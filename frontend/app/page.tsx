'use client';

import React, { useEffect } from 'react';
import { Header } from '../components/dashboard/Header';
import { KpiPanel } from '../components/dashboard/KpiPanel';
import { FilterTabBar } from '../components/dashboard/FilterTabBar';
import { CameraGrid } from '../components/dashboard/CameraGrid';
import { LatestEventBar } from '../components/dashboard/LatestEventBar';
import { Footer } from '../components/dashboard/Footer';
import { DispatchModal } from '../components/modals/DispatchModal';
import { AlertTeamModal } from '../components/modals/AlertTeamModal';
import { AddCameraModal } from '../components/modals/AddCameraModal';
import { MediaTesterModal } from '../components/modals/MediaTesterModal';
import { Toaster } from 'react-hot-toast';
import { useAppStore } from '../lib/store';
import { Bell } from 'lucide-react';

export default function DashboardPage() {
  const {
    currentUser,
    fetchCameras,
    fetchEmergencies,
    initRealtime,
    login
  } = useAppStore();

  useEffect(() => {
    // Check local session
    const savedToken = localStorage.getItem('visionmed_token');
    const savedUser = localStorage.getItem('visionmed_user');

    if (savedToken && savedUser) {
      useAppStore.setState({
        sessionToken: savedToken,
        currentUser: JSON.parse(savedUser),
        isLoadingAuth: false
      });
      initRealtime();
      fetchCameras();
      fetchEmergencies();
    } else {
      // Auto login with default security account on initial mount if not logged in
      login('reed.security@visionmed.hospital', 'hospital123').then(() => {
        fetchCameras();
        fetchEmergencies();
      });
    }

    // Refresh cameras every 30s
    const interval = setInterval(() => {
      fetchCameras();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-100/90 text-slate-900 flex flex-col justify-between selection:bg-cyan-500 selection:text-white">
      <Toaster position="top-right" containerStyle={{ top: 80, right: 24 }} />

      {/* Sticky Full-Width Header */}
      <Header />

      {/* Receptionist Mode Alert Banner if active */}
      {currentUser?.role === 'receptionist' && (
        <div className="w-full bg-[#0369a1] text-white text-xs py-2 px-4 shadow-inner">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-200 animate-bounce" />
              <span className="font-bold">
                RECEPTIONIST MODE ACTIVE:
              </span>
              <span>
                Audible sirens are muted. Emergency incidents are dispatched silently via in-app toast and OS-level Desktop Notifications.
              </span>
            </div>
            <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-bold">
              Web Notifications API Active
            </span>
          </div>
        </div>
      )}

      {/* Main Dashboard Control Center */}
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 flex-1">
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 sm:p-7">
          <KpiPanel />
          <FilterTabBar />
          <CameraGrid />
          <LatestEventBar />
        </div>
      </main>

      {/* Full-Width Operational Status Footer */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 pb-6">
        <Footer />
      </div>

      {/* Global Modals */}
      <DispatchModal />
      <AlertTeamModal />
      <AddCameraModal />
      <MediaTesterModal />
    </div>
  );
}
