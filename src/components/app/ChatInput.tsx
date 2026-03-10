import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = "Ask about your memories...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
    // Reset height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background/80 backdrop-blur-sm px-4 py-4">
      <div className="max-w-[720px] mx-auto relative">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          className="w-full px-5 py-4 pr-14 rounded-2xl border border-border/60 bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 resize-none min-h-[56px] max-h-[200px] placeholder:text-muted-foreground/50"
        />
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="absolute right-3 bottom-3 p-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white transition-colors disabled:opacity-40 shrink-0"
        >
          {disabled ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
        Enter to send · Shift+Enter for new line
      </p>
    </form>
  );
}
