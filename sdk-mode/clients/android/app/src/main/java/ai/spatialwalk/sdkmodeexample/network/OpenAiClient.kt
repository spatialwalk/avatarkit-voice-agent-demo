package ai.spatialwalk.sdkmodeexample.network

import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class OpenAiConfig(
    val apiKey: String,
    val baseUrl: String,
    val useProxy: Boolean = false,
    val proxyBaseUrl: String = "",
    val chatModel: String,
    val sttModel: String,
    val sttLanguage: String = "en",
    val ttsModel: String,
    val ttsVoice: String,
)

class OpenAiClient(
    private val config: OpenAiConfig,
    private val client: OkHttpClient = defaultHttpClient(),
) {
    fun transcribe(pcm16: ByteArray, sampleRate: Int): String {
        val wavData = pcm16ToWav(pcm16, sampleRate)

        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                "speech.wav",
                wavData.toRequestBody("audio/wav".toMediaType()),
            )
            .addFormDataPart("model", config.sttModel)
            .addFormDataPart("language", config.sttLanguage)
            .build()

        val request = Request.Builder()
            .post(requestBody)

        val finalRequest = withAuth(request)
            .url(endpoint("audio/transcriptions"))
            .build()

        client.newCall(finalRequest).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("ASR failed: $raw")
            }

            val payload = JSONObject(raw.ifBlank { "{}" })
            return payload.optString("text").trim()
        }
    }

    fun runLlmStream(userText: String, onDelta: (String) -> Unit): String {
        val payload = JSONObject()
            .put("model", config.chatModel)
            .put("stream", true)
            .put(
                "messages",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("role", "system")
                            .put("content", "You are concise and natural for spoken avatar conversation.")
                    )
                    .put(
                        JSONObject()
                            .put("role", "user")
                            .put("content", userText)
                    )
            )

        val request = Request.Builder()
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))

        val finalRequest = withAuth(request)
            .url(endpoint("chat/completions"))
            .build()

        client.newCall(finalRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("LLM failed: ${response.body?.string().orEmpty()}")
            }

            val body = response.body ?: error("LLM response body is empty")
            val contentType = response.header("Content-Type").orEmpty()
            if (!contentType.contains("text/event-stream")) {
                val payload = JSONObject(body.string().ifBlank { "{}" })
                val full = payload.optJSONArray("choices")
                    ?.optJSONObject(0)
                    ?.optJSONObject("message")
                    ?.optString("content")
                    .orEmpty()
                    .trim()
                if (full.isNotEmpty()) {
                    onDelta(full)
                    return full
                }
                return "Sorry, I don't have a result right now."
            }

            val source = body.source()
            val fullReply = StringBuilder()

            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                val trimmed = line.trim()
                if (!trimmed.startsWith("data:")) continue

                val data = trimmed.removePrefix("data:").trim()
                if (data.isBlank() || data == "[DONE]") continue

                runCatching {
                    val chunk = JSONObject(data)
                    val delta = chunk.optJSONArray("choices")
                        ?.optJSONObject(0)
                        ?.optJSONObject("delta")
                        ?.optString("content")
                        .orEmpty()
                    if (delta.isNotEmpty()) {
                        fullReply.append(delta)
                        onDelta(delta)
                    }
                }
            }

            val finalReply = fullReply.toString().trim()
            return if (finalReply.isNotEmpty()) {
                finalReply
            } else {
                "Sorry, I don't have a result right now."
            }
        }
    }

    fun synthesizePcm(text: String): ByteArray {
        val payload = JSONObject()
            .put("model", config.ttsModel)
            .put("voice", config.ttsVoice)
            .put("input", text)
            .put("response_format", "pcm")

        val request = Request.Builder()
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))

        val finalRequest = withAuth(request)
            .url(endpoint("audio/speech"))
            .build()

        client.newCall(finalRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("TTS failed: ${response.body?.string().orEmpty()}")
            }
            return response.body?.bytes() ?: error("TTS response body is empty")
        }
    }

    fun close() {
        client.connectionPool.evictAll()
        client.dispatcher.executorService.shutdown()
    }

    private fun requireApiKey() {
        if (config.apiKey.isBlank()) {
            error("Missing OPENAI_API_KEY")
        }
    }

    private fun endpoint(path: String): String {
        val normalizedPath = path.trimStart('/')
        return if (config.useProxy) {
            val root = config.proxyBaseUrl.trim()
            require(root.isNotEmpty()) {
                "Missing OPENAI_PROXY_BASE_URL"
            }
            "${root.trimEnd('/')}/openai/v1/$normalizedPath"
        } else {
            "${config.baseUrl.trimEnd('/')}/v1/$normalizedPath"
        }
    }

    private fun withAuth(builder: Request.Builder): Request.Builder {
        if (!config.useProxy) {
            requireApiKey()
            builder.header("Authorization", "Bearer ${config.apiKey}")
        }
        return builder
    }

    private fun pcm16ToWav(pcmData: ByteArray, sampleRate: Int): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * (bitsPerSample / 8)
        val blockAlign = channels * (bitsPerSample / 8)

        val totalDataLen = 36 + pcmData.size
        val out = ByteBuffer.allocate(44 + pcmData.size).order(ByteOrder.LITTLE_ENDIAN)

        out.put("RIFF".toByteArray(StandardCharsets.US_ASCII))
        out.putInt(totalDataLen)
        out.put("WAVE".toByteArray(StandardCharsets.US_ASCII))
        out.put("fmt ".toByteArray(StandardCharsets.US_ASCII))
        out.putInt(16)
        out.putShort(1)
        out.putShort(channels.toShort())
        out.putInt(sampleRate)
        out.putInt(byteRate)
        out.putShort(blockAlign.toShort())
        out.putShort(bitsPerSample.toShort())
        out.put("data".toByteArray(StandardCharsets.US_ASCII))
        out.putInt(pcmData.size)
        out.put(pcmData)

        return out.array()
    }

    companion object {
        private fun defaultHttpClient(): OkHttpClient {
            return OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.SECONDS)
                .callTimeout(0, TimeUnit.SECONDS)
                .build()
        }
    }
}
