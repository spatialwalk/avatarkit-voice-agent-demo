package ai.spatialwalk.sdkmodeexample

import ai.spatialwalk.avatarkit.AudioFormat
import ai.spatialwalk.avatarkit.AvatarController
import ai.spatialwalk.avatarkit.AvatarSDK
import ai.spatialwalk.avatarkit.AvatarView
import ai.spatialwalk.avatarkit.Configuration
import ai.spatialwalk.avatarkit.DrivingServiceMode
import ai.spatialwalk.avatarkit.Environment
import ai.spatialwalk.avatarkit.LogLevel
import ai.spatialwalk.avatarkit.assets.AvatarManager
import ai.spatialwalk.avatarkit.player.AnimationPlayer.ConversationState
import ai.spatialwalk.sdkmodeexample.audio.VadConfig
import ai.spatialwalk.sdkmodeexample.audio.VadRecorder
import ai.spatialwalk.sdkmodeexample.network.OpenAiClient
import ai.spatialwalk.sdkmodeexample.network.OpenAiConfig
import ai.spatialwalk.sdkmodeexample.pipeline.TextChunker
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private enum class LoadStatus {
    Idle,
    Loading,
    Ready,
    Error,
}

private enum class RuntimeLogLevel {
    Info,
    Error,
}

class MainActivity : ComponentActivity() {
    private var status by mutableStateOf(LoadStatus.Idle)
    private var errorMsg by mutableStateOf("")
    private var logs by mutableStateOf(emptyList<String>())
    private var isListening by mutableStateOf(false)
    private var isConnectingConversation by mutableStateOf(false)
    private var sessionTokenInput by mutableStateOf("")

    private var avatarView: AvatarView? = null
    private var sdkInitialized = false
    private var recorder: VadRecorder? = null

    private val initializedOnce = AtomicBoolean(false)
    private val processing = AtomicBoolean(false)
    private val avatarSpeaking = AtomicBoolean(false)
    private val connectionReady = AtomicBoolean(false)
    private val connecting = AtomicBoolean(false)
    private val conversationStarting = AtomicBoolean(false)
    private val disconnectByClient = AtomicBoolean(false)

    private var lastConnectionStateText = ""
    private var lastConversationStateText = ""

    private var pendingStartAfterPermission = false

    private val sessionTokenDocsUrl =
        "https://docs.spatialreal.ai/overview/get-apikeys#temporary-session-token"

    private val openAiClient by lazy {
        OpenAiClient(
            OpenAiConfig(
                apiKey = BuildConfig.OPENAI_API_KEY,
                baseUrl = BuildConfig.OPENAI_BASE_URL,
                useProxy = BuildConfig.OPENAI_USE_PROXY,
                proxyBaseUrl = BuildConfig.OPENAI_PROXY_BASE_URL,
                chatModel = BuildConfig.OPENAI_MODEL,
                sttModel = BuildConfig.OPENAI_STT_MODEL,
                sttLanguage = BuildConfig.OPENAI_STT_LANGUAGE,
                ttsModel = BuildConfig.OPENAI_TTS_MODEL,
                ttsVoice = BuildConfig.OPENAI_TTS_VOICE,
            )
        )
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            pushLog("Microphone permission granted")
            if (pendingStartAfterPermission) {
                pendingStartAfterPermission = false
                startConversationInternal()
            }
        } else {
            pendingStartAfterPermission = false
            pushLog("Microphone permission denied, cannot start conversation", RuntimeLogLevel.Error)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        bootstrapSdk()

        setContent {
            MaterialTheme {
                SdkModeScreen(
                    status = status,
                    errorMsg = errorMsg,
                    logs = logs,
                    isListening = isListening,
                    isConnecting = isConnectingConversation,
                    sessionTokenInput = sessionTokenInput,
                    sessionTokenDocsUrl = sessionTokenDocsUrl,
                    hasModelProvider = BuildConfig.OPENAI_USE_PROXY || BuildConfig.OPENAI_API_KEY.isNotBlank(),
                    canCreateAvatarView = sdkInitialized,
                    onSessionTokenChange = { sessionTokenInput = it },
                    onInitializeAvatar = { initializeAvatar() },
                    onToggleConversation = {
                        if (isListening) {
                            stopConversation()
                        } else {
                            startConversation()
                        }
                    },
                    onAvatarViewCreated = { view ->
                        if (avatarView !== view) {
                            avatarView = view
                            if (initializedOnce.compareAndSet(false, true)) {
                                initializeAvatar()
                            }
                        }
                    }
                )
            }
        }
    }

