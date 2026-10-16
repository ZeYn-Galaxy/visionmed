'use client';

import React from 'react';
import { Users, Siren } from 'lucide-react';
import { useAppStore } from '../../lib/store';

export const KpiPanel: React.FC = () => {
  const { urgentAlerts, openDispatchModal } = useAppStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      {/* 1. QUEUE CARD */}
      <div className="bg-white rounded-xl border border-gray-100 border-l-[5px] border-l-[#dc2626] p-4 shadow-xs flex flex-col justify-between min-h-[145px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            QUEUE
          </span>
          <Users className="w-4 h-4 text-[#0284c7]" />
        </div>

        {/* Big Number */}
        <div className="my-1">
          <div className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none">
            38
          </div>
        </div>

        {/* Status Line */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#dc2626]">
            <span className="w-2 h-2 rounded-full bg-[#dc2626] animate-ping" />
            <span>2 need help</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">Avg wait: 9m</span>
        </div>
      </div>

      {/* 2. URGENT ALERTS CARD */}
      <div className="bg-white rounded-xl border border-gray-100 border-l-[5px] border-l-[#dc2626] p-4 shadow-xs flex flex-col justify-between min-h-[145px]">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]"></span>
            <span className="text-sm font-bold text-slate-900">Urgent Alerts</span>
          </div>
          <span className="bg-[#b91c1c] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full tracking-wide uppercase">
            ACTIVE
          </span>
        </div>

        {/* Alerts List */}
        <div className="space-y-1.5 my-1.5">
          {urgentAlerts.length > 0 ? (
            urgentAlerts.slice(0, 2).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#dc2626]">
                  {alert.cameraName}: {alert.message}
                </span>
                <span className="text-[#dc2626] text-[11px] font-medium">{alert.timeAgo}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-400 py-1">No active urgent alerts.</div>
          )}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => openDispatchModal()}
          className="w-full bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold py-2 rounded-md flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.99]"
        >
          <Siren className="w-3.5 h-3.5 text-red-200" />
          <span>Dispatch Help</span>
        </button>
      </div>
    </div>
  );
};
