"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed) {
      onSend(trimmed);
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
        className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-700 px-4 py-3
                   text-white placeholder-slate-400 transition-colors focus:border-blue-500
                   focus:outline-none"
        rows={1}
      />
      <button
        type="submit"
        disabled={!message.trim()}
        className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors
                   hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-600"
      >
        Send
      </button>
    </form>
  );
}