    private fun bootstrapSdk() {
        if (sdkInitialized) return
        if (BuildConfig.SPATIALREAL_APP_ID.isBlank()) {
            status = LoadStatus.Error
            errorMsg = "Missing SPATIALREAL_APP_ID"
            pushLog("Initialization failed: $errorMsg", RuntimeLogLevel.Error)
            return
        }

        runCatching {
            AvatarSDK.initialize(
                applicationContext,
                BuildConfig.SPATIALREAL_APP_ID,
                Configuration(
                    environment = parseEnvironment(BuildConfig.SPATIALREAL_ENVIRONMENT),
                    audioFormat = AudioFormat(24000),
                    drivingServiceMode = DrivingServiceMode.SDK,
                    logLevel = LogLevel.INFO,
                ),
            )
            AvatarManager.initialize(applicationContext)
            sdkInitialized = true
            status = LoadStatus.Idle
        }.onFailure {
            status = LoadStatus.Error
            errorMsg = it.message ?: it.javaClass.simpleName
            pushLog("SDK pre-initialization failed: $errorMsg", RuntimeLogLevel.Error)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopConversation()
        isConnectingConversation = false
        processing.set(false)
        avatarSpeaking.set(false)
        connectionReady.set(false)
        connecting.set(false)
        teardownAvatarView()
        openAiClient.close()
    }

    private fun initializeAvatar() {
        val view = avatarView
        if (view == null) {
            pushLog("AvatarView not created yet")
            return
        }

        if (BuildConfig.SPATIALREAL_APP_ID.isBlank() || BuildConfig.SPATIALREAL_AVATAR_ID.isBlank()) {
            status = LoadStatus.Error
            errorMsg = "Missing SPATIALREAL_APP_ID or SPATIALREAL_AVATAR_ID"
            pushLog("Initialization failed: $errorMsg", RuntimeLogLevel.Error)
            return
        }

        lifecycleScope.launch {
            status = LoadStatus.Loading
            errorMsg = ""
            processing.set(false)
            avatarSpeaking.set(false)
            connectionReady.set(false)
            connecting.set(false)
            disconnectByClient.set(false)
            lastConnectionStateText = ""
            lastConversationStateText = ""
            stopConversation()
            pushLog("Initializing Avatar...")
            safeCloseController()

            try {
                if (!AvatarSDK.supportsCurrentDevice()) {
                    error("Current device does not meet AvatarKit requirements (API24+, Vulkan)")
                }

                val sessionToken = normalizedSessionToken(sessionTokenInput)
                if (sessionToken.isNotEmpty()) {
                    AvatarSDK.sessionToken = sessionToken
                    val current = sessionTokenInput.trim()
                    if (sessionToken != current) {
                        sessionTokenInput = sessionToken
                        pushLog("Removed Bearer prefix from Session Token")
                    }
                    pushLog("Applied manual Session Token")
                }

                if (!sdkInitialized) {
                    bootstrapSdk()
                    if (!sdkInitialized) {
                        error("SDK initialization failed")
                    }
                }

                var lastProgressBucket = -1
                val avatar = withContext(Dispatchers.IO) {
                    AvatarManager.load(BuildConfig.SPATIALREAL_AVATAR_ID) { progress ->
                        if (progress is AvatarManager.LoadProgress.Downloading) {
                            val percent = (progress.progress * 100).toInt().coerceIn(0, 100)
                            val bucket = percent / 20
                            if (bucket != lastProgressBucket) {
                                lastProgressBucket = bucket
                                pushLog("Avatar download progress: $percent%")
                            }
                        }
                    }
                }

                view.init(avatar, lifecycleScope)
                bindControllerCallbacks(view.controller)

                status = LoadStatus.Ready
                pushLog("Avatar is ready. Connection starts when you tap Start Conversation")
            } catch (t: Throwable) {
                status = LoadStatus.Error
                errorMsg = t.message ?: t.javaClass.simpleName
                pushLog("Initialization failed: $errorMsg", RuntimeLogLevel.Error)
                safeCloseController()
            }
        }
    }

    private fun parseEnvironment(raw: String): Environment {
        return when (raw.lowercase(Locale.US)) {
            "cn" -> Environment.cn
            "test" -> Environment.test
            else -> Environment.intl
        }
    }

    private fun bindControllerCallbacks(controller: AvatarController?) {
        if (controller == null) {
            pushLog("Avatar controller unavailable", RuntimeLogLevel.Error)
            return
        }

        controller.onConnectionState = connectionState@{ state ->
            val stateText = state.toString()
            if (stateText == lastConnectionStateText) return@connectionState
            lastConnectionStateText = stateText

            val normalized = stateText.lowercase(Locale.US)
            when {
                normalized.contains("connecting") -> {
                    connectionReady.set(false)
                    pushLog("Connection state: $stateText (connecting)")
                }

                normalized.contains("disconnected") -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    isConnectingConversation = false

                    val closedByClient = disconnectByClient.getAndSet(false)
                    if (closedByClient) {
                        pushLog("Connection state: $stateText (closed)")
                    } else {
                        pushLog("Connection state: $stateText (disconnected)", RuntimeLogLevel.Error)
                        if (isListening) {
                            stopConversation()
                            pushLog("Connection dropped unexpectedly. Conversation stopped", RuntimeLogLevel.Error)
                        }
                    }
                }

                normalized.contains("failed") -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    isConnectingConversation = false
                    disconnectByClient.set(false)
                    pushLog("Connection state: $stateText (failed)", RuntimeLogLevel.Error)
                }

                normalized.contains("connected") -> {
                    disconnectByClient.set(false)
                    connecting.set(false)
                    connectionReady.set(true)
                    pushLog("Connection state: $stateText (connected)")
                }

                else -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    pushLog("Connection state: $stateText (unrecognized)", RuntimeLogLevel.Error)
                }
            }
        }

        controller.onConversationState = { state ->
            val stateText = state.toString()
            if (stateText != lastConversationStateText) {
                lastConversationStateText = stateText
                pushLog("Conversation state: $stateText")
            }

            when (state) {
                ConversationState.Playing -> {
                    if (!avatarSpeaking.getAndSet(true)) {
                        pushLog("Avatar started speaking")
                    }
                }

                ConversationState.Idle -> {
                    if (avatarSpeaking.getAndSet(false)) {
                        pushLog("Avatar finished speaking")
                    }
                }

                ConversationState.Active -> {
                    pushLog("Conversation active, waiting for playable content")
                }

                ConversationState.Paused -> {
                    pushLog("Conversation paused")
                }
            }
        }

        controller.onError = { error ->
            val message = error.message ?: error.toString()
            pushLog("Avatar error: $message", RuntimeLogLevel.Error)

            val normalized = message.lowercase(Locale.US)
            if (normalized.contains("sessiontokeninvalid")) {
                pushLog(
                    "Invalid Session Token: make sure you entered a temporary Session Token (not an API key). $sessionTokenDocsUrl",
                    RuntimeLogLevel.Error,
                )
            }
            if (normalized.contains("sessiontokenexpired")) {
                pushLog("Session Token expired. Generate a new one and retry.", RuntimeLogLevel.Error)
            }
        }
    }

    private fun startConversation() {
        if (isListening) return
        if (status != LoadStatus.Ready) {
            pushLog("Avatar is not ready", RuntimeLogLevel.Error)
            return
        }

        if (normalizedSessionToken(sessionTokenInput).isEmpty()) {
            pushLog("Please enter Session Token before starting conversation. Link: $sessionTokenDocsUrl", RuntimeLogLevel.Error)
            return
        }

        if (BuildConfig.OPENAI_USE_PROXY && BuildConfig.OPENAI_PROXY_BASE_URL.isBlank()) {
            pushLog("Missing OPENAI_PROXY_BASE_URL configuration", RuntimeLogLevel.Error)
            return
        }

        if (!BuildConfig.OPENAI_USE_PROXY && BuildConfig.OPENAI_API_KEY.isBlank()) {
            pushLog("Missing OPENAI_API_KEY configuration", RuntimeLogLevel.Error)
            return
        }

        pushLog(
            if (BuildConfig.OPENAI_USE_PROXY) {
                "Model mode: local proxy"
            } else {
                "Model mode: direct OpenAI"
            }
        )

        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            pendingStartAfterPermission = true
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }

        startConversationInternal()
    }

    private fun startConversationInternal() {
        if (isListening) return
        if (!conversationStarting.compareAndSet(false, true)) return

        lifecycleScope.launch {
            isConnectingConversation = true
            try {
                val controller = avatarView?.controller
                if (controller == null) {
                    pushLog("Avatar controller unavailable", RuntimeLogLevel.Error)
                    return@launch
                }

                if (!ensureConnected(controller)) {
                    pushLog("Connection not ready, cannot start conversation", RuntimeLogLevel.Error)
                    return@launch
                }

                startRecorder()
            } finally {
                isConnectingConversation = false
                conversationStarting.set(false)
            }
        }
    }

    private fun startRecorder() {
        if (isListening) return

        try {
            val newRecorder = VadRecorder(
                config = VadConfig(
                    sampleRate = BuildConfig.MIC_SAMPLE_RATE,
                    startThreshold = BuildConfig.VAD_START_THRESHOLD,
                    stopThreshold = BuildConfig.VAD_STOP_THRESHOLD,
                    silenceMs = BuildConfig.VAD_SILENCE_MS.toLong(),
                    minSpeechMs = BuildConfig.VAD_MIN_SPEECH_MS.toLong(),
                    maxSpeechMs = BuildConfig.VAD_MAX_SPEECH_MS.toLong(),
                ),
                shouldGate = { processing.get() || avatarSpeaking.get() },
                onLog = { pushLog(it) },
                onSegment = { pcm16 ->
                    lifecycleScope.launch {
                        processSegment(pcm16)
                    }
                },
            )

            newRecorder.start(lifecycleScope)
            recorder = newRecorder
            isListening = true
            pushLog("Microphone started, waiting for speech...")
        } catch (t: Throwable) {
            pushLog("Failed to start microphone: ${t.message ?: t.javaClass.simpleName}", RuntimeLogLevel.Error)
            stopConversation()
        }
    }

    private fun stopConversation() {
        recorder?.stop()
        recorder = null
        if (isListening) {
            isListening = false
            pushLog("Conversation stopped")
        }
    }

    private suspend fun ensureConnected(controller: AvatarController): Boolean {
        if (connectionReady.get()) return true

        if (connecting.compareAndSet(false, true)) {
            try {
                val sessionToken = normalizedSessionToken(sessionTokenInput)
                if (sessionToken.isEmpty()) {
                    connecting.set(false)
                    pushLog("Please enter Session Token before starting conversation. Link: $sessionTokenDocsUrl", RuntimeLogLevel.Error)
                    return false
                }

                if (sessionToken != sessionTokenInput.trim()) {
                    sessionTokenInput = sessionToken
                    pushLog("Removed Bearer prefix from Session Token")
                }

                AvatarSDK.sessionToken = sessionToken
                disconnectByClient.set(false)
                pushLog("Starting connection...")
                controller.start()
            } catch (t: Throwable) {
                connecting.set(false)
                pushLog("Failed to establish connection: ${t.message ?: t.javaClass.simpleName}", RuntimeLogLevel.Error)
                return false
            }
        }

        val connected = withTimeoutOrNull(15_000) {
            while (!connectionReady.get()) {
                if (!connecting.get()) {
                    return@withTimeoutOrNull false
                }
                delay(100)
            }
            true
        } ?: false

        if (!connected) {
            connecting.set(false)
        }
        return connected
    }

    private fun normalizedSessionToken(value: String): String {
        val trimmed = value.trim()
        return if (trimmed.startsWith("Bearer ", ignoreCase = true)) {
            trimmed.substring(7).trim()
        } else {
            trimmed
        }
    }

    private suspend fun processSegment(pcm16: ByteArray) {
        if (pcm16.isEmpty() || !processing.compareAndSet(false, true)) {
            return
        }

        try {
            val sizeKb = pcm16.size / 1024
            pushLog("Speech segment ${sizeKb}KB, starting ASR...")

            val text = withContext(Dispatchers.IO) {
                openAiClient.transcribe(pcm16, BuildConfig.MIC_SAMPLE_RATE)
            }.trim()

            if (text.isEmpty()) {
                pushLog("ASR did not return valid text")
                return
            }

            pushLog("ASR transcript: \"$text\"")

            val controller = avatarView?.controller
            if (controller == null) {
                pushLog("Avatar controller unavailable, skipping playback", RuntimeLogLevel.Error)
                return
            }

            pushLog("Calling LLM (streaming)...")

            val reply = coroutineScope {
                val ttsTasks = ConcurrentHashMap<Int, kotlinx.coroutines.Deferred<ByteArray>>()
                val sentenceCount = AtomicInteger(0)
                val llmFinished = AtomicBoolean(false)
                var pending = ""

                fun enqueueSentence(sentence: String) {
                    val normalized = sentence.trim()
                    if (normalized.isEmpty()) return
                    val index = sentenceCount.getAndIncrement()
                    ttsTasks[index] = async(Dispatchers.IO) {
                        openAiClient.synthesizePcm(normalized)
                    }
                }

                val senderJob = launch(Dispatchers.IO) {
                    var nextSendIndex = 0
                    while (!llmFinished.get() || nextSendIndex < sentenceCount.get()) {
                        val task = ttsTasks[nextSendIndex]
                        if (task == null) {
                            delay(10)
                            continue
                        }

                        val pcm = task.await()
                        val shouldEnd = llmFinished.get() && nextSendIndex == sentenceCount.get() - 1
                        controller.send(pcm, shouldEnd)
                        ttsTasks.remove(nextSendIndex)
                        nextSendIndex += 1
                    }

                    if (sentenceCount.get() == 0) {
                        controller.send(ByteArray(0), true)
                    }
                }

                val fullReply = withContext(Dispatchers.IO) {
                    openAiClient.runLlmStream(text) { chunk ->
                        pending += chunk
                        val (sentences, carry) = TextChunker.splitForTts(pending, flushTail = false)
                        pending = carry
                        for (sentence in sentences) {
                            enqueueSentence(sentence)
                        }
                    }
                }

                val (tailSentences, _) = TextChunker.splitForTts(pending, flushTail = true)
                for (sentence in tailSentences) {
                    enqueueSentence(sentence)
                }

                llmFinished.set(true)
                senderJob.join()
                fullReply
            }

            pushLog("LLM reply: \"$reply\"")
        } catch (t: Throwable) {
            pushLog("Conversation failed: ${t.message ?: t.javaClass.simpleName}", RuntimeLogLevel.Error)
        } finally {
            processing.set(false)
        }
    }

    private fun safeCloseController() {
        val controller = avatarView?.controller ?: return
        connectionReady.set(false)
        connecting.set(false)
        disconnectByClient.set(true)
        runCatching { controller.close() }
    }

    private fun teardownAvatarView() {
        val view = avatarView ?: return
        val controller = view.controller

        connectionReady.set(false)
        connecting.set(false)
        disconnectByClient.set(true)

        runCatching { controller?.onConnectionState = null }
        runCatching { controller?.onConversationState = null }
        runCatching { controller?.onError = null }
        runCatching { controller?.close() }
        runCatching { controller?.cleanup() }

        avatarView = null
    }

    private fun pushLog(value: String, level: RuntimeLogLevel = RuntimeLogLevel.Info) {
        val tag = if (level == RuntimeLogLevel.Error) "[ERROR]" else "[INFO]"
        val line = "${logTimeFormatter.format(Date())} $tag $value"
        val isError = level == RuntimeLogLevel.Error
        if (isError) {
            Log.e(LOG_TAG, line)
        } else {
            Log.i(LOG_TAG, line)
        }
        runOnUiThread {
            logs = listOf(line) + logs.take(79)
        }
    }

    companion object {
        private const val LOG_TAG = "SdkModeDemo"
        private val logTimeFormatter = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    }
}

