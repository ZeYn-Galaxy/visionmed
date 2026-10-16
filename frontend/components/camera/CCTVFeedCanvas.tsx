'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraFeed } from '../../types';
import { Camera, AlertTriangle, Cpu, Upload, Image as ImageIcon, XCircle, RotateCcw, Activity, Users, Sparkles, Video, Play, Heart, Zap, Brain } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

interface CCTVFeedCanvasProps {
  camera: CameraFeed;
  isDetailedView?: boolean;
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

interface VideoDevice {
  deviceId: string;
  label: string;
}

export const CCTVFeedCanvas: React.FC<CCTVFeedCanvasProps> = ({ camera }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const testerImageRef = useRef<HTMLImageElement | null>(null);
  const [testerMedia, setTesterMedia] = useState<{ type: 'video' | 'image'; name: string; url: string } | null>(null);

  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [activeDetectionStatus, setActiveDetectionStatus] = useState<string>('Standby');

  // Video device selection
  const [availableDevices, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // AI Pose Model telemetry from backend
  const [backendInferStats, setBackendInferStats] = useState<{ fps: number; ms: number } | null>(null);

  const { reportCVDetection, socket, openMediaTesterModal } = useAppStore();

  // Multi-person tracking collection
  const trackedPersonsRef = useRef<Map<string, TrackedPerson>>(new Map());
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const simulatedAlertRef = useRef<{ personId: string; symptom: string } | null>(null);
  const isStreamingToBackendRef = useRef<boolean>(false);
  const lastStreamTimeRef = useRef<number>(0);
  const lastAlertTimeRef = useRef<number>(0);
  const lastAlertSymptomRef = useRef<string>('');

  // Enumerate video devices
  const refreshDevices = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${index + 1} (${d.deviceId ? d.deviceId.slice(0, 6) : 'Default'})`
          }));

        setAvailableDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      }
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Setup webcam stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      if (isWebcamActive) {
        try {
          const constraints: MediaStreamConstraints = {
            video: selectedDeviceId
              ? { deviceId: { exact: selectedDeviceId }, width: 640, height: 480 }
              : { width: 640, height: 480, frameRate: { ideal: 30 } }
          };

          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setWebcamError(null);
          }

          refreshDevices();
        } catch (err) {
          console.error('Camera error:', err);
          setWebcamError('Akses kamera tidak diizinkan atau kamera tidak tersedia.');
          setIsWebcamActive(false);
        }
      } else {
        if (videoRef.current && videoRef.current.srcObject) {
          const s = videoRef.current.srcObject as MediaStream;
          s.getTracks().forEach((track) => track.stop());
          videoRef.current.srcObject = null;
        }
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isWebcamActive, selectedDeviceId, refreshDevices]);

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
      setBackendInferStats({ fps: data.fps, ms: data.infer_ms });

      const tracks = trackedPersonsRef.current;
      const now = Date.now();
      const currentActiveIds = new Set<string>();

      if (data.persons && data.persons.length > 0) {
        const scaleX = 480 / 320;
        const scaleY = 360 / 240;

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

          if (isAlert && p.symptom) {
            const tNow = Date.now();
            if (tNow - lastAlertTimeRef.current > 4000 || lastAlertSymptomRef.current !== p.symptom) {
              lastAlertTimeRef.current = tNow;
              lastAlertSymptomRef.current = p.symptom;
              reportCVDetection(
                camera.id,
                p.symptom,
                `Status: Emergency Alert (${p.symptom})`,
                'YOLO11-Pose Multi-Person Model',
                p.symptom
              );
            }
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
  }, [socket, camera.id, camera.hasAlert, reportCVDetection]);

  // Main Render Loop with Multi-Person Spatial Clustering & Backend YOLO Stream
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Downscaled canvas for fast motion capture & frame encoding
    const downCanvas = document.createElement('canvas');
    downCanvas.width = 320;
    downCanvas.height = 240;
    const downCtx = downCanvas.getContext('2d', { willReadFrequently: true });

    let frameId: number;
    let tick = 0;

    const render = () => {
      tick++;
      const w = canvas.width;
      const h = canvas.height;
      const now = Date.now();

      const isVideoActive = (isWebcamActive || testerMedia?.type === 'video') && videoRef.current && videoRef.current.readyState >= 2;

      if (isVideoActive && videoRef.current) {
        // Draw real video frame (Webcam or uploaded test video)
        ctx.drawImage(videoRef.current, 0, 0, w, h);

        // Stream frame to Python Backend YOLO-Pose via WebSocket (Real-time ~15-20 fps)
        const frameInterval = 65;
        if (downCtx && now - lastStreamTimeRef.current > frameInterval) {
          // Fail-safe watchdog: only unlock if no response for > 2500ms
          if (isStreamingToBackendRef.current && now - lastStreamTimeRef.current > 2500) {
            isStreamingToBackendRef.current = false;
          }

          if (!isStreamingToBackendRef.current) {
            downCtx.drawImage(videoRef.current, 0, 0, 320, 240);
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
                    setBackendInferStats({ fps: 20, ms: res.infer_ms });
                    const tracks = trackedPersonsRef.current;
                    const scaleX = 480 / 320;
                    const scaleY = 360 / 240;
                    const actIds = new Set<string>();
                    res.persons.forEach((p: any) => {
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
                        confidence: p.confidence,
                        isAlert,
                        status: statusText,
                        lastSeen: now,
                        prevY: by1,
                        downwardVelocity: 0,
                        keypoints: p.keypoints?.map(([kx, ky, kc]: [number, number, number]) => [kx * scaleX, ky * scaleY, kc])
                      });
                      if (isAlert && p.symptom) {
                        const tNow = Date.now();
                        if (tNow - lastAlertTimeRef.current > 4000 || lastAlertSymptomRef.current !== p.symptom) {
                          lastAlertTimeRef.current = tNow;
                          lastAlertSymptomRef.current = p.symptom;
                          reportCVDetection(
                            camera.id,
                            p.symptom,
                            `Status: Emergency Alert (${p.symptom})`,
                            'YOLO11-Pose Multi-Person Model',
                            p.symptom
                          );
                        }
                      }

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
          // Authentic Real-Time YOLO Scanning HUD when 0 people in camera
          drawScanningReticle(ctx, w, h, tick);
          setActiveDetectionStatus('YOLO Active • 0 People (Scanning...)');
        } else {
          // Smooth positions & Draw Real YOLO Bounding Boxes & Skeletons
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

            drawPersonDetectionBox(ctx, trk, tick);
          });

          if (anyEmergency) {
            setActiveDetectionStatus(emergencyName);
          } else {
            setActiveDetectionStatus(`Active (${tracks.size} People Detected)`);
          }
        }
      } else if (testerMedia?.type === 'image' && testerImageRef.current) {
        // DRAW UPLOADED / PRESET IMAGE & REAL YOLO BOUNDING BOXES
        ctx.drawImage(testerImageRef.current, 0, 0, w, h);
        const tracks = trackedPersonsRef.current;
        tracks.forEach((trk) => {
          drawPersonDetectionBox(ctx, trk, tick);
        });
        setActiveDetectionStatus(`Tester Foto (${tracks.size} Orang Terdeteksi)`);
      } else {
        // Clear stale tracks when camera is offline
        if (trackedPersonsRef.current.size > 0) {
          trackedPersonsRef.current.clear();
        }
        prevFrameDataRef.current = null;

        // CAMERA UNAVAILABLE SCREEN
        drawCameraUnavailableScreen(ctx, w, h, camera, tick);
      }

      // CCTV Timestamp & Metadata Header overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, w, 22);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9px monospace';
      const timestamp = camera.cameraTimestamp || new Date().toLocaleTimeString();
      const camLabel = `${camera.id} • ${timestamp} • ${camera.location.toUpperCase()}`;
      ctx.fillText(camLabel, 8, 14);

      // Signal Strength bars bottom right
      drawSignalBars(ctx, w - 24, h - 14, isWebcamActive || testerMedia ? '#22c55e' : '#64748b');

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
  }, [camera, isWebcamActive, testerMedia, reportCVDetection, socket, backendInferStats]);

  const toggleWebcam = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (testerMedia) {
      handleResetTester(e);
      return;
    }
    const next = !isWebcamActive;
    setIsWebcamActive(next);
    if (!next) {
      trackedPersonsRef.current.clear();
      prevFrameDataRef.current = null;
      setBackendInferStats(null);
      setActiveDetectionStatus('Standby');
    }
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    setSelectedDeviceId(e.target.value);
    if (!isWebcamActive) {
      setIsWebcamActive(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        if (videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
          videoRef.current.srcObject = null;
        }
        videoRef.current.src = url;
        videoRef.current.loop = true;
        videoRef.current.muted = true;
        videoRef.current.play().catch(console.error);
      }
      setTesterMedia({ type: 'video', name: file.name, url });
      setIsWebcamActive(true);
      toast.success(`Video ${file.name} dimuat untuk inferensi YOLO11-Pose real-time!`, { icon: '🎬' });
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        testerImageRef.current = img;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 640;
        c.height = img.naturalHeight || 480;
        const ctx2 = c.getContext('2d');
        if (ctx2) {
          ctx2.drawImage(img, 0, 0, c.width, c.height);
          const b64 = c.toDataURL('image/jpeg', 0.85);
          fetch('http://localhost:5000/api/cv/test-base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: b64, camera_id: camera.id })
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.success && res.persons) {
                setBackendInferStats({ fps: 20, ms: res.infer_ms });
                const tracks = trackedPersonsRef.current;
                tracks.clear();
                const natW = img.naturalWidth || res.width || c.width;
                const natH = img.naturalHeight || res.height || c.height;
                const scaleX = 480 / natW;
                const scaleY = 360 / natH;
                res.persons.forEach((p: any) => {
                  const pId = `PERSON #${p.track_id < 10 ? '0' + p.track_id : p.track_id}`;
                  const [bx1, by1, bx2, by2] = p.bbox;
                  const isAlert = Boolean(p.symptom);
                  tracks.set(pId, {
                    id: pId,
                    x: bx1 * scaleX,
                    y: by1 * scaleY,
                    w: Math.max((bx2 - bx1) * scaleX, 30),
                    h: Math.max((by2 - by1) * scaleY, 40),
                    targetX: bx1 * scaleX,
                    targetY: by1 * scaleY,
                    targetW: Math.max((bx2 - bx1) * scaleX, 30),
                    targetH: Math.max((by2 - by1) * scaleY, 40),
                    label: isAlert ? `🚨 ${p.symptom}` : `${pId} (${p.posture || 'Normal'})`,
                    confidence: p.confidence,
                    isAlert,
                    status: p.symptom ? `CRITICAL: ${p.symptom.toUpperCase()}` : (p.posture || 'DETECTED'),
                    lastSeen: Date.now(),
                    prevY: by1 * scaleY,
                    downwardVelocity: 0,
                    keypoints: p.keypoints?.map(([kx, ky, kc]: [number, number, number]) => [kx * scaleX, ky * scaleY, kc])
                  });
                  if (isAlert && p.symptom) {
                    const tNow = Date.now();
                    if (tNow - lastAlertTimeRef.current > 4000 || lastAlertSymptomRef.current !== p.symptom) {
                      lastAlertTimeRef.current = tNow;
                      lastAlertSymptomRef.current = p.symptom;
                      reportCVDetection(
                        camera.id,
                        p.symptom,
                        `Status: Emergency Alert (${p.symptom})`,
                        'YOLO11-Pose Multi-Person Model',
                        p.symptom
                      );
                    }
                  }

                });
                toast.success(`YOLO11-Pose: ${res.people_count} orang terdeteksi (${res.infer_ms}ms)!`, { icon: '🎯' });
              }
            })
            .catch(console.error);
        }
      };
      setTesterMedia({ type: 'image', name: file.name, url });
      setIsWebcamActive(false);
    }
  };

  const handlePresetSample = (url: string, name: string) => {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      testerImageRef.current = img;
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = reader.result as string;
            fetch('http://localhost:5000/api/cv/test-base64', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: b64, camera_id: camera.id })
            })
              .then((r) => r.json())
              .then((res) => {
                if (res.success && res.persons) {
                  setBackendInferStats({ fps: 24, ms: res.infer_ms });
                  const tracks = trackedPersonsRef.current;
                  tracks.clear();
                  const natW = img.naturalWidth || res.width || 640;
                  const natH = img.naturalHeight || res.height || 480;
                  const scaleX = 480 / natW;
                  const scaleY = 360 / natH;
                  res.persons.forEach((p: any) => {
                    const pId = `PERSON #${p.track_id < 10 ? '0' + p.track_id : p.track_id}`;
                    const [bx1, by1, bx2, by2] = p.bbox;
                    const isAlert = Boolean(p.symptom);
                    tracks.set(pId, {
                      id: pId,
                      x: bx1 * scaleX,
                      y: by1 * scaleY,
                      w: Math.max((bx2 - bx1) * scaleX, 30),
                      h: Math.max((by2 - by1) * scaleY, 40),
                      targetX: bx1 * scaleX,
                      targetY: by1 * scaleY,
                      targetW: Math.max((bx2 - bx1) * scaleX, 30),
                      targetH: Math.max((by2 - by1) * scaleY, 40),
                      label: isAlert ? `🚨 ${p.symptom}` : `${pId} (${p.posture || 'Normal'})`,
                      confidence: p.confidence,
                      isAlert,
                      status: p.symptom ? `CRITICAL: ${p.symptom.toUpperCase()}` : (p.posture || 'DETECTED'),
                      lastSeen: Date.now(),
                      prevY: by1 * scaleY,
                      downwardVelocity: 0,
                      keypoints: p.keypoints?.map(([kx, ky, kc]: [number, number, number]) => [kx * scaleX, ky * scaleY, kc])
                    });
                    if (isAlert && p.symptom) {
                      const tNow = Date.now();
                      if (tNow - lastAlertTimeRef.current > 4000 || lastAlertSymptomRef.current !== p.symptom) {
                        lastAlertTimeRef.current = tNow;
                        lastAlertSymptomRef.current = p.symptom;
                        reportCVDetection(
                          camera.id,
                          p.symptom,
                          `Status: Emergency Alert (${p.symptom})`,
                          'YOLO11-Pose Multi-Person Model',
                          p.symptom
                        );
                      }
                    }

                  });
                  toast.success(`AI Tester [${name}]: ${res.people_count} orang terdeteksi (${res.infer_ms}ms)!`, { icon: '🎯' });
                }
              })
              .catch(console.error);
          };
          reader.readAsDataURL(blob);
        });
    };
    setTesterMedia({ type: 'image', name, url });
    setIsWebcamActive(false);
  };

  const handleResetTester = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (testerMedia?.url && testerMedia.url.startsWith('blob:')) {
      URL.revokeObjectURL(testerMedia.url);
    }
    setTesterMedia(null);
    testerImageRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    trackedPersonsRef.current.clear();
    setBackendInferStats(null);
    setIsWebcamActive(false);
    setActiveDetectionStatus('Standby');
    toast('Mode tester ditutup. Kembali ke status CCTV normal.');
  };

  return (
    <div className="relative w-full aspect-[4/3] bg-slate-950 overflow-hidden rounded-t-md group select-none">
      {/* Hidden real video element for MediaStream capture */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Hidden file input for Photo/Video tester */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        width={480}
        height={360}
        className="w-full h-full object-cover block"
      />

      {/* Top right Live indicator */}
      <div className="absolute top-1.5 right-2 flex items-center gap-1.5 z-10 pointer-events-none">
        {backendInferStats && (
          <span className="bg-slate-900/80 text-cyan-400 font-mono text-[8px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5 text-cyan-400" />
            <span>YOLO {backendInferStats.fps} FPS</span>
          </span>
        )}
        <span
          className={`w-2 h-2 rounded-full ${
            isWebcamActive || testerMedia ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
          }`}
        ></span>
        <span
          className={`text-[9px] font-mono font-bold tracking-wider ${
            isWebcamActive || testerMedia ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {testerMedia ? 'TESTER ACTIVE' : isWebcamActive ? 'LIVE WEBCAM CV' : 'OFFLINE'}
        </span>
      </div>

      {/* Active Tester Banner */}
      {testerMedia && (
        <div className="absolute top-7 left-2 right-2 bg-cyan-950/95 text-cyan-200 text-[10px] p-2 rounded-lg border border-cyan-500/60 flex items-center justify-between z-30 shadow-lg">
          <div className="flex items-center gap-1.5 truncate">
            <span className="bg-cyan-600 text-white font-bold text-[8px] px-1.5 py-0.5 rounded uppercase">
              {testerMedia.type === 'video' ? 'Video Tester' : 'Foto Tester'}
            </span>
            <span className="truncate max-w-[200px] font-medium">{testerMedia.name}</span>
          </div>
          <button
            onClick={handleResetTester}
            className="bg-red-700 hover:bg-red-600 text-white font-bold text-[9px] px-2 py-0.5 rounded transition shadow-2xs flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>
      )}

      {/* Action Controls Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-2 left-2 right-2 z-20 flex flex-wrap items-center justify-between gap-1.5 pointer-events-auto"
      >
        <div className="flex items-center gap-1 flex-wrap">
          {/* Main Toggle Button */}
          <button
            onClick={toggleWebcam}
            title={isWebcamActive ? 'Matikan Kamera' : 'Nyalakan Kamera untuk Deteksi Real-Time'}
            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition shadow ${
              isWebcamActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-cyan-700 hover:bg-cyan-600 text-white border border-cyan-500/50'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-white" />
            <span>{isWebcamActive ? 'Matikan' : 'Kamera Real-Time'}</span>
          </button>

          {/* Upload Foto/Video Tester Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            title="Upload Foto atau Video untuk Uji Coba Deteksi Pose"
            className="flex items-center gap-1 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Upload className="w-3 h-3 text-cyan-400" />
            <span>Upload File</span>
          </button>

          {/* Preset Sample Photo Buttons */}
          <button
            onClick={() => handlePresetSample('/samples/test_crowd.jpg', 'Sampel 4 Orang')}
            title="Uji Langsung dengan Foto Sampel (4 Orang)"
            className="flex items-center gap-1 bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Users className="w-3 h-3 text-cyan-400" />
            <span>4 Org</span>
          </button>

          <button
            onClick={() => handlePresetSample('/samples/sample_fall.jpg', 'Dataset Fall')}
            title="Uji Langsung dengan Sampel Dataset Fall (Jatuh)"
            className="flex items-center gap-1 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/80 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span>Fall</span>
          </button>

          <button
            onClick={() => handlePresetSample('/samples/sample_faint.jpg', 'Dataset Faint')}
            title="Uji Langsung dengan Sampel Dataset Faint (Pingsan)"
            className="flex items-center gap-1 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/80 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Activity className="w-3 h-3 text-amber-400" />
            <span>Faint</span>
          </button>

          <button
            onClick={() => handlePresetSample('/samples/sample_pain.jpg', 'Dataset Pain')}
            title="Uji Langsung dengan Sampel Dataset Pain (Nyeri Dada Akut)"
            className="flex items-center gap-1 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/80 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Heart className="w-3 h-3 text-rose-400" />
            <span>Pain</span>
          </button>

          <button
            onClick={() => handlePresetSample('/samples/sample_seizure.jpg', 'Dataset Seizure')}
            title="Uji Langsung dengan Sampel Dataset Seizure (Kejang Epilepsi)"
            className="flex items-center gap-1 bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/80 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Zap className="w-3 h-3 text-purple-400" />
            <span>Seizure</span>
          </button>

          <button
            onClick={() => handlePresetSample('/samples/sample_stroke.jpg', 'Dataset Stroke')}
            title="Uji Langsung dengan Sampel Dataset Stroke (Kelumpuhan Asimetris)"
            className="flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-700/80 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Brain className="w-3 h-3 text-cyan-400" />
            <span>Stroke</span>
          </button>

          {/* Tester AI Studio Modal Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openMediaTesterModal();
            }}
            title="Buka AI Media Tester Studio"
            className="flex items-center gap-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/70 text-[10px] font-bold px-2 py-1.5 rounded-md transition cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Tester AI</span>
          </button>

          {/* Device Selector Dropdown (Pilih Kamera) */}
          <div
            className="relative flex items-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <select
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              title="Pilih Perangkat Kamera (Webcam / USB Cam)"
              className="bg-slate-900/90 text-slate-200 text-[10px] font-bold px-2 py-1.5 rounded-md border border-slate-700 hover:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition max-w-[110px] truncate cursor-pointer"
            >
              <option value="">Pilih Kamera...</option>
              {availableDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(isWebcamActive || testerMedia) && (
          <span
            className={`text-[9px] font-mono font-bold px-2 py-1 rounded border shrink-0 ${
              activeDetectionStatus.includes('Fall') || activeDetectionStatus.includes('Chest') || activeDetectionStatus.includes('Faint')
                ? 'bg-red-950/90 text-red-300 border-red-500 animate-pulse'
                : 'bg-black/60 text-emerald-400 border-emerald-500/40'
            }`}
          >
            {activeDetectionStatus}
          </span>
        )}
      </div>

      {webcamError && (
        <div className="absolute top-8 left-2 right-2 bg-red-950/90 text-red-200 text-[10px] p-2 rounded border border-red-700 flex items-center gap-1.5 z-20">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
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

function drawPersonDetectionBox(ctx: CanvasRenderingContext2D, person: TrackedPerson, tick: number) {
  const { x, y, w, h, label, confidence, isAlert, status, keypoints } = person;
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
    // Head / Face (Magenta / Pink)
    { pair: [0, 1], color: '#ec4899' },
    { pair: [0, 2], color: '#d946ef' },
    { pair: [1, 3], color: '#ec4899' },
    { pair: [2, 4], color: '#d946ef' },
    // Shoulders (Bright Lime / Emerald Green)
    { pair: [5, 6], color: '#10b981' },
    // Left Arm (Orange / Amber)
    { pair: [5, 7], color: '#f97316' },
    { pair: [7, 9], color: '#fbbf24' },
    // Right Arm (Cyan / Electric Sky Blue)
    { pair: [6, 8], color: '#06b6d4' },
    { pair: [8, 10], color: '#38bdf8' },
    // Torso / Hips (Emerald Green)
    { pair: [5, 11], color: '#10b981' },
    { pair: [6, 12], color: '#10b981' },
    { pair: [11, 12], color: '#10b981' },
    // Left Leg (Vibrant Orange / Amber)
    { pair: [11, 13], color: '#ea580c' },
    { pair: [13, 15], color: '#f59e0b' },
    // Right Leg (Electric Blue / Azure)
    { pair: [12, 14], color: '#0284c7' },
    { pair: [14, 16], color: '#0ea5e9' },
  ];

  const KPT_COLORS = [
    '#ec4899', // 0: nose
    '#ec4899', '#d946ef', // 1: l_eye, 2: r_eye
    '#ec4899', '#d946ef', // 3: l_ear, 4: r_ear
    '#10b981', '#10b981', // 5: l_sho, 6: r_sho
    '#f97316', '#06b6d4', // 7: l_elb, 8: r_elb
    '#fbbf24', '#38bdf8', // 9: l_wri, 10: r_wri
    '#10b981', '#10b981', // 11: l_hip, 12: r_hip
    '#ea580c', '#0284c7', // 13: l_kne, 14: r_kne
    '#f59e0b', '#0ea5e9', // 15: l_ank, 16: r_ank
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

    // Render Two-Tier Joint Dots (Outer color + White core)
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
  ctx.fillRect(x, Math.max(y - pillH, 22), pillW, pillH);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(headerText, x + 5, Math.max(y - 4, 34));

  ctx.restore();
}

// ==========================================
// CAMERA UNAVAILABLE SCREEN (AUTHENTIC CCTV)
// ==========================================

function drawCameraUnavailableScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: CameraFeed,
  tick: number
) {
  // Dark Surveillance Monitor Background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, w, h);

  // Digital Grid Lines
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
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

  // Center CCTV "CAMERA UNAVAILABLE" Warning Box
  const boxW = Math.min(w * 0.75, 300);
  const boxH = 120;
  const boxX = (w - boxW) / 2;
  const boxY = (h - boxH) / 2;

  // Backdrop
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Corner Accents on Warning Box
  ctx.strokeStyle = '#ef4444';
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

  // Pulsing Amber / Red Indicator Dot
  const isBlink = Math.floor(tick / 25) % 2 === 0;
  ctx.fillStyle = isBlink ? '#ef4444' : '#7f1d1d';
  ctx.beginPath();
  ctx.arc(iconX - 60, iconY - 4, 4, 0, Math.PI * 2);
  ctx.fill();

  // Main Header Text
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAMERA UNAVAILABLE', iconX, iconY);

  // Subtitle Diagnostic
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px monospace';
  ctx.fillText('NO RTSP VIDEO SIGNAL DETECTED', iconX, iconY + 18);

  // Diagnostic Info
  ctx.fillStyle = '#64748b';
  ctx.font = '8px monospace';
  ctx.fillText(`CHANNEL: ${camera.id} • RTSP STREAM TIMEOUT`, iconX, iconY + 34);

  // Call-to-action note
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Pilih Kamera atau Klik "Nyalakan Kamera"', iconX, iconY + 54);

  ctx.textAlign = 'left';
}

function drawSignalBars(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#22c55e') {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 6, 2.5, 4);
  ctx.fillRect(x + 4, y + 4, 2.5, 6);
  ctx.fillRect(x + 8, y + 2, 2.5, 8);
  ctx.fillRect(x + 12, y, 2.5, 10);
}
