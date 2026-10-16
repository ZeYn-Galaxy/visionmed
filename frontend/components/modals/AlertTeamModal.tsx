'use client';

import React from 'react';
import { ShieldAlert, VolumeX, Radio } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

export const AlertTeamModal: React.FC = () => {
  const { isAlertTeamModalOpen, closeAlertTeamModal, stopSiren, activeAlertDetails } = useAppStore();

  if (!isAlertTeamModalOpen) return null;

  const handleAcknowledge = () => {
    stopSiren();
    toast.success('Hospital alert acknowledged. Response teams notified.', {
      icon: '📢',
    });
    closeAlertTeamModal();
  };

  const symptomText = activeAlertDetails?.symptom || 'Kedaruratan Medis Terdeteksi';
  const cameraText = activeAlertDetails?.cameraName
    ? `${activeAlertDetails.cameraId} (${activeAlertDetails.cameraName})`
    : activeAlertDetails?.cameraId || 'CCTV Surveillance';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border-4 border-[#b91c1c] overflow-hidden text-center">
        {/* Animated Warning Header */}
        <div className="bg-[#b91c1c] text-white p-6 flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3 animate-ping">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-extrabold uppercase tracking-wide">
            CODE ALERT ACTIVATED
          </h2>
          <p className="text-red-100 text-xs mt-1">
            Audible Alarm Siren is Looping via Web Audio API
          </p>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4 text-xs text-slate-700">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-left space-y-1.5">
            <div className="font-bold text-red-900 flex items-center gap-1.5 text-sm">
              <Radio className="w-4 h-4 text-red-600 animate-pulse" />
              <span>{symptomText}</span>
            </div>
            <div className="text-[11px] text-red-800 font-semibold">
              Lokasi: {cameraText}
            </div>
            <p className="text-gray-600">
              Emergency sirens sound locally. SMS notifications sent to registered triage duty phones. Receptionist desktop notification pushed.
            </p>
          </div>


          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleAcknowledge}
              className="w-full bg-[#b91c1c] hover:bg-[#991b1b] text-white font-bold py-3 rounded-lg shadow-md transition flex items-center justify-center gap-2 text-sm"
            >
              <VolumeX className="w-5 h-5 text-red-200" />
              <span>MUTE SIREN & ACKNOWLEDGE</span>
            </button>

            <button
              onClick={closeAlertTeamModal}
              className="w-full py-2 font-bold text-gray-500 hover:text-gray-700 transition"
            >
              Close Window (Alarm will stop)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
