'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Activity,
  Eye,
  Camera,
  CameraOff,
  Video,
  Maximize2,
  Minimize2,
  Cpu,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  FlipHorizontal
} from 'lucide-react';
import { Header } from '../../../components/dashboard/Header';
import { Footer } from '../../../components/dashboard/Footer';
import { CCTVFeedCanvas, VideoDevice } from '../../../components/camera/CCTVFeedCanvas';
import { useAppStore } from '../../../lib/store';
import { AlertTeamModal } from '../../../components/modals/AlertTeamModal';
import { DispatchModal } from '../../../components/modals/DispatchModal';
import { AddCameraModal } from '../../../components/modals/AddCameraModal';
import { MediaTesterModal } from '../../../components/modals/MediaTesterModal';
import { Toaster } from 'react-hot-toast';

export default function CameraDetailPage() {
  const params = useParams();
  const {
    cameras,
    fetchCameras,
    openDispatchModal,
    initRealtime,
    initAuth,
    currentUser,
    activeWebcamCameraId,
    activeWebcamDeviceId,
    setActiveWebcam,
    isCameraMirrored,
    toggleCameraMirror
  } = useAppStore();

  const isAdmin = currentUser?.role === 'admin';

  const numericId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const camera = cameras.find((c) => c.numericId === numericId) || cameras[0];

  const isWebcamActive = Boolean(camera && activeWebcamCameraId === camera.id);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(activeWebcamDeviceId || '');
  const [availableDevices, setAvailableDevices] = useState<VideoDevice[]>([]);
  const [inferStats, setInferStats] = useState<{ fps: number; ms: number } | null>(null);
  const [activeDetectionStatus, setActiveDetectionStatus] = useState<string>('Standby');

  // Stable memoized callbacks
  const handleDevicesDiscovered = React.useCallback((devices: VideoDevice[]) => {
    setAvailableDevices(devices);
    setSelectedDeviceId((prev) => {
      if (prev && devices.some((d) => d.deviceId === prev)) return prev;
      return devices.length > 0 ? devices[0].deviceId : '';
    });
  }, []);

  const handleToggleWebcam = React.useCallback(() => {
    if (!camera) return;
    if (isWebcamActive) {
      setActiveWebcam(null);
    } else {
      setActiveWebcam(camera.id, selectedDeviceId);
    }
  }, [isWebcamActive, camera, selectedDeviceId, setActiveWebcam]);

  const handleSelectDevice = React.useCallback((id: string) => {
    setSelectedDeviceId(id);
    if (camera && isWebcamActive) {
      setActiveWebcam(camera.id, id);
    }
  }, [isWebcamActive, camera, setActiveWebcam]);

  const handleStatsChange = React.useCallback((stats: { fps: number; ms: number } | null) => {
    setInferStats(stats);
  }, []);

  const handleStatusChange = React.useCallback((status: string) => {
    setActiveDetectionStatus((prev) => (prev !== status ? status : prev));
  }, []);

  // Fullscreen support
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    initAuth();
    initRealtime();
    if (cameras.length === 0) {
      fetchCameras();
    }
  }, [cameras.length, fetchCameras, initRealtime, initAuth]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (fullscreenContainerRef.current) {
          await fullscreenContainerRef.current.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

  const handleActionClick = () => {
    if (camera) {
      openDispatchModal(camera);
    }
  };

  if (!camera) {
    return (
      <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-bold text-slate-600">Memuat data kamera...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-100/90 text-slate-900 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      <Toaster position="top-right" containerStyle={{ top: 80, right: 24 }} />

      {/* Full-Width Enterprise Header */}
      <Header />

      {/* Main Content Area - Expanded to max-w-6xl for high-definition 16:9 surveillance viewing */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col">
        {/* Main Workstation Container */}
        <div
          className={`bg-white rounded-2xl shadow-sm p-4 sm:p-6 transition flex flex-col gap-4 ${
            camera.hasAlert
              ? 'border-2 border-[#b91c1c] shadow-red-100'
              : 'border border-slate-200'
          }`}
        >
          {/* Top Bar: Back navigation, Camera Title & Status Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            {/* Back button */}
            <Link
              href="/"
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-2xs border border-slate-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dashboard</span>
            </Link>

            {/* Camera Tag & Title */}
            <div className="flex items-center gap-2.5">
              <span
                className={`text-xs font-extrabold px-2.5 py-1 rounded tracking-wide ${
                  camera.hasAlert
                    ? 'bg-[#b91c1c] text-white'
                    : camera.badgeType === 'blue'
                    ? 'bg-sky-100 text-[#0284c7]'
                    : 'bg-slate-800 text-white'
                }`}
              >
                {camera.id}
              </span>
              <div>
                <h1 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                  {camera.name}
                </h1>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {camera.location} • Hospital Network
                </span>
              </div>
            </div>

            {/* Status Pill & 16:9 Indicator (16:9 for Admin only) */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  <Monitor className="w-3 h-3 text-slate-500" />
                  16:9 HD Ratio
                </span>
              )}
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${
                  camera.badgeType === 'red'
                    ? 'bg-[#b91c1c] text-white animate-pulse'
                    : camera.badgeType === 'blue'
                    ? 'bg-[#e0f2fe] text-[#0369a1]'
                    : 'bg-[#dcfce7] text-[#15803d]'
                }`}
              >
                {camera.badgeText}
              </span>
            </div>
          </div>

          {/* 16:9 Large Video Player with HTML5 Fullscreen Support */}
          <div
            ref={fullscreenContainerRef}
            className={`relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-900 shadow-2xl transition-all ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none w-screen h-screen' : ''
            }`}
          >
            <CCTVFeedCanvas
              camera={camera}
              isDetailedView={true}
              isWebcamActive={isWebcamActive}
              onToggleWebcam={handleToggleWebcam}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={handleSelectDevice}
              onDevicesDiscovered={handleDevicesDiscovered}
              onStatsChange={handleStatsChange}
              onStatusChange={handleStatusChange}
            />

            {/* Fullscreen Exit Floating Button */}
            {isFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 z-50 bg-slate-900/90 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-lg border border-slate-700/80 flex items-center gap-2 shadow-2xl backdrop-blur transition cursor-pointer"
                title="Keluar dari Layar Penuh"
              >
                <Minimize2 className="w-4 h-4 text-cyan-400" />
                <span>Keluar Layar Penuh (ESC)</span>
              </button>
            )}
          </div>

          {/* Dedicated Workstation Control Toolbar (Outside & Below Video Frame) */}
          <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            {/* Left Hardware Controls: Webcam Toggle, Camera Select, Fullscreen */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Live Camera */}
              <button
                onClick={handleToggleWebcam}
                className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-xs active:scale-95 ${
                  isWebcamActive
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                    : 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-sky-500/20'
                }`}
                title={isWebcamActive ? 'Matikan Kamera' : 'Nyalakan Kamera untuk Deteksi Real-Time'}
              >
                {isWebcamActive ? (
                  <>
                    <CameraOff className="w-4 h-4" />
                    <span>Matikan Kamera</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Nyalakan Kamera</span>
                  </>
                )}
              </button>

              {/* Camera Selection Dropdown */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
                <Video className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    handleSelectDevice(e.target.value);
                    if (!isWebcamActive && camera) {
                      setActiveWebcam(camera.id, e.target.value);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer max-w-[190px] sm:max-w-[260px] truncate"
                  title="Pilih Perangkat Input Kamera (Webcam / USB Cam)"
                >
                  <option value="">Pilih Kamera...</option>
                  {availableDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Camera Mirror / Unmirror Toggle (Admin only) */}
              {isAdmin && (
                <button
                  onClick={toggleCameraMirror}
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 transition shadow-2xs active:scale-95 cursor-pointer"
                  title="Ubah Orientasi Kamera (Mirror / Tidak Mirror)"
                >
                  <FlipHorizontal className="w-4 h-4 text-slate-600" />
                  <span>{isCameraMirrored ? 'Tidak Mirror' : 'Mirror Aktif'}</span>
                </button>
              )}

              {/* Fullscreen Video Button */}
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-xs active:scale-95 cursor-pointer"
                title="Buka Video Layar Penuh"
              >
                <Maximize2 className="w-4 h-4 text-sky-400" />
                <span>Layar Penuh</span>
              </button>
            </div>

            {/* Right Telemetry: FPS, Model, Status Pill */}
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && isWebcamActive && inferStats && (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-700">
                  <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                  <span>YOLO11:</span>
                  <strong className="text-cyan-700">{inferStats.fps} FPS</strong>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">{inferStats.ms}ms</span>
                </div>
              )}

              <span
                className={`text-xs font-bold font-mono px-3 py-1 rounded-lg border ${
                  activeDetectionStatus.includes('Fall') ||
                  activeDetectionStatus.includes('Chest') ||
                  activeDetectionStatus.includes('Faint') ||
                  activeDetectionStatus.includes('Seizure') ||
                  activeDetectionStatus.includes('Stroke')
                    ? 'bg-red-50 text-red-700 border-red-300 animate-pulse'
                    : isWebcamActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {activeDetectionStatus}
              </span>
            </div>
          </div>

          {/* Under Video Status & Telemetry Strip */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-bold flex items-center gap-1.5 ${
                  camera.hasAlert ? 'text-[#b91c1c]' : 'text-slate-700'
                }`}
              >
                {camera.hasAlert ? (
                  <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" />
                ) : (
                  <Activity className="w-4 h-4 text-emerald-600" />
                )}
                <span>{camera.statusText}</span>
              </span>

              <span className="text-slate-300">|</span>

              <span className="text-[11px] font-mono text-slate-500">
                LOKASI: <strong className="text-slate-700">{camera.location.toUpperCase()}</strong>
              </span>

              <span className="text-slate-300 hidden sm:inline">|</span>

              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                CHANNEL: <strong className="text-slate-700">{camera.id}</strong>
              </span>
            </div>

            {/* Action Buttons (Dispatch, Wheelchair, Riwayat Insiden) */}
            <div className="flex items-center gap-2">
              {camera.hasAlert ? (
                <button
                  onClick={handleActionClick}
                  className="bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm active:scale-95 flex items-center gap-1.5 animate-bounce"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-white" />
                  <span>Dispatch Tim Medis</span>
                </button>
              ) : camera.actionType === 'wheelchair' ? (
                <button
                  onClick={handleActionClick}
                  className="bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm active:scale-95"
                >
                  Bantuan Kursi Roda
                </button>
              ) : null}

              <Link
                href={`/history/${camera.numericId}`}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg transition border border-slate-200"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Riwayat Insiden</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Technical Diagnostics & Specifications Cards Grid (Admin Only) */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-2">
                <Monitor className="w-4 h-4 text-[#0284c7]" />
                <span>Spesifikasi Tampilan & Rasio</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1.5">
                <li className="flex justify-between">
                  <span>Rasio Tampilan:</span>
                  <strong className="text-slate-800">16:9 (Laptop Standard)</strong>
                </li>
                <li className="flex justify-between">
                  <span>Resolusi Canvas:</span>
                  <strong className="text-slate-800">640 × 360 HD</strong>
                </li>
                <li className="flex justify-between">
                  <span>Dukungan Fullscreen:</span>
                  <strong className="text-emerald-600">Aktif (W3C Standard)</strong>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Model Kecerdasan Buatan</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1.5">
                <li className="flex justify-between">
                  <span>Arsitektur Pose:</span>
                  <strong className="text-slate-800">YOLO11-Pose (17 Joints)</strong>
                </li>
                <li className="flex justify-between">
                  <span>Deteksi Gejala:</span>
                  <strong className="text-slate-800">Fall, Faint, Pain, Seizure, Stroke</strong>
                </li>
                <li className="flex justify-between">
                  <span>Testing Model:</span>
                  <strong className="text-[#0284c7]">Tersedia di Navbar Studio</strong>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs mb-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                <span>Surveillance Telemetry</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1.5">
                <li className="flex justify-between">
                  <span>Sumber Kamera:</span>
                  <strong className="text-slate-800">
                    {isWebcamActive ? 'Live Webcam / USB' : 'Standby Surveillance'}
                  </strong>
                </li>
                <li className="flex justify-between">
                  <span>Protokol Data:</span>
                  <strong className="text-slate-800">WebSocket real-time</strong>
                </li>
                <li className="flex justify-between">
                  <span>Keamanan CCTV:</span>
                  <strong className="text-emerald-600">Enkripsi Internal TLS</strong>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Full-Width Footer */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <Footer />
      </div>

      <DispatchModal />
      <AlertTeamModal />
      <AddCameraModal />
      <MediaTesterModal />
    </div>
  );
}
