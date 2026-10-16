'use client';

import React, { useState } from 'react';
import { Siren, X, UserCheck } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

export const DispatchModal: React.FC = () => {
  const {
    isDispatchModalOpen,
    closeDispatchModal,
    selectedCameraForDispatch,
    dispatchCamera,
    resolveAlert,
  } = useAppStore();

  const [responder, setResponder] = useState('Emergency Response Team A');
  const [notes, setNotes] = useState('');

  if (!isDispatchModalOpen || !selectedCameraForDispatch) return null;

  const handleConfirm = () => {
    dispatchCamera(selectedCameraForDispatch.id, responder);
    toast.success(`Dispatched ${responder} to ${selectedCameraForDispatch.name}`, {
      duration: 4000,
      icon: '🚨',
    });
    closeDispatchModal();
  };

  const handleResolve = () => {
    resolveAlert('inc-01', selectedCameraForDispatch.id);
    toast.success(`Alert resolved for ${selectedCameraForDispatch.id}`, {
      duration: 3000,
    });
    closeDispatchModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-[#b91c1c] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-200 animate-pulse" />
            <h3 className="font-bold text-base">Dispatch Emergency Response</h3>
          </div>
          <button
            onClick={closeDispatchModal}
            className="p-1 rounded-md hover:bg-white/20 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target Camera Info */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-slate-800">
            <div className="flex items-center justify-between font-bold text-sm mb-1">
              <span>
                {selectedCameraForDispatch.id} — {selectedCameraForDispatch.name}
              </span>
              <span className="text-[#dc2626]">
                {selectedCameraForDispatch.statusText}
              </span>
            </div>
            <div className="text-gray-600">
              Condition Detected:{' '}
              <span className="font-semibold text-red-700">
                {selectedCameraForDispatch.bboxLabel || selectedCameraForDispatch.badgeText}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Confidence Score: 94.2% • Automated CV Trigger
            </div>
          </div>

          {/* Responder Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Select Response Unit:
            </label>
            <select
              value={responder}
              onChange={(e) => setResponder(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 font-medium text-slate-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-red-600"
            >
              <option value="Emergency Response Team A">
                🚨 Emergency Response Team A (Immediate)
              </option>
              <option value="Triage Nurse Station 1">
                🩺 Triage Nurse (Station 1)
              </option>
              <option value="Floor Security & Escort">
                🛡️ Floor Security & Escort
              </option>
              <option value="Wheelchair Mobility Assist">
                ♿ Wheelchair Mobility Assist
              </option>
            </select>
          </div>

          {/* Triage Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              Dispatch Instructions / Notes (Optional):
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Patient collapsed backwards, bring gurney and vitals monitor..."
              rows={2}
              className="w-full border border-gray-300 rounded-md p-2 font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-red-600"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={handleResolve}
              className="px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-100 font-bold text-gray-700 transition"
            >
              Mark Resolved
            </button>

            <button
              onClick={handleConfirm}
              className="flex-1 bg-[#b91c1c] hover:bg-[#991b1b] text-white font-bold py-2 rounded-md shadow-sm transition flex items-center justify-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>Confirm & Send Alert</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
