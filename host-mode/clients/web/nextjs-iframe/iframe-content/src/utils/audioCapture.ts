export class MicrophonePcmCapture {
  private readonly targetSampleRate: number
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null

  constructor(targetSampleRate: number) {
    this.targetSampleRate = targetSampleRate
  }

  async start(onChunk: (chunk: Uint8Array) => void): Promise<void> {
    if (this.audioContext !== null) {
      return
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.audioContext = new AudioContext()
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0)
      const resampled = downsample(channel, this.audioContext!.sampleRate, this.targetSampleRate)
      if (resampled.length === 0) {
        return
      }
      onChunk(floatTo16BitPcm(resampled))
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }

  async stop(): Promise<void> {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    await this.audioContext?.close()

    this.processor = null
    this.source = null
    this.mediaStream = null
    this.audioContext = null
  }
}

function downsample(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return input
  }
  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.round(input.length / ratio)
  const output = new Float32Array(outputLength)
  let outputIndex = 0
  let inputIndex = 0

  while (outputIndex < outputLength) {
    const nextInputIndex = Math.round((outputIndex + 1) * ratio)
    let sum = 0
    let count = 0
    for (let i = inputIndex; i < nextInputIndex && i < input.length; i += 1) {
      sum += input[i]
      count += 1
    }
    output[outputIndex] = count > 0 ? sum / count : 0
    outputIndex += 1
    inputIndex = nextInputIndex
  }

  return output
}

function floatTo16BitPcm(input: Float32Array): Uint8Array {
  const output = new ArrayBuffer(input.length * 2)
  const view = new DataView(output)

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Uint8Array(output)
}
