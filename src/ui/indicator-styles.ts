/**
 * Modern scoped CSS for the WebRoom floating indicator inside Shadow DOM.
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
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.webroom-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px 0 10px;
  background: rgba(18, 18, 22, 0.88);
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

.webroom-tooltip {
  position: absolute;
  bottom: 42px;
  right: 0;
  width: 220px;
  padding: 10px 12px;
  background: rgba(15, 15, 18, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.2);
  color: #e5e7eb;
  font-size: 11px;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  transform: translateY(6px) scale(0.96);
  transition: opacity 0.18s ease, transform 0.18s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.webroom-floating-wrapper:hover .webroom-tooltip {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.tooltip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 5px;
}

.tooltip-title {
  font-weight: 600;
  color: #f9fafb;
  font-size: 11px;
}

.tooltip-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tooltip-label {
  color: #9ca3af;
}

.tooltip-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #d1d5db;
  font-size: 10px;
}
`;
