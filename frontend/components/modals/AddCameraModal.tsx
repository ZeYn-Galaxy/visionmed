'use client';

import React, { useState } from 'react';
import { Camera, Plus, X, Trash2, Power, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast from 'react-hot-toast';

export const AddCameraModal: React.FC = () => {
  const {
    isAddCameraModalOpen,
    closeAddCameraModal,
    cameras,
    addCamera,
    removeCamera,
    toggleCameraActive,
    triggerTestAlert,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'add' | 'list'>('add');

  // New Camera Form State
  const nextNumber = cameras.length + 1;
  const defaultId = `CAM ${nextNumber < 10 ? '0' + nextNumber : nextNumber}`;
  const [cameraId, setCameraId] = useState(defaultId);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [feedSource, setFeedSource] = useState<'simulated' | 'webcam' | 'rtsp'>('simulated');
  const [rtspUrl, setRtspUrl] = useState('');
  const [selectedDetections, setSelectedDetections] = useState<string[]>([
    'Fall / Syncope',
    'Chest Pain',
    'Pre-Syncope / Slump',
  ]);

  if (!isAddCameraModalOpen) return null;

  const toggleDetection = (det: string) => {
    setSelectedDetections((prev) =>
      prev.includes(det) ? prev.filter((d) => d !== det) : [...prev, det]
    );
  };

  const handleAddCamera = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a camera name / zone');
      return;
    }

    addCamera({
      id: cameraId || defaultId,
      name: name.trim(),
      location: location.trim() || 'Clinical Zone',
      badgeText: '• Normal',
      badgeType: 'green',
      statusText: 'Status: Normal',
      hasAlert: false,
      actionType: 'view',
      actionLabel: 'View',
      peopleCount: Math.floor(Math.random() * 8) + 2,
      cameraTimestamp: new Date().toLocaleTimeString(),
      feedSource,
      rtspUrl: feedSource === 'rtsp' ? rtspUrl : undefined,
      enabledDetections: selectedDetections,
    });

    toast.success(`Camera ${cameraId} (${name}) successfully added!`);
    setName('');
    setLocation('');
    setRtspUrl('');
    closeAddCameraModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0284c7] flex items-center justify-center text-white">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Camera Surveillance Management</h3>
              <p className="text-[11px] text-gray-400">Configure CCTV streams & CV emergency models</p>
            </div>
          </div>
          <button
            onClick={closeAddCameraModal}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('add')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'add'
                ? 'border-[#0284c7] text-[#0284c7]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            + Add New Camera
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'list'
                ? 'border-[#0284c7] text-[#0284c7]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Active Cameras ({cameras.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {activeTab === 'add' ? (
            <form onSubmit={handleAddCamera} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Camera ID:</label>
                  <input
                    type="text"
                    value={cameraId}
                    onChange={(e) => setCameraId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0284c7]"
                    placeholder="e.g. CAM 07"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Zone / Area Name:</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg p-2 font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0284c7]"
                    placeholder="e.g. Pediatric Ward Corridor"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Building & Wing Location:</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#0284c7]"
                  placeholder="e.g. Building B, 2nd Floor, Hallway 4"
                />
              </div>

              {/* Feed Source */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Stream Source Type:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedSource('simulated')}
                    className={`p-2.5 rounded-lg border text-center font-bold transition ${
                      feedSource === 'simulated'
                        ? 'border-[#0284c7] bg-sky-50 text-[#0284c7]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Simulated CCTV
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedSource('webcam')}
                    className={`p-2.5 rounded-lg border text-center font-bold transition ${
                      feedSource === 'webcam'
                        ? 'border-[#0284c7] bg-sky-50 text-[#0284c7]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Live Webcam
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedSource('rtsp')}
                    className={`p-2.5 rounded-lg border text-center font-bold transition ${
                      feedSource === 'rtsp'
                        ? 'border-[#0284c7] bg-sky-50 text-[#0284c7]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    IP Camera / RTSP
                  </button>
                </div>

                {feedSource === 'rtsp' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={rtspUrl}
                      onChange={(e) => setRtspUrl(e.target.value)}
                      placeholder="rtsp://admin:pass@192.168.1.50:554/stream1"
                      className="w-full border border-gray-300 rounded-lg p-2 font-mono text-[11px] text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* Computer Vision Detections Enablement */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Activate CV Detection Modules:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Fall / Syncope',
                    'Chest Pain',
                    'Pre-Syncope / Slump',
                    'Seizure / Convulsion',
                    'Respiratory Distress',
                    'Facial Paralysis (Stroke)',
                  ].map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-2 p-2 border border-gray-200 rounded-md cursor-pointer hover:bg-slate-50 transition"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDetections.includes(item)}
                        onChange={() => toggleDetection(item)}
                        className="rounded text-[#0284c7] focus:ring-[#0284c7]"
                      />
                      <span className="font-medium text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold py-2.5 rounded-lg transition shadow-md flex items-center justify-center gap-2 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register & Deploy Camera</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-500 text-[11px]">
                Click test alert to simulate how the system triggers medical siren and team dispatch on that specific feed.
              </p>
              {cameras.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white shadow-2xs hover:border-gray-300 transition"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        c.hasAlert ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {c.id}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{c.name}</div>
                      <div className="text-[10px] text-gray-400">{c.location}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Test Trigger Button */}
                    <button
                      onClick={() => triggerTestAlert(c.id, 'Fall Detected')}
                      title="Trigger simulated emergency alert"
                      className="px-2 py-1 bg-red-50 hover:bg-red-100 text-[#b91c1c] border border-red-200 font-bold text-[10px] rounded transition flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Test Alert</span>
                    </button>

                    {/* Toggle Active Button */}
                    <button
                      onClick={() => toggleCameraActive(c.id)}
                      title={c.isActive !== false ? 'Disable Feed' : 'Enable Feed'}
                      className={`p-1.5 rounded transition ${
                        c.isActive !== false
                          ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                          : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Camera */}
                    {cameras.length > 2 && (
                      <button
                        onClick={() => removeCamera(c.id)}
                        title="Delete camera"
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
