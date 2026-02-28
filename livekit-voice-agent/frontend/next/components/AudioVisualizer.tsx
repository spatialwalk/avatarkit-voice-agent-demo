"use client";

import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";

interface AudioVisualizerProps {
  track?: Track;
}

export default function AudioVisualizer({ track }: AudioVisualizerProps) {
  const [volume, setVolume] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!track || track.kind !== "audio") {
      setVolume(0);
      return;
    }

    const mediaStream = track.mediaStream;
    if (!mediaStream) {
      setVolume(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const normalizedVolume = Math.min(average / 128, 1);
      setVolume(normalizedVolume);
      animationRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      source.disconnect();
      void audioContext.close();
    };
  }, [track]);

  const isSpeaking = volume > 0.01;
  const barCount = 5;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const baseHeight = 8;
    const maxHeight = 40;
    const heightFactor = Math.sin(((i + 1) / barCount) * Math.PI);
    const height = isSpeaking
      ? baseHeight + volume * (maxHeight - baseHeight) * heightFactor
      : baseHeight;
    return height;
  });

  return (
    <div className="flex h-12 items-center justify-center gap-1">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-2 rounded-full transition-all duration-75 ${
            isSpeaking ? "bg-green-500" : "bg-slate-600"
          }`}
          style={{ height: `${height}px` }}
        />
      ))}
      <span className="ml-3 text-sm text-slate-400">
        {isSpeaking ? "Listening..." : "Speak or type a message"}
      </span>
    </div>
  );
}
