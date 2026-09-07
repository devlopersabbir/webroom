/**
 * Modern scoped CSS for the WebRoom floating indicator & chat panel inside Shadow DOM.
 * Styled with Linear / Raycast / Arc / Vercel dark aesthetics and ultra-smooth spring transitions.
 */
export const INDICATOR_STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.webroom-floating-wrapper {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* ==========================================================================
   Floating Indicator Pill Button
   ========================================================================== */

.webroom-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px 0 10px;
  background: rgba(18, 18, 22, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.35),
    0 1px 3px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: #f3f4f6;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  outline: none;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
}

.webroom-pill:hover {
  background: rgba(28, 28, 34, 0.96);
  border-color: rgba(255, 255, 255, 0.24);
  transform: translateY(-2px) scale(1.02);
  box-shadow: 
    0 8px 28px rgba(0, 0, 0, 0.45),
    0 2px 6px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.webroom-pill:active {
  transform: translateY(0) scale(0.97);
}

.webroom-pill-active {
  background: rgba(30, 30, 38, 0.98);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 
    0 4px 24px rgba(99, 102, 241, 0.25),
    0 1px 3px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.webroom-pulse-dot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 7px;
  height: 7px;
}

.webroom-pulse-dot::before {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #10b981;
  opacity: 0.8;
  animation: webroom-pulse 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite;
}

.webroom-pulse-dot::after {
  content: "";
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

@keyframes webroom-pulse {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    transform: scale(2.4);
    opacity: 0;
  }
  100% {
    transform: scale(0.95);
    opacity: 0;
  }
}

.webroom-icon {
  display: flex;
  align-items: center;
  color: #9ca3af;
  margin-left: 1px;
}

.webroom-count {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  min-width: 12px;
  text-align: center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s ease;
}

.webroom-count-bump {
  animation: webroom-bump 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes webroom-bump {
  0% { transform: scale(1); }
  50% { transform: scale(1.4); color: #34d399; }
  100% { transform: scale(1); color: #ffffff; }
}

/* ==========================================================================
   WebRoom Chat Panel Wrapper & Container
   ========================================================================== */

.webroom-panel-wrapper {
  position: absolute;
  bottom: 44px;
  right: 0;
  z-index: 20;
  transform-origin: bottom right;
  animation: webroom-panel-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes webroom-panel-in {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.95);
    filter: blur(4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
  }
}

.webroom-panel {
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 32px));
  height: min(520px, calc(100vh - 85px));
  background: rgba(16, 16, 20, 0.94);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  box-shadow: 
    0 24px 52px rgba(0, 0, 0, 0.65),
    0 4px 16px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: hidden;
  user-select: text;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

/* ==========================================================================
   Panel Header
   ========================================================================== */

.webroom-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 15px;
  background: rgba(22, 22, 28, 0.75);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  user-select: none;
  flex-shrink: 0;
}

.webroom-header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.webroom-header-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.webroom-header-title {
  font-size: 13px;
  font-weight: 600;
  color: #f9fafb;
  letter-spacing: -0.01em;
}

.webroom-header-badge {
  font-size: 9px;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  letter-spacing: 0.03em;
}

.webroom-header-presence {
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 4px;
}

.webroom-header-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.webroom-voice-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 7px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  outline: none;
  font-size: 13px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.webroom-voice-btn-off {
  color: #9ca3af;
  opacity: 0.6;
}

.webroom-voice-btn-off:hover {
  opacity: 0.95;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.webroom-voice-btn-off:active {
  transform: scale(0.94);
}

.webroom-voice-btn-mic-on {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
  transform: scale(1.03);
}

.webroom-voice-btn-mic-on:hover {
  background: rgba(16, 185, 129, 0.24);
  border-color: rgba(16, 185, 129, 0.55);
}

.webroom-voice-btn-speaker-on {
  background: rgba(99, 102, 241, 0.16);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.25);
  transform: scale(1.03);
}

.webroom-voice-btn-speaker-on:hover {
  background: rgba(99, 102, 241, 0.24);
  border-color: rgba(99, 102, 241, 0.55);
}

.webroom-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 13.5px;
}

.webroom-mic-indicator-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.webroom-settings-btn {
  background: transparent;
  border: none;
  cursor: default;
  font-size: 14px;
  opacity: 0.6;
  padding: 4px 5px;
  border-radius: 6px;
  outline: none;
  color: #9ca3af;
  transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.webroom-settings-btn:hover {
  opacity: 0.95;
  background: rgba(255, 255, 255, 0.08);
  transform: rotate(20deg);
}

/* Speaking Peer Avatar Animation */
.webroom-avatar-speaking {
  animation: webroom-speaking-pulse 1.3s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
  filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.85));
}

