import Foundation

/// Sentence splitting for TTS, matching the web client's `splitForTTS`.
enum TextSplitter {
    private static let hardBoundary: Set<Character> = ["。", "！", "？", ".", "!", "?"]
    private static let softBoundary: Set<Character> = ["，", ",", "；", ";", "：", ":", "\n"]
    private static let minChunkChars = 18
    private static let maxChunkChars = 72
    private static let minTailChars = 8

    struct Result {
        let sentences: [String]
        let carry: String
    }

    static func split(_ text: String, flushTail: Bool = false) -> Result {
        var sentences: [String] = []
        var carry = ""
        var preferredBreak = -1

        let chars = Array(text)
        for i in 0..<chars.count {
            let ch = chars[i]
            carry.append(ch)

            let isHard = hardBoundary.contains(ch)
            let isSoft = softBoundary.contains(ch)

            if isHard {
                let trimmed = carry.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty { sentences.append(trimmed) }
                carry = ""
                preferredBreak = -1
                continue
            }

            if isSoft && carry.count >= minChunkChars {
                preferredBreak = carry.count
            }

            if carry.count >= maxChunkChars {
                if preferredBreak > 0 {
                    let breakIndex = carry.index(carry.startIndex, offsetBy: preferredBreak)
                    let head = String(carry[..<breakIndex]).trimmingCharacters(in: .whitespaces)
                    if !head.isEmpty { sentences.append(head) }
                    carry = String(carry[breakIndex...]).trimmingCharacters(in: .init(charactersIn: " \t"))
                    preferredBreak = -1
                } else if carry.count >= maxChunkChars + 40 {
                    let trimmed = carry.trimmingCharacters(in: .whitespaces)
                    if !trimmed.isEmpty { sentences.append(trimmed) }
                    carry = ""
                }
            }
        }

        if flushTail {
            let tail = carry.trimmingCharacters(in: .whitespaces)
            if !tail.isEmpty {
                if tail.count < minTailChars, let last = sentences.last {
                    sentences[sentences.count - 1] = last + tail
                } else {
                    sentences.append(tail)
                }
            }
            carry = ""
        }

        return Result(sentences: sentences, carry: carry)
    }
}
