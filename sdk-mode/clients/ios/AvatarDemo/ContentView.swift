import AvatarKit
import SwiftUI

// MARK: - SwiftUI ↔ UIKit bridge (matches official demo pattern)

struct AvatarViewRepresentable: UIViewRepresentable {
    let avatar: Avatar
    let onCreated: (AvatarController) -> Void

    func makeUIView(context: Context) -> AvatarView {
        let view = AvatarView(avatar: avatar)
        view.isOpaque = false
        view.contentTransform = .identity
        onCreated(view.avatarController)
        return view
    }

    func updateUIView(_ uiView: AvatarView, context: Context) {}
}

// MARK: - ViewModel

@MainActor
final class AvatarViewModel: ObservableObject {
    struct LogEntry: Identifiable {
        enum Level { case info, error }
        let id = UUID()
        let message: String
        let level: Level
    }

    // UI state
    @Published var status: Status = .loading
    @Published var errorMessage = ""
    @Published var logs: [LogEntry] = []
    @Published var isListening = false
    @Published var isConnectingConversation = false
    @Published var avatar: Avatar?
    @Published var sessionTokenInput = ""

    enum Status { case idle, loading, ready, error }

    private static let sessionTokenDocsURL = SessionTokenService.temporaryTokenDocsURL

    private let recorder = AudioRecorderService()
    private var controller: AvatarController?
    private var avatarSpeaking = false
    private var processing = false
    private var connectionState = "disconnected"
    private var isManualDisconnect = false
    private var lastConnectionState = ""
    private var lastConversationState = ""

    // MARK: - Logs

    func pushLog(_ msg: String, level: LogEntry.Level = .info) {
        let time = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        let tag = level == .error ? "[ERROR]" : "[INFO]"
        let entry = "\(time) \(tag) \(msg)"
        logs.insert(LogEntry(message: entry, level: level), at: 0)
        if logs.count > 50 { logs = Array(logs.prefix(50)) }
    }

    // MARK: - Controller setup (called from UIViewRepresentable)