@keyframes webroom-speaking-pulse {
  0% {
    transform: scale(1);
    filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.5));
  }
  50% {
    transform: scale(1.22);
    filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.95));
  }
  100% {
    transform: scale(1);
    filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.5));
  }
}

/* ==========================================================================
   Messages Scroll Area
   ========================================================================== */

.webroom-messages-container {
  flex: 1;
  padding: 14px 12px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
}

.webroom-messages-container::-webkit-scrollbar {
  width: 5px;
}

.webroom-messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.webroom-messages-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 9999px;
  transition: background 0.2s ease;
}

.webroom-messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.28);
}

.webroom-messages-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ==========================================================================
   Empty Room State
   ========================================================================== */

.webroom-empty-state {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 16px;
  user-select: none;
  animation: webroom-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-fade-in {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.webroom-empty-avatar {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 12px;
  filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.4));
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.webroom-empty-avatar:hover {
  transform: scale(1.1) rotate(5deg);
}

.webroom-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 4px;
}

.webroom-empty-subtitle {
  font-size: 11px;
  color: #6b7280;
  max-width: 210px;
  line-height: 1.45;
}

/* ==========================================================================
   Message Rows & Bubbles with Smooth Inbound Transition
   ========================================================================== */

.webroom-message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
  animation: webroom-msg-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: bottom;
}

@keyframes webroom-msg-in {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.webroom-message-self {
  justify-content: flex-end;
}

.webroom-message-peer {
  justify-content: flex-start;
}

.webroom-message-avatar {
  font-size: 18px;
  line-height: 1;
  margin-bottom: 14px;
  flex-shrink: 0;
  user-select: none;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.webroom-message-avatar:hover {
  transform: scale(1.15);
}

.webroom-message-content {
  display: flex;
  flex-direction: column;
  max-width: 82%;
}

.webroom-message-self .webroom-message-content {
  align-items: flex-end;
}

.webroom-message-peer .webroom-message-content {
  align-items: flex-start;
}

.webroom-message-bubble {
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 12.5px;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
  transition: all 0.15s ease;
}

.webroom-bubble-self {
  background: #3b82f6;
  color: #ffffff;
  border-bottom-right-radius: 3px;
  box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
}

.webroom-bubble-peer {
  background: rgba(36, 36, 44, 0.92);
  color: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom-left-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.webroom-message-text {
  font-family: inherit;
  color: inherit;
}

.webroom-message-time {
  font-size: 9.5px;
  color: #6b7280;
  margin-top: 3px;
  padding: 0 2px;
  user-select: none;
  opacity: 0.85;
}

/* ==========================================================================
   Composer Footer
   ========================================================================== */

.webroom-panel-footer {
  padding: 10px 12px 12px;
  background: rgba(22, 22, 28, 0.75);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.webroom-composer-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
}

.webroom-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: rgba(14, 14, 18, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 6px 8px 6px 10px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.webroom-composer:focus-within {
  border-color: rgba(99, 102, 241, 0.55);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  background: rgba(18, 18, 24, 0.96);
}

.webroom-composer-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f3f4f6;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.4;
  resize: none;
  max-height: 100px;
  min-height: 20px;
  padding: 2px 0;
  transition: height 0.15s ease;
}

.webroom-composer-input::placeholder {
  color: #6b7280;
}

.webroom-composer-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(255, 255, 255, 0.06);
  color: #6b7280;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.webroom-send-active {
  background: #3b82f6;
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
}

.webroom-send-active:hover {
  background: #2563eb;
  transform: scale(1.06);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.45);
}

.webroom-send-active:active {
  transform: scale(0.95);
}

.webroom-emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  outline: none;
  font-size: 14px;
  opacity: 0.7;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
  user-select: none;
}

