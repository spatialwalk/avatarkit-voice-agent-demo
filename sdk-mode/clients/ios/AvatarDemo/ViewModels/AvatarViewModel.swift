import SwiftUI
import Combine
import AVFoundation
import AvatarKit

@MainActor class AvatarViewModel: ObservableObject {
    @Published var connectionState: String = "\(ConnectionState.disconnected)"
    @Published var conversationState: String = "\(ConversationState.idle)"
    @Published var errorMessage: String?
    @Published var isSendingAudio = false
    @Published var currentlyPlayingFile: String?
    @Published var avatar: Avatar?

    let audioFiles: [String]
    private var isConnected = false
    private var avatarController: AvatarController?
    private var sendAudioTask: Task<Void, Never>?

    init() {
        var files: [String] = []
        if let path = Bundle.main.resourcePath {
            let enumerator = FileManager.default.enumerator(atPath: path)
            while let item = enumerator?.nextObject() as? String {
                if item.hasSuffix(".pcm") {
                    files.append((item as NSString).lastPathComponent)
                }
            }
        }
        audioFiles = files.sorted()
    }

    func setAvatarController(_ controller: AvatarController) {
        avatarController = controller
        avatarController?.onConnectionState = { [weak self] state in
            guard let self else { return }
            self.connectionState = "\(state)"
            switch state {
            case .connected:
                self.isConnected = true
            case .disconnected, .failed:
                self.isConnected = false
                self.cancelSending()
            case .connecting:
                break
            @unknown default:
                break
            }
        }
        avatarController?.onConversationState = { [weak self] state in
            guard let self else { return }
            self.conversationState = "\(state)"
        }
        avatarController?.onError = { [weak self] error in
            self?.errorMessage = error.localizedDescription
        }
    }

    func start() { avatarController?.start() }

    func sendAudioFile(_ filename: String) {
        guard let controller = avatarController, isConnected else { return }
        cancelSending()
        controller.interrupt()

        let name = filename.replacingOccurrences(of: ".pcm", with: "")
        guard let url = Bundle.main.url(forResource: name, withExtension: "pcm"),
              let audioData = try? Data(contentsOf: url) else {
            errorMessage = "Cannot read \(filename)"
            return
        }

        isSendingAudio = true
        currentlyPlayingFile = filename

        let chunkSize = AvatarSDK.configuration.audioFormat.sampleRate * 2

        sendAudioTask = Task {
            var offset = 0
            while offset < audioData.count, !Task.isCancelled, self.isConnected {
                let end = min(offset + chunkSize, audioData.count)
                let isLast = end >= audioData.count
                controller.send(Data(audioData[offset..<end]), end: isLast)
                offset = end
                if !isLast {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
            }
            if !Task.isCancelled {
                self.isSendingAudio = false
                self.currentlyPlayingFile = nil
            }
        }
    }

    func pause() { avatarController?.pause() }
    func resume() { avatarController?.resume() }

    func interrupt() {
        cancelSending()
        avatarController?.interrupt()
    }

    func close() {
        cancelSending()
        avatarController?.close()
    }

    private func cancelSending() {
        sendAudioTask?.cancel()
        sendAudioTask = nil
        isSendingAudio = false
        currentlyPlayingFile = nil
    }
}
