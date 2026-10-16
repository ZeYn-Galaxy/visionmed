'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '../../components/dashboard/Header';
import { Footer } from '../../components/dashboard/Footer';
import { useAppStore } from '../../lib/store';
import { AlertTeamModal } from '../../components/modals/AlertTeamModal';
import { DispatchModal } from '../../components/modals/DispatchModal';
import { AddCameraModal } from '../../components/modals/AddCameraModal';
import { Toaster } from 'react-hot-toast';

export default function IncidentLogPage() {
  const { incidents } = useAppStore();

  return (
    <div className="min-h-screen w-full bg-slate-100/90 text-slate-900 flex flex-col justify-between">
      <Toaster position="top-right" />

      {/* Full-Width Header */}
      <Header />

      {/* Main Container */}
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 flex-1">
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 sm:p-7">
          {/* Back Button & Title Header */}
          <div className="relative flex items-center justify-center py-2 mb-4">
            <Link
              href="/"
              className="absolute left-0 flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-[#0284c7] transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>

            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Incident Log
            </h1>
          </div>

          <div className="h-[1px] bg-slate-200 w-full mb-6" />

          {/* Incidents Table / List View */}
          <div className="overflow-x-auto">
            {/* Table Column Titles */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-bold text-slate-800 mb-2 border-b border-gray-100">
              <div className="col-span-3 text-center sm:text-left">Main frame image</div>
              <div className="col-span-3 text-center sm:text-left">Camera</div>
              <div className="col-span-3 text-center sm:text-left">Incident</div>
              <div className="col-span-1 text-center">Duration</div>
              <div className="col-span-2 text-center sm:text-right">Time</div>
            </div>

            {/* Table Rows */}
            <div className="space-y-3">
              {incidents.map((item, idx) => (
                <div
                  key={item.id + idx}
                  className="grid grid-cols-12 gap-4 items-center bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:shadow-md hover:border-slate-300 transition"
                >
                  {/* 1. Main Frame Image Thumbnail */}
                  <div className="col-span-3">
                    <div className="relative w-full aspect-[16/9] bg-[#1e293b] rounded-lg overflow-hidden border border-gray-300 shadow-inner flex items-center justify-center">
                      <div className="w-full h-full bg-gradient-to-br from-slate-400 to-slate-700 relative p-1.5">
                        <div className="absolute top-1 left-1.5 text-[8px] font-mono text-gray-200 bg-black/50 px-1 rounded">
                          {item.camera_id}
                        </div>
                        <div className="absolute inset-x-5 inset-y-3 border-2 border-red-500 rounded flex flex-col justify-between p-0.5">
                          <span className="bg-red-600 text-white text-[7px] font-bold px-1 py-0.2 rounded w-fit">
                            {item.bbox_label}
                          </span>
                          <div className="w-full h-2 bg-red-500/40 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Camera */}
                  <div className="col-span-3 flex items-center gap-2">
                    <span className="bg-[#b91c1c] text-white text-[11px] font-bold px-2 py-0.5 rounded">
                      {item.camera_id}
                    </span>
                    <span className="font-bold text-xs text-[#b91c1c]">
                      {item.camera_name}
                    </span>
                  </div>

                  {/* 3. Incident */}
                  <div className="col-span-3 flex flex-col justify-center">
                    <span className="font-bold text-xs text-[#b91c1c] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b91c1c]"></span>
                      {item.detected_symptom.replace('• ', '')}
                    </span>
                    <span className="text-[11px] font-semibold text-[#b91c1c]">
                      {item.status_label}
                    </span>
                  </div>

                  {/* 4. Duration */}
                  <div className="col-span-1 text-center font-bold text-xs text-[#b91c1c]">
                    {item.duration}
                  </div>

                  {/* 5. Time */}
                  <div className="col-span-2 text-right font-bold text-xs text-[#b91c1c]">
                    {item.timestamp}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 pb-6">
        <Footer />
      </div>

      <DispatchModal />
      <AlertTeamModal />
      <AddCameraModal />
    </div>
  );
}
