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
  const { openDispatchModal } = useAppStore();

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (camera.actionType === 'dispatch' || camera.hasAlert) {
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
          ? 'border-2 border-[#b91c1c] shadow-xs'
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
                ? 'bg-[#b91c1c] text-white'
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
              ? 'bg-[#b91c1c] text-white'
              : camera.badgeType === 'blue'
              ? 'bg-[#e0f2fe] text-[#0369a1]'
              : 'bg-[#dcfce7] text-[#15803d]'
          }`}
        >
          {camera.badgeText}
        </span>
      </div>

      {/* CCTV Canvas View */}
      <div className="relative w-full">
        <CCTVFeedCanvas camera={camera} />
      </div>

      {/* Footer Status & Action */}
      <div className="p-2.5 flex items-center justify-between border-t border-gray-100 bg-white">
        <span
          className={`text-xs font-bold truncate max-w-[170px] ${
            camera.hasAlert
              ? 'text-[#dc2626]'
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
            camera.actionType === 'dispatch'
              ? 'bg-[#b91c1c] hover:bg-[#991b1b] text-white'
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