.webroom-emoji-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
  transform: scale(1.08);
}

.webroom-emoji-btn:active {
  transform: scale(0.95);
}

.webroom-emoji-btn-active {
  opacity: 1;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
}

/* ==========================================================================
   Emoji Picker Popup Component
   ========================================================================== */

.webroom-emoji-picker {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 100;
  width: 290px;
  height: 270px;
  background: rgba(18, 18, 24, 0.96);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 
    0 16px 36px rgba(0, 0, 0, 0.6),
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  padding: 10px;
  overflow: hidden;
  animation: webroom-emoji-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: bottom left;
}

@keyframes webroom-emoji-pop {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.94);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.webroom-emoji-search-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(10, 10, 14, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 5px 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.webroom-emoji-search-icon {
  font-size: 11px;
  opacity: 0.6;
  user-select: none;
}

.webroom-emoji-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f3f4f6;
  font-family: inherit;
  font-size: 11.5px;
}

.webroom-emoji-search-input::placeholder {
  color: #6b7280;
}

.webroom-emoji-search-clear {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 10px;
  cursor: pointer;
  padding: 2px;
  line-height: 1;
  border-radius: 50%;
}

.webroom-emoji-search-clear:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.webroom-emoji-tabs {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.webroom-emoji-tab-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.webroom-emoji-tab-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.webroom-emoji-tab-active {
  opacity: 1;
  background: rgba(99, 102, 241, 0.25);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.webroom-emoji-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  overflow-y: auto;
  padding-right: 2px;
}

.webroom-emoji-grid::-webkit-scrollbar {
  width: 4px;
}

.webroom-emoji-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.webroom-emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  outline: none;
  transition: transform 0.15s ease, background 0.15s ease;
  user-select: none;
}

.webroom-emoji-item:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: scale(1.22);
}

.webroom-emoji-item:active {
  transform: scale(0.95);
}

.webroom-emoji-empty {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11.5px;
  color: #6b7280;
  text-align: center;
}

/* ==========================================================================
   Header Presence Button & Participant List
   ========================================================================== */

.webroom-header-presence-btn {
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: #9ca3af;
  cursor: pointer;
  padding: 2px 6px;
  margin-left: -6px;
  border-radius: 6px;
  outline: none;
  display: inline-flex;
  align-items: center;
  transition: all 0.15s ease;
  text-align: left;
}

.webroom-header-presence-btn:hover {
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.08);
}

.webroom-header-presence-btn-active {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}

.webroom-participant-list-modal {
  position: absolute;
  top: 58px;
  left: 12px;
  right: 12px;
  max-height: 280px;
  background: rgba(22, 22, 28, 0.96);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 
    0 16px 36px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: webroom-fade-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-fade-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.webroom-participant-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.webroom-participant-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #e5e7eb;
  letter-spacing: -0.01em;
}

.webroom-participant-count-badge {
  background: rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.webroom-participant-close-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.webroom-participant-close-btn:hover {
  color: #f3f4f6;
  background: rgba(255, 255, 255, 0.1);
}

.webroom-participant-items {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.webroom-participant-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  transition: all 0.15s ease;
  user-select: none;
}

.webroom-participant-item-clickable {
  cursor: pointer;
}

.webroom-participant-item-clickable:hover {
  background: rgba(255, 255, 255, 0.06);
}

.webroom-participant-item-following {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.webroom-participant-avatar-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  font-size: 16px;
}

.webroom-participant-speaking-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #10b981;
  border: 2px solid #16161c;
  border-radius: 50%;
  animation: webroom-pulse 1.8s infinite;
}

