import AVFoundation

/// Microphone capture with simple energy-based VAD, matching the web client logic.
final class AudioRecorderService: NSObject {
    private let engine = AVAudioEngine()
    private var isCapturing = false

    /// Called on the main queue when a speech segment completes.
    /// The Data contains PCM16 mono audio at the engine's input sample rate (usually 48 kHz).
    var onSegment: ((Data) -> Void)?

    // VAD state
    private var segmentActive = false
    private var segmentStartTime: TimeInterval = 0
    private var speechFrameCount = 0
    private var lastSpeechTime: TimeInterval = 0
    private var segmentBuffers: [AVAudioPCMBuffer] = []

    // Suppression flag: skip VAD while the avatar is speaking / pipeline is busy.
    var isSuppressed = false

    func start() throws {
        guard !isCapturing else { return }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try session.setActive(true)

        let inputNode = engine.inputNode
        let hwFormat = inputNode.outputFormat(forBus: 0)

        // Install a tap on the input node for VAD analysis.
        inputNode.installTap(onBus: 0, bufferSize: 2048, format: hwFormat) { [weak self] buffer, _ in
            self?.processBuffer(buffer)
        }

        try engine.start()
        isCapturing = true
        speechFrameCount = 0
        lastSpeechTime = CACurrentMediaTime()
    }

    func stop() {
        guard isCapturing else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isCapturing = false
        segmentActive = false
        segmentBuffers.removeAll()
    }

    // MARK: - VAD

    private func processBuffer(_ buffer: AVAudioPCMBuffer) {
        // If suppressed (avatar speaking), keep resetting.
        if isSuppressed {
            if segmentActive {
                segmentActive = false
                segmentBuffers.removeAll()
            }
            speechFrameCount = 0
            return
        }

        let rms = Self.rms(of: buffer)
        let now = CACurrentMediaTime()
        let threshold = segmentActive ? Config.vadStopThreshold : Config.vadStartThreshold

        if rms >= threshold {
            speechFrameCount += 1
            lastSpeechTime = now
            if !segmentActive && speechFrameCount >= 3 {
                beginSegment(at: now)
            }
        } else {
            speechFrameCount = 0
            if segmentActive && (now - lastSpeechTime) >= Config.vadSilenceSeconds {
                endSegment(at: now)
            }
        }

        if segmentActive {
            segmentBuffers.append(buffer)
        }
    }

    private func beginSegment(at time: TimeInterval) {
        segmentActive = true
        segmentStartTime = time
        segmentBuffers.removeAll()
    }

    private func endSegment(at now: TimeInterval) {
        segmentActive = false
        let duration = now - segmentStartTime
        let buffers = segmentBuffers
        segmentBuffers = []

        guard duration >= Config.vadMinSpeechSeconds, !buffers.isEmpty else { return }

        // Convert captured buffers to mono PCM16 Data at hardware sample rate.
        let pcmData = Self.toPCM16Data(buffers)
        guard !pcmData.isEmpty else { return }

        DispatchQueue.main.async { [weak self] in
            self?.onSegment?(pcmData)
        }
    }

    // MARK: - Helpers

    private static func rms(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        let samples = channelData[0]
        for i in 0..<count {
            let s = samples[i]
            sum += s * s
        }
        return sqrtf(sum / Float(count))
    }

    /// Converts an array of PCM float buffers into mono PCM16 little-endian Data.
    private static func toPCM16Data(_ buffers: [AVAudioPCMBuffer]) -> Data {
        var data = Data()
        for buffer in buffers {
            guard let channelData = buffer.floatChannelData else { continue }
            let count = Int(buffer.frameLength)
            let samples = channelData[0]
            for i in 0..<count {
                let clamped = max(-1.0, min(1.0, samples[i]))
                var sample = Int16(clamped * 32767)
                withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
            }
        }
        return data
    }
}
