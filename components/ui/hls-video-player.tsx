'use client';

import * as React from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Check,
  Video,
  AlertTriangle,
} from 'lucide-react';

export interface WatermarkStudentInfo {
  id?: string;
  full_name: string;
  admission_number?: string;
  student_code?: string;
  email?: string;
  phone?: string;
}

export interface HlsVideoPlayerProps {
  src: string;
  title?: string;
  student?: WatermarkStudentInfo;
  initialPosition?: number; // seconds
  onProgress?: (currentTime: number, duration: number, percentage: number) => void;
  onComplete?: () => void;
  className?: string;
}

export function HlsVideoPlayer({
  src,
  title,
  student,
  initialPosition = 0,
  onProgress,
  onComplete,
  className = '',
}: HlsVideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const watermarkRef = React.useRef<HTMLDivElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  // Player State
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [bufferedEnd, setBufferedEnd] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [isMuted, setIsMuted] = React.useState(false);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const [qualityLevels, setQualityLevels] = React.useState<{ height: number; level: number }[]>([]);
  const [currentQuality, setCurrentQuality] = React.useState<number>(-1); // -1 = Auto
  const [showSettingsMenu, setShowSettingsMenu] = React.useState(false);

  // Dynamic Anti-Piracy Watermark State
  const [watermarkPos, setWatermarkPos] = React.useState({
    top: 20,
    left: 25,
    rotate: -4,
    opacity: 0.55,
  });
  const [liveTimestamp, setLiveTimestamp] = React.useState('');
  const [isTamperDetected, setIsTamperDetected] = React.useState(false);

  // Auto-hide controls timer
  const hideControlsTimer = React.useRef<NodeJS.Timeout | null>(null);

  // 1. Initialize HLS / Video Stream
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = src.includes('.m3u8') || src.includes('/hls/');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map((lvl, idx) => ({
          height: lvl.height,
          level: idx,
        }));
        // Sort descending by height
        levels.sort((a, b) => b.height - a.height);
        setQualityLevels(levels);

        if (initialPosition > 0) {
          video.currentTime = initialPosition;
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        // Updated level
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isHls) {
      // Native Apple HLS (Safari / iOS)
      video.src = src;
      if (initialPosition > 0) {
        video.currentTime = initialPosition;
      }
    } else {
      // Standard Direct MP4/WebM Source Fallback
      video.src = src;
      if (initialPosition > 0) {
        video.currentTime = initialPosition;
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  // 2. Dynamic Floating Watermark Positioning & Clock
  React.useEffect(() => {
    const updateWatermark = () => {
      // Random coordinates keeping inside canvas bounds (10% to 70% range)
      const top = Math.floor(Math.random() * 60) + 10;
      const left = Math.floor(Math.random() * 55) + 10;
      const rotate = Math.floor(Math.random() * 16) - 8; // -8deg to +8deg
      const opacity = Number((Math.random() * 0.35 + 0.35).toFixed(2)); // 0.35 to 0.70

      setWatermarkPos({ top, left, rotate, opacity });
    };

    updateWatermark();
    const watermarkInterval = setInterval(updateWatermark, 7000);

    const timestampInterval = setInterval(() => {
      const now = new Date();
      setLiveTimestamp(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    }, 1000);

    return () => {
      clearInterval(watermarkInterval);
      clearInterval(timestampInterval);
    };
  }, []);

  // 3. Anti-Tampering Mutation Observer (DevTools / DOM inspection detection)
  React.useEffect(() => {
    const watermarkEl = watermarkRef.current;
    if (!watermarkEl) return;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // If someone attempts to hide watermark via devtools
        const target = m.target as HTMLElement;
        const style = window.getComputedStyle(target);

        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity || '1') === 0
        ) {
          triggerTamperViolation();
          return;
        }

        // If nodes were removed
        if (m.removedNodes.length > 0) {
          for (let i = 0; i < m.removedNodes.length; i++) {
            if (m.removedNodes[i] === watermarkEl) {
              triggerTamperViolation();
              return;
            }
          }
        }
      }
    });

    observer.observe(watermarkEl, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
      childList: true,
    });

    if (watermarkEl.parentElement) {
      observer.observe(watermarkEl.parentElement, {
        childList: true,
      });
    }

    return () => observer.disconnect();
  }, []);

  const triggerTamperViolation = () => {
    setIsTamperDetected(true);
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleResetCompliance = () => {
    setIsTamperDetected(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // 4. Video Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);
    const dur = video.duration || duration || 1;
    setDuration(dur);

    // Calculate buffer progress
    if (video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      setBufferedEnd(end);
    }

    const pct = Math.min(100, Math.round((video.currentTime / dur) * 100));

    if (onProgress) {
      onProgress(video.currentTime, dur, pct);
    }

    if (pct >= 90 && onComplete) {
      onComplete();
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || isTamperDetected) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const dur = duration || video?.duration || 0;
    if (!video || !dur) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newFraction = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = newFraction * dur;

    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSeekOffset = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    video.volume = clamped;
    video.muted = clamped === 0;
    setVolume(clamped);
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 0.8;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettingsMenu(false);
  };

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setShowSettingsMenu(false);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Keyboard Navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        handleSeekOffset(-5);
      } else if (e.code === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        handleSeekOffset(5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleVolumeChange(volume + 0.1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleVolumeChange(volume - 0.1);
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, isMuted]);

  // Controls auto-hide on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        setShowSettingsMenu(false);
      }, 3500);
    }
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const studentName = student?.full_name || 'Enrolled Student';
  const studentId = student?.admission_number || student?.student_code || student?.id || 'SAP-STD-2026';
  const studentEmail = student?.email || 'verified.student@erp-lms.com';

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative select-none aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group ${className}`}
    >
      {/* 1. Underlying Video Element */}
      <video
        ref={videoRef}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (onComplete) onComplete();
        }}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* 2. Top Stream Security Header */}
      <div
        className={`absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between text-white transition-opacity duration-300 z-20 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center space-x-2 truncate pr-4">
          <div className="h-6 w-6 rounded bg-[#0A6ED1] text-white flex items-center justify-center font-bold text-xs shrink-0">
            SAP
          </div>
          <span className="text-xs font-semibold truncate text-slate-100">
            {title || 'SAP S/4HANA Enterprise Curriculum Stream'}
          </span>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] bg-red-600/90 text-white font-bold px-2 py-0.5 rounded tracking-wider flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span>ENCRYPTED HLS</span>
          </span>
        </div>
      </div>

      {/* 3. Dynamic Anti-Piracy Watermarking Layer */}
      {!isTamperDetected && (
        <div
          ref={watermarkRef}
          style={{
            top: `${watermarkPos.top}%`,
            left: `${watermarkPos.left}%`,
            transform: `rotate(${watermarkPos.rotate}deg)`,
            opacity: watermarkPos.opacity,
            transition: 'top 1.5s ease-in-out, left 1.5s ease-in-out, transform 1.5s ease-in-out, opacity 1.5s ease-in-out',
          }}
          className="absolute pointer-events-none z-10 px-3 py-1.5 rounded-lg bg-black/40 border border-white/20 backdrop-blur-xs text-white text-[11px] font-mono leading-tight shadow-lg"
        >
          <div className="font-bold text-slate-100 tracking-wide">{studentName}</div>
          <div className="text-[10px] text-blue-200">{studentId} · {studentEmail}</div>
          <div className="text-[9px] text-slate-400 mt-0.5">
            {liveTimestamp || '2026-09-30 08:35:10 UTC'} · LICENSED
          </div>
        </div>
      )}

      {/* 4. Subtle Static Corner Watermark for Dual Security */}
      <div className="absolute bottom-16 right-4 pointer-events-none z-10 opacity-30 text-right font-mono text-[9px] text-white hidden sm:block">
        <div>{studentName} ({studentId})</div>
        <div>Next-Gen ERP LMS · Anti-Leak Security</div>
      </div>

      {/* 5. Anti-Piracy Tamper Alert Modal (if DevTools or user attempts to hide watermark) */}
      {isTamperDetected && (
        <div className="absolute inset-0 bg-red-950/95 z-30 flex flex-col items-center justify-center p-6 text-center text-white space-y-4 backdrop-blur-md">
          <div className="h-14 w-14 rounded-full bg-red-600/30 border border-red-500 flex items-center justify-center text-red-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-lg font-bold tracking-tight text-white">
              Anti-Piracy Compliance Violation
            </h3>
            <p className="text-xs text-red-200 leading-relaxed">
              Watermark element tampering, inspection, or unauthorized screen manipulation detected. Playback has been halted for intellectual property compliance.
            </p>
          </div>
          <div className="p-3 bg-red-900/60 border border-red-700/60 rounded-lg text-[11px] font-mono text-red-200">
            User ID: {studentId} · Session IP Recorded
          </div>
          <button
            onClick={handleResetCompliance}
            className="px-4 py-2 bg-white text-red-950 font-bold text-xs rounded-lg hover:bg-slate-100 transition-colors shadow"
          >
            Restore Compliance & Resume
          </button>
        </div>
      )}

      {/* 6. Center Big Play Button (When Paused) */}
      {!isPlaying && !isTamperDetected && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer bg-black/25 hover:bg-black/35 transition-colors"
        >
          <div className="h-16 w-16 rounded-full bg-[#0A6ED1]/90 hover:bg-[#0A6ED1] text-white flex items-center justify-center pl-1 shadow-xl hover:scale-105 transition-all">
            <Play className="h-8 w-8 fill-current" />
          </div>
        </div>
      )}

      {/* 7. Bottom Floating Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 z-20 space-y-2 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Seek Scrubber Bar */}
        <div
          onClick={handleSeek}
          className="relative w-full h-2 bg-white/20 hover:h-3 rounded-full cursor-pointer transition-all overflow-hidden"
        >
          {/* Buffer Progress */}
          <div
            style={{ width: `${bufferPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-white/30 rounded-full"
          />
          {/* Played Progress */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-[#0A6ED1] rounded-full transition-all"
          />
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between text-white text-xs pt-1">
          {/* Left Controls */}
          <div className="flex items-center space-x-3">
            <button
              onClick={togglePlay}
              className="p-1 hover:text-blue-400 transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <button
              onClick={() => handleSeekOffset(-10)}
              className="p-1 hover:text-blue-400 transition-colors"
              title="Rewind 10 seconds (J / Left Arrow)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              onClick={() => handleSeekOffset(10)}
              className="p-1 hover:text-blue-400 transition-colors"
              title="Forward 10 seconds (L / Right Arrow)"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            {/* Volume Control */}
            <div className="flex items-center space-x-1.5 group/volume">
              <button onClick={toggleMute} className="p-1 hover:text-blue-400 transition-colors">
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-1 bg-white/30 accent-[#0A6ED1] rounded-lg cursor-pointer"
                title="Volume"
              />
            </div>

            {/* Timestamp */}
            <span className="font-mono text-[11px] text-slate-300">
              {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-3 relative">
            {/* Speed Badge */}
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded font-semibold text-[11px] flex items-center space-x-1"
              title="Playback Settings"
            >
              <Settings className="h-3 w-3" />
              <span>{playbackRate}x</span>
            </button>

            {/* Settings Flyout Menu */}
            {showSettingsMenu && (
              <div className="absolute right-8 bottom-8 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 text-xs space-y-2 z-40">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                    Playback Speed
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handleSpeedChange(rate)}
                        className={`px-2 py-1 rounded text-[11px] font-medium text-center ${
                          playbackRate === rate
                            ? 'bg-[#0A6ED1] text-white font-bold'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {qualityLevels.length > 0 && (
                  <div className="pt-1 border-t border-slate-800">
                    <p className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                      Stream Quality (HLS)
                    </p>
                    <div className="space-y-0.5">
                      <button
                        onClick={() => handleQualityChange(-1)}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between ${
                          currentQuality === -1 ? 'bg-[#0A6ED1] text-white' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>Auto (Adaptive)</span>
                        {currentQuality === -1 && <Check className="h-3 w-3" />}
                      </button>
                      {qualityLevels.map((lvl) => (
                        <button
                          key={lvl.level}
                          onClick={() => handleQualityChange(lvl.level)}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center justify-between ${
                            currentQuality === lvl.level ? 'bg-[#0A6ED1] text-white' : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span>{lvl.height}p</span>
                          {currentQuality === lvl.level && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1 hover:text-blue-400 transition-colors"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