.webroom-participant-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.webroom-participant-label {
  font-size: 12.5px;
  font-weight: 500;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.webroom-you-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.webroom-following-tag {
  font-size: 10px;
  font-weight: 600;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
}

.webroom-follow-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  outline: none;
  transition: all 0.18s ease;
}

.webroom-follow-btn:hover {
  background: rgba(99, 102, 241, 0.3);
  border-color: rgba(99, 102, 241, 0.5);
  color: #ffffff;
  transform: translateY(-1px);
}

.webroom-follow-btn-active {
  background: rgba(99, 102, 241, 0.85);
  border-color: #818cf8;
  color: #ffffff;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
}

.webroom-follow-btn-active:hover {
  background: rgba(239, 68, 68, 0.85);
  border-color: #f87171;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
}

.webroom-follow-btn-active:hover::after {
  content: "";
}

/* ==========================================================================
   Full-Screen Figma-Inspired Follow Border
   ========================================================================== */

.webroom-follow-border-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 2147483640;
  box-sizing: border-box;
}

.webroom-follow-border-inner {
  position: absolute;
  inset: 0;
  border: 3px solid #6366f1;
  box-shadow: 
    inset 0 0 20px rgba(99, 102, 241, 0.35),
    0 0 16px rgba(99, 102, 241, 0.4);
  animation: webroom-border-glow 3s ease-in-out infinite alternate;
  pointer-events: none;
}

@keyframes webroom-border-glow {
  0% {
    border-color: #6366f1;
    box-shadow: 
      inset 0 0 16px rgba(99, 102, 241, 0.25),
      0 0 12px rgba(99, 102, 241, 0.3);
  }
  50% {
    border-color: #8b5cf6;
    box-shadow: 
      inset 0 0 24px rgba(139, 92, 246, 0.4),
      0 0 20px rgba(139, 92, 246, 0.45);
  }
  100% {
    border-color: #3b82f6;
    box-shadow: 
      inset 0 0 16px rgba(59, 130, 246, 0.25),
      0 0 12px rgba(59, 130, 246, 0.3);
  }
}

/* ==========================================================================
   Top Floating Following Indicator
   ========================================================================== */