    func setController(_ controller: AvatarController) {
        self.controller = controller

        controller.onFirstRendering = { [weak self] in
            Task { @MainActor in
                self?.pushLog("Avatar first frame rendered")
            }
        }

        controller.onConnectionState = { [weak self] state in
            Task { @MainActor in
                guard let self else { return }
                let stateText = "\(state)"
                if stateText == self.lastConnectionState {
                    return
                }
                self.lastConnectionState = stateText

                switch state {
                case .connecting:
                    self.connectionState = "connecting"
                    self.pushLog("Connection state: \(stateText) (connecting)")

                case .connected:
                    self.connectionState = "connected"
                    self.isManualDisconnect = false
                    self.pushLog("Connection state: \(stateText) (connected)")

                case .disconnected:
                    self.connectionState = "disconnected"
                    let closedByClient = self.isManualDisconnect
                    self.isManualDisconnect = false

                    if closedByClient {
                        self.pushLog("Connection state: \(stateText) (closed)")
                    } else {
                        self.pushLog("Connection state: \(stateText) (disconnected)", level: .error)
                        if self.isListening {
                            self.recorder.stop()
                            self.isListening = false
                            self.processing = false
                            self.avatarSpeaking = false
                            self.recorder.isSuppressed = false
                            self.pushLog("Connection dropped unexpectedly. Conversation stopped", level: .error)
                        }
                    }

                case .failed(let error):
                    self.connectionState = "failed"
                    self.isManualDisconnect = false
                    self.pushLog(
                        "Connection state: \(stateText) (failed: \(error.localizedDescription))",
                        level: .error
                    )

                @unknown default:
                    self.connectionState = Self.normalizedConnectionState(stateText)
                    self.isManualDisconnect = false
                    self.pushLog("Connection state: \(stateText) (unrecognized)", level: .error)
                }
            }
        }

        controller.onConversationState = { [weak self] state in
            Task { @MainActor in
                guard let self else { return }

                let stateText = "\(state)"
                if stateText != self.lastConversationState {
                    self.lastConversationState = stateText
                    self.pushLog("Conversation state: \(stateText)")
                }

                switch state {
                case .playing:
                    if !self.avatarSpeaking {
                        self.avatarSpeaking = true
                        self.recorder.isSuppressed = true
                        self.pushLog("Avatar started speaking")
                    }
                case .idle:
                    if self.avatarSpeaking {
                        self.avatarSpeaking = false
                        if !self.processing {
                            self.recorder.isSuppressed = false
                        }
                        self.pushLog("Avatar finished speaking")
                    }

                case .paused:
                    self.pushLog("Conversation paused")

                @unknown default:
                    self.pushLog("Unknown conversation state: \(stateText)")
                }
            }
        }

        controller.onError = { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                let message = error.localizedDescription
                self.pushLog("SDK error: \(message)", level: .error)

                if message.lowercased().contains("sessiontokeninvalid") {
                    self.pushLog(
                        "Invalid Session Token: make sure you pasted a temporary Session Token (not an API key). Link: \(Self.sessionTokenDocsURL)",
                        level: .error
                    )
                    self.pushLog(
                        "Also verify token expiration, AppID match (\(Config.appID)), and intl environment.",
                        level: .error
                    )
                }

                if message.lowercased().contains("sessiontokenexpired") {
                    self.pushLog("Session Token expired. Generate a new one and retry.", level: .error)
                }
            }
        }
    }

    // MARK: - Initialize SDK + load avatar

    func initialize() async {
        status = .loading
        errorMessage = ""
        isConnectingConversation = false
        isManualDisconnect = false
        connectionState = "disconnected"
        lastConnectionState = ""
        lastConversationState = ""
        pushLog("Initializing...")

        do {
            let sessionToken = Self.normalizedSessionToken(sessionTokenInput)
            if !sessionToken.isEmpty {
                AvatarSDK.sessionToken = sessionToken
                if sessionToken != sessionTokenInput.trimmingCharacters(in: .whitespacesAndNewlines) {
                    sessionTokenInput = sessionToken
                    pushLog("Removed Bearer prefix from Session Token")
                }
                pushLog("Applied manual Session Token")
            }

            // Initialize AvatarSDK
            pushLog("Initializing AvatarSDK...")
            AvatarSDK.initialize(
                appID: Config.appID,
                configuration: Configuration(
                    environment: .intl,
                    audioFormat: AudioFormat(sampleRate: Config.avatarSampleRate),
                    drivingServiceMode: .sdk,
                    logLevel: .warning
                )
            )
            // Load avatar
            pushLog("Loading avatar: \(Config.avatarID)")
            let loadedAvatar = try await AvatarManager.shared.load(id: Config.avatarID) { [weak self] progress in
                Task { @MainActor in
                    self?.pushLog("Download progress: \(Int(progress.fractionCompleted * 100))%")
                }
            }

            avatar = loadedAvatar
            status = .ready
            pushLog("Avatar loaded. Tap \"Start Conversation\" to begin the voice pipeline")
        } catch {
            status = .error
            errorMessage = error.localizedDescription
            pushLog("Initialization failed: \(error.localizedDescription)", level: .error)
        }
    }

    // MARK: - Conversation

    func startConversation() {
        guard !isListening, !isConnectingConversation, status == .ready else { return }

        let sessionToken = Self.normalizedSessionToken(sessionTokenInput)
        guard !sessionToken.isEmpty else {
            pushLog("Please enter Session Token before starting conversation. Link: \(Self.sessionTokenDocsURL)", level: .error)
            return
        }

        if sessionToken != sessionTokenInput.trimmingCharacters(in: .whitespacesAndNewlines) {
            sessionTokenInput = sessionToken
            pushLog("Removed Bearer prefix from Session Token")
        }

        guard !Config.openAIApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !Self.isPlaceholder(Config.openAIApiKey) else {
            pushLog(
                "OpenAI API Key is missing or still a placeholder. Update Config.swift and retry. OpenAI Key: https://platform.openai.com/api-keys",
                level: .error
            )
            return
        }

        AvatarSDK.sessionToken = sessionToken

        guard let controller else {
            pushLog("Avatar controller unavailable", level: .error)
            return
        }

        isConnectingConversation = true
        Task { @MainActor in
            defer { self.isConnectingConversation = false }

            let connected = await ensureConnected(controller)
            guard connected else { return }

            recorder.onSegment = { [weak self] pcmData in
                guard let self else { return }
                Task { @MainActor in
                    await self.processSegment(pcmData: pcmData)
                }
            }

            do {
                try recorder.start()
                isListening = true
                pushLog("Microphone started, waiting for speech...")
            } catch {
                pushLog("Failed to start microphone: \(error.localizedDescription)", level: .error)
            }
        }
    }

    func stopConversation() {
        guard isListening else { return }
        recorder.stop()
        isManualDisconnect = true
        connectionState = "disconnected"
        controller?.close()
        isListening = false
        isConnectingConversation = false
        processing = false
        avatarSpeaking = false
        recorder.isSuppressed = false
        pushLog("Conversation stopped")
    }

    private func ensureConnected(_ controller: AvatarController) async -> Bool {
        if Self.isConnectedConnectionState(connectionState) {
            return true
        }

        pushLog("Authenticating and establishing connection...")
        isManualDisconnect = false
        controller.start()

        let startAt = Date().timeIntervalSince1970
        var sawConnecting = Self.isConnectingConnectionState(connectionState)
        while Date().timeIntervalSince1970 - startAt < 12 {
            let state = connectionState
            if Self.isConnectedConnectionState(state) {
                pushLog("Authentication succeeded, connection established")
                return true
            }
            if Self.isConnectingConnectionState(state) {
                sawConnecting = true
            }
            if sawConnecting, Self.isDisconnectedConnectionState(state) {
                break
            }
            if Self.isFailedConnectionState(state) {
                break
            }
            try? await Task.sleep(nanoseconds: 80_000_000)
        }

        pushLog("Authentication failed or connection timed out. Check Session Token.", level: .error)
        return false
    }

    // MARK: - ASR → LLM (stream) → TTS → Avatar

    private func processSegment(pcmData: Data) async {
        guard !processing, let controller else { return }
        processing = true
        recorder.isSuppressed = true

        defer {
            processing = false
            if !avatarSpeaking {
                recorder.isSuppressed = false
            }
        }

        do {
            pushLog("Speech segment \(pcmData.count / 1024)KB, starting ASR...")

            // AVAudioEngine on simulator typically captures at 48 kHz
            let inputSampleRate = 48000
            let text = try await OpenAIService.transcribe(pcmData: pcmData, sampleRate: inputSampleRate)
            guard !text.isEmpty else {
                pushLog("ASR did not return valid text")
                return
            }
            pushLog("ASR transcript: \"\(text)\"")

            // Stream LLM → split sentences → TTS each → send to avatar in order
            pushLog("Calling LLM (streaming)...")

            var pending = ""
            var sentenceQueue: [(index: Int, task: Task<Data, Error>)] = []
            var nextIndex = 0

            let enqueueSentence = { (sentence: String) in
                let idx = nextIndex
                nextIndex += 1
                let task = Task<Data, Error> {
                    try await OpenAIService.synthesize(text: sentence)
                }
                sentenceQueue.append((index: idx, task: task))
            }

            let reply = try await OpenAIService.chatStream(text: text) { chunk in
                pending += chunk
                let result = TextSplitter.split(pending, flushTail: false)
                pending = result.carry
                for sentence in result.sentences {
                    enqueueSentence(sentence)
                }
            }

            // Flush remaining text
            let tail = TextSplitter.split(pending, flushTail: true)
            for sentence in tail.sentences {
                enqueueSentence(sentence)
            }

            // Send all TTS results to avatar in order
            for (i, entry) in sentenceQueue.enumerated() {
                let pcm = try await entry.task.value
                let isLast = (i == sentenceQueue.count - 1)
                controller.send(pcm, end: isLast)
                pushLog("Chunk #\(entry.index + 1) audio sent (\(pcm.count / 2) samples)")
            }

            pushLog("LLM reply: \"\(reply)\"")
        } catch {
            pushLog("Conversation failed: \(error.localizedDescription)", level: .error)
        }
    }

    private static func isPlaceholder(_ value: String) -> Bool {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let placeholders: Set<String> = [
            "sk-your_openai_api_key",
            "your_openai_api_key",
            "replace_me",
        ]
        return placeholders.contains(normalized)
    }

    private static func normalizedSessionToken(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.lowercased().hasPrefix("bearer ") {
            return String(trimmed.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return trimmed
    }

    private static func normalizedConnectionState(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func isConnectedConnectionState(_ value: String) -> Bool {
        normalizedConnectionState(value) == "connected"
    }

    private static func isConnectingConnectionState(_ value: String) -> Bool {
        normalizedConnectionState(value) == "connecting"
    }

    private static func isDisconnectedConnectionState(_ value: String) -> Bool {
        normalizedConnectionState(value) == "disconnected"
    }

    private static func isFailedConnectionState(_ value: String) -> Bool {
        normalizedConnectionState(value).contains("failed")
    }
}

// MARK: - Design tokens (matching web styles.css)

private enum DS {
    static let bg = Color(red: 0.96, green: 0.97, blue: 1.0) // #f5f8ff
    static let panel = Color.white.opacity(0.88)
    static let panelBorder = Color(red: 0.13, green: 0.29, blue: 0.54).opacity(0.15)
    static let title = Color(red: 0.04, green: 0.07, blue: 0.14) // #0b1323
    static let text = Color(red: 0.15, green: 0.21, blue: 0.31) // #27364f
    static let muted = Color(red: 0.37, green: 0.46, blue: 0.60) // #5f7598
    static let blue = Color(red: 0.15, green: 0.39, blue: 0.92) // #2563eb
    static let kicker = Color(red: 0.28, green: 0.44, blue: 0.76) // #4670c1
    static let chipOkFg = Color(red: 0.08, green: 0.39, blue: 0.18) // #14632f
    static let chipOkBg = Color(red: 0.09, green: 0.64, blue: 0.29).opacity(0.16)
    static let chipErrFg = Color(red: 0.60, green: 0.11, blue: 0.11) // #991b1b
    static let chipErrBg = Color(red: 0.94, green: 0.27, blue: 0.27).opacity(0.16)
    static let chipIdleFg = Color(red: 0.33, green: 0.39, blue: 0.49) // #54647c
    static let chipIdleBg = Color(red: 0.39, green: 0.45, blue: 0.55).opacity(0.16)
    static let logBorder = Color(red: 0.22, green: 0.35, blue: 0.57).opacity(0.18)
    static let logErrBorder = Color(red: 0.86, green: 0.15, blue: 0.15).opacity(0.32)
    static let logErrBg = Color(red: 0.996, green: 0.95, blue: 0.95).opacity(0.95)
}

// MARK: - ContentView

struct ContentView: View {
    @StateObject private var vm = AvatarViewModel()
    private let sessionTokenDocsURL = URL(string: SessionTokenService.temporaryTokenDocsURL)!

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("SPATIALREAL SDK MODE")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .tracking(0.8)
                        .foregroundColor(DS.kicker)
                    Text("Avatar Demo")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundColor(DS.title)
                }
                Spacer()
                statusChip
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 14)

            sessionTokenCard
                .padding(.horizontal, 14)
                .padding(.bottom, 10)

            // Stage card
            stageCard
                .padding(.horizontal, 14)

            // Log card (fills remaining space)
            logCard
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Spacer(minLength: 0)
        }
        .background(pageBackground.ignoresSafeArea())
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .task {
            await vm.initialize()
        }
    }

    // MARK: - Page background (matching web radial gradients)

    private var pageBackground: some View {
        ZStack {
            DS.bg
            // Blue accent (top-left)
            RadialGradient(
                colors: [DS.blue.opacity(0.2), .clear],
                center: UnitPoint(x: 0.07, y: 0.14),
                startRadius: 0,
                endRadius: UIScreen.main.bounds.width * 0.8
            )
            // Orange accent (top-right)
            RadialGradient(
                colors: [Color(red: 0.98, green: 0.45, blue: 0.09).opacity(0.14), .clear],
                center: UnitPoint(x: 0.92, y: 0.10),
                startRadius: 0,
                endRadius: UIScreen.main.bounds.width * 0.7
            )
        }
    }

    // MARK: - Stage card

    private var sessionTokenCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Session Token (Manual Paste)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(DS.title)

            TextField("Enter Session Token", text: $vm.sessionTokenInput)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
                .font(.system(size: 11, design: .monospaced))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.white.opacity(0.92))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(DS.panelBorder, lineWidth: 1)
                        )
                )

            HStack(spacing: 10) {
                Link("Get Temporary Session Token", destination: sessionTokenDocsURL)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.blue)

                Spacer()

                Button {
                    Task { await vm.initialize() }
                } label: {
                    Text("Reinitialize Avatar")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(
                                    LinearGradient(
                                        colors: [DS.blue, Color(red: 0.31, green: 0.27, blue: 0.90)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(DS.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(DS.panelBorder, lineWidth: 1)
                )
                .shadow(color: Color(red: 0.06, green: 0.09, blue: 0.16).opacity(0.08), radius: 14, y: 6)
        )
    }

    // MARK: - Stage card

    private var stageCard: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                // Stage area with background image
                GeometryReader { geo in
                    ZStack {
                        // Background image
                        Image("AvatarBg")
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()

                        // Avatar or placeholder
                        if let avatar = vm.avatar {
                            AvatarViewRepresentable(avatar: avatar) { controller in
                                vm.setController(controller)
                            }
                        } else {
                            if vm.status == .idle {
                                VStack(spacing: 8) {
                                    Text("Waiting for Avatar initialization")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(.white.opacity(0.85))
                                    Text("If this fails, tap \"Reinitialize Avatar\"")
                                        .font(.system(size: 10, weight: .regular))
                                        .foregroundColor(.white.opacity(0.7))
                                }
                            } else if vm.status == .loading {
                                VStack(spacing: 8) {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                    Text("Loading...")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(.white.opacity(0.8))
                                }
                            } else if vm.status == .error {
                                VStack(spacing: 10) {
                                    Text(vm.errorMessage)
                                        .font(.system(size: 11))
                                        .foregroundColor(DS.chipErrFg)
                                        .multilineTextAlignment(.center)
                                        .padding(.horizontal, 20)
                                    Button {
                                        Task { await vm.initialize() }
                                    } label: {
                                        Text("Retry")
                                            .font(.system(size: 12, weight: .bold))
                                            .foregroundColor(.white)
                                            .padding(.horizontal, 20)
                                            .padding(.vertical, 8)
                                            .background(
                                                RoundedRectangle(cornerRadius: 10)
                                                    .fill(
                                                        LinearGradient(
                                                            colors: [DS.blue, Color(red: 0.31, green: 0.27, blue: 0.90)],
                                                            startPoint: .topLeading, endPoint: .bottomTrailing
                                                        )
                                                    )
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color.white.opacity(0.85))
                                .background(.ultraThinMaterial)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: UIScreen.main.bounds.height * 0.52)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color(red: 0.20, green: 0.33, blue: 0.54).opacity(0.18), lineWidth: 1)
                )

                // Talk button
                talkButton
                    .padding(.bottom, 28)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(DS.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(DS.panelBorder, lineWidth: 1)
                )
                .shadow(color: Color(red: 0.06, green: 0.09, blue: 0.16).opacity(0.08), radius: 14, y: 6)
        )
    }

    // MARK: - Log card

    private var logCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Runtime Logs")
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundColor(DS.title)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 5) {
                    if vm.logs.isEmpty {
                        Text("Waiting for actions...")
                            .foregroundColor(DS.muted)
                            .font(.system(size: 10, design: .monospaced))
                    }
                    ForEach(vm.logs) { entry in
                        Text(entry.message)
                            .font(.system(size: 10, design: .monospaced))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .foregroundColor(entry.level == .error ? DS.chipErrFg : DS.text)
                            .background(
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(entry.level == .error ? DS.logErrBg : Color.white.opacity(0.9))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 7)
                                            .stroke(entry.level == .error ? DS.logErrBorder : DS.logBorder, lineWidth: 1)
                                    )
                            )
                    }
                }
            }
            .frame(maxHeight: 160)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(DS.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(DS.panelBorder, lineWidth: 1)
                )
                .shadow(color: Color(red: 0.06, green: 0.09, blue: 0.16).opacity(0.08), radius: 14, y: 6)
        )
    }

    // MARK: - Status chip

    private var statusChip: some View {
        Text(
            vm.status == .ready
                ? "Ready"
                : vm.status == .error
                    ? "Load failed"
                    : vm.status == .loading
                        ? "Loading..."
                        : "Not initialized"
        )
            .font(.system(size: 10, weight: .medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule().fill(
                    vm.status == .ready ? DS.chipOkBg :
                    vm.status == .error ? DS.chipErrBg :
                    DS.chipIdleBg
                )
            )
            .foregroundColor(
                    vm.status == .ready ? DS.chipOkFg :
                    vm.status == .error ? DS.chipErrFg :
                    DS.chipIdleFg
            )
    }

    // MARK: - Talk button (glassmorphism, matching web .talk-btn)

    private var talkButton: some View {
        Button {
            if vm.isListening {
                vm.stopConversation()
            } else {
                vm.startConversation()
            }
        } label: {
            Text(talkButtonText)
                .font(.system(size: 13, weight: .bold))
                .tracking(0.3)
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(
                    Capsule()
                        .fill(vm.isListening
                              ? Color.red.opacity(0.2)
                              : Color.white.opacity(0.25))
                )
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(
                    Capsule()
                        .stroke(
                            vm.isListening
                                ? Color(red: 0.99, green: 0.65, blue: 0.65).opacity(0.5)
                                : Color.white.opacity(0.5),
                            lineWidth: 1
                        )
                )
                .shadow(
                    color: vm.isListening
                        ? Color.red.opacity(0.3)
                        : Color.black.opacity(0.1),
                    radius: vm.isListening ? 10 : 8,
                    y: 2
                )
        }
        .disabled(talkButtonDisabled)
        .opacity(talkButtonDisabled ? 0.5 : 1)
    }

    private var talkButtonText: String {
        if vm.isListening { return "End Conversation" }
        if vm.isConnectingConversation { return "Authenticating..." }
        switch vm.status {
        case .idle: return "Not initialized"
        case .loading: return "Loading..."
        case .error: return "Initialization failed"
        case .ready: return "Start Conversation"
        }
    }

    private var talkButtonDisabled: Bool {
        if vm.isListening { return false }
        return vm.status != .ready || vm.isConnectingConversation
    }
}
