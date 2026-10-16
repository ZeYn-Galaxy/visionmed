import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { CameraFeed, IncidentRecord, UrgentAlert, UserProfile } from '../types';
import toast from 'react-hot-toast';
import {
  playSiren,
  stopSiren as stopSirenAudio,
  muteSiren as muteSirenAudio,
  unmuteSiren as unmuteSirenAudio,
  playHospitalChime
} from './audioSiren';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const notifiedEmergencyKeys = new Set<string>();
let lastEmergencyTriggeredTime = 0;
let lastEmergencyTriggeredKey = '';

interface AppState {
  // Auth state
  currentUser: UserProfile | null;
  sessionToken: string | null;
  isLoadingAuth: boolean;
  initAuth: () => void;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // Cameras state
  cameras: CameraFeed[];
  urgentAlerts: UrgentAlert[];
  incidents: IncidentRecord[];
  activeTab: 'all' | 'alerts';
  setActiveTab: (tab: 'all' | 'alerts') => void;

  // Real-time Socket
  socket: Socket | null;
  initRealtime: () => void;

  // Camera Management
  fetchCameras: () => Promise<void>;
  fetchEmergencies: () => Promise<void>;
  addCamera: (cameraData: Partial<CameraFeed>) => Promise<boolean>;
  removeCamera: (cameraId: string) => Promise<boolean>;
  toggleCameraActive: (cameraId: string) => Promise<boolean>;
  triggerTestAlert: (cameraId: string, alertType: string) => Promise<void>;

  // Modals & Active Actions
  selectedCameraForDispatch: CameraFeed | null;
  isDispatchModalOpen: boolean;
  openDispatchModal: (camera?: CameraFeed) => void;
  closeDispatchModal: () => void;

  isAlertTeamModalOpen: boolean;
  activeAlertDetails: { cameraId: string; cameraName?: string; symptom: string; timestamp?: string } | null;
  openAlertTeamModal: (details?: { cameraId: string; cameraName?: string; symptom: string }) => void;
  closeAlertTeamModal: () => void;

  isAddCameraModalOpen: boolean;
  openAddCameraModal: () => void;
  closeAddCameraModal: () => void;

  isMediaTesterModalOpen: boolean;
  openMediaTesterModal: () => void;
  closeMediaTesterModal: () => void;

  // Audio Siren & Mute Controls
  isSirenPlaying: boolean;
  isSirenMuted: boolean;
  startSiren: () => void;
  stopSiren: () => void;
  muteSiren: () => void;
  unmuteSiren: () => void;

  // Active Webcam sync between Detail & Dashboard
  activeWebcamCameraId: string | null;
  activeWebcamDeviceId: string | null;
  setActiveWebcam: (cameraId: string | null, deviceId?: string) => void;

  // Dismiss Active Alert Banner
  dismissActiveAlert: () => void;

  // Mirror & People tracking
  isCameraMirrored: boolean;
  toggleCameraMirror: () => void;
  updateCameraPeopleCount: (cameraId: string, count: number) => void;

