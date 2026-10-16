'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, ShieldAlert, Activity, Eye } from 'lucide-react';
import { Header } from '../../../components/dashboard/Header';
import { Footer } from '../../../components/dashboard/Footer';
import { CCTVFeedCanvas } from '../../../components/camera/CCTVFeedCanvas';
import { useAppStore } from '../../../lib/store';
import { AlertTeamModal } from '../../../components/modals/AlertTeamModal';
import { DispatchModal } from '../../../components/modals/DispatchModal';
import { AddCameraModal } from '../../../components/modals/AddCameraModal';
import { MediaTesterModal } from '../../../components/modals/MediaTesterModal';
import { Toaster } from 'react-hot-toast';

export default function CameraDetailPage() {
  const params = useParams();
  const { cameras, fetchCameras, openDispatchModal, initRealtime, initAuth } = useAppStore();
 
  const numericId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const camera = cameras.find((c) => c.numericId === numericId) || cameras[0];

  useEffect(() => {
    initAuth();
    initRealtime();
    if (cameras.length === 0) {
      fetchCameras();
    }
  }, [cameras.length, fetchCameras, initRealtime, initAuth]);

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
      <Toaster position="top-right" />

      {/* Full-Width Enterprise Header */}
      <Header />

      {/* Main Content Area - Constrained to a balanced, professional size */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col justify-center">
        {/* Main Card Container */}
        <div
          className={`bg-white rounded-2xl shadow-md p-4 sm:p-5 transition flex flex-col justify-between ${
            camera.hasAlert
              ? 'border-2 border-[#b91c1c] shadow-red-100'
              : 'border border-slate-200'
          }`}
        >
          {/* Top Sub-bar: Back Button, Camera ID & Name, Status Pill */}
          <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
            {/* Back button */}
            <Link
              href="/"
              className="flex items-center gap-1.5 bg-[#0369a1] hover:bg-[#0284c7] text-white text-xs font-bold px-3 py-1.5 rounded-md transition shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali</span>
            </Link>

            {/* Camera Tag & Title */}
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded tracking-wide ${
                  camera.hasAlert
                    ? 'bg-[#b91c1c] text-white'
                    : camera.badgeType === 'blue'
                    ? 'bg-sky-100 text-[#0284c7]'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {camera.id}
              </span>
              <span
                className={`font-bold text-xs sm:text-sm ${
                  camera.hasAlert ? 'text-[#b91c1c]' : 'text-slate-800'
                }`}
              >
                {camera.name}
              </span>
            </div>

            {/* Status Badge */}
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                camera.badgeType === 'red'
                  ? 'bg-[#b91c1c] text-white'
                  : camera.badgeType === 'blue'
                  ? 'bg-[#e0f2fe] text-[#0369a1]'
                  : 'bg-[#dcfce7] text-[#15803d]'
              }`}
            >
              {camera.badgeText}
            </span>
          </div>

          {/* Video Player - Constrained to max-w-2xl or max-h-[460px] so it is never oversized */}
          <div className="relative w-full max-w-[700px] mx-auto rounded-xl overflow-hidden border border-slate-900 bg-slate-950 shadow-inner">
            <CCTVFeedCanvas camera={camera} isDetailedView={true} />
          </div>

          {/* Under Video Status & Telemetry Strip */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
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
            </div>

            {/* Action button (Dispatch or Wheelchair) */}
            <div className="flex items-center gap-2">
              {camera.hasAlert ? (
                <button
                  onClick={handleActionClick}
                  className="bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold px-4 py-1.5 rounded-md transition shadow-sm active:scale-95"
                >
                  Dispatch Tim Medis
                </button>
              ) : camera.actionType === 'wheelchair' ? (
                <button
                  onClick={handleActionClick}
                  className="bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold px-4 py-1.5 rounded-md transition shadow-sm active:scale-95"
                >
                  Bantuan Kursi Roda
                </button>
              ) : null}

              <Link
                href={`/history/${camera.numericId}`}
                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-md transition"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Riwayat Insiden</span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Full-Width Footer */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-6">
        <Footer />
      </div>

      <DispatchModal />
      <AlertTeamModal />
      <AddCameraModal />
      <MediaTesterModal />
    </div>
  );
}
