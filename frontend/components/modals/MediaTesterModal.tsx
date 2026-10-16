'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Image as ImageIcon, Video, Play, Pause, CheckCircle, Cpu, Users, AlertTriangle, Activity, Heart, Zap, Brain } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

interface DetectedPerson {
  track_id: number;
  confidence: number;
  bbox: [number, number, number, number];
  posture?: string;
  symptom?: string;
  keypoints?: [number, number, number][];
}

interface TestResult {
  success: boolean;
  people_count: number;
  infer_ms: number;
  fps: number;
  model: string;
  persons: DetectedPerson[];
  annotated_image?: string;
}

export const MediaTesterModal: React.FC = () => {
  const { isMediaTesterModalOpen, closeMediaTesterModal, socket, triggerEmergencyAlert } = useAppStore();

  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageResult, setImageResult] = useState<TestResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  // Video streaming state
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [videoStats, setVideoStats] = useState<{ fps: number; ms: number; peopleCount: number } | null>(null);
  const [videoPersons, setVideoPersons] = useState<DetectedPerson[]>([]);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isStreamingVideoRef = useRef<boolean>(false);
  const lastVideoFrameTimeRef = useRef<number>(0);
  const lastTesterAlertTimeRef = useRef<number>(0);

  // Clean up video url on unmount or file change
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Video processing socket listener
  useEffect(() => {
    if (!socket) return;

    const handleCVResults = (data: { camera_id: string; people_count: number; infer_ms: number; fps: number; persons: DetectedPerson[] }) => {
      if (data.camera_id !== 'TESTER_MODAL_VIDEO') return;
      isStreamingVideoRef.current = false;
      setVideoStats({ fps: data.fps, ms: data.infer_ms, peopleCount: data.people_count });
      setVideoPersons(data.persons || []);

      const alertPerson = data.persons?.find((p) => Boolean(p.symptom));
      if (alertPerson && alertPerson.symptom && Date.now() - lastTesterAlertTimeRef.current > 4000) {
        lastTesterAlertTimeRef.current = Date.now();
        triggerEmergencyAlert('CAM 01', alertPerson.symptom, 'Tester AI (Video)');
      }
    };

    socket.on('cv_results', handleCVResults);
    return () => {
      socket.off('cv_results', handleCVResults);
    };
  }, [socket]);

  // Video render animation loop
  useEffect(() => {
    if (activeTab !== 'video' || !isVideoPlaying) return;

    let animId: number;
    const canvas = videoCanvasRef.current;
    const video = videoPlayerRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const downCanvas = document.createElement('canvas');
    downCanvas.width = 320;
    downCanvas.height = 240;
    const downCtx = downCanvas.getContext('2d', { willReadFrequently: true });

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

    const loop = () => {
      if (video.readyState >= 2) {
        const w = canvas.width;
        const h = canvas.height;
        ctx.drawImage(video, 0, 0, w, h);

        const now = Date.now();
        // Watchdog: unlock if frame took longer than 2000ms
        if (isStreamingVideoRef.current && now - lastVideoFrameTimeRef.current > 2000) {
          isStreamingVideoRef.current = false;
        }

        if (downCtx && !isStreamingVideoRef.current && now - lastVideoFrameTimeRef.current > 80) {
          downCtx.drawImage(video, 0, 0, 320, 240);
          const b64 = downCanvas.toDataURL('image/jpeg', 0.60);
          isStreamingVideoRef.current = true;
          lastVideoFrameTimeRef.current = now;

          if (socket && socket.connected) {
            socket.emit('cv_frame', { camera_id: 'TESTER_MODAL_VIDEO', image: b64 });
          } else {
            // HTTP POST fallback
            fetch('http://localhost:5000/api/cv/test-base64', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: b64, camera_id: 'TESTER_MODAL_VIDEO' })
            })
              .then((r) => r.json())
              .then((data) => {
                isStreamingVideoRef.current = false;
                if (data.success) {
                  setVideoStats({ fps: data.fps || 16, ms: data.infer_ms, peopleCount: data.people_count });
                  setVideoPersons(data.persons || []);
                  const alertPerson = (data.persons as DetectedPerson[])?.find((p) => Boolean(p.symptom));
                  if (alertPerson && alertPerson.symptom && now - lastTesterAlertTimeRef.current > 4000) {
                    lastTesterAlertTimeRef.current = now;
                    triggerEmergencyAlert('CAM 01', alertPerson.symptom, 'Tester AI (Video)');
                  }
                }
              })
              .catch(() => {
                isStreamingVideoRef.current = false;
              });
          }
        }

        // Draw YOLO boxes & skeletons
        const scaleX = w / 320;
        const scaleY = h / 240;

        videoPersons.forEach((p) => {
          const bx1 = p.bbox[0] * scaleX;
          const by1 = p.bbox[1] * scaleY;
          const bx2 = p.bbox[2] * scaleX;
          const by2 = p.bbox[3] * scaleY;
          const bw = bx2 - bx1;
          const bh = by2 - by1;
          const isAlert = Boolean(p.symptom);
          const color = isAlert ? '#ef4444' : '#22c55e';

          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(bx1, by1, bw, bh);

          // Draw skeleton with official YOLO palette
          if (p.keypoints && p.keypoints.length === 17) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 2.4;

            SKELETON_LIMBS.forEach(({ pair: [k1, k2], color: limbCol }) => {
              const ka = p.keypoints![k1];
              const kb = p.keypoints![k2];
              if (ka && kb && ka[2] > 0.35 && kb[2] > 0.35) {
                ctx.strokeStyle = isAlert ? 'rgba(239, 68, 68, 0.9)' : limbCol;
                ctx.beginPath();
                ctx.moveTo(ka[0] * scaleX, ka[1] * scaleY);
                ctx.lineTo(kb[0] * scaleX, kb[1] * scaleY);
                ctx.stroke();
              }
            });

            p.keypoints.forEach(([kx, ky, kc], idx) => {
              if (kc > 0.35) {
                const dotCol = isAlert ? '#ef4444' : (KPT_COLORS[idx] || '#facc15');
                ctx.beginPath();
                ctx.arc(kx * scaleX, ky * scaleY, 3.2, 0, Math.PI * 2);
                ctx.fillStyle = dotCol;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(kx * scaleX, ky * scaleY, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
              }
            });
          }

          // Label
          const lbl = `ID #${p.track_id} (${Math.round(p.confidence * 100)}%) ${p.symptom || p.posture || ''}`;
          ctx.fillStyle = isAlert ? '#dc2626' : '#16a34a';
          ctx.fillRect(bx1, Math.max(0, by1 - 18), Math.max(bw, 120), 18);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(lbl, bx1 + 4, Math.max(12, by1 - 5));
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [activeTab, isVideoPlaying, socket, videoPersons]);

  if (!isMediaTesterModalOpen) return null;

  // Handle image upload and analyze
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsProcessing(true);
    setImageResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch('http://localhost:5000/api/cv/test-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data, camera_id: 'TEST_UPLOAD' })
        });

        if (!res.ok) throw new Error('Inference server error');
        const data: TestResult = await res.json();
        setImageResult(data);
        const alertPerson = data.persons?.find((p) => Boolean(p.symptom));
        if (alertPerson && alertPerson.symptom) {
          triggerEmergencyAlert('CAM 01', alertPerson.symptom, 'Tester AI (Foto)');
          toast.error(`🚨 DETEKSI KEDARURATAN AI: ${alertPerson.symptom.toUpperCase()}!`, { duration: 6000 });
        } else {
          toast.success(`Berhasil mendeteksi ${data.people_count} orang dalam ${data.infer_ms}ms!`, { icon: '🎯' });
        }
      } catch (err) {
        console.error(err);
        toast.error('Gagal memproses gambar pada model YOLO backend.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Preset sample tests (Fall, Faint, Crowd)
  const handleUsePresetImage = async (url: string, label: string) => {
    setSelectedFileName(label);
    setIsProcessing(true);
    setImageResult(null);

    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await fetch('http://localhost:5000/api/cv/test-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data, camera_id: 'PRESET_IMAGE' })
        });
        const data: TestResult = await res.json();
        setImageResult(data);
        const alertPerson = data.persons?.find((p) => Boolean(p.symptom));
        if (alertPerson && alertPerson.symptom) {
          triggerEmergencyAlert('CAM 01', alertPerson.symptom, 'Tester AI (Foto)');
          toast.error(`🚨 DETEKSI KEDARURATAN AI: ${alertPerson.symptom.toUpperCase()}!`, { duration: 6000 });
        } else {
          toast.success(`Foto dianalisis: ${data.people_count} orang terdeteksi (${data.infer_ms}ms)!`, { icon: '🎯' });
        }
        setIsProcessing(false);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat foto sampel.');
      setIsProcessing(false);
    }
  };

  // Video file upload
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setSelectedFileName(file.name);
    setIsVideoPlaying(true);
    isStreamingVideoRef.current = false;
    setVideoStats(null);
    setVideoPersons([]);

    if (videoPlayerRef.current) {
      videoPlayerRef.current.src = url;
      videoPlayerRef.current.loop = true;
      videoPlayerRef.current.muted = true;
      videoPlayerRef.current.onloadeddata = () => {
        videoPlayerRef.current?.play().catch(console.error);
      };
      videoPlayerRef.current.play().catch(console.error);
    }

    toast.success(`Video ${file.name} dimuat. Inferensi real-time dimulai!`, { icon: '🎬' });
  };

  const toggleVideoPlayback = () => {
    if (!videoPlayerRef.current) return;
    if (isVideoPlaying) {
      videoPlayerRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      videoPlayerRef.current.play();
      setIsVideoPlaying(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base tracking-wide flex items-center gap-2">
                <span>AI Media Tester — YOLO11-Pose Engine</span>
                <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/40">
                  COCO-Keypoints Dataset
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Uji langsung model Computer Vision dengan mengunggah foto atau video Anda sendiri
              </p>
            </div>
          </div>
          <button
            onClick={closeMediaTesterModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center border-b border-gray-200 bg-slate-50 px-4 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 border-b-2 transition ${
              activeTab === 'image'
                ? 'border-cyan-600 text-cyan-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-cyan-600" />
            <span>Uji Foto (Image Analysis)</span>
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 border-b-2 transition ${
              activeTab === 'video'
                ? 'border-cyan-600 text-cyan-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Video className="w-4 h-4 text-cyan-600" />
            <span>Uji Video (Live Frame Stream)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* ================= TAB 1: UJI FOTO ================= */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              {/* Controls strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={imageInputRef}
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Foto Baru</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/test_crowd.jpg', 'Sampel COCO (4 Orang)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-3 py-2 rounded-lg border border-slate-300 shadow-2xs transition"
                  >
                    <Users className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Sampel 4 Orang</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/sample_fall.jpg', 'Dataset Fall (Jatuh)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs px-3 py-2 rounded-lg border border-red-200 shadow-2xs transition"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span>Sampel Fall</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/sample_faint.jpg', 'Dataset Faint (Pingsan)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs px-3 py-2 rounded-lg border border-amber-200 shadow-2xs transition"
                  >
                    <Activity className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sampel Faint</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/sample_pain.jpg', 'Dataset Pain (Nyeri Dada)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-3 py-2 rounded-lg border border-rose-200 shadow-2xs transition"
                  >
                    <Heart className="w-3.5 h-3.5 text-rose-600" />
                    <span>Sampel Pain</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/sample_seizure.jpg', 'Dataset Seizure (Kejang)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs px-3 py-2 rounded-lg border border-purple-200 shadow-2xs transition"
                  >
                    <Zap className="w-3.5 h-3.5 text-purple-600" />
                    <span>Sampel Seizure</span>
                  </button>

                  <button
                    onClick={() => handleUsePresetImage('/samples/sample_stroke.jpg', 'Dataset Stroke (Asimetri Facial)')}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-bold text-xs px-3 py-2 rounded-lg border border-cyan-200 shadow-2xs transition"
                  >
                    <Brain className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Sampel Stroke</span>
                  </button>
                </div>

                {selectedFileName && (
                  <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded border border-slate-200 truncate max-w-[260px]">
                    📄 {selectedFileName}
                  </span>
                )}
              </div>

              {/* Loading State */}
              {isProcessing && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-cyan-900">
                  <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-bold text-xs">Menganalisis Pose Manusia via YOLO11-Pose ONNX...</span>
                  <span className="text-[10px] text-cyan-700">Mengevaluasi 17 keypoints anatomi & postur klinis</span>
                </div>
              )}

              {/* Results View */}
              {imageResult && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left: Annotated Image Canvas View */}
                  <div className="lg:col-span-7 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col justify-center items-center relative">
                    {imageResult.annotated_image ? (
                      <img
                        src={imageResult.annotated_image}
                        alt="YOLO Pose Analysis"
                        className="w-full h-auto max-h-[380px] object-contain"
                      />
                    ) : (
                      <div className="p-8 text-slate-400">Gambar tidak dapat ditampilkan</div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-slate-900/90 text-cyan-300 font-mono text-[9px] font-bold px-2 py-0.5 rounded border border-cyan-500/40">
                      ⚡ Inferensi: {imageResult.infer_ms} ms
                    </div>
                  </div>

                  {/* Right: Telemetry & Detections breakdown */}
                  <div className="lg:col-span-5 space-y-3">
                    {/* Metric Cards */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="text-slate-500 text-[10px] font-semibold">Orang Terdeteksi</div>
                        <div className="text-xl font-extrabold text-cyan-700 flex items-center gap-1.5 mt-0.5">
                          <Users className="w-5 h-5 text-cyan-600" />
                          <span>{imageResult.people_count}</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="text-slate-500 text-[10px] font-semibold">Waktu Proses AI</div>
                        <div className="text-xl font-extrabold text-emerald-700 flex items-center gap-1.5 mt-0.5">
                          <Cpu className="w-5 h-5 text-emerald-600" />
                          <span>{imageResult.infer_ms} ms</span>
                        </div>
                      </div>
                    </div>

                    {/* Persons List */}
                    <div className="border border-slate-200 rounded-lg p-3 bg-white">
                      <div className="font-bold text-slate-800 text-xs mb-2 flex items-center justify-between">
                        <span>Daftar Orang Terdeteksi ({imageResult.persons.length})</span>
                        <span className="text-[10px] text-slate-500 font-normal">YOLO-Pose Landmarks</span>
                      </div>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {imageResult.persons.map((p, idx) => (
                          <div
                            key={p.track_id || idx}
                            className={`p-2 rounded-md border text-[11px] flex items-center justify-between ${
                              p.symptom
                                ? 'bg-red-50 border-red-300 text-red-900'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-300 text-slate-700 text-[10px]">
                                #{p.track_id}
                              </span>
                              <div>
                                <div className="font-bold">
                                  {p.symptom ? `🚨 ${p.symptom}` : p.posture || 'Person Normal'}
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono">
                                  BBox: [{p.bbox.map((v) => Math.round(v)).join(', ')}]
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {Math.round(p.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!imageResult && !isProcessing && (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-cyan-500 rounded-2xl p-10 flex flex-col items-center justify-center gap-2 cursor-pointer transition bg-slate-50/50 hover:bg-cyan-50/30 text-slate-600"
                >
                  <Upload className="w-8 h-8 text-cyan-600 animate-bounce" />
                  <span className="font-bold text-sm text-slate-800">Klik untuk Mengunggah Foto Pengujian</span>
                  <span className="text-xs text-slate-500">Mendukung file JPG, PNG, atau WebP</span>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleUsePresetImage('/samples/test_crowd.jpg', 'Sampel COCO (4 Orang)')}
                      className="bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Sampel (4 Orang)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUsePresetImage('/samples/sample_fall.jpg', 'Dataset Fall (Jatuh)')}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Sampel Fall</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUsePresetImage('/samples/sample_faint.jpg', 'Dataset Faint (Pingsan)')}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      <span>Sampel Faint</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: UJI VIDEO ================= */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              {/* Controls strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={videoInputRef}
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Video File (MP4/WebM)</span>
                  </button>

                  {videoUrl && (
                    <button
                      onClick={toggleVideoPlayback}
                      className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs px-3 py-2 rounded-lg border border-slate-300 shadow-2xs transition"
                    >
                      {isVideoPlaying ? <Pause className="w-3.5 h-3.5 text-amber-600" /> : <Play className="w-3.5 h-3.5 text-emerald-600" />}
                      <span>{isVideoPlaying ? 'Jeda Video' : 'Putar Video'}</span>
                    </button>
                  )}
                </div>

                {selectedFileName && (
                  <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded border border-slate-200 truncate max-w-[260px]">
                    🎬 {selectedFileName}
                  </span>
                )}
              </div>

              {/* Active HTML5 Video element */}
              <video ref={videoPlayerRef} className="absolute opacity-0 pointer-events-none w-1 h-1" playsInline muted autoPlay />

              {/* Video Player Canvas View */}
              {videoUrl ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-8 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative aspect-[4/3]">
                    <canvas
                      ref={videoCanvasRef}
                      width={480}
                      height={360}
                      className="w-full h-full object-cover block"
                    />

                    {/* Telemetry pill overlay */}
                    <div className="absolute top-2 right-2 flex items-center gap-2 bg-slate-900/90 px-2 py-1 rounded border border-cyan-500/30 text-cyan-300 font-mono text-[9px] font-bold">
                      <Cpu className="w-3 h-3 text-cyan-400" />
                      <span>YOLO: {videoStats ? `${videoStats.fps} FPS (${videoStats.ms}ms)` : 'Inferencing...'}</span>
                    </div>

                    <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white font-mono text-[9px] px-2 py-0.5 rounded">
                      STREAM: {videoStats ? `${videoStats.peopleCount} ORANG TERDETEKSI` : 'MEMPROSES...'}
                    </div>
                  </div>

                  {/* Video Live Analysis Panel */}
                  <div className="lg:col-span-4 space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="font-bold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Real-Time Multi-Person Tracking</span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Setiap frame video di-stream langsung ke backend Python YOLO11-Pose via WebSocket untuk deteksi orang & 17 titik sendi tubuh.
                      </p>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-3 bg-white">
                      <div className="font-bold text-slate-800 text-xs mb-2">Live Persons ({videoPersons.length})</div>
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                        {videoPersons.length === 0 ? (
                          <div className="text-slate-400 text-[11px] italic py-3 text-center">
                            Menunggu deteksi orang di video...
                          </div>
                        ) : (
                          videoPersons.map((p, idx) => (
                            <div
                              key={p.track_id || idx}
                              className={`p-1.5 rounded border text-[11px] flex items-center justify-between ${
                                p.symptom ? 'bg-red-50 border-red-300 text-red-800' : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <span className="font-bold font-mono text-[10px]">PERSON #{p.track_id}</span>
                              <span className="text-[10px] font-semibold text-slate-600">
                                {p.symptom ? `🚨 ${p.symptom}` : p.posture || 'Normal'}
                              </span>
                              <span className="text-[10px] font-mono text-emerald-600">
                                {Math.round(p.confidence * 100)}%
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-cyan-500 rounded-2xl p-12 flex flex-col items-center justify-center gap-2 cursor-pointer transition bg-slate-50/50 hover:bg-cyan-50/30 text-slate-600"
                >
                  <Video className="w-10 h-10 text-cyan-600 animate-pulse" />
                  <span className="font-bold text-sm text-slate-800">Klik untuk Mengunggah File Video Pengujian</span>
                  <span className="text-xs text-slate-500">Mendukung format MP4, WebM, MOV dari HP atau rekaman CCTV</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-gray-200 flex items-center justify-between text-slate-500 text-[11px]">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Dataset Resmi COCO-Keypoints (200k+ citra pelatihan)</span>
          </span>
          <button
            onClick={closeMediaTesterModal}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1.5 rounded-lg transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
