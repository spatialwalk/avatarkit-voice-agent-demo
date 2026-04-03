package ai.spatialwalk.sdkmodeexample.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.SystemClock
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.sqrt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class VadConfig(
    val sampleRate: Int,
    val startThreshold: Double,
    val stopThreshold: Double,
    val silenceMs: Long,
    val minSpeechMs: Long,
    val maxSpeechMs: Long,
    val calibrationMs: Long = 500,
    val retriggerCooldownMs: Long = 600,
    val frameSize: Int = 1024,
    val startFrameCount: Int = 3,
)

class VadRecorder(
    private val config: VadConfig,
    private val shouldGate: () -> Boolean,
    private val onLog: (String) -> Unit,
    private val onSegment: (ByteArray) -> Unit,
) {
    private var audioRecord: AudioRecord? = null
    private var job: Job? = null

    @Synchronized
    fun start(scope: CoroutineScope) {
        if (job?.isActive == true) return

        val minBuffer = AudioRecord.getMinBufferSize(
            config.sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        require(minBuffer > 0) {
            "AudioRecord initialization failed, code=$minBuffer"
        }

        val bufferSize = max(minBuffer, config.frameSize * 8)
        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            config.sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            error("AudioRecord unavailable, microphone cannot be started")
        }

        audioRecord = record
        job = scope.launch(Dispatchers.Default) {
            try {
                record.startRecording()
                recordLoop(record)
            } finally {
                releaseRecord(record)
            }
        }
    }

    @Synchronized
    fun stop() {
        val record = audioRecord
        job?.cancel()
        runCatching {
            if (record?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop()
            }
        }
        job = null
        audioRecord = null
    }

    private suspend fun recordLoop(record: AudioRecord) {
        val frame = ShortArray(config.frameSize)
        val segmentBuffer = ByteArrayOutputStream(config.sampleRate * 2)

        var segmentActive = false
        var segmentStartAt = 0L
        var speechFrames = 0
        var lastSpeechAt = 0L
        var activeStopThreshold = config.stopThreshold
        var gateLogged = false
        var cooldownUntil = 0L
        var noiseFloor = config.stopThreshold.coerceAtLeast(0.001)
        val warmupUntil = SystemClock.elapsedRealtime() + config.calibrationMs

        fun finishSegment(now: Long, reason: String) {
            val duration = now - segmentStartAt
            val pcmData = segmentBuffer.toByteArray()
            segmentBuffer.reset()
            segmentActive = false
            speechFrames = 0
            cooldownUntil = now + config.retriggerCooldownMs

            if (duration < config.minSpeechMs || pcmData.isEmpty()) {
                onLog("Speech segment too short, ignored")
                return
            }

            onLog(reason)
            onSegment(pcmData)
        }

        while (job?.isActive == true) {
            val read = record.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
            if (read <= 0) continue

            val now = SystemClock.elapsedRealtime()

            if (shouldGate()) {
                if (!gateLogged) {
                    gateLogged = true
                    onLog("Avatar is speaking or processing, VAD paused")
                }
                if (segmentActive) {
                    segmentActive = false
                    segmentBuffer.reset()
                }
                speechFrames = 0
                cooldownUntil = now + config.retriggerCooldownMs
                continue
            }
            gateLogged = false

            val rms = computeRms(frame, read)

            if (!segmentActive) {
                noiseFloor = updateNoiseFloor(noiseFloor, rms)

                if (now < warmupUntil || now < cooldownUntil) {
                    speechFrames = 0
                    continue
                }

                val dynamicStart = dynamicStartThreshold(noiseFloor)
                val dynamicStop = dynamicStopThreshold(noiseFloor, dynamicStart)

                if (rms >= dynamicStart) {
                    speechFrames += 1
                    if (speechFrames >= config.startFrameCount) {
                        segmentActive = true
                        segmentStartAt = now
                        lastSpeechAt = now
                        activeStopThreshold = dynamicStop
                        segmentBuffer.reset()
                        speechFrames = 0
                        onLog("Speech detected, recording started...")
                    }
                } else {
                    speechFrames = 0
                }
            }

            if (!segmentActive) continue

            appendPcm(segmentBuffer, frame, read)

            if (rms >= activeStopThreshold) {
                lastSpeechAt = now
            }

            val duration = now - segmentStartAt
            if (duration >= config.maxSpeechMs) {
                finishSegment(now, "Max segment duration reached, force split")
                continue
            }

            if (now - lastSpeechAt >= config.silenceMs) {
                finishSegment(now, "Silence detected, recording finished")
            }
        }
    }

    private fun updateNoiseFloor(current: Double, rms: Double): Double {
        val clamped = rms.coerceIn(0.0, 1.0)
        return (current * 0.95 + clamped * 0.05).coerceAtLeast(0.0005)
    }

    private fun dynamicStartThreshold(noiseFloor: Double): Double {
        val adaptive = noiseFloor * 2.8 + 0.002
        return max(config.startThreshold, adaptive)
    }

    private fun dynamicStopThreshold(noiseFloor: Double, dynamicStart: Double): Double {
        val adaptive = noiseFloor * 1.8 + 0.001
        val candidate = max(config.stopThreshold, adaptive)
        return candidate.coerceAtMost(dynamicStart * 0.9)
    }

    private fun computeRms(samples: ShortArray, length: Int): Double {
        var sum = 0.0
        var i = 0
        while (i < length) {
            val normalized = samples[i] / 32768.0
            sum += normalized * normalized
            i += 1
        }
        return sqrt(sum / length)
    }

    private fun appendPcm(out: ByteArrayOutputStream, samples: ShortArray, length: Int) {
        var i = 0
        while (i < length) {
            val value = samples[i].toInt()
            out.write(value and 0xFF)
            out.write((value ushr 8) and 0xFF)
            i += 1
        }
    }

    private fun releaseRecord(record: AudioRecord) {
        runCatching {
            if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop()
            }
        }
        runCatching { record.release() }
    }
}