  // Actions
  resolveAlert: (incidentId: string, cameraId: string) => Promise<void>;
  resolveCameraAlert: (cameraId: string) => Promise<void>;
  dispatchCamera: (cameraId: string, responder: string, emergencyId?: string) => Promise<void>;
  reportCVDetection: (cameraId: string, symptom: string, statusLabel: string, cvMethod: string, bboxLabel: string) => Promise<void>;
  triggerEmergencyAlert: (cameraId: string, symptom: string, cameraName?: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  sessionToken: null,
  isLoadingAuth: true,
  cameras: [],
  urgentAlerts: [],
  incidents: [],
  activeTab: 'all',
  socket: null,
  isSirenPlaying: false,
  isSirenMuted: false,
  selectedCameraForDispatch: null,
  isDispatchModalOpen: false,
  isAlertTeamModalOpen: false,
  isAddCameraModalOpen: false,
  isMediaTesterModalOpen: false,
  activeAlertDetails: null,
  activeWebcamCameraId: null,
  activeWebcamDeviceId: null,
  setActiveWebcam: (cameraId, deviceId) =>
    set((state) => ({
      activeWebcamCameraId: cameraId,
      activeWebcamDeviceId: deviceId || null,
      cameras: state.cameras.map((c) =>
        cameraId && c.id === cameraId ? c : { ...c, peopleCount: 0 }
      )
    })),
  isCameraMirrored: true,
  toggleCameraMirror: () => set((state) => ({ isCameraMirrored: !state.isCameraMirrored })),
  updateCameraPeopleCount: (cameraId, count) => {
    const activeId = get().activeWebcamCameraId;
    set((state) => ({
      cameras: state.cameras.map((c) =>
        c.id === cameraId ? { ...c, peopleCount: activeId === cameraId ? count : 0 } : c
      )
    }));
  },
  dismissActiveAlert: () => set({ activeAlertDetails: null }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  initAuth: () => {
    if (typeof window === 'undefined') return;
    try {
      const savedToken = localStorage.getItem('visionmed_token');
      const savedUser = localStorage.getItem('visionmed_user');
      if (savedToken && savedUser) {
        set({
          sessionToken: savedToken,
          currentUser: JSON.parse(savedUser),
          isLoadingAuth: false
        });
      }
    } catch {}
  },

  // -------------------------------------------------------------
  // AUTH: Single Account, Single Web Session, No Role Switching
  // -------------------------------------------------------------
  login: async (email, password = 'hospital123') => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login gagal');
        return false;
      }

      localStorage.setItem('visionmed_token', data.token);
      localStorage.setItem('visionmed_user', JSON.stringify(data.user));

      set({
        currentUser: data.user,
        sessionToken: data.token,
        isLoadingAuth: false
      });

      get().initRealtime();
      get().fetchCameras();
      get().fetchEmergencies();

      // Request Web Notifications permission for Receptionist silently
      if (data.user.role === 'receptionist') {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }

      return true;
    } catch {
      toast.error('Gagal terhubung ke backend server');
      return false;
    }
  },

  logout: async () => {
    const token = get().sessionToken;
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // ignore
      }
    }

    if (get().socket) {
      get().socket?.disconnect();
    }

    localStorage.removeItem('visionmed_token');
    localStorage.removeItem('visionmed_user');

    set({
      currentUser: null,
      sessionToken: null,
      socket: null,
      isLoadingAuth: false
    });
  },

  // -------------------------------------------------------------
  // REAL-TIME SOCKET.IO (Alerts, Broadcasts, Single-Session Terminate)
  // -------------------------------------------------------------
  initRealtime: () => {
    const token = get().sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('visionmed_token') : null);
    const user = get().currentUser || (typeof window !== 'undefined' && localStorage.getItem('visionmed_user') ? JSON.parse(localStorage.getItem('visionmed_user')!) : null);

    if (get().socket?.connected) return;

    if (get().socket) {
      get().socket?.disconnect();
    }

    const socket = io(SOCKET_URL, {
      query: {
        userId: user ? user.id : 'guest',
        token: token ? token : 'guest_token'
      }
    });

    // Handle single-session eviction (when another tab or device logs in)
    socket.on('session_terminated', (data: { reason: string }) => {
      toast.error(data.reason || 'Sesi akun Anda ditutup karena login di tab/device lain.', {
        duration: 7000,
        icon: '🔒'
      });
      get().stopSiren();
      localStorage.removeItem('visionmed_token');
      localStorage.removeItem('visionmed_user');
      set({ currentUser: null, sessionToken: null });
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    });

    // Real-time emergency detection event
    socket.on('emergency_detected', (payload) => {
      const { camera_id, detected_symptom } = payload;
      get().fetchCameras();
      get().fetchEmergencies();
      get().triggerEmergencyAlert(camera_id, detected_symptom);
    });


    socket.on('emergency_resolved', (payload?: { camera_id?: string }) => {
      get().fetchCameras();
      get().fetchEmergencies();
      stopSirenAudio();
      set({ isSirenPlaying: false });
      if (!payload?.camera_id || get().activeAlertDetails?.cameraId === payload.camera_id) {
        get().dismissActiveAlert();
      }
      if (payload?.camera_id) {
        for (const key of Array.from(notifiedEmergencyKeys)) {
          if (key.startsWith(payload.camera_id)) {
            notifiedEmergencyKeys.delete(key);
          }
        }
      }
    });

    socket.on('people_count_updated', ({ camera_id, people_count }: { camera_id: string; people_count: number }) => {
      set((state) => ({
        cameras: state.cameras.map((c) => (c.id === camera_id ? { ...c, peopleCount: people_count } : c))
      }));
    });

    socket.on('camera_added', (cam) => {
      set((state) => ({ cameras: [...state.cameras, cam] }));
      toast.success(`New camera added: ${cam.id}`);
    });

    socket.on('camera_deleted', ({ id }) => {
      set((state) => ({ cameras: state.cameras.filter((c) => c.id !== id) }));
      toast(`Camera ${id} has been removed.`);
    });

    socket.on('camera_toggled', ({ id, isActive }) => {
      set((state) => ({
        cameras: state.cameras.map((c) => (c.id === id ? { ...c, isActive } : c))
      }));
    });

    set({ socket });
  },

  // -------------------------------------------------------------
  // DATA FETCHING & CAMERA MANAGEMENT
  // -------------------------------------------------------------
  fetchCameras: async () => {
    try {
      const res = await fetch(`${API_BASE}/cameras`);
      if (res.ok) {
        const cameras: CameraFeed[] = await res.json();
        const activeId = get().activeWebcamCameraId;
        const normalizedCameras = cameras.map((c) => ({
          ...c,
          peopleCount: activeId && activeId === c.id ? c.peopleCount || 0 : 0
        }));
        const urgent = normalizedCameras
          .filter((c) => c.hasAlert)
          .map((c) => ({
            id: 'alert-' + c.id,
            cameraId: c.id,
            cameraName: c.name,
            message: c.alertType || 'Medical alert triggered',
            timeAgo: 'Just now'
          }));
        set({ cameras: normalizedCameras, urgentAlerts: urgent });
      }
    } catch (err) {
      console.error('Fetch cameras error:', err);
    }
  },

  fetchEmergencies: async () => {
    try {
      const res = await fetch(`${API_BASE}/emergencies`);
      if (res.ok) {
        const emergencies: IncidentRecord[] = await res.json();
        set({ incidents: emergencies });
      }
    } catch (err) {
      console.error('Fetch emergencies error:', err);
    }
  },

  addCamera: async (cameraData) => {
    const token = get().sessionToken;
    try {
      const res = await fetch(`${API_BASE}/cameras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(cameraData)
      });
      return res.ok;
    } catch {
      toast.error('Failed to add camera');
      return false;
    }
  },

  removeCamera: async (cameraId) => {
    const token = get().sessionToken;
    try {
      const res = await fetch(`${API_BASE}/cameras/${cameraId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  toggleCameraActive: async (cameraId) => {
    const token = get().sessionToken;
    try {
      const res = await fetch(`${API_BASE}/cameras/${cameraId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  triggerTestAlert: async (cameraId, alertType) => {
    get().triggerEmergencyAlert(cameraId, alertType);
    try {
      await fetch(`${API_BASE}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: cameraId,
          detected_symptom: alertType,
          status_label: `Status: Critical ${alertType}`,
          cv_method: 'Manual Simulation & Motion Trigger',
          confidence_score: 95.5,
          bbox_label: alertType,
          thumbnail_type: 'collapse'
        })
      });
      get().fetchCameras();
      get().fetchEmergencies();
    } catch (err) {
      console.error('Trigger alert error:', err);
    }
  },

  reportCVDetection: async (cameraId, symptom, statusLabel, cvMethod, bboxLabel) => {
    // 1. Immediately sound role alarm & visual alert locally
    get().triggerEmergencyAlert(cameraId, symptom);

    // 2. Transmit to backend to persist in incident database & broadcast via Socket.IO
    try {
      const res = await fetch(`${API_BASE}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: cameraId,
          detected_symptom: symptom,
          status_label: statusLabel,
          cv_method: cvMethod,
          confidence_score: 96.0,
          bbox_label: bboxLabel,
          thumbnail_type: 'collapse'
        })
      });
      if (res.ok) {
        get().fetchCameras();
        get().fetchEmergencies();
      }
    } catch (err) {
      console.error('Report CV detection error:', err);
    }
  },

  triggerEmergencyAlert: (cameraId, symptom, cameraName) => {
    let user = get().currentUser;
    if (!user && typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('visionmed_user');
      if (savedUser) {
        try {
          user = JSON.parse(savedUser);
          set({ currentUser: user });
        } catch {}
      }
    }
    const role = user?.role || 'security';

    // Prevent duplicate rapid-fire alarms within 2 seconds for identical camera+symptom
    const now = Date.now();
    const currentKey = `${cameraId}-${symptom}`;
    if (now - lastEmergencyTriggeredTime < 2000 && lastEmergencyTriggeredKey === currentKey) {
      return;
    }
    lastEmergencyTriggeredTime = now;
    lastEmergencyTriggeredKey = currentKey;

    const cam = get().cameras.find((c) => c.id === cameraId) || { name: cameraName || cameraId };
    set((state) => ({
      activeAlertDetails: {
        cameraId,
        cameraName: cam.name,
        symptom,
        timestamp: new Date().toLocaleTimeString()
      },
      // Immediately illuminate camera ambient glow & badge in store
      cameras: state.cameras.map((c) =>
        c.id === cameraId
          ? {
              ...c,
              hasAlert: true,
              alertType: symptom,
              badgeType: c.actionLabel === 'Dispatched' ? 'blue' : 'red',
              badgeText: c.actionLabel === 'Dispatched' ? c.badgeText : `• ${symptom}`,
              statusText: c.actionLabel === 'Dispatched' ? c.statusText : `Status: Critical ${symptom}`,
              actionType: 'dispatch',
              actionLabel: c.actionLabel === 'Dispatched' ? 'Dispatched' : 'Dispatch'
            }
          : c
      ),
      urgentAlerts: [
        {
          id: 'alert-' + cameraId,
          cameraId,
          cameraName: cam.name || cameraId,
          message: symptom,
          timeAgo: 'Just now'
        },
        ...state.urgentAlerts.filter((a) => a.cameraId !== cameraId)
      ],
      // Unmute so newly detected emergency sounds immediately
      isSirenMuted: false
    }));

    if (role === 'security') {
      // Security Guard: Web Audio Siren (No full-screen modal popup; ambient glow + top-right swipeable banner)
      get().startSiren();
    } else if (role === 'receptionist') {
      // Receptionist: Medical chime + OS Desktop Notification
      if (typeof window !== 'undefined') {
        playHospitalChime();
      }

      if (typeof window !== 'undefined' && 'Notification' in window) {
        const notifKey = `${cameraId}-${symptom}`;
        if (!notifiedEmergencyKeys.has(notifKey)) {
          notifiedEmergencyKeys.add(notifKey);

          const showNotif = () => {
            try {
              const osNotif = new Notification(`🚨 Medical Alert: ${symptom}`, {
                body: `Location: ${cam.name || cameraId}. Prepare ER / Triage response immediately.`,
                icon: '/favicon.ico'
              });
              osNotif.onclick = () => {
                window.focus();
                window.location.href = '/incidents';
              };
              // Auto close after 4.5s to avoid permanent desktop clutter
              setTimeout(() => {
                try {
                  osNotif.close();
                } catch {}
              }, 4500);
            } catch (e) {
              console.warn('Desktop notification error:', e);
            }
          };

          if (Notification.permission === 'granted') {
            showNotif();
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().then((perm) => {
              if (perm === 'granted') {
                showNotif();
              }
            });
          }
        }
      }
    } else {
      toast.error(`🚨 ALERT: ${symptom} di ${cam.name || cameraId}!`, { duration: 6000 });
    }
  },

  // -------------------------------------------------------------
  // MODALS & SIREN
  // -------------------------------------------------------------
  openDispatchModal: (camera) =>
    set({
      selectedCameraForDispatch: camera || get().cameras.find((c) => c.hasAlert) || get().cameras[0],
      isDispatchModalOpen: true
    }),
  closeDispatchModal: () => set({ isDispatchModalOpen: false, selectedCameraForDispatch: null }),

  openAlertTeamModal: (details) => {
    if (details) {
      set({ activeAlertDetails: details });
    }
    get().startSiren();
    set({ isAlertTeamModalOpen: true });
  },
  closeAlertTeamModal: () => {
    get().stopSiren();
    set({ isAlertTeamModalOpen: false });
  },

  openAddCameraModal: () => set({ isAddCameraModalOpen: true }),
  closeAddCameraModal: () => set({ isAddCameraModalOpen: false }),

  openMediaTesterModal: () => set({ isMediaTesterModalOpen: true }),
  closeMediaTesterModal: () => set({ isMediaTesterModalOpen: false }),

  startSiren: () => {
    unmuteSirenAudio();
    playSiren();
    set({ isSirenPlaying: true, isSirenMuted: false });
  },
  stopSiren: () => {
    stopSirenAudio();
    muteSirenAudio();
    set({ isSirenPlaying: false, isSirenMuted: true });
  },
  muteSiren: () => {
    stopSirenAudio();
    muteSirenAudio();
    set({ isSirenPlaying: false, isSirenMuted: true });
  },
  unmuteSiren: () => {
    unmuteSirenAudio();
    set({ isSirenMuted: false });
  },

  resolveCameraAlert: async (cameraId: string) => {
    const token = get().sessionToken;
    try {
      await fetch(`${API_BASE}/cameras/${encodeURIComponent(cameraId)}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      stopSirenAudio();
      unmuteSirenAudio();
      set({ isSirenPlaying: false, isSirenMuted: false });
      get().dismissActiveAlert();
      await get().fetchCameras();
      await get().fetchEmergencies();
    } catch (err) {
      console.error('Resolve camera alert error:', err);
    }
  },

  resolveAlert: async (incidentId, cameraId) => {
    await get().resolveCameraAlert(cameraId);
  },

  dispatchCamera: async (cameraId, responder, emergencyId) => {
    const token = get().sessionToken;
    try {
      // 1. Locally mark camera as Dispatched while preserving active emergency alert
      set((state) => ({
        cameras: state.cameras.map((c) =>
          c.id === cameraId
            ? {
                ...c,
                hasAlert: true,
                badgeType: 'blue',
                badgeText: `• Dispatched (${responder})`,
                statusText: `🚨 ${c.alertType || 'Emergency'} (Dispatched: ${responder})`,
                actionLabel: 'Dispatched'
              }
            : c
        ),
        isSirenMuted: false,
        isSirenPlaying: true
      }));

      // Ensure siren sounds continuously until solved or muted
      unmuteSirenAudio();
      get().startSiren();

      await fetch(`${API_BASE}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          camera_id: cameraId,
          responder,
          emergency_id: emergencyId
        })
      });
      get().fetchCameras();
    } catch (err) {
      console.error(err);
    }
  }
}));
