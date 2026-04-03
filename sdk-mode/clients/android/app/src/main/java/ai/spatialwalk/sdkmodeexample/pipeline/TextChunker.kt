package ai.spatialwalk.sdkmodeexample.pipeline

object TextChunker {
    data class SplitResult(
        val sentences: List<String>,
        val carry: String,
    )

    private val hardBoundaryChars = setOf('。', '！', '？', '.', '!', '?')
    private val softBoundaryChars = setOf('，', ',', '；', ';', '：', ':', '\n')
    private val openBrackets = setOf('(', '[', '{', '（', '【', '《', '「', '『', '“', '‘')
    private val closeBrackets = setOf(')', ']', '}', '）', '】', '》', '」', '』', '”', '’')

    private val wordRegex = Regex("[A-Za-z]+(?:'[A-Za-z]+)*")
    private val cjkRegex = Regex("[\\u3400-\\u9FFF\\uF900-\\uFAFF]")

    private const val MIN_CHUNK_CHARS = 18
    private const val MAX_CHUNK_CHARS = 72
    private const val MIN_CHUNK_WORDS = 10
    private const val MAX_CHUNK_WORDS = 30
    private const val MIN_TAIL_CHARS = 8
    private const val MIN_TAIL_WORDS = 4

    fun splitForTts(text: String, flushTail: Boolean): SplitResult {
        val sentences = mutableListOf<String>()
        var carry = ""
        var preferredBreak = -1

        fun pushSentence(value: String) {
            val sentence = value.trim()
            if (sentence.isNotEmpty()) {
                sentences += sentence
            }
        }

        fun appendTailToLast(tail: String) {
            if (tail.isBlank()) return
            if (sentences.isEmpty()) {
                pushSentence(tail)
                return
            }

            val prev = sentences.last()
            val cleanedTail = tail.trim()
            val needSpace = prev.lastOrNull()?.let { it.isLetterOrDigit() } == true &&
                cleanedTail.firstOrNull()?.let { it.isLetterOrDigit() } == true
            sentences[sentences.lastIndex] = prev + (if (needSpace) " " else "") + cleanedTail
        }

        var index = 0
        while (index < text.length) {
            val ch = text[index]
            carry += ch

            val hasOpenPair = hasUnclosedPairs(carry)
            val isHardBoundary = hardBoundaryChars.contains(ch)
            val isSoftBoundary = softBoundaryChars.contains(ch)

            if (isHardBoundary && !(ch == '.' && isProtectedDot(text, index)) && !hasOpenPair) {
                pushSentence(carry)
                carry = ""
                preferredBreak = -1
                index += 1
                continue
            }

            if (isSoftBoundary && reachesMinChunk(carry) && !hasOpenPair) {
                preferredBreak = carry.length
            }

            if (reachesMaxChunk(carry)) {
                if (preferredBreak > 0) {
                    pushSentence(carry.substring(0, preferredBreak))
                    carry = carry.substring(preferredBreak).trimStart()
                    preferredBreak = -1
                } else if (!hasOpenPair && carry.length >= MAX_CHUNK_CHARS + 40) {
                    pushSentence(carry)
                    carry = ""
                }
            }

            index += 1
        }

        if (flushTail) {
            val tail = carry.trim()
            if (tail.isNotEmpty()) {
                val shortTail = countCjkChars(tail) < MIN_TAIL_CHARS &&
                    countWords(tail) < MIN_TAIL_WORDS &&
                    tail.replace("\\s+".toRegex(), "").length < MIN_TAIL_CHARS
                if (shortTail) {
                    appendTailToLast(tail)
                } else {
                    pushSentence(tail)
                }
            }
            carry = ""
        }

        return SplitResult(sentences = sentences, carry = carry)
    }

    private fun reachesMinChunk(text: String): Boolean {
        val cjkChars = countCjkChars(text)
        val words = countWords(text)
        val plainChars = text.replace("\\s+".toRegex(), "").length
        return cjkChars >= MIN_CHUNK_CHARS || words >= MIN_CHUNK_WORDS || plainChars >= MIN_CHUNK_CHARS
    }

    private fun reachesMaxChunk(text: String): Boolean {
        val cjkChars = countCjkChars(text)
        val words = countWords(text)
        val plainChars = text.replace("\\s+".toRegex(), "").length
        return cjkChars >= MAX_CHUNK_CHARS || words >= MAX_CHUNK_WORDS || plainChars >= MAX_CHUNK_CHARS
    }

    private fun countWords(text: String): Int = wordRegex.findAll(text).count()

    private fun countCjkChars(text: String): Int = cjkRegex.findAll(text).count()

    private fun hasUnclosedPairs(text: String): Boolean {
        var balance = 0
        for (ch in text) {
            if (openBrackets.contains(ch)) balance += 1
            if (closeBrackets.contains(ch)) balance -= 1
        }
        return balance > 0
    }

    private fun isProtectedDot(text: String, index: Int): Boolean {
        val prev = text.getOrNull(index - 1) ?: '\u0000'
        val next = text.getOrNull(index + 1) ?: '\u0000'

        val decimalLike = prev.isDigit() && next.isDigit()
        if (decimalLike) return true

        val prefix = text.substring(0, index)
        val prevToken = Regex("([A-Za-z]{1,4})$").find(prefix)?.groupValues?.get(1)
        val nextLetter = next.isLetter()
        if (!prevToken.isNullOrEmpty() && nextLetter) return true

        return false
    }
}
