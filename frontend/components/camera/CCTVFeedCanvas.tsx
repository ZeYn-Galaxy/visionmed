'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraFeed } from '../../types';
import { Cpu } from 'lucide-react';
import { useAppStore } from '../../lib/store';

export interface VideoDevice {
  deviceId: string;
  label: string;
}

export interface CCTVFeedCanvasProps {
  camera: CameraFeed;
  isDetailedView?: boolean;
  // Controlled webcam & device states (for Camera Detail page)
  isWebcamActive?: boolean;
  onToggleWebcam?: () => void;
  selectedDeviceId?: string;
  onSelectDevice?: (deviceId: string) => void;
  onDevicesDiscovered?: (devices: VideoDevice[]) => void;
  onStatsChange?: (stats: { fps: number; ms: number } | null) => void;
  onStatusChange?: (status: string) => void;
}

interface TrackedPerson {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  label: string;
  confidence: number;
  isAlert: boolean;
  status: string;
  lastSeen: number;
  prevY: number;
  downwardVelocity: number;
  keypoints?: [number, number, number][];
}

export const CCTVFeedCanvas: React.FC<CCTVFeedCanvasProps> = ({
  camera,
  isWebcamActive: controlledIsWebcamActive,
  selectedDeviceId: controlledSelectedDeviceId,
  onToggleWebcam,
  onDevicesDiscovered,
  onStatsChange,
  onStatusChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);

  // Uncontrolled state fallbacks if not supplied as props
  const [internalWebcamActive] = useState<boolean>(false);
  const [internalSelectedDeviceId, setInternalSelectedDeviceId] = useState<string>('');
  const [, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [backendInferStats, setBackendInferStats] = useState<{ fps: number; ms: number } | null>(null);

  // Stable callback refs to avoid infinite re-render cycles
  const onDevicesDiscoveredRef = useRef(onDevicesDiscovered);
  const onStatsChangeRef = useRef(onStatsChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const onToggleWebcamRef = useRef(onToggleWebcam);

  useEffect(() => {
    onDevicesDiscoveredRef.current = onDevicesDiscovered;
    onStatsChangeRef.current = onStatsChange;
    onStatusChangeRef.current = onStatusChange;
    onToggleWebcamRef.current = onToggleWebcam;
  });

  // Status reporter with change deduplication
  const lastReportedStatusRef = useRef<string>('');
  const updateStatus = useCallback((status: string) => {
    if (lastReportedStatusRef.current !== status) {
      lastReportedStatusRef.current = status;
      onStatusChangeRef.current?.(status);
    }
  }, []);

  // Determine active states
  const effectiveWebcamActive = controlledIsWebcamActive !== undefined ? controlledIsWebcamActive : internalWebcamActive;
  const effectiveDeviceId = controlledSelectedDeviceId !== undefined ? controlledSelectedDeviceId : internalSelectedDeviceId;

  const {
    socket,
    isCameraMirrored,
    updateCameraPeopleCount,
    triggerEmergencyAlert,
    reportCVDetection,
    currentUser
  } = useAppStore();
  const isAdmin = currentUser?.role === 'admin';
  const isCameraMirroredRef = useRef(isCameraMirrored);
  useEffect(() => {
    isCameraMirroredRef.current = isCameraMirrored;
  }, [isCameraMirrored]);

  // Multi-person tracking collection
  const trackedPersonsRef = useRef<Map<string, TrackedPerson>>(new Map());
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const isStreamingToBackendRef = useRef<boolean>(false);
  const lastStreamTimeRef = useRef<number>(0);
  const lastCountReportRef = useRef<number>(0);
  const lastReportedCountRef = useRef<number>(-1);
  const lastTriggeredAlertTimeRef = useRef<number>(0);

  // Enumerate video devices (isolated, never in camera stream loop)
  const enumerateDevices = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${index + 1}`
          }));

        setAvailableDevices(videoInputs);
        onDevicesDiscoveredRef.current?.(videoInputs);

        if (videoInputs.length > 0 && !effectiveDeviceId) {
          setInternalSelectedDeviceId(videoInputs[0].deviceId);
        }
        return videoInputs;
      }
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
    }
    return [];
  }, [effectiveDeviceId]);

  useEffect(() => {
    enumerateDevices();
    const handleDeviceChange = () => {
      enumerateDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [enumerateDevices]);

  // Robust, Non-glitching Camera Stream Lifecycle
  useEffect(() => {
    let isCancelled = false;

    async function setupStream() {
      // 1. Stop existing stream if any
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((track) => track.stop());
        currentStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      if (!effectiveWebcamActive) {
        setWebcamError(null);
        return;
      }

      try {
        let stream: MediaStream;

        // Try preferred 16:9 constraints
        try {
          const constraints: MediaStreamConstraints = {
            video: effectiveDeviceId
              ? { deviceId: { ideal: effectiveDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (initialErr) {
          console.warn('Preferred camera constraints failed, attempting fallback { video: true }:', initialErr);
          // Fallback to basic video stream without constraint errors
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        currentStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch((playErr) => {
            console.warn('Video play interrupted:', playErr);
          });
        }

        setWebcamError(null);

        // Re-enumerate devices to update labels now that permission is active
        enumerateDevices();
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error('Camera access error:', err);
        setWebcamError('Camera access denied or camera is in use by another application.');
      }
    }

    setupStream();

    return () => {
      isCancelled = true;
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach((track) => track.stop());
        currentStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [effectiveWebcamActive, effectiveDeviceId, enumerateDevices]);

  // Listen for backend real-time YOLO results
  useEffect(() => {
    if (!socket) return;

    interface CVResponse {
      camera_id: string;
      people_count: number;
      infer_ms: number;
      fps: number;
      persons: {
        track_id: number;
        bbox: [number, number, number, number];
        confidence: number;
        symptom?: string;
        posture?: string;
        status?: string;
        keypoints?: [number, number, number][];
      }[];
    }

    const handleCVResults = (data: CVResponse) => {
      if (data.camera_id && camera.id && data.camera_id.trim() !== camera.id.trim()) return;

      isStreamingToBackendRef.current = false;
      const stats = { fps: data.fps, ms: data.infer_ms };
      setBackendInferStats(stats);
      onStatsChangeRef.current?.(stats);

      if (typeof data.people_count === 'number') {
        updateCameraPeopleCount(camera.id, data.people_count);
      }

      const tracks = trackedPersonsRef.current;
      const now = Date.now();
      const currentActiveIds = new Set<string>();

      if (data.persons && data.persons.length > 0) {
        // 16:9 Canvas resolution: 640 x 360, Downscaled input: 320 x 180
        const scaleX = 640 / 320;
        const scaleY = 360 / 180;

        data.persons.forEach((p) => {
          const pId = `PERSON #${p.track_id < 10 ? '0' + p.track_id : p.track_id}`;
          currentActiveIds.add(pId);
          const bx1 = p.bbox[0] * scaleX;
          const by1 = p.bbox[1] * scaleY;
          const bx2 = p.bbox[2] * scaleX;
          const by2 = p.bbox[3] * scaleY;
          const bw = Math.max(bx2 - bx1, 30);
          const bh = Math.max(by2 - by1, 50);
          const scaledKps = p.keypoints?.map(([kx, ky, kc]) => [kx * scaleX, ky * scaleY, kc] as [number, number, number]);
          const isAlert = Boolean(p.symptom);
          const statusText = p.symptom ? `CRITICAL: ${p.symptom.toUpperCase()}` : (p.posture || 'NORMAL');

          if (!tracks.has(pId)) {
            tracks.set(pId, {
              id: pId,
              x: bx1,
              y: by1,
              w: bw,
              h: bh,
              targetX: bx1,
              targetY: by1,
              targetW: bw,
              targetH: bh,
              label: isAlert ? `🚨 ${p.symptom}` : `${pId} (${p.posture || 'Normal'})`,
              confidence: p.confidence,
              isAlert,
              status: statusText,
              lastSeen: now,
              prevY: by1,
              downwardVelocity: 0,
              keypoints: scaledKps
            });
          } else {
            const trk = tracks.get(pId)!;
            trk.targetX = bx1;
            trk.targetY = by1;
            trk.targetW = bw;
            trk.targetH = bh;
            trk.confidence = p.confidence;
            trk.lastSeen = now;
            trk.keypoints = scaledKps;
            trk.isAlert = isAlert;
            trk.label = isAlert ? `🚨 ${p.symptom}` : `${pId} (${p.posture || 'Normal'})`;
            trk.status = statusText;
          }
        });
      }

      // Automatically prune inactive tracks not seen in latest YOLO frame (> 800ms)
      tracks.forEach((_, id) => {
        if (!currentActiveIds.has(id)) {
          const t = tracks.get(id);
          if (t && now - t.lastSeen > 800) {
            tracks.delete(id);
          }
        }
      });
    };

    socket.on('cv_results', handleCVResults);
    return () => {
      socket.off('cv_results', handleCVResults);
    };
  }, [socket, camera.id]);

  // Main Render Loop: 16:9 aspect ratio (640x360), YOLO streaming (320x180)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Downscaled canvas for fast 16:9 frame encoding to YOLO backend
    const downCanvas = document.createElement('canvas');
    downCanvas.width = 320;
    downCanvas.height = 180;
    const downCtx = downCanvas.getContext('2d', { willReadFrequently: true });

    let frameId: number;
    let tick = 0;

    const render = () => {
      tick++;
      const w = canvas.width;
      const h = canvas.height;
      const now = Date.now();

      const isVideoActive = effectiveWebcamActive && videoRef.current && videoRef.current.readyState >= 2;

      if (isVideoActive && videoRef.current) {
        // Draw real webcam video feed
        if (isCameraMirroredRef.current) {
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, 0, 0, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(videoRef.current, 0, 0, w, h);
        }

        // Stream 16:9 frame to Python Backend YOLO-Pose via WebSocket (~15-20 fps)
        const frameInterval = 65;
        if (downCtx && now - lastStreamTimeRef.current > frameInterval) {
          // Fail-safe watchdog: unlock if stuck for > 2500ms
          if (isStreamingToBackendRef.current && now - lastStreamTimeRef.current > 2500) {
            isStreamingToBackendRef.current = false;
          }

          if (!isStreamingToBackendRef.current) {
            if (isCameraMirroredRef.current) {
              downCtx.save();
              downCtx.translate(320, 0);
              downCtx.scale(-1, 1);
              downCtx.drawImage(videoRef.current, 0, 0, 320, 180);
              downCtx.restore();
            } else {
              downCtx.drawImage(videoRef.current, 0, 0, 320, 180);
            }
            const frameB64 = downCanvas.toDataURL('image/jpeg', 0.60);
            isStreamingToBackendRef.current = true;
            lastStreamTimeRef.current = now;

            if (socket && socket.connected) {
              socket.emit('cv_frame', { camera_id: camera.id, image: frameB64 });
            } else {
              // HTTP POST fallback
              fetch('http://localhost:5000/api/cv/test-base64', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: frameB64, camera_id: camera.id })
              })
                .then((r) => r.json())
                .then((res) => {
                  isStreamingToBackendRef.current = false;
                  if (res.success && res.persons) {
                    const stats = { fps: 20, ms: res.infer_ms };
                    setBackendInferStats(stats);
                    onStatsChangeRef.current?.(stats);
                    if (typeof res.people_count === 'number') {
                      const nowTs = Date.now();
                      if (res.people_count !== lastReportedCountRef.current || nowTs - lastCountReportRef.current > 1200) {
                        lastReportedCountRef.current = res.people_count;
                        lastCountReportRef.current = nowTs;
                        updateCameraPeopleCount(camera.id, res.people_count);
                      }
                    }
                    const tracks = trackedPersonsRef.current;
                    const scaleX = 640 / 320;
                    const scaleY = 360 / 180;
                    const actIds = new Set<string>();
                    res.persons.forEach((p: { track_id: number; bbox: number[]; symptom?: string; posture?: string; confidence?: number; keypoints?: [number, number, number][] }) => {
                      const pId = `PERSON #${p.track_id < 10 ? '0' + p.track_id : p.track_id}`;
                      actIds.add(pId);
                      const bx1 = p.bbox[0] * scaleX;
                      const by1 = p.bbox[1] * scaleY;
                      const bx2 = p.bbox[2] * scaleX;
                      const by2 = p.bbox[3] * scaleY;
                      const isAlert = Boolean(p.symptom);
                      const statusText = p.symptom ? `CRITICAL: ${p.symptom.toUpperCase()}` : (p.posture || 'NORMAL');
                      tracks.set(pId, {
                        id: pId,
                        x: bx1,
                        y: by1,
                        w: Math.max(bx2 - bx1, 30),
                        h: Math.max(by2 - by1, 50),
                        targetX: bx1,
                        targetY: by1,
                        targetW: Math.max(bx2 - bx1, 30),
                        targetH: Math.max(by2 - by1, 50),
                        label: isAlert ? `🚨 ${p.symptom}` : `${pId} (${p.posture || 'Normal'})`,
                        confidence: p.confidence || 0.95,
                        isAlert,
                        status: statusText,
                        lastSeen: now,
                        prevY: by1,
                        downwardVelocity: 0,
                        keypoints: p.keypoints?.map(([kx, ky, kc]: [number, number, number]) => [kx * scaleX, ky * scaleY, kc])
                      });
                    });
                    tracks.forEach((_, id) => {
                      if (!actIds.has(id)) {
                        const t = tracks.get(id);
                        if (t && now - t.lastSeen > 800) tracks.delete(id);
                      }
                    });
                  }
                })
                .catch(() => {
                  isStreamingToBackendRef.current = false;
                });
            }
          }
        }

        const tracks = trackedPersonsRef.current;

        // Clean up stale tracks (older than 1.5s)
        tracks.forEach((t, trackId) => {
          if (now - t.lastSeen > 1500) {
            tracks.delete(trackId);
          }
        });

        if (tracks.size === 0) {
          // Authentic Real-Time YOLO Scanning Reticle when 0 people
          drawScanningReticle(ctx, w, h, tick);
          updateStatus('YOLO Active • 0 People (Scanning...)');
        } else {
          // Render YOLO Bounding Boxes & Skeletons
          let anyEmergency = false;
          let emergencyName = '';

          tracks.forEach((trk) => {
            const dx = trk.targetX - trk.x;
            const dy = trk.targetY - trk.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 40) {
              trk.x = trk.targetX;
              trk.y = trk.targetY;
              trk.w = trk.targetW;
              trk.h = trk.targetH;
            } else {
              trk.x += dx * 0.75;
              trk.y += dy * 0.75;
              trk.w += (trk.targetW - trk.w) * 0.75;
              trk.h += (trk.targetH - trk.h) * 0.75;
            }

            if (trk.isAlert) {
              anyEmergency = true;
              emergencyName = trk.status.replace('CRITICAL: ', '') || 'EMERGENCY';
            }

            drawPersonDetectionBox(ctx, trk);
          });

          if (anyEmergency) {
            updateStatus(emergencyName);

            // Instantly sound alarm and trigger warning banner & ambient glow
            if (now - lastTriggeredAlertTimeRef.current > 4000) {
              lastTriggeredAlertTimeRef.current = now;
              triggerEmergencyAlert(camera.id, emergencyName, camera.name);
              reportCVDetection(
                camera.id,
                emergencyName,
                `Status: Critical ${emergencyName}`,
                'YOLO11-Pose Edge Model',
                emergencyName
              );
            }
          } else {
            updateStatus(`Active (${tracks.size} People Detected)`);
          }
        }
      } else {
        // Clear stale tracks when camera is offline
        if (trackedPersonsRef.current.size > 0) {
          trackedPersonsRef.current.clear();
        }
        prevFrameDataRef.current = null;

        // Reset people count to 0 when camera is offline / standby
        if (camera.peopleCount !== 0) {
          lastReportedCountRef.current = 0;
          updateCameraPeopleCount(camera.id, 0);
        }

        // Clean authentic surveillance standby monitor screen
        drawCameraUnavailableScreen(ctx, w, h, camera, tick);
        updateStatus('Standby');
      }

      // CCTV Timestamp & Metadata Header overlay (Authentic Surveillance Banner)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, w, 24);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9.5px monospace';
      const timestamp = camera.cameraTimestamp || new Date().toLocaleTimeString();
      const camLabel = `${camera.id} • ${timestamp} • ${camera.location.toUpperCase()}`;
      ctx.fillText(camLabel, 8, 16);

      // Signal Strength bars bottom right
      drawSignalBars(ctx, w - 24, h - 14, effectiveWebcamActive ? '#22c55e' : '#64748b');

      // Subtle CCTV Scanline effect
      if (tick % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, (tick * 2) % h, w, 1.5);
      }

      frameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [camera.id, camera.location, camera.cameraTimestamp, effectiveWebcamActive, socket, updateStatus]);

  return (
    <div className="relative w-full aspect-video bg-slate-950 overflow-hidden rounded-lg group select-none shadow-inner">
      {/* Hidden real video element for MediaStream capture */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Main 16:9 Canvas (640x360) */}
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="w-full h-full object-cover block"
      />

      {/* Top right CCTV Status Watermark (Non-interactive HUD) */}
      <div className="absolute top-1.5 right-2 flex items-center gap-1.5 z-10 pointer-events-none">
        {isAdmin && backendInferStats && effectiveWebcamActive && (
          <span className="bg-slate-900/80 text-cyan-400 font-mono text-[8px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5 text-cyan-400" />
            <span>YOLO {backendInferStats.fps} FPS</span>
          </span>
        )}
        <span
          className={`w-2 h-2 rounded-full ${
            effectiveWebcamActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
          }`}
        ></span>
        <span
          className={`text-[9px] font-mono font-bold tracking-wider ${
            effectiveWebcamActive ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          {effectiveWebcamActive ? 'LIVE CCTV CV' : 'STANDBY'}
        </span>
      </div>

      {webcamError && (
        <div className="absolute top-8 left-2 right-2 bg-red-950/90 text-red-200 text-[10px] p-2 rounded border border-red-700 flex items-center gap-1.5 z-20">
          <span>{webcamError}</span>
        </div>
      )}
    </div>
  );
};

// ==========================================
// SCANNING RETICLE (YOLO ACTIVE HUD OVERLAY)
// ==========================================

function drawScanningReticle(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.5;

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 24, cy);
  ctx.moveTo(cx, cy - 24);
  ctx.lineTo(cx, cy - 8);
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + 24);
  ctx.stroke();

  // Radar circle sweep
  const sweepAngle = (tick * 0.05) % (Math.PI * 2);
  ctx.beginPath();
  ctx.arc(cx, cy, 32, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 32, sweepAngle, sweepAngle + 0.35);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.fill();

  // Badge bottom
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillRect(cx - 110, cy + 44, 220, 18);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.strokeRect(cx - 110, cy + 44, 220, 18);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('YOLO11-POSE ACTIVE • SCANNING SKELETON (0)', cx, cy + 56);
  ctx.restore();
}

function drawPersonDetectionBox(ctx: CanvasRenderingContext2D, person: TrackedPerson) {
  const { x, y, w, h, label, confidence, isAlert, keypoints } = person;
  const color = isAlert ? '#ef4444' : '#22c55e';
  const bracketLen = Math.min(w, h) * 0.18;

  ctx.save();

  // Translucent fill
  ctx.fillStyle = isAlert ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.05)';
  ctx.fillRect(x, y, w, h);

  // Outer Box Border
  ctx.strokeStyle = isAlert ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Corner Brackets (YOLO Style)
  ctx.strokeStyle = color;
  ctx.lineWidth = isAlert ? 3 : 2.5;
  ctx.beginPath();

  // Top-Left
  ctx.moveTo(x, y + bracketLen);
  ctx.lineTo(x, y);
  ctx.lineTo(x + bracketLen, y);

  // Top-Right
  ctx.moveTo(x + w - bracketLen, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + bracketLen);

  // Bottom-Left
  ctx.moveTo(x, y + h - bracketLen);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + bracketLen, y + h);

  // Bottom-Right
  ctx.moveTo(x + w - bracketLen, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - bracketLen);

  ctx.stroke();

  // Official Ultralytics YOLO-Pose Color Palette & Limbs
  const SKELETON_LIMBS: { pair: [number, number]; color: string }[] = [
    { pair: [0, 1], color: '#ec4899' },
    { pair: [0, 2], color: '#d946ef' },
    { pair: [1, 3], color: '#ec4899' },
    { pair: [2, 4], color: '#d946ef' },
    { pair: [5, 6], color: '#10b981' },
    { pair: [5, 7], color: '#f97316' },
    { pair: [7, 9], color: '#fbbf24' },
    { pair: [6, 8], color: '#06b6d4' },
    { pair: [8, 10], color: '#38bdf8' },
    { pair: [5, 11], color: '#10b981' },
    { pair: [6, 12], color: '#10b981' },
    { pair: [11, 12], color: '#10b981' },
    { pair: [11, 13], color: '#ea580c' },
    { pair: [13, 15], color: '#f59e0b' },
    { pair: [12, 14], color: '#0284c7' },
    { pair: [14, 16], color: '#0ea5e9' },
  ];

  const KPT_COLORS = [
    '#ec4899', '#ec4899', '#d946ef', '#ec4899', '#d946ef',
    '#10b981', '#10b981',
    '#f97316', '#06b6d4',
    '#fbbf24', '#38bdf8',
    '#10b981', '#10b981',
    '#ea580c', '#0284c7',
    '#f59e0b', '#0ea5e9',
  ];

  // Render Official YOLO Skeleton Limbs & Keypoints
  if (keypoints && keypoints.length === 17) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;

    SKELETON_LIMBS.forEach(({ pair: [k1, k2], color: limbCol }) => {
      const ka = keypoints[k1];
      const kb = keypoints[k2];
      if (ka && kb && ka[2] > 0.35 && kb[2] > 0.35) {
        ctx.strokeStyle = isAlert ? 'rgba(239, 68, 68, 0.9)' : limbCol;
        ctx.beginPath();
        ctx.moveTo(ka[0], ka[1]);
        ctx.lineTo(kb[0], kb[1]);
        ctx.stroke();
      }
    });

    // Render Two-Tier Joint Dots
    keypoints.forEach(([kx, ky, kconf], idx) => {
      if (kconf > 0.35) {
        const dotColor = isAlert ? '#ef4444' : (KPT_COLORS[idx] || '#facc15');
        ctx.beginPath();
        ctx.arc(kx, ky, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(kx, ky, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    });
  }

  // Top Header Label Pill (YOLO Style)
  const headerText = `${label} (${Math.round(confidence * 100)}%)`;
  ctx.font = 'bold 9.5px monospace';
  const textWidth = ctx.measureText(headerText).width;
  const pillW = Math.max(textWidth + 10, 75);
  const pillH = 16;

  ctx.fillStyle = isAlert ? 'rgba(220, 38, 38, 0.95)' : 'rgba(22, 163, 74, 0.95)';
  ctx.fillRect(x, Math.max(y - pillH, 26), pillW, pillH);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(headerText, x + 5, Math.max(y - 4, 38));

  ctx.restore();
}

// ==========================================
// CAMERA UNAVAILABLE / STANDBY SCREEN
// ==========================================

function drawCameraUnavailableScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: CameraFeed,
  tick: number
) {
  // Dark Surveillance Monitor Background
  ctx.fillStyle = '#080d18';
  ctx.fillRect(0, 0, w, h);

  // Digital Grid Lines
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  ctx.beginPath();
  for (let x = 0; x < w; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Center CCTV "SURVEILLANCE FEED STANDBY" Box
  const boxW = Math.min(w * 0.75, 340);
  const boxH = 110;
  const boxX = (w - boxW) / 2;
  const boxY = (h - boxH) / 2;

  // Backdrop
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Corner Accents on Box
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  const cLen = 12;
  ctx.beginPath();
  ctx.moveTo(boxX, boxY + cLen);
  ctx.lineTo(boxX, boxY);
  ctx.lineTo(boxX + cLen, boxY);

  ctx.moveTo(boxX + boxW - cLen, boxY);
  ctx.lineTo(boxX + boxW, boxY);
  ctx.lineTo(boxX + boxW, boxY + cLen);

  ctx.moveTo(boxX, boxY + boxH - cLen);
  ctx.lineTo(boxX, boxY + boxH);
  ctx.lineTo(boxX + cLen, boxY + boxH);

  ctx.moveTo(boxX + boxW - cLen, boxY + boxH);
  ctx.lineTo(boxX + boxW, boxY + boxH);
  ctx.lineTo(boxX + boxW, boxY + boxH - cLen);
  ctx.stroke();

  const iconY = boxY + 28;
  const iconX = w / 2;

  // Pulsing Indicator Dot
  const isBlink = Math.floor(tick / 25) % 2 === 0;
  ctx.fillStyle = isBlink ? '#38bdf8' : '#0369a1';
  ctx.beginPath();
  ctx.arc(iconX - 85, iconY - 4, 4, 0, Math.PI * 2);
  ctx.fill();

  // Main Header Text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAMERA FEED STANDBY', iconX, iconY);

  // Subtitle Diagnostic
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.fillText('STREAM / CAMERA INACTIVE', iconX, iconY + 18);

  // Diagnostic Info
  ctx.fillStyle = '#64748b';
  ctx.font = '8px monospace';
  ctx.fillText(`CHANNEL: ${camera.id} • ${camera.location.toUpperCase()} • READY`, iconX, iconY + 34);

  // Note at bottom of the box
  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('VisionMed Smart Health Monitoring System', iconX, iconY + 54);

  ctx.textAlign = 'left';
}

function drawSignalBars(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#22c55e') {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 6, 2.5, 4);
  ctx.fillRect(x + 4, y + 4, 2.5, 6);
  ctx.fillRect(x + 8, y + 2, 2.5, 8);
  ctx.fillRect(x + 12, y, 2.5, 10);
}
