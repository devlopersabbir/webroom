/**
 * Modern scoped CSS for the WebRoom floating indicator & chat panel inside Shadow DOM.
 * Styled with Linear / Raycast / Arc / Vercel dark aesthetics.
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
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
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
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
  transform: translateY(0) scale(0.98);
}

.webroom-pill-active {
  background: rgba(30, 30, 38, 0.98);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 
    0 4px 24px rgba(99, 102, 241, 0.2),
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
  animation: webroom-pulse 2.2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
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
  transition: transform 0.15s ease, color 0.15s ease;
}

.webroom-count-bump {
  animation: webroom-bump 0.25s ease-out;
}

@keyframes webroom-bump {
  0% { transform: scale(1); }
  50% { transform: scale(1.35); color: #34d399; }
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
  animation: webroom-panel-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes webroom-panel-in {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.webroom-panel {
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 32px));
  height: min(520px, calc(100vh - 85px));
  background: rgba(16, 16, 20, 0.94);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  box-shadow: 
    0 20px 48px rgba(0, 0, 0, 0.6),
    0 4px 12px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  user-select: text;
}

/* ==========================================================================
   Panel Header
   ========================================================================== */

.webroom-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(22, 22, 28, 0.7);
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

.webroom-settings-btn {
  background: transparent;
  border: none;
  cursor: default;
  font-size: 15px;
  opacity: 0.6;
  padding: 4px 6px;
  border-radius: 6px;
  outline: none;
  color: #9ca3af;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.webroom-settings-btn:hover {
  opacity: 0.9;
  background: rgba(255, 255, 255, 0.06);
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
}

.webroom-messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
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
}

.webroom-empty-avatar {
  font-size: 38px;
  line-height: 1;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
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
  max-width: 200px;
  line-height: 1.4;
}

/* ==========================================================================
   Message Rows & Bubbles
   ========================================================================== */

.webroom-message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
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
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}

.webroom-bubble-self {
  background: #3b82f6;
  color: #ffffff;
  border-bottom-right-radius: 3px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

.webroom-bubble-peer {
  background: rgba(36, 36, 44, 0.9);
  color: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom-left-radius: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
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
}

/* ==========================================================================
   Composer Footer
   ========================================================================== */

.webroom-panel-footer {
  padding: 10px 12px 12px;
  background: rgba(22, 22, 28, 0.7);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.webroom-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: rgba(14, 14, 18, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 6px 8px 6px 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.webroom-composer:focus-within {
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
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
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.webroom-send-active {
  background: #3b82f6;
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.webroom-send-active:hover {
  background: #2563eb;
  transform: scale(1.05);
}

.webroom-send-active:active {
  transform: scale(0.96);
}
`;
