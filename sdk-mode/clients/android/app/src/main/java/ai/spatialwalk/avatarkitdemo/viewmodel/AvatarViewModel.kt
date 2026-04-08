package ai.spatialwalk.avatarkitdemo.viewmodel

import ai.spatialwalk.avatarkit.AudioFormat
import ai.spatialwalk.avatarkit.Avatar
import ai.spatialwalk.avatarkit.AvatarController
import ai.spatialwalk.avatarkit.AvatarController.ConnectionState
import ai.spatialwalk.avatarkit.AvatarSDK
import ai.spatialwalk.avatarkit.AvatarView
import ai.spatialwalk.avatarkit.Configuration
import ai.spatialwalk.avatarkit.DrivingServiceMode
import ai.spatialwalk.avatarkit.Environment
import ai.spatialwalk.avatarkit.LogLevel
import ai.spatialwalk.avatarkit.assets.AvatarManager
import ai.spatialwalk.avatarkit.performance.FrameRateMonitor.FrameRateInfo
import ai.spatialwalk.avatarkit.player.AnimationPlayer.ConversationState
import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlin.io.encoding.Base64
import kotlin.io.path.Path
import kotlin.io.path.nameWithoutExtension
import java.io.InputStream

private fun InputStream.readNBytesCompat(n: Int): ByteArray {
    val buf = ByteArray(n)
    var offset = 0
    while (offset < n) {
        val read = read(buf, offset, n - offset)
        if (read == -1) break
        offset += read
    }
    return if (offset == n) buf else buf.copyOf(offset)
}

@Serializable
data class AudioAndAnimation(
    @SerialName("audio_base64") val audio: String,
    @SerialName("animation_messages_base64") val animations: List<String>,
    @SerialName("sample_rate") val sampleRate: Int,
    @SerialName("audio_format") val audioFormat: String,
    @SerialName("connection_id") val connectionId: String,
    @SerialName("req_id") val reqId: String,
)

class AvatarViewModel(application: Application) : AndroidViewModel(application) {

    // --- Config state ---
    var mode: DrivingServiceMode by mutableStateOf(DrivingServiceMode.SDK)
    var appId: String by mutableStateOf("")
    var sessionToken: String by mutableStateOf("")
    var environment: Environment by mutableStateOf(Environment.intl)
    var isInitialized: Boolean by mutableStateOf(false)

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
    var extraMessage: String by mutableStateOf("")
        private set
    var frameRateInfo: FrameRateInfo by mutableStateOf(FrameRateInfo())
        private set
    var isSendingAudio: Boolean by mutableStateOf(false)
        private set
    var currentlyPlayingFile: String? by mutableStateOf(null)
        private set

    private var pcmSendingJob: Job? = null
        set(value) { field?.cancel(); field = value }

    private val controller: AvatarController?
        get() = avatarView?.controller

    private val prefs by lazy {
        application.getSharedPreferences("avatarkit_demo", Context.MODE_PRIVATE)
    }

    init {
        appId = prefs.getString("appId", "") ?: ""
        sessionToken = prefs.getString("sessionToken", "") ?: ""
        environment = if (prefs.getString("env", "intl") == "cn") Environment.cn else Environment.intl
    }

    fun savePrefs() {
        prefs.edit()
            .putString("appId", appId)
            .putString("sessionToken", sessionToken)
            .putString("env", if (environment == Environment.cn) "cn" else "intl")
            .apply()
    }

    fun initialize() {
        savePrefs()
        AvatarSDK.initialize(
            getApplication(),
            appId,
            Configuration(
                environment,
                AudioFormat(16000),
                drivingServiceMode = mode,
                logLevel = LogLevel.ALL
            )
        )
        AvatarSDK.sessionToken = sessionToken
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
            onFrameRateInfo = { info -> frameRateInfo = info }
        }
    }

    fun connect() { controller?.start() }
    fun disconnect() {
        cancelSending()
        controller?.close()
    }
    fun interrupt() {
        cancelSending()
        controller?.interrupt()
    }
    fun pause() { controller?.pause() }
    fun resume() { controller?.resume() }

    private fun cancelSending() {
        pcmSendingJob = null
        isSendingAudio = false
        currentlyPlayingFile = null
    }

    val isSdkMode: Boolean get() = mode == DrivingServiceMode.SDK

    fun sendPcm(filePath: String) {
        val ctx = getApplication<Application>()
        cancelSending()
        controller?.interrupt()
        isSendingAudio = true
        currentlyPlayingFile = filePath
        pcmSendingJob = viewModelScope.launch(Dispatchers.IO) {
            try {
                val stream = ctx.assets.open(filePath)
                while (isActive) {
                    val bufferSize = 16000 * 2
                    val data = stream.readNBytesCompat(bufferSize)
                    controller?.send(data, data.size < bufferSize)
                    delay(100L)
                    if (data.size < bufferSize) break
                }
                isSendingAudio = false
                currentlyPlayingFile = null
            } catch (e: CancellationException) {
                isSendingAudio = false
                currentlyPlayingFile = null
                extraMessage = "PCM sending interrupted."
                throw e
            } catch (e: Exception) {
                isSendingAudio = false
                currentlyPlayingFile = null
                errorState = e
            }
        }
    }

    fun sendJson(filePath: String) {
        val ctx = getApplication<Application>()
        viewModelScope.launch(Dispatchers.IO) {
            val ana = ctx.assets.open(filePath).use {
                Json.decodeFromStream<AudioAndAnimation>(it)
            }
            val sampleRate = Path(filePath).nameWithoutExtension.toInt()
            val reqId = controller?.yield(Base64.decode(ana.audio), true, AudioFormat(sampleRate))
            if (reqId != null) {
                controller?.yield(ana.animations.map(Base64::decode), reqId)
            }
        }
    }

    fun onPause() { /* AvatarView handles lifecycle automatically */ }
    fun onResume() { /* AvatarView handles lifecycle automatically */ }

    fun cleanupAvatar() {
        cancelSending()
        avatarView = null
        connectionState = ConnectionState.Disconnected
        conversationState = ConversationState.Idle
        errorState = null
        extraMessage = ""
        frameRateInfo = FrameRateInfo()
        loadProgress = 0f
    }

    override fun onCleared() {
        super.onCleared()
        cleanupAvatar()
    }
}
