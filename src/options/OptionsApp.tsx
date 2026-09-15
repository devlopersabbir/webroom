import React, { useEffect, useRef, useState } from "react";
import {
  APP_VERSION,
  AUDIO_DEVICE_STORAGE_KEY,
  FILE_SHARING_STORAGE_KEY,
} from "../shared/constants";

declare const chrome: any;

interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export const OptionsApp: React.FC = () => {
  // Settings State
  const [fileSharingEnabled, setFileSharingEnabled] = useState<boolean>(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [hasDeviceLabels, setHasDeviceLabels] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Mic Test State
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [testError, setTestError] = useState<string | null>(null);

  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 1. Load Initial Saved Settings from chrome.storage.local or localStorage
  useEffect(() => {
    // Load File Sharing preference
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(
        [FILE_SHARING_STORAGE_KEY, AUDIO_DEVICE_STORAGE_KEY],
        (items: Record<string, any>) => {
          if (items && FILE_SHARING_STORAGE_KEY in items) {
            setFileSharingEnabled(Boolean(items[FILE_SHARING_STORAGE_KEY]));
          } else {
            const localVal = localStorage.getItem(FILE_SHARING_STORAGE_KEY);
            setFileSharingEnabled(localVal !== "false");
          }

          if (items && AUDIO_DEVICE_STORAGE_KEY in items) {
            setSelectedDeviceId(String(items[AUDIO_DEVICE_STORAGE_KEY] || ""));
          } else {
            const localDevice = localStorage.getItem(AUDIO_DEVICE_STORAGE_KEY) || "";
            setSelectedDeviceId(localDevice);
          }
        }
      );
    } else {
      const localSharing = localStorage.getItem(FILE_SHARING_STORAGE_KEY);
      setFileSharingEnabled(localSharing !== "false");

      const localDevice = localStorage.getItem(AUDIO_DEVICE_STORAGE_KEY) || "";
      setSelectedDeviceId(localDevice);
    }

    // Enumerate audio devices
    loadAudioDevices();

    // Listen for device changes (plugged/unplugged mic)
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      const handleDeviceChange = () => {
        loadAudioDevices();
      };
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      };
    }
  }, []);

  const showSavedNotice = (msg: string = "Saved!") => {
    setSaveStatus(msg);
    setTimeout(() => {
      setSaveStatus(null);
    }, 2500);
  };

  // Enumerate audio input devices
  const loadAudioDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
          groupId: device.groupId,
        }));

      setAudioDevices(audioInputs);
      const hasLabels = audioInputs.some((d) => Boolean(d.label && !d.label.startsWith("Microphone ")));
      setHasDeviceLabels(hasLabels);
    } catch (err) {
      console.warn("[Options] Could not enumerate audio devices:", err);
    }
  };

  // Explicitly prompt user for mic permission so hardware labels become readable
  const requestMicPermission = async () => {
    try {
      setTestError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release tracks immediately
      stream.getTracks().forEach((track) => track.stop());
      await loadAudioDevices();
      showSavedNotice("Microphone access granted!");
    } catch (err: any) {
      console.error("[Options] Permission request error:", err);
      setTestError("Microphone permission was denied. Please allow microphone access in browser settings.");
    }
  };

  // Toggle File Sharing Preference
  const handleToggleFileSharing = () => {
    const nextVal = !fileSharingEnabled;
    setFileSharingEnabled(nextVal);

    // Save to localStorage
    try {
      localStorage.setItem(FILE_SHARING_STORAGE_KEY, String(nextVal));
    } catch (_) {}

    // Save to chrome.storage.local
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [FILE_SHARING_STORAGE_KEY]: nextVal }, () => {
        showSavedNotice(nextVal ? "File sharing enabled" : "File sharing disabled");
      });
    } else {
      showSavedNotice(nextVal ? "File sharing enabled" : "File sharing disabled");
    }
  };

  // Select Audio Input Device (instantly affects active calls via chrome.storage / window storage)
  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);

    // Save to localStorage
    try {
      localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
      // Dispatch storage event in case extension panel is sharing the same window context
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_DEVICE_STORAGE_KEY,
          newValue: deviceId,
        })
      );
    } catch (_) {}

    // Save to chrome.storage.local (broadcasts to all active tabs and WebRoom panels)
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [AUDIO_DEVICE_STORAGE_KEY]: deviceId }, () => {
        showSavedNotice("Microphone updated!");
      });
    } else {
      showSavedNotice("Microphone updated!");
    }

    // If currently testing mic, restart test with the new device
    if (isTestingMic) {
      stopMicTest();
      setTimeout(() => {
        startMicTest(deviceId);
      }, 150);
    }
  };

  // Start Mic Audio VU Meter Test
  const startMicTest = async (deviceIdToUse = selectedDeviceId) => {
    stopMicTest();
    setTestError(null);

    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceIdToUse ? { deviceId: { exact: deviceIdToUse } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      setIsTestingMic(true);

      const updateMeter = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize volume level between 0% and 100%
        const normalized = Math.min(100, Math.round((average / 128) * 100 * 1.5));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err: any) {
      console.error("[Options] Failed to start microphone test:", err);
      setTestError(
        err.message || "Failed to access microphone. Please check permissions or device availability."
      );
      stopMicTest();
    }
  };

  // Stop Mic Audio VU Meter Test
  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((track) => track.stop());
      testStreamRef.current = null;
    }
    setIsTestingMic(false);
    setAudioLevel(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 selection:bg-indigo-600 selection:text-white">
      {/* Toast Save Notification */}
      {saveStatus && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-xl shadow-emerald-950/40 text-sm font-medium animate-fade-in transition-all">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-2xl">
              🌐
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">WebRoom</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Decentralized Presence, P2P Voice & File Sharing Preferences
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <a
              href="https://github.com/devlopersabbir/webroom"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </div>

        {/* Section 1: Microphone Selection & Audio Testing */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xl">🎙️</span>
                <h2 className="text-lg font-semibold text-white">Microphone Input Device</h2>
              </div>
              <p className="text-sm text-slate-400">
                Choose the audio input device for your peer-to-peer voice calls. Switching your microphone
                takes effect <strong className="text-slate-200">instantly</strong>, even while actively speaking in a room.
              </p>
            </div>
            <button
              type="button"
              onClick={loadAudioDevices}
              title="Refresh devices"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              🔄
            </button>
          </div>

          {!hasDeviceLabels && audioDevices.length > 0 && (
            <div className="flex items-center justify-between p-3.5 bg-indigo-950/40 border border-indigo-900/60 rounded-xl text-xs text-indigo-300">
              <div className="flex items-center space-x-2">
                <span>ℹ️</span>
                <span>Browser permissions are needed to display detailed microphone model names.</span>
              </div>
              <button
                type="button"
                onClick={requestMicPermission}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition text-xs shadow-md shadow-indigo-600/30"
              >
                Grant Mic Access
              </button>
            </div>
          )}

          {/* Select Dropdown */}
          <div className="space-y-2">
            <label htmlFor="mic-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Audio Input
            </label>
            <select
              id="mic-select"
              value={selectedDeviceId}
              onChange={(e) => handleSelectDevice(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-sm text-white transition outline-none cursor-pointer"
            >
              <option value="">Default System Microphone</option>
              {audioDevices.map((device, idx) => (
                <option key={device.deviceId || idx} value={device.deviceId}>
                  {device.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Microphone Live VU Meter & Audio Test */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-slate-300">Live Audio Level Check</span>
                {isTestingMic && (
                  <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Listening</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => (isTestingMic ? stopMicTest() : startMicTest())}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                  isTestingMic
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                }`}
              >
                <span>{isTestingMic ? "⏹️ Stop Test" : "▶️ Test Microphone"}</span>
              </button>
            </div>

            {/* Visual VU Meter Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500"
                  style={{ width: `${isTestingMic ? audioLevel : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Quiet</span>
                <span>{isTestingMic ? `${audioLevel}% Level` : "Mic test inactive"}</span>
                <span>Loud</span>
              </div>
            </div>

            {testError && (
              <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">
                {testError}
              </p>
            )}
          </div>
        </div>

        {/* Section 2: Auto File Sharing Enable / Disable */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📁</span>
                <h2 className="text-lg font-semibold text-white">Peer-to-Peer File Sharing</h2>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Control whether peers in your current room can send you file transfer requests.
                When disabled, all incoming transfer offers are automatically declined to prevent unsolicited requests.
              </p>
            </div>

            {/* Toggle Button */}
            <button
              type="button"
              role="switch"
              aria-checked={fileSharingEnabled}
              onClick={handleToggleFileSharing}
              className={`relative inline-flex h-7 w-13 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                fileSharingEnabled ? "bg-emerald-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  fileSharingEnabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="pt-2">
            <div
              className={`inline-flex items-center space-x-2 px-3 py-1 rounded-lg text-xs font-medium ${
                fileSharingEnabled
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              <span>{fileSharingEnabled ? "✅ File sharing enabled (requests accepted)" : "🚫 File sharing disabled (incoming requests blocked)"}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Support Developer & Buy Me a Coffee */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-xl">☕</span>
              <h2 className="text-lg font-semibold text-white">Support WebRoom Development</h2>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              WebRoom is completely free, decentralized, and open-source with no advertisements or central server tracking.
              If WebRoom makes your online collaboration and co-browsing easier, buying me a coffee fuels maintenance and new features!
            </p>
          </div>

          {/* Buy Me a Coffee Button */}
          <div>
            <a
              href="https://buymeacoffee.com/devlopersabbir"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-3 px-6 py-3.5 rounded-xl font-bold text-slate-950 bg-[#FFDD00] hover:bg-[#ffe338] shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transform hover:-translate-y-0.5 active:translate-y-0 transition duration-150 text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.216 6.415l-.132-.666c-.119-.597-.388-1.157-.78-1.618C18.704 3.42 17.848 3 16.797 3H4.402C3.078 3 2 4.078 2 5.402v7.716C2 17.514 5.504 21 9.9 21h4.202c4.394 0 7.898-3.486 7.898-7.882v-4.82c0-.663-.292-1.306-.784-1.883zm-1.816 6.703c0 3.256-2.64 5.882-5.898 5.882H9.9C6.643 19 4 16.374 4 13.118V5.402c0-.222.18-.402.402-.402h12.395c.42 0 .753.155.972.413.176.207.294.464.348.742l.142.716c-.452.12-.892.29-1.312.508-1.425.736-2.28 2.112-2.28 3.676 0 1.564.855 2.94 2.28 3.676.136.07.275.132.417.185v.202zm1.6-2.585c-.328-.155-.662-.303-1.002-.42.063-.674-.084-1.378-.456-1.954.512.213.987.525 1.385.92.057.057.073.085.073.125v1.329z" />
              </svg>
              <span>Buy me a coffee (@devlopersabbir)</span>
            </a>
          </div>

          {/* Social Links & Connections */}
          <div className="pt-4 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Developer & Social Links
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* GitHub */}
              <a
                href="https://github.com/devlopersabbir"
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition group"
              >
                <span className="text-lg">🐙</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-white">GitHub</div>
                  <div className="text-xs text-slate-400">@devlopersabbir</div>
                </div>
              </a>

              {/* Website */}
              <a
                href="https://devlopersabbir.github.io/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition group"
              >
                <span className="text-lg">🌐</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Portfolio</div>
                  <div className="text-xs text-slate-400">devlopersabbir.github.io</div>
                </div>
              </a>

              {/* Email */}
              <a
                href="mailto:devlopersabbir@gmail.com"
                className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition group"
              >
                <span className="text-lg">✉️</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Email</div>
                  <div className="text-xs text-slate-400">devlopersabbir@gmail.com</div>
                </div>
              </a>

              {/* WebRoom Project Repo */}
              <a
                href="https://github.com/devlopersabbir/webroom"
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition group"
              >
                <span className="text-lg">⭐</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Star on GitHub</div>
                  <div className="text-xs text-slate-400">devlopersabbir/webroom</div>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 pb-8 space-y-1">
          <p>
            WebRoom v{APP_VERSION} • Built with WebRTC mesh & WebTorrent trackers
          </p>
          <p>
            Crafted with ❤️ by{" "}
            <a
              href="https://github.com/devlopersabbir"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-slate-300 underline underline-offset-2"
            >
              Sabbir Hossain Shuvo
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default OptionsApp;