.webroom-top-following-indicator {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483646;
  pointer-events: auto;
  animation: webroom-slide-down 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-slide-down {
  from {
    opacity: 0;
    transform: translate(-50%, -12px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.webroom-top-following-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 14px;
  background: rgba(18, 18, 24, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(99, 102, 241, 0.45);
  border-radius: 9999px;
  box-shadow: 
    0 8px 30px rgba(0, 0, 0, 0.45),
    0 0 16px rgba(99, 102, 241, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: #f3f4f6;
  font-size: 12.5px;
  font-weight: 500;
  user-select: none;
}

.webroom-top-following-icon {
  font-size: 14px;
  color: #818cf8;
}

.webroom-top-following-text {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #e5e7eb;
}

.webroom-top-following-avatar {
  font-size: 15px;
}

.webroom-top-following-stop-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #9ca3af;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  outline: none;
  margin-left: 2px;
  transition: all 0.15s ease;
}

.webroom-top-following-stop-btn:hover {
  background: rgba(239, 68, 68, 0.85);
  color: #ffffff;
  transform: scale(1.15);
}

/* ==========================================================================
   Bottom Floating Stop Following Action Control
   ========================================================================== */

.webroom-bottom-stop-wrapper {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483646;
  pointer-events: auto;
  animation: webroom-slide-up 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-slide-up {
  from {
    opacity: 0;
    transform: translate(-50%, 14px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.webroom-bottom-stop-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px 6px 14px;
  background: rgba(18, 18, 24, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 9999px;
  box-shadow: 
    0 12px 36px rgba(0, 0, 0, 0.5),
    0 0 20px rgba(99, 102, 241, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: #f3f4f6;
  font-size: 13px;
  font-weight: 500;
  user-select: none;
}

.webroom-bottom-stop-pulse {
  width: 8px;
  height: 8px;
  background: #6366f1;
  border-radius: 50%;
  box-shadow: 0 0 8px #6366f1;
  animation: webroom-pulse 2s infinite;
}

.webroom-bottom-stop-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #e5e7eb;
}

.webroom-bottom-stop-avatar {
  font-size: 16px;
}

.webroom-bottom-stop-btn {
  background: rgba(239, 68, 68, 0.85);
  border: 1px solid rgba(248, 113, 113, 0.5);
  color: #ffffff;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  outline: none;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-bottom-stop-btn:hover {
  background: rgba(220, 38, 38, 0.95);
  border-color: #f87171;
  transform: translateY(-1px) scale(1.03);
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.5);
}

.webroom-bottom-stop-btn:active {
  transform: translateY(0) scale(0.97);
}

/* ==========================================================================
   Live Multiplayer Follow Cursor & Click Ripples
   ========================================================================== */

.webroom-follow-cursor-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 2147483645;
  overflow: hidden;
}

.webroom-leader-cursor {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  will-change: transform;
  transition: transform 0.06s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  z-index: 10;
}

.webroom-cursor-svg {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.45));
  transform: translate(-1px, -1px);
  transition: transform 0.12s ease, filter 0.12s ease;
}

.webroom-cursor-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: -3px;
  margin-left: 12px;
  padding: 3px 8px 3px 6px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(99, 102, 241, 0.95));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 9999px;
  box-shadow: 
    0 4px 14px rgba(139, 92, 246, 0.4),
    0 1px 3px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  user-select: none;
  animation: webroom-tag-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-tag-pop {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.webroom-cursor-avatar {
  font-size: 13px;
  line-height: 1;
}

.webroom-cursor-label {
  font-size: 10.5px;
  opacity: 0.95;
  letter-spacing: -0.01em;
}

.webroom-cursor-hovering .webroom-cursor-svg {
  transform: scale(1.22) translate(-1px, -1px);
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.7));
}

.webroom-cursor-hovering .webroom-cursor-tag {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.98), rgba(129, 140, 248, 0.98));
  box-shadow: 0 4px 18px rgba(168, 85, 247, 0.55);
}

.webroom-cursor-click-ripple {
  position: absolute;
  top: 0;
  left: 0;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  margin-left: -16px;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.85);
  background: radial-gradient(circle, rgba(168, 85, 247, 0.35) 0%, transparent 70%);
  pointer-events: none;
  z-index: 5;
  animation: webroom-click-burst 0.55s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
}

@keyframes webroom-click-burst {
  0% {
    opacity: 1;
    transform: translate3d(var(--x, 0), var(--y, 0), 0) scale(0.2);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--x, 0), var(--y, 0), 0) scale(2.4);
  }
}

/* ==========================================================================
   Live Selection Highlight Overlay
   ========================================================================== */

.webroom-selection-highlight {
  pointer-events: none;
  z-index: 999998;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-selection-box {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: rgba(168, 85, 247, 0.22);
  border: 1.5px solid rgba(168, 85, 247, 0.65);
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
  animation: webroom-selection-glow 1.5s ease-in-out infinite alternate;
}

@keyframes webroom-selection-glow {
  from {
    background: rgba(168, 85, 247, 0.18);
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.25);
  }
  to {
    background: rgba(168, 85, 247, 0.28);
    box-shadow: 0 0 16px rgba(168, 85, 247, 0.45);
  }
}

.webroom-selection-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding: 3px 8px 3px 6px;
  background: rgba(22, 22, 28, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(168, 85, 247, 0.5);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  color: #f3f4f6;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  animation: webroom-tag-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-selection-avatar {
  font-size: 12px;
}

