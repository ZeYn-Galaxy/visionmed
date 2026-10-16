'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Users, Siren, MapPin } from 'lucide-react';
import { useAppStore } from '../../lib/store';

export const KpiPanel: React.FC = () => {
  const {
    cameras,
    openDispatchModal,
    activeWebcamCameraId,
    triggerEmergencyAlert,
    startSiren,
    unmuteSiren,
  } = useAppStore();

  // If no camera is active (activeWebcamCameraId is null), the queue count is strictly 0.
  // When a camera is active, it dynamically reflects the sum of people detected on active camera(s).
  const activeCameras = activeWebcamCameraId
    ? cameras.filter((c) => c.id === activeWebcamCameraId)
    : [];

  const rawTotalDetectedPeople = activeWebcamCameraId
    ? activeCameras.reduce((sum, c) => sum + (c.peopleCount || 0), 0)
    : 0;

  // 2-second calculation stabilization buffer (anti-glitch / anti-flicker filter)
  const [displayQueueCount, setDisplayQueueCount] = useState<number>(0);
  const samplesRef = useRef<number[]>([]);
  const hasInitializedRef = useRef<boolean>(false);

  // Selected camera location for manual dispatch override
  const [selectedLocationCameraId, setSelectedLocationCameraId] = useState<string>('');

  useEffect(() => {
    if (cameras.length > 0 && (!selectedLocationCameraId || !cameras.some((c) => c.id === selectedLocationCameraId))) {
      const alertCam = cameras.find((c) => c.hasAlert);
      setSelectedLocationCameraId(alertCam ? alertCam.id : cameras[0].id);
    }
  }, [cameras, selectedLocationCameraId]);

  // Synchronous reset when camera turns off
  useEffect(() => {
    if (!activeWebcamCameraId) {
      setDisplayQueueCount(0);
      samplesRef.current = [];
      hasInitializedRef.current = false;
    }
  }, [activeWebcamCameraId]);

  // Collect samples on every raw count change
  useEffect(() => {
    if (!activeWebcamCameraId) return;

    samplesRef.current.push(rawTotalDetectedPeople);

    // Initial first-render pop so user doesn't wait 2s on cold camera startup
    if (!hasInitializedRef.current && rawTotalDetectedPeople > 0) {
      setDisplayQueueCount(rawTotalDetectedPeople);
      hasInitializedRef.current = true;
    }
  }, [rawTotalDetectedPeople, activeWebcamCameraId]);

  // Commit updates strictly every ~2 seconds using the statistical mode
  useEffect(() => {
    if (!activeWebcamCameraId) return;

    const intervalId = setInterval(() => {
      const samples = samplesRef.current;
      if (samples.length > 0) {
        const freqMap = new Map<number, number>();
        for (const s of samples) {
          freqMap.set(s, (freqMap.get(s) || 0) + 1);
        }

        let bestVal = samples[samples.length - 1];
        let maxFreq = -1;
        freqMap.forEach((freq, val) => {
          if (freq > maxFreq) {
            maxFreq = freq;
            bestVal = val;
          }
        });

        setDisplayQueueCount(bestVal);
        samplesRef.current = [];
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeWebcamCameraId]);

  const needHelpCount = cameras.filter((c) => c.hasAlert).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      {/* 1. QUEUE CARD */}
      <div
        className={`bg-white rounded-xl border border-gray-100 border-l-[5px] ${
          needHelpCount > 0
            ? 'border-l-[#dc2626]'
            : activeWebcamCameraId
            ? 'border-l-[#0284c7]'
            : 'border-l-slate-300'
        } p-4 shadow-xs flex flex-col justify-between min-h-[145px] transition-colors`}
      >
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
            {activeWebcamCameraId ? displayQueueCount : 0}
          </div>
        </div>

        {/* Status Line */}
        <div className="flex items-center justify-between pt-1">
          {needHelpCount > 0 ? (
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#dc2626]">
              <span className="w-2 h-2 rounded-full bg-[#dc2626] animate-ping" />
              <span>{needHelpCount} need help</span>
            </div>
          ) : activeWebcamCameraId ? (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{displayQueueCount} People Detected</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>No Active Camera (0)</span>
            </div>
          )}
          <span className="text-xs text-gray-400 font-medium">Real-time CCTV Detection</span>
        </div>
      </div>

      {/* 2. DISPATCH HELP CARD (LOKASI SELECTION & MANUAL DISPATCH OVERRIDE) */}
      <div className="bg-white rounded-xl border border-gray-100 border-l-[5px] border-l-[#0284c7] p-4 shadow-xs flex flex-col justify-between min-h-[145px]">
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#0284c7]" />
            <span className="text-sm font-bold text-slate-900">Dispatch Help</span>
          </div>
          {needHelpCount > 0 ? (
            <span className="bg-[#b91c1c] text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full tracking-wide uppercase animate-pulse">
              {needHelpCount} NEED HELP
            </span>
          ) : (
            <span className="bg-sky-100 text-[#0369a1] text-[10px] font-extrabold px-2 py-0.5 rounded-full tracking-wide uppercase">
              READY TO DISPATCH
            </span>
          )}
        </div>

        {/* Location Selector (Daftar List Lokasi Kamera) */}
        <div className="my-1 space-y-1">
          <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
            <span>Select Location for Help:</span>
            <span className="text-[10px] text-gray-400 font-normal">Manual Override</span>
          </label>
          <div className="relative">
            <select
              value={selectedLocationCameraId}
              onChange={(e) => setSelectedLocationCameraId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-[#0284c7] cursor-pointer"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.id} • {cam.location || cam.name} {cam.hasAlert ? `🚨 (${cam.alertType || 'Alert'})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">
            Use if Computer Vision has not detected yet, but you observe someone in need of assistance.
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={() => {
            const targetCam = cameras.find((c) => c.id === selectedLocationCameraId) || cameras[0];
            if (targetCam) {
              // 1. Immediately unmute and start siren audio so it blares until solved/muted
              unmuteSiren();
              triggerEmergencyAlert(
                targetCam.id,
                'Manual Emergency Help Requested',
                targetCam.name
              );
              startSiren();

              // 2. Transmit to backend so receptionists, incidents log, and other screens get notified
              fetch('http://localhost:5000/api/emergency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  camera_id: targetCam.id,
                  detected_symptom: 'Manual Emergency Help',
                  status_label: 'Status: Critical Emergency Help',
                  cv_method: 'Security Manual Dispatch Override',
                  confidence_score: 100.0,
                  bbox_label: 'Manual Help',
                  thumbnail_type: 'collapse',
                }),
              }).catch((e) => console.error('Emergency POST error:', e));

              // 3. Open dispatch modal with target camera pre-selected
              openDispatchModal(targetCam);
            }
          }}
          className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-bold py-2 rounded-md flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.99] cursor-pointer"
        >
          <Siren className="w-3.5 h-3.5 text-sky-200 animate-pulse" />
          <span>Dispatch Help to Selected Location</span>
        </button>
      </div>
    </div>
  );
};