private object DS {
    val bg = Color(0xFFF5F8FF)
    val panel = Color.White.copy(alpha = 0.88f)
    val panelBorder = Color(0x26354A8A)
    val title = Color(0xFF0B1323)
    val text = Color(0xFF27364F)
    val muted = Color(0xFF5F7598)
    val blue = Color(0xFF2563EB)
    val kicker = Color(0xFF4670C1)

    val chipOkFg = Color(0xFF14632F)
    val chipOkBg = Color(0x2923A64A)
    val chipErrFg = Color(0xFF991B1B)
    val chipErrBg = Color(0x29F04444)
    val chipIdleFg = Color(0xFF54647C)
    val chipIdleBg = Color(0x2963718C)

    val logBorder = Color(0x2E395C92)
    val logErrBorder = Color(0x52DC2626)
    val logErrBg = Color(0xFFFDF2F2)
}

@Composable
private fun StageViewport(
    status: LoadStatus,
    errorMsg: String,
    canCreateAvatarView: Boolean,
    onAvatarViewCreated: (AvatarView) -> Unit,
) {
    val context = LocalContext.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
    ) {
        Image(
            painter = painterResource(id = R.drawable.avatar_bg),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.08f))
        )

        if (canCreateAvatarView) {
            AndroidView(
                factory = {
                    AvatarView(context).also {
                        it.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        runCatching {
                            val method = it.javaClass.getMethod("setOpaque", java.lang.Boolean::class.java)
                            method.invoke(it, false)
                        }
                        onAvatarViewCreated(it)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }

        val needOverlay = !canCreateAvatarView || status != LoadStatus.Ready
        if (needOverlay) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center,
            ) {
                when (status) {
                    LoadStatus.Loading -> {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.height(22.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                            Text(
                                text = "Loading...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    LoadStatus.Error -> {
                        Text(
                            text = if (errorMsg.isBlank()) "Initialization failed" else errorMsg,
                            color = Color.White,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }

                    LoadStatus.Idle,
                    LoadStatus.Ready,
                    -> {
                        Text(
                            text = "Waiting for Avatar initialization",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SdkModeScreen(
    status: LoadStatus,
    errorMsg: String,
    logs: List<String>,
    isListening: Boolean,
    isConnecting: Boolean,
    sessionTokenInput: String,
    sessionTokenDocsUrl: String,
    hasModelProvider: Boolean,
    canCreateAvatarView: Boolean,
    onSessionTokenChange: (String) -> Unit,
    onInitializeAvatar: () -> Unit,
    onToggleConversation: () -> Unit,
    onAvatarViewCreated: (AvatarView) -> Unit,
) {
    val context = LocalContext.current
    val canStartConversation = status == LoadStatus.Ready && hasModelProvider
    val talkButtonDisabled = !isListening && (!canStartConversation || isConnecting)
    val talkButtonText = when {
        isListening -> "End Conversation"
        isConnecting -> "Authenticating..."
        status == LoadStatus.Loading -> "Loading..."
        status == LoadStatus.Error -> "Initialization failed"
        status == LoadStatus.Idle -> "Not initialized"
        hasModelProvider -> "Start Conversation"
        else -> "Missing model configuration"
    }

    val chipText = when (status) {
        LoadStatus.Idle -> "Not initialized"
        LoadStatus.Ready -> "Ready"
        LoadStatus.Error -> "Load failed"
        LoadStatus.Loading -> "Loading"
    }
    val chipFg = when (status) {
        LoadStatus.Ready -> DS.chipOkFg
        LoadStatus.Error -> DS.chipErrFg
        LoadStatus.Idle,
        LoadStatus.Loading,
        -> DS.chipIdleFg
    }
    val chipBg = when (status) {
        LoadStatus.Ready -> DS.chipOkBg
        LoadStatus.Error -> DS.chipErrBg
        LoadStatus.Idle,
        LoadStatus.Loading,
        -> DS.chipIdleBg
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DS.bg)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(DS.blue.copy(alpha = 0.20f), Color.Transparent),
                        center = Offset(80f, 120f),
                        radius = 600f,
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color(0x24FB8C2B), Color.Transparent),
                        center = Offset(980f, 80f),
                        radius = 540f,
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "SPATIALREAL SDK MODE",
                        color = DS.kicker,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Avatar Demo",
                        color = DS.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Box(
                    modifier = Modifier
                        .background(chipBg, RoundedCornerShape(999.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = chipText,
                        color = chipFg,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Session Token (Manual Paste)",
                        color = DS.title,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )

                    OutlinedTextField(
                        value = sessionTokenInput,
                        onValueChange = onSessionTokenChange,
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Enter Session Token", color = DS.muted, fontSize = 11.sp) },
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 11.sp),
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.White.copy(alpha = 0.92f),
                            unfocusedContainerColor = Color.White.copy(alpha = 0.92f),
                            focusedBorderColor = DS.blue.copy(alpha = 0.5f),
                            unfocusedBorderColor = DS.panelBorder,
                            focusedTextColor = DS.text,
                            unfocusedTextColor = DS.text,
                        ),
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TextButton(
                            onClick = {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sessionTokenDocsUrl)))
                            }
                        ) {
                            Text(
                                "Get Temporary Session Token",
                                color = DS.blue,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }

                        OutlinedButton(
                            onClick = onInitializeAvatar,
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text("Reinitialize Avatar", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp)
                ) {
                    StageViewport(
                        status = status,
                        errorMsg = errorMsg,
                        canCreateAvatarView = canCreateAvatarView,
                        onAvatarViewCreated = onAvatarViewCreated,
                    )

                    Button(
                        onClick = onToggleConversation,
                        enabled = !talkButtonDisabled,
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isListening) {
                                Color(0x33FF6B6B)
                            } else {
                                Color.White.copy(alpha = 0.26f)
                            },
                            contentColor = Color.White,
                            disabledContainerColor = Color.White.copy(alpha = 0.20f),
                            disabledContentColor = Color.White.copy(alpha = 0.78f),
                        ),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 24.dp)
                            .fillMaxWidth(0.56f),
                    ) {
                        Text(talkButtonText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }

                if (status == LoadStatus.Error && errorMsg.isNotBlank()) {
                    Text(
                        text = errorMsg,
                        color = DS.chipErrFg,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Runtime Logs",
                        color = DS.title,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )

                    if (logs.isEmpty()) {
                        Text(
                            text = "Waiting for actions...",
                            color = DS.muted,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp,
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            items(logs) { line ->
                                val lowerLine = line.lowercase(Locale.US)
                                val isErrorLine = line.contains("[ERROR]") || lowerLine.contains("failed") || lowerLine.contains("error")
                                Text(
                                    text = line,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 10.sp,
                                    color = if (isErrorLine) DS.chipErrFg else DS.text,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(
                                            if (isErrorLine) DS.logErrBg else Color.White.copy(alpha = 0.90f),
                                            RoundedCornerShape(7.dp)
                                        )
                                        .border(
                                            1.dp,
                                            if (isErrorLine) DS.logErrBorder else DS.logBorder,
                                            RoundedCornerShape(7.dp)
                                        )
                                        .padding(horizontal = 8.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
