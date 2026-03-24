import Foundation

/// Thin wrapper around OpenAI REST APIs (ASR / Chat / TTS), matching the web client.
enum OpenAIService {

    // MARK: - ASR (Whisper)

    static func transcribe(pcmData: Data, sampleRate: Int) async throws -> String {
        // Convert raw PCM16 to WAV in-memory so OpenAI accepts it.
        let wavData = wavEncode(pcm16: pcmData, sampleRate: sampleRate, channels: 1)

        let boundary = UUID().uuidString
        var body = Data()
        func appendField(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
        }
        func appendFile(_ name: String, _ filename: String, _ mime: String, _ data: Data) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\nContent-Type: \(mime)\r\n\r\n")
            body.append(data)
            body.append("\r\n")
        }
        appendField("model", Config.openAISttModel)
        appendField("language", Config.openAISttLanguage)
        appendFile("file", "speech.wav", "audio/wav", wavData)
        body.append("--\(boundary)--\r\n")

        var request = URLRequest(url: URL(string: "\(Config.openAIBase)/v1/audio/transcriptions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(Config.openAIApiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw OpenAIError.api("ASR failed: \(String(data: data, encoding: .utf8) ?? "")")
        }
        let decoded = try JSONDecoder().decode(TranscriptionResponse.self, from: data)
        return decoded.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - LLM (streaming)

    static func chatStream(
        text: String,
        onDelta: @escaping (String) -> Void
    ) async throws -> String {
        let payload: [String: Any] = [
            "model": Config.openAIModel,
            "stream": true,
            "messages": [
                ["role": "system", "content": "You are concise and natural for spoken avatar conversation."],
                ["role": "user", "content": text],
            ],
        ]

        var request = URLRequest(url: URL(string: "\(Config.openAIBase)/v1/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(Config.openAIApiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw OpenAIError.api("LLM request failed")
        }

        var fullReply = ""
        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("data:") else { continue }
            let payload = trimmed.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard payload != "[DONE]", !payload.isEmpty else { continue }
            guard let jsonData = payload.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let delta = choices.first?["delta"] as? [String: Any],
                  let content = delta["content"] as? String, !content.isEmpty
            else { continue }
            fullReply += content
            onDelta(content)
        }

        return fullReply.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - TTS

    /// Returns raw 24 kHz 16-bit signed LE mono PCM.
    static func synthesize(text: String) async throws -> Data {
        let payload: [String: Any] = [
            "model": Config.openAITtsModel,
            "voice": Config.openAITtsVoice,
            "input": text,
            "response_format": "pcm",
        ]

        var request = URLRequest(url: URL(string: "\(Config.openAIBase)/v1/audio/speech")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(Config.openAIApiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw OpenAIError.api("TTS failed: \(String(data: data, encoding: .utf8) ?? "")")
        }
        // OpenAI returns raw 24 kHz 16-bit signed LE mono PCM.
        return data
    }

    // MARK: - Helpers

    enum OpenAIError: LocalizedError {
        case api(String)
        var errorDescription: String? {
            switch self { case .api(let msg): return msg }
        }
    }

    private struct TranscriptionResponse: Decodable {
        let text: String
    }

    /// Wraps raw PCM16 LE data in a minimal WAV header.
    private static func wavEncode(pcm16: Data, sampleRate: Int, channels: Int) -> Data {
        let bitsPerSample = 16
        let byteRate = sampleRate * channels * (bitsPerSample / 8)
        let blockAlign = channels * (bitsPerSample / 8)
        let dataSize = pcm16.count
        let chunkSize = 36 + dataSize

        var wav = Data()
        wav.append("RIFF")
        wav.appendLE(UInt32(chunkSize))
        wav.append("WAVE")
        wav.append("fmt ")
        wav.appendLE(UInt32(16))               // subchunk1 size
        wav.appendLE(UInt16(1))                // PCM
        wav.appendLE(UInt16(channels))
        wav.appendLE(UInt32(sampleRate))
        wav.appendLE(UInt32(byteRate))
        wav.appendLE(UInt16(blockAlign))
        wav.appendLE(UInt16(bitsPerSample))
        wav.append("data")
        wav.appendLE(UInt32(dataSize))
        wav.append(pcm16)
        return wav
    }
}

// MARK: - Data helpers

private extension Data {
    mutating func append(_ string: String) {
        if let d = string.data(using: .utf8) { append(d) }
    }
    mutating func appendLE(_ value: UInt16) {
        var v = value.littleEndian
        append(Swift.withUnsafeBytes(of: &v) { Data($0) })
    }
    mutating func appendLE(_ value: UInt32) {
        var v = value.littleEndian
        append(Swift.withUnsafeBytes(of: &v) { Data($0) })
    }
}
