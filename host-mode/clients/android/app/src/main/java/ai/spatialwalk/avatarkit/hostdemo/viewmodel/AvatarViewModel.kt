package ai.spatialwalk.avatarkit.hostdemo.viewmodel

import ai.spatialwalk.avatarkit.AudioFormat
import ai.spatialwalk.avatarkit.AvatarController.ConnectionState
import ai.spatialwalk.avatarkit.AvatarSDK
import ai.spatialwalk.avatarkit.AvatarView
import ai.spatialwalk.avatarkit.Configuration
import ai.spatialwalk.avatarkit.DrivingServiceMode
import ai.spatialwalk.avatarkit.Environment
import ai.spatialwalk.avatarkit.LogLevel
import ai.spatialwalk.avatarkit.assets.AvatarManager
import ai.spatialwalk.avatarkit.player.AnimationPlayer.ConversationState
import ai.spatialwalk.avatarkit.hostdemo.BuildConfig
import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import kotlin.io.encoding.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class AvatarViewModel(application: Application) : AndroidViewModel(application) {

    // --- Avatar state ---
    var avatarView: AvatarView? = null
        private set
    var isLoading: Boolean by mutableStateOf(false)
        private set
    var loadProgress: Float by mutableStateOf(0f)
        private set
    var currentAvatarId: String by mutableStateOf("")
        private set

    // --- Controller state ---
    var connectionState: ConnectionState by mutableStateOf(ConnectionState.Disconnected)
        private set
    var conversationState: ConversationState by mutableStateOf(ConversationState.Idle)
        private set
    var errorState: Throwable? by mutableStateOf(null)
        private set

    // --- Host mode state ---
    var hostConnected: Boolean by mutableStateOf(false)
        private set
    var hostConnecting: Boolean by mutableStateOf(false)
        private set
    var hostMicActive: Boolean by mutableStateOf(false)
        private set
    var hostTextInput: String by mutableStateOf("")
    var isPaused: Boolean by mutableStateOf(false)
        private set

    private var hostWebSocket: WebSocket? = null
    private var micRecordJob: Job? = null
    private var audioRecord: AudioRecord? = null
    private val hostTurnMap = mutableMapOf<String, String>()

    private val controller get() = avatarView?.controller

    var isInitialized: Boolean by mutableStateOf(false)
        private set

    private val okHttpClient = OkHttpClient()

    fun initialize(appId: String, environment: Environment = Environment.intl) {
        AvatarSDK.initialize(
            getApplication(),
            appId,
            Configuration(
                environment,
                AudioFormat(16000),
                drivingServiceMode = DrivingServiceMode.HOST,
                logLevel = LogLevel.ALL
            )
        )
        isInitialized = true
    }

    fun loadAvatar(avatarId: String) {
        if (avatarId == currentAvatarId && avatarView != null) return
        cleanupAvatar()
        currentAvatarId = avatarId
        isLoading = true
        loadProgress = 0f
        viewModelScope.launch {
            AvatarManager.load(avatarId, onProgress = { progress ->
                when (progress) {
                    is AvatarManager.LoadProgress.Downloading -> loadProgress = progress.progress
                    is AvatarManager.LoadProgress.Completed -> loadProgress = 1f
                    is AvatarManager.LoadProgress.Failed -> {}
                }
            })
            isLoading = false
        }
    }

    fun onAvatarViewCreated(view: AvatarView) {
        avatarView = view
        viewModelScope.launch {
            val avatar = AvatarManager.load(currentAvatarId)
            view.init(avatar, viewModelScope)
            setupController()
        }
    }

    private fun setupController() {
        controller?.apply {
            onConnectionState = { state -> connectionState = state }
            onConversationState = { state -> conversationState = state }
            onError = { error -> errorState = Exception(error.message) }
        }
    }

    fun pause() { controller?.pause(); isPaused = true }
    fun resume() { controller?.resume(); isPaused = false }

    fun interrupt() {
        hostStopMic()
        hostWebSocket?.send(JSONObject().apply { put("type", "interrupt") }.toString())
        hostTurnMap.clear()
        controller?.interrupt()
    }

    // ========== Host Mode: WebSocket ==========

    private fun handleHostMessage(text: String) {
        val obj = try { JSONObject(text) } catch (_: Exception) { return }
        val type = obj.optString("type", "") .ifEmpty { return }

        when (type) {
            "ready" -> {
                hostConnected = true
                hostConnecting = false
                hostWebSocket?.send(JSONObject().apply { put("type", "set_avatar"); put("avatarId", currentAvatarId) }.toString())
            }
            "avatar_audio" -> {
                val audioB64 = obj.optString("audio", "")
                val turnId = obj.optString("turnId", "").ifEmpty { return }
                val isLast = obj.optBoolean("isLast", false)
                val audioBytes = if (audioB64.isNotEmpty()) Base64.decode(audioB64) else ByteArray(0)
                viewModelScope.launch {
                    val cid = controller?.yield(audioBytes, isLast)
                    if (cid != null && !hostTurnMap.containsKey(turnId)) {
                        hostTurnMap[turnId] = cid
                    }
                }
            }
            "avatar_frames" -> {
                val turnId = obj.optString("turnId", "").ifEmpty { return }
                val framesArr = obj.optJSONArray("frames") ?: return
                val frames = (0 until framesArr.length()).mapNotNull { i ->
                    framesArr.optString(i)?.takeIf { it.isNotEmpty() }?.let { Base64.decode(it) }
                }
                val isLast = obj.optBoolean("isLast", false)
                val cid = hostTurnMap[turnId]
                if (cid != null && frames.isNotEmpty()) {
                    viewModelScope.launch { controller?.yield(frames, cid) }
                }
                if (isLast) {
                    hostTurnMap.remove(turnId)
                }
            }
            "interrupt" -> {
                hostTurnMap.clear()
                viewModelScope.launch { controller?.interrupt() }
            }
            "error" -> {
                val errMsg = obj.optString("message", "Unknown error")
                viewModelScope.launch { errorState = Exception(errMsg) }
            }
        }
    }

    fun hostConnect() {
        if (hostWebSocket != null || hostConnecting) return
        hostConnecting = true
        errorState = null

        val wsUrl = BuildConfig.HOST_SERVER_URL.let { url ->
            if (url.startsWith("ws://") || url.startsWith("wss://")) url
            else url.replace("http://", "ws://").replace("https://", "wss://")
        }.let { base ->
            if (base.endsWith("/ws/agent")) base else "$base/ws/agent"
        }

        val request = Request.Builder().url(wsUrl).build()
        val ws = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleHostMessage(text)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                viewModelScope.launch {
                    errorState = t
                    hostConnecting = false
                    hostConnected = false
                    hostWebSocket = null
                    hostMicActive = false
                }
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                viewModelScope.launch {
                    hostWebSocket = null
                    hostConnected = false
                    hostConnecting = false
                    hostMicActive = false
                    hostTurnMap.clear()
                }
            }
        })
        hostWebSocket = ws
    }

    fun hostDisconnect() {
        hostStopMic()
        hostWebSocket?.close(1000, "User disconnected")
        hostWebSocket = null
        hostConnected = false
        hostConnecting = false
        hostTurnMap.clear()
    }

    fun hasRecordPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            getApplication(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    @android.annotation.SuppressLint("MissingPermission")
    fun hostStartMic() {
        if (hostMicActive) return
        if (!hasRecordPermission()) return

        val sampleRate = 16000
        val channelConfig = android.media.AudioFormat.CHANNEL_IN_MONO
        val audioEncoding = android.media.AudioFormat.ENCODING_PCM_16BIT
        val minBufSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioEncoding)
        val bufferSize = maxOf(minBufSize, sampleRate * 2)

        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            channelConfig,
            audioEncoding,
            bufferSize
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            errorState = Exception("AudioRecord initialization failed")
            return
        }

        audioRecord = record
        record.startRecording()
        hostMicActive = true

        micRecordJob = viewModelScope.launch(Dispatchers.IO) {
            val chunkSize = sampleRate * 2 * 200 / 1000 // 200ms of 16kHz 16-bit mono
            val buffer = ByteArray(chunkSize)
            try {
                while (isActive && hostMicActive) {
                    val read = record.read(buffer, 0, chunkSize)
                    if (read > 0) {
                        val chunk = if (read == chunkSize) buffer else buffer.copyOf(read)
                        val b64 = Base64.encode(chunk)
                        hostWebSocket?.send(JSONObject().apply { put("type", "mic_audio"); put("audio", b64) }.toString())
                    }
                }
            } catch (_: CancellationException) {
                // normal cancellation
            }
        }
    }

    fun hostStopMic() {
        if (!hostMicActive) return
        hostMicActive = false
        micRecordJob?.cancel()
        micRecordJob = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
        hostWebSocket?.send(JSONObject().apply { put("type", "mic_end") }.toString())
    }

    fun hostSendText(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        if (!hostConnected) hostConnect()
        hostWebSocket?.send(JSONObject().apply { put("type", "text_query"); put("text", trimmed) }.toString())
        hostTextInput = ""
    }

    fun cleanupAvatar() {
        hostDisconnect()
        avatarView = null
        connectionState = ConnectionState.Disconnected
        conversationState = ConversationState.Idle
        errorState = null
        loadProgress = 0f
    }

    override fun onCleared() {
        super.onCleared()
        cleanupAvatar()
    }
}
