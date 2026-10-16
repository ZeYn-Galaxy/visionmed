'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, VolumeX, Camera, LogOut, ChevronDown, Lock, FlaskConical } from 'lucide-react';
import { useAppStore } from '../../lib/store';

export const Header: React.FC = () => {
  const router = useRouter();
  const {
    openAlertTeamModal,
    isSirenPlaying,
    stopSiren,
    openAddCameraModal,
    openMediaTesterModal,
    currentUser,
    logout,
    cameras,
  } = useAppStore();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activeCamerasCount = cameras.filter((c) => c.isActive !== false).length;

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    router.push('/login');
  };

  return (
    <header className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3.5 sticky top-0 z-40 shadow-xs">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Live Status */}
        <div className="flex items-center gap-3.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0284c7] to-[#06b6d4] flex items-center justify-center text-white shadow-md shadow-cyan-500/20 group-hover:scale-105 transition">
              <span className="font-extrabold text-xl leading-none">+</span>
            </div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900">
              Vision<span className="text-[#0284c7]">Med</span>
            </span>
          </Link>

          <div className="h-5 w-[1.5px] bg-slate-200 mx-1 hidden sm:block" />

          {/* Live Badge */}
          <div className="inline-flex items-center gap-1.5 bg-[#dcfce7] border border-[#bbf7d0] text-[#15803d] text-xs font-semibold px-3 py-1 rounded-full shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"></span>
            <span>Live • {activeCamerasCount} Cameras</span>
          </div>
        </div>

        {/* Action Controls & User Profile */}
        <div className="flex items-center gap-3">
          {/* AI Media Tester (Foto/Video) */}
          <button
            onClick={openMediaTesterModal}
            className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-700 to-sky-700 hover:from-cyan-600 hover:to-sky-600 text-white text-xs font-bold px-3 py-2 rounded-md transition shadow-xs hover:shadow active:scale-95"
            title="Uji Model AI: Upload Foto atau Video untuk Evaluasi Pose & Gejala Kedaruratan"
          >
            <FlaskConical className="w-3.5 h-3.5 text-cyan-200" />
            <span>Tester AI (Foto/Video)</span>
          </button>

          {/* Add Camera Button (Only for Security or Admin) */}
          {currentUser?.role !== 'receptionist' && (
            <button
              onClick={openAddCameraModal}
              className="hidden sm:flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-bold px-3 py-2 rounded-md transition border border-slate-200"
              title="Manage and Add Surveillance Cameras"
            >
              <Camera className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Manage Cameras</span>
            </button>
          )}

          {/* Mute Siren Button if active */}
          {isSirenPlaying && (
            <button
              onClick={stopSiren}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-md transition shadow animate-bounce"
              title="Silence Active Audio Siren"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>MUTE SIREN</span>
            </button>
          )}

          {/* ALERT TEAM Button (Only for Security role) */}
          {currentUser?.role === 'security' && (
            <button
              onClick={openAlertTeamModal}
              className="flex items-center gap-2 bg-[#b91c1c] hover:bg-[#991b1b] text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-md transition shadow-sm hover:shadow active:scale-95"
            >
              <ShieldAlert className="w-4 h-4 text-red-200" />
              <span>ALERT TEAM</span>
            </button>
          )}

          {/* User Profile Menu (LOCKED: No Switch Role, 1 Account per session) */}
          <div className="relative pl-2 border-l border-slate-200">
            {currentUser ? (
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition text-left"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-300 ring-2 ring-slate-100 flex items-center justify-center text-white text-sm">
                  <span>{currentUser.avatar}</span>
                </div>
                <div className="hidden sm:block text-xs">
                  <div className="font-bold text-slate-900 leading-tight flex items-center gap-1">
                    <span>{currentUser.name}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </div>
                  <div className="text-[10px] uppercase font-extrabold text-[#0284c7]">
                    ROLE: {currentUser.role}
                  </div>
                </div>
              </button>
            ) : (
              <Link
                href="/login"
                className="bg-[#0284c7] text-white font-bold text-xs px-3 py-1.5 rounded-md"
              >
                Login
              </Link>
            )}

            {/* Dropdown Menu (Locked Role Info + Logout) */}
            {isUserMenuOpen && currentUser && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs text-slate-700 animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="font-bold text-slate-900 text-sm">{currentUser.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                      {currentUser.title}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 border-b border-slate-100 text-[11px] text-slate-600 flex items-start gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Role Permanen & Terkunci:</strong> Anda masuk sebagai{' '}
                    <span className="uppercase font-bold text-slate-800">{currentUser.role}</span>. Tidak dapat berganti peran secara instan.
                  </span>
                </div>

                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-red-600 hover:bg-red-50 rounded-lg transition font-bold"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar (Logout Akun)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