.webroom-selection-text {
  color: #e9d5ff;
  font-weight: 600;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==========================================================================
   Settings Modal & Resource Sharing UI
   ========================================================================== */

.webroom-settings-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: webroom-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 16px;
}

.webroom-settings-modal {
  width: 100%;
  max-width: 330px;
  background: #18181f;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: webroom-pop-in 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.webroom-settings-title {
  font-size: 13px;
  font-weight: 600;
  color: #f3f4f6;
}

.webroom-settings-close-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.webroom-settings-close-btn:hover {
  color: #f3f4f6;
  background: rgba(255, 255, 255, 0.1);
}

.webroom-settings-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 380px;
  overflow-y: auto;
}

.webroom-settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.webroom-settings-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.webroom-settings-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #e5e7eb;
}

.webroom-settings-desc {
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.4;
}

.webroom-settings-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.webroom-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.webroom-settings-label {
  color: #9ca3af;
}

.webroom-settings-value {
  color: #f3f4f6;
  font-weight: 500;
}

.webroom-settings-badge {
  font-size: 10px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.webroom-toggle-switch {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 2px;
}

.webroom-toggle-switch-on {
  background: #6366f1;
  border-color: #818cf8;
}

.webroom-toggle-thumb {
  display: block;
  width: 14px;
  height: 14px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-toggle-switch-on .webroom-toggle-thumb {
  transform: translateX(16px);
}

.webroom-settings-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
}

/* ==========================================================================
   Dynamic Roles Badges
   ========================================================================== */

.webroom-participant-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.webroom-participant-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: -0.01em;
}

.webroom-role-coordinator {
  background: rgba(234, 179, 8, 0.18);
  color: #fde047;
  border: 1px solid rgba(234, 179, 8, 0.45);
}

.webroom-role-relay {
  background: rgba(59, 130, 246, 0.18);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.45);
}

.webroom-role-standby {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.45);
}

.webroom-role-contributor {
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.45);
}

.webroom-role-participant {
  background: rgba(156, 163, 175, 0.14);
  color: #d1d5db;
  border: 1px solid rgba(156, 163, 175, 0.25);
}

/* ==========================================================================
   P2P Direct File Sharing & Transfer Modals
   ========================================================================== */

.webroom-participant-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.webroom-participant-upload-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #9ca3af;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  transition: all 0.18s ease;
  padding: 0;
}

.webroom-participant-upload-btn:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(99, 102, 241, 0.6);
  color: #c7d2fe;
  transform: translateY(-1px) scale(1.05);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.webroom-participant-upload-btn:active {
  transform: translateY(0) scale(0.96);
}

