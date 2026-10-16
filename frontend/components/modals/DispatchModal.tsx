import React, { useState } from 'react';
import { Siren, X, UserCheck, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

export const DispatchModal: React.FC = () => {
  const {
    isDispatchModalOpen,
    closeDispatchModal,
    selectedCameraForDispatch,
    dispatchCamera,
    resolveCameraAlert,
    startSiren,
    unmuteSiren,
  } = useAppStore();

  const [responder, setResponder] = useState('Emergency Response Team A');
  const [notes, setNotes] = useState('');

  if (!isDispatchModalOpen || !selectedCameraForDispatch) return null;

  const isDispatched =
    selectedCameraForDispatch.actionLabel === 'Dispatched' ||
    selectedCameraForDispatch.badgeType === 'blue';

  const handleConfirm = () => {
    unmuteSiren();
    startSiren();
    dispatchCamera(selectedCameraForDispatch.id, responder);
    toast.success(`Dispatched ${responder} to ${selectedCameraForDispatch.name}`, {
      duration: 4000,
      icon: '🚨',
    });
    closeDispatchModal();
  };

  const handleResolve = async () => {
    await resolveCameraAlert(selectedCameraForDispatch.id);
    toast.success(
      `Incident resolved! Camera ${selectedCameraForDispatch.id} returned to Normal (View) status.`,
      {
        duration: 3500,
        icon: '✅',
      }
    );
    closeDispatchModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden">
        {/* Modal Header */}
        <div
          className={`${
            isDispatched ? 'bg-[#0284c7]' : 'bg-[#b91c1c]'
          } text-white p-4 flex items-center justify-between transition-colors`}
        >
          <div className="flex items-center gap-2">
            {isDispatched ? (
              <CheckCircle className="w-5 h-5 text-sky-200" />
            ) : (
              <Siren className="w-5 h-5 text-red-200 animate-pulse" />
            )}
            <h3 className="font-bold text-base">
              {isDispatched ? 'Emergency Response Status' : 'Dispatch Emergency Response'}
            </h3>
          </div>
          <button
            onClick={closeDispatchModal}
            className="p-1 rounded-md hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target Camera Info */}
          <div
            className={`border rounded-lg p-3 text-slate-800 ${
              isDispatched ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center justify-between font-bold text-sm mb-1">
              <span>
                {selectedCameraForDispatch.id} — {selectedCameraForDispatch.name}
              </span>
              <span className={isDispatched ? 'text-[#0284c7]' : 'text-[#dc2626]'}>
                {selectedCameraForDispatch.statusText}
              </span>
            </div>
            <div className="text-gray-600">
              {isDispatched ? 'Response Status:' : 'Condition Detected:'}{' '}
              <span className={`font-semibold ${isDispatched ? 'text-sky-700' : 'text-red-700'}`}>
                {selectedCameraForDispatch.bboxLabel || selectedCameraForDispatch.badgeText}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {isDispatched
                ? 'Emergency response team has been dispatched to the patient location.'
                : 'Confidence Score: 94.2% • Automated CV Trigger'}
            </div>
          </div>

          {isDispatched ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Confirm Incident Resolution</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                Has the patient been attended to by medical personnel and the situation stabilized? Click below to return the camera status to <strong>Normal</strong> and action to <strong>View</strong>.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {isDispatched ? (
              <button
                onClick={handleResolve}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Mark Incident Resolved (Return to View)</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleResolve}
                  className="px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-100 font-bold text-gray-700 transition cursor-pointer"
                >
                  Mark Resolved
                </button>

                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-[#b91c1c] hover:bg-[#991b1b] text-white font-bold py-2 rounded-md shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Confirm & Send Alert</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
