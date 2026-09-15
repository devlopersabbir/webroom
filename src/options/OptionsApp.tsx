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

type TabType = "audio" | "files" | "about";

export const OptionsApp: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>("audio");

  // Settings State
  const [fileSharingEnabled, setFileSharingEnabled] = useState<boolean>(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [hasDeviceLabels, setHasDeviceLabels] = useState<boolean>(false);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Mic Test State
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [testError, setTestError] = useState<string | null>(null);

  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load Saved Preferences
  useEffect(() => {
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

    loadAudioDevices();

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

  const showSavedNotice = (msg = "Settings saved") => {
    setSaveStatus(msg);
    setTimeout(() => {
      setSaveStatus(null);
    }, 2400);
  };

  const loadAudioDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    setIsRefreshingDevices(true);
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
      const hasLabels = audioInputs.some(
        (d) => Boolean(d.label && !d.label.startsWith("Microphone "))
      );
      setHasDeviceLabels(hasLabels);
    } catch (err) {
      console.warn("[WebRoom Options] Enumerate devices error:", err);
    } finally {
      setTimeout(() => setIsRefreshingDevices(false), 400);
    }
  };

  const requestMicPermission = async () => {
    try {
      setTestError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await loadAudioDevices();
      showSavedNotice("Microphone permission granted");
    } catch (err: any) {
      console.error("[WebRoom Options] Mic permission error:", err);
      setTestError(
        "Microphone access denied. Please enable microphone permissions in your browser address bar."
      );
    }
  };

  const handleToggleFileSharing = () => {
    const nextVal = !fileSharingEnabled;
    setFileSharingEnabled(nextVal);

    try {
      localStorage.setItem(FILE_SHARING_STORAGE_KEY, String(nextVal));
    } catch (_) {}

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [FILE_SHARING_STORAGE_KEY]: nextVal }, () => {
        showSavedNotice(nextVal ? "File sharing enabled" : "File sharing disabled");
      });
    } else {
      showSavedNotice(nextVal ? "File sharing enabled" : "File sharing disabled");
    }
  };

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);

    try {
      localStorage.setItem(AUDIO_DEVICE_STORAGE_KEY, deviceId);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AUDIO_DEVICE_STORAGE_KEY,
          newValue: deviceId,
        })
      );
    } catch (_) {}

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ [AUDIO_DEVICE_STORAGE_KEY]: deviceId }, () => {
        showSavedNotice("Microphone updated");
      });
    } else {
      showSavedNotice("Microphone updated");
    }

    if (isTestingMic) {
      stopMicTest();
      setTimeout(() => {
        startMicTest(deviceId);
      }, 150);
    }
  };

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
      analyser.fftSize = 128;
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
        const normalized = Math.min(100, Math.round((average / 128) * 100 * 1.6));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err: any) {
      console.error("[WebRoom Options] Mic test error:", err);
      setTestError(
        err.message || "Failed to access microphone. Please check your system audio settings."
      );
      stopMicTest();
    }
  };

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

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  // Total segments in VU meter
  const TOTAL_LEDS = 18;
  const activeLeds = Math.round((audioLevel / 100) * TOTAL_LEDS);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8">
      {/* Toast Save Notification */}
      {saveStatus && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 bg-emerald-500/90 text-white px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-semibold animate-toast border border-emerald-400/30">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Main Card Shell */}
      <div className="w-full max-w-2xl flex flex-col space-y-6">
        {/* Sleek App Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 flex-shrink-0">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M3.6 9h16.8M3.6 15h16.8" />
                <path d="M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">WebRoom</h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Preferences, Audio Devices & Peer-to-Peer Settings
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href="https://github.com/devlopersabbir/webroom"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </header>

        {/* Modern Segmented Navigation Bar */}
        <nav className="flex p-1 bg-slate-900/90 border border-slate-800/90 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "audio"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>Audio & Mic</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "files"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <span>File Sharing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("about")}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === "about"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>Support & Author</span>
          </button>
        </nav>

        {/* TAB 1: AUDIO & MICROPHONE */}
        {activeTab === "audio" && (
          <div className="space-y-5">
            {/* Device Selection Card */}
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Microphone Input</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select your preferred input device. Switching happens{" "}
                    <span className="text-indigo-300 font-medium">instantly mid-call</span> without
                    reconnecting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadAudioDevices}
                  title="Refresh audio input devices"
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition cursor-pointer"
                >
                  <svg
                    className={`w-4 h-4 ${isRefreshingDevices ? "animate-spin text-indigo-400" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>

              {!hasDeviceLabels && audioDevices.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-indigo-950/40 border border-indigo-900/60 rounded-xl text-xs text-indigo-200">
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>Grant microphone permission to display specific hardware device names.</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestMicPermission}
                    className="ml-3 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition text-xs shadow-sm flex-shrink-0 cursor-pointer"
                  >
                    Grant Access
                  </button>
                </div>
              )}

              {/* Styled Select Dropdown */}
              <div className="relative">
                <select
                  id="mic-select"
                  value={selectedDeviceId}
                  onChange={(e) => handleSelectDevice(e.target.value)}
                  className="w-full appearance-none bg-[#090d16] border border-slate-700/80 hover:border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-xs text-white transition outline-none cursor-pointer pr-10"
                >
                  <option value="">Default System Microphone</option>
                  {audioDevices.map((device, idx) => (
                    <option key={device.deviceId || idx} value={device.deviceId}>
                      {device.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Live Audio Meter Card */}
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Live Microphone Test</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Speak into your microphone to verify volume levels.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => (isTestingMic ? stopMicTest() : startMicTest())}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-2 cursor-pointer ${
                    isTestingMic
                      ? "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  }`}
                >
                  {isTestingMic ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-ping flex-shrink-0" />
                      <span>Stop Test</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      <span>Test Mic</span>
                    </>
                  )}
                </button>
              </div>

              {/* Multi-Segment LED Audio Meter */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between gap-1 p-2 bg-[#090d16] border border-slate-800 rounded-xl">
                  {Array.from({ length: TOTAL_LEDS }).map((_, i) => {
                    const isActive = isTestingMic && i < activeLeds;
                    // Color transitions: Green -> Yellow -> Red
                    let activeColor = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
                    if (i >= 15) {
                      activeColor = "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
                    } else if (i >= 12) {
                      activeColor = "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]";
                    }

                    return (
                      <div
                        key={i}
                        className={`h-6 flex-1 rounded-sm transition-all duration-75 ${
                          isActive ? activeColor : "bg-slate-800/70"
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
                  <span>-60 dB</span>
                  <span className={isTestingMic && audioLevel > 15 ? "text-emerald-400 font-semibold" : ""}>
                    {isTestingMic
                      ? audioLevel > 15
                        ? `Speaking (${audioLevel}%)`
                        : `Idle (${audioLevel}%)`
                      : "Inactive"}
                  </span>
                  <span>0 dB</span>
                </div>
              </div>

              {testError && (
                <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
                  <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
                  </svg>
                  <span>{testError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FILE SHARING */}
        {activeTab === "files" && (
          <div className="space-y-5">
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-white">Direct P2P File Sharing</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Allow participants on the same webpage to offer you peer-to-peer file transfers.
                  </p>
                </div>

                {/* Smooth Custom Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={fileSharingEnabled}
                  onClick={handleToggleFileSharing}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    fileSharingEnabled ? "bg-emerald-500" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                      fileSharingEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Status Callout */}
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2.5 ${
                  fileSharingEnabled
                    ? "bg-emerald-950/25 border-emerald-800/40 text-emerald-300"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                {fileSharingEnabled ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>File sharing active — Peers can send you transfer requests with your consent.</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
                    <span>File sharing disabled — All incoming requests are automatically declined.</span>
                  </>
                )}
              </div>

              {/* Security & Architecture Highlights */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[#090d16] border border-slate-800/80 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Zero Cloud</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Files stream directly browser-to-browser. No intermediate storage.
                  </p>
                </div>

                <div className="p-3 bg-[#090d16] border border-slate-800/80 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Encrypted</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    End-to-end encrypted WebRTC data channels with chunk verification.
                  </p>
                </div>

                <div className="p-3 bg-[#090d16] border border-slate-800/80 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Rate-Limited</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Automatic 5-minute spam protection if offers are declined 3 times.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUPPORT & AUTHOR */}
        {activeTab === "about" && (
          <div className="space-y-5">
            {/* Buy Me a Coffee Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#101726] to-[#1a1c2e] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Open Source Support
                </span>
                <h2 className="text-base font-bold text-white">Support WebRoom Development</h2>
                <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                  WebRoom is 100% free and open-source with zero tracking, no analytics, and no central servers.
                  If WebRoom helps you collaborate and co-browse smoothly, buying me a coffee directly supports
                  continued maintenance and WebRTC infrastructure!
                </p>
              </div>

              <div>
                <a
                  href="https://buymeacoffee.com/devlopersabbir"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-2.5 px-5 py-2.5 rounded-xl font-bold text-slate-950 bg-[#FFDD00] hover:bg-[#FFE53B] shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition duration-150 text-xs"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M20.216 6.415l-.132-.666c-.119-.597-.388-1.157-.78-1.618C18.704 3.42 17.848 3 16.797 3H4.402C3.078 3 2 4.078 2 5.402v7.716C2 17.514 5.504 21 9.9 21h4.202c4.394 0 7.898-3.486 7.898-7.882v-4.82c0-.663-.292-1.306-.784-1.883zm-1.816 6.703c0 3.256-2.64 5.882-5.898 5.882H9.9C6.643 19 4 16.374 4 13.118V5.402c0-.222.18-.402.402-.402h12.395c.42 0 .753.155.972.413.176.207.294.464.348.742l.142.716c-.452.12-.892.29-1.312.508-1.425.736-2.28 2.112-2.28 3.676 0 1.564.855 2.94 2.28 3.676.136.07.275.132.417.185v.202zm1.6-2.585c-.328-.155-.662-.303-1.002-.42.063-.674-.084-1.378-.456-1.954.512.213.987.525 1.385.92.057.057.073.085.073.125v1.329z" />
                  </svg>
                  <span>Buy me a coffee (@devlopersabbir)</span>
                </a>
              </div>
            </div>

            {/* Author Profile & Social Connections */}
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Developer & Contact
                </h3>
                <p className="text-sm font-semibold text-white mt-1">Sabbir Hossain Shuvo</p>
                <p className="text-xs text-slate-400">Software Engineer & Open-Source Maintainer</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* GitHub */}
                <a
                  href="https://github.com/devlopersabbir"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 p-3 rounded-xl bg-[#090d16] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white flex-shrink-0">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">GitHub</div>
                    <div className="text-[11px] text-slate-400">@devlopersabbir</div>
                  </div>
                </a>

                {/* Portfolio Website */}
                <a
                  href="https://devlopersabbir.github.io/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 p-3 rounded-xl bg-[#090d16] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">Portfolio</div>
                    <div className="text-[11px] text-slate-400">devlopersabbir.github.io</div>
                  </div>
                </a>

                {/* Email */}
                <a
                  href="mailto:devlopersabbir@gmail.com"
                  className="flex items-center space-x-3 p-3 rounded-xl bg-[#090d16] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">Email</div>
                    <div className="text-[11px] text-slate-400">devlopersabbir@gmail.com</div>
                  </div>
                </a>

                {/* Project Repository */}
                <a
                  href="https://github.com/devlopersabbir/webroom"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 p-3 rounded-xl bg-[#090d16] border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">Star Repository</div>
                    <div className="text-[11px] text-slate-400">devlopersabbir/webroom</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Minimal Clean Footer */}
        <footer className="pt-4 border-t border-slate-800/60 text-center text-xs text-slate-500 space-y-1">
          <p>WebRoom v{APP_VERSION} • Decentralized WebRTC Mesh Architecture</p>
          <p>
            Created with care by{" "}
            <a
              href="https://github.com/devlopersabbir"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-slate-300 underline underline-offset-2"
            >
              Sabbir Hossain Shuvo
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default OptionsApp;
