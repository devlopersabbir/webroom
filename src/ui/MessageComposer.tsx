import React, { useCallback, useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../shared/constants";
import { EmojiPicker } from "./EmojiPicker";

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  disabled = false,
}) => {
  const [text, setText] = useState<string>("");
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerContainerRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || disabled) {
      return;
    }

    onSendMessage(trimmed);
    setText("");
    setShowEmojiPicker(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }, [text, disabled, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();

    if (e.key === "Escape" && showEmojiPicker) {
      e.preventDefault();
      setShowEmojiPicker(false);
      return;
    }

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

  const isSelectingEmojiRef = useRef<boolean>(false);

  const handleInputFocus = () => {
    if (isSelectingEmojiRef.current) {
      isSelectingEmojiRef.current = false;
      return;
    }
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => (prev + emoji).slice(0, MAX_MESSAGE_LENGTH));
      return;
    }

    isSelectingEmojiRef.current = true;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const newText = text.substring(0, start) + emoji + text.substring(end);

    if (newText.length <= MAX_MESSAGE_LENGTH) {
      setText(newText);

      // Focus back to textarea and position cursor right after the emoji
      setTimeout(() => {
        el.focus();
        const newCursorPosition = start + emoji.length;
        el.setSelectionRange(newCursorPosition, newCursorPosition);
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
      }, 0);
    }
  };

  // Close emoji picker when clicking outside composer
  useEffect(() => {
    if (!showEmojiPicker) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        composerContainerRef.current &&
        !composerContainerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showEmojiPicker]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="webroom-composer-wrapper" ref={composerContainerRef}>
      {showEmojiPicker && (
        <EmojiPicker onSelectEmoji={handleSelectEmoji} />
      )}
      <div className="webroom-composer">
        <button
          type="button"
          className={`webroom-emoji-btn ${showEmojiPicker ? "webroom-emoji-btn-active" : ""}`}
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          disabled={disabled}
          title={showEmojiPicker ? "Close emoji picker" : "Add emoji"}
          aria-label="Toggle emoji picker"
        >
          <span className="webroom-btn-icon">😀</span>
        </button>

        <textarea
          ref={textareaRef}
          className="webroom-composer-input"
          rows={1}
          placeholder="Message..."
          value={text}
          onChange={handleChange}
          onFocus={handleInputFocus}
          onClick={handleInputFocus}
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
    </div>
  );
};