.webroom-file-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483647;
  pointer-events: auto;
  box-sizing: border-box;
  padding: 20px;
  animation: webroom-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-file-modal {
  width: 420px;
  max-width: min(420px, calc(100vw - 32px));
  max-height: min(600px, calc(100vh - 40px));
  background: rgba(20, 20, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 18px;
  box-shadow: 
    0 24px 64px rgba(0, 0, 0, 0.8),
    0 4px 20px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: webroom-modal-pop 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  color: #f3f4f6;
  pointer-events: auto;
}

@keyframes webroom-modal-pop {
  from {
    opacity: 0;
    transform: scale(0.93) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.webroom-incoming-modal {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 
    0 24px 60px rgba(0, 0, 0, 0.8),
    0 0 30px rgba(99, 102, 241, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.webroom-file-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.webroom-file-modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.webroom-file-modal-avatar {
  font-size: 24px;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.webroom-file-modal-title-text h4 {
  font-size: 14px;
  font-weight: 600;
  color: #f3f4f6;
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}

.webroom-file-modal-title-text p {
  font-size: 11.5px;
  color: #9ca3af;
}

.webroom-file-modal-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.webroom-file-dropzone {
  border: 2px dashed rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  padding: 26px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: center;
}

.webroom-file-dropzone:hover {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.06);
  transform: translateY(-1px);
}

.webroom-file-dropzone-dragging {
  border-color: #818cf8;
  background: rgba(99, 102, 241, 0.15);
  transform: scale(1.02);
}

.webroom-dropzone-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.webroom-dropzone-main-text {
  font-size: 13px;
  font-weight: 500;
  color: #e5e7eb;
}

.webroom-dropzone-main-text span {
  color: #818cf8;
  text-decoration: underline;
}

.webroom-dropzone-sub-text {
  font-size: 11px;
  color: #6b7280;
}

.webroom-selected-file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}

.webroom-file-type-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.webroom-selected-file-details {
  flex: 1;
  min-width: 0;
}

.webroom-selected-file-name {
  font-size: 13px;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.webroom-selected-file-size {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.webroom-change-file-btn {
  background: transparent;
  border: none;
  color: #818cf8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  outline: none;
}

.webroom-change-file-btn:hover {
  background: rgba(99, 102, 241, 0.15);
}

.webroom-transfer-note {
  font-size: 11px;
  line-height: 1.45;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.webroom-modal-actions-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.webroom-btn-ghost {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 12.5px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.webroom-btn-ghost:hover {
  color: #f3f4f6;
  background: rgba(255, 255, 255, 0.06);
}

.webroom-btn-ghost-danger {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  font-size: 12.5px;
  font-weight: 500;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.webroom-btn-ghost-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.6);
}

.webroom-btn-primary {
  background: #6366f1;
  color: #ffffff;
  border: none;
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
}

.webroom-btn-primary:hover:not(:disabled) {
  background: #4f46e5;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);
}

.webroom-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.webroom-btn-success {
  background: #10b981;
  color: #ffffff;
  border: none;
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
}

.webroom-btn-success:hover {
  background: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.45);
}

.webroom-btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 12.5px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.webroom-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.webroom-btn-danger {
  background: #ef4444;
  color: #ffffff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.webroom-btn-danger:hover {
  background: #dc2626;
}

/* Transfer State Views */

.webroom-transfer-status-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px 8px;
  gap: 12px;
}

.webroom-pulsing-loader {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  animation: webroom-pulse-ring 1.8s infinite cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5);
  }
  70% {
    box-shadow: 0 0 0 16px rgba(99, 102, 241, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.webroom-pulse-avatar {
  font-size: 30px;
}

.webroom-transfer-headline {
  font-size: 15px;
  font-weight: 600;
  color: #f3f4f6;
}

.webroom-transfer-subtext {
  font-size: 12px;
  color: #9ca3af;
  max-width: 280px;
  line-height: 1.45;
}

.webroom-transfer-privacy-badge {
  font-size: 10.5px;
  font-weight: 500;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.12);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.25);
  margin-bottom: 4px;
}

.webroom-transfer-active-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 12px;
  border-radius: 10px;
}

.webroom-transfer-active-info {
  flex: 1;
  min-width: 0;
}

.webroom-transfer-file-name {
  font-size: 13px;
  font-weight: 600;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.webroom-transfer-metrics {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
}

.webroom-transfer-speed {
  color: #34d399;
  font-weight: 600;
}

.webroom-progress-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
  margin-top: 4px;
}

.webroom-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 999px;
  transition: width 0.25s ease-out;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
}

.webroom-progress-fill-receiving {
  background: linear-gradient(90deg, #10b981, #34d399);
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}

.webroom-progress-percentage {
  font-size: 12px;
  font-weight: 600;
  color: #d1d5db;
  margin-bottom: 6px;
}

.webroom-transfer-success-icon {
  font-size: 42px;
  animation: webroom-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.webroom-transfer-rejected-icon,
.webroom-transfer-cancelled-icon {
  font-size: 38px;
}

.webroom-incoming-prompt {
  font-size: 13px;
  color: #d1d5db;
  line-height: 1.4;
  margin-bottom: 2px;
}
`;



