import React, { useCallback, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../shared/constants";

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [text, setText] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || disabled) {
      return;
    }

    onSendMessage(trimmed);
    setText("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }, [text, disabled, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    if (newText.length <= MAX_MESSAGE_LENGTH) {
      setText(newText);
    }

    // Auto-adjust height up to max 120px
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="webroom-composer">
      <textarea
        ref={textareaRef}
        className="webroom-composer-input"
        rows={1}
        placeholder="Message..."
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
        disabled={disabled}
        maxLength={MAX_MESSAGE_LENGTH}
      />
      <button
        type="button"
        className={`webroom-composer-send ${canSend ? "webroom-send-active" : ""}`}
        onClick={handleSend}
        disabled={!canSend}
        title="Send message (Enter)"
        aria-label="Send message"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      </button>
    </div>
  );
};
