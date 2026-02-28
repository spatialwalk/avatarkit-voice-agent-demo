import { useEffect, useRef } from 'react';
import type { TranscriptMessage } from './VoiceAgent';

interface TranscriptViewProps {
  transcripts: TranscriptMessage[];
}

export default function TranscriptView({ transcripts }: TranscriptViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <p>Start speaking or type a message to begin the conversation</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      {transcripts.map((transcript) => (
        <div
          key={transcript.id}
          className={`flex ${
            transcript.participant === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-3 ${
              transcript.participant === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-100'
            } ${!transcript.isFinal ? 'opacity-70' : ''}`}
          >
            <p className="text-sm font-medium mb-1 opacity-70">
              {transcript.participant === 'user' ? 'You' : 'Assistant'}
            </p>
            <p className="whitespace-pre-wrap">{transcript.text}</p>
            {!transcript.isFinal && (
              <span className="text-xs opacity-50 mt-1 block">
                (transcribing...)
              </span>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
