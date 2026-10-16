'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CameraFeed } from '../../types';
import { CCTVFeedCanvas } from '../camera/CCTVFeedCanvas';
import { useAppStore } from '../../lib/store';

interface CameraCardProps {
  camera: CameraFeed;
}

export const CameraCard: React.FC<CameraCardProps> = ({ camera }) => {
  const router = useRouter();
  const { openDispatchModal, activeWebcamCameraId, activeWebcamDeviceId } = useAppStore();

  const isThisCameraWebcamActive = activeWebcamCameraId === camera.id;

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      camera.actionType === 'dispatch' ||
      camera.actionLabel === 'Dispatched' ||
      camera.badgeType === 'blue' ||
      camera.hasAlert
    ) {
      openDispatchModal(camera);
    } else if (camera.actionType === 'wheelchair') {
      openDispatchModal(camera);
    } else {
      router.push(`/camera/${camera.numericId}`);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('select') ||
      target.closest('option') ||
      target.closest('.pointer-events-auto')
    ) {
      return;
    }
    router.push(`/camera/${camera.numericId}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-xl overflow-hidden bg-white cursor-pointer transition transform hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between ${
        camera.hasAlert
          ? 'border-2 border-red-500 ring-4 ring-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.45)]'
          : 'border border-gray-200 shadow-2xs'
      }`}
    >
      {/* Top Header */}
      <div className="p-2.5 flex items-center justify-between border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          {/* Camera ID Badge */}
          <span
            className={`text-[11px] font-extrabold px-2 py-0.5 rounded tracking-wide ${
              camera.hasAlert
                ? 'bg-red-600 text-white animate-pulse'
                : isThisCameraWebcamActive
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {camera.id}
          </span>
          <span className="font-bold text-xs text-slate-900 truncate max-w-[130px]">
            {camera.name}
          </span>
        </div>

        {/* Status Badge */}
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full tracking-wide ${
            camera.badgeType === 'red'
              ? 'bg-red-600 text-white animate-pulse'
              : camera.badgeType === 'blue'
              ? 'bg-[#e0f2fe] text-[#0369a1]'
              : 'bg-[#dcfce7] text-[#15803d]'
          }`}
        >
          {camera.badgeText}
        </span>
      </div>

      {/* CCTV Canvas View (16:9 Laptop Ratio with Red Ambient Glow on Alert) */}
      <div className="relative w-full aspect-video bg-slate-950 overflow-hidden">
        <CCTVFeedCanvas
          camera={camera}
          isWebcamActive={isThisCameraWebcamActive}
          selectedDeviceId={isThisCameraWebcamActive ? activeWebcamDeviceId || undefined : undefined}
        />

        {/* Ambient Red Glow Frame on Camera When Alert is Detected */}
        {camera.hasAlert && (
          <div className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-red-500 shadow-[inset_0_0_35px_rgba(239,68,68,0.55)] z-20 animate-pulse">
            <div className="absolute top-2 left-2 bg-red-600/90 text-white font-mono font-extrabold text-[9px] px-2 py-0.5 rounded tracking-wider flex items-center gap-1 shadow-md animate-bounce">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
              <span>{camera.actionLabel === 'Dispatched' ? 'DISPATCHED • ACTIVE EMERGENCY' : 'EMERGENCY DETECTED'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status & Action */}
      <div className="p-2.5 flex items-center justify-between border-t border-gray-100 bg-white">
        <span
          className={`text-xs font-bold truncate max-w-[170px] ${
            camera.hasAlert
              ? 'text-red-600'
              : camera.badgeType === 'blue'
              ? 'text-[#0284c7]'
              : 'text-slate-600'
          }`}
        >
          {camera.statusText}
        </span>

        {/* Action Button */}
        <button
          onClick={handleAction}
          className={`text-xs font-bold px-3 py-1 rounded transition active:scale-95 shadow-2xs ${
            camera.actionLabel === 'Dispatched' || camera.badgeType === 'blue'
              ? 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
              : camera.actionType === 'dispatch' || camera.hasAlert
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : camera.actionType === 'wheelchair'
              ? 'bg-[#0284c7] hover:bg-[#0369a1] text-white'
              : 'bg-[#e0f2fe] hover:bg-[#bae6fd] text-[#0369a1]'
          }`}
        >
          {camera.actionLabel}
        </button>
      </div>
    </div>
  );
};
