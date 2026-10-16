import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { CameraFeed, IncidentRecord, UrgentAlert, UserProfile } from '../types';
import toast from 'react-hot-toast';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

interface AppState {
  // Auth state
  currentUser: UserProfile | null;
  sessionToken: string | null;
  isLoadingAuth: boolean;
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
  openAlertTeamModal: () => void;
  closeAlertTeamModal: () => void;

  isAddCameraModalOpen: boolean;
  openAddCameraModal: () => void;
  closeAddCameraModal: () => void;

  isMediaTesterModalOpen: boolean;
  openMediaTesterModal: () => void;
  closeMediaTesterModal: () => void;

  // Audio Siren
  isSirenPlaying: boolean;
  startSiren: () => void;
  stopSiren: () => void;

  // Actions
  resolveAlert: (incidentId: string, cameraId: string) => Promise<void>;
  dispatchCamera: (cameraId: string, responder: string, emergencyId?: string) => Promise<void>;
  reportCVDetection: (cameraId: string, symptom: string, statusLabel: string, cvMethod: string, bboxLabel: string) => Promise<void>;
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
  selectedCameraForDispatch: null,
  isDispatchModalOpen: false,
  isAlertTeamModalOpen: false,
  isAddCameraModalOpen: false,
  isMediaTesterModalOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

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

      // Trigger Web Notifications API for Receptionist immediately upon login
      if (data.user.role === 'receptionist') {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission().then((perm) => {
              if (perm === 'granted') {
                new Notification('VisionMed Receptionist Mode', {
                  body: 'Notifikasi insiden kritis desktop aktif.',
                  icon: '/favicon.ico'
                });
              }
            });
          }
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

      const role = get().currentUser?.role;

      // Role response behavior
      if (role === 'security') {
        // Security gets loud Web Audio siren and red visual banner
        get().startSiren();
        toast.error(`🚨 ALERT: ${detected_symptom} di ${camera_id}!`, { duration: 6000 });
      } else if (role === 'receptionist') {
        // Receptionist gets silent in-app toast + OS Desktop Notification
        toast(`⚠️ ${detected_symptom} terdeteksi di ${camera_id}`, {
          icon: '🏥',
          duration: 6000
        });

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          const osNotif = new Notification(`🚨 Peringatan Medis: ${detected_symptom}`, {
            body: `Lokasi: ${camera_id}. Segera siapkan jalur IGD / Triage.`,
            icon: '/favicon.ico',
            requireInteraction: true
          });
          osNotif.onclick = () => {
            window.focus();
            window.location.href = '/incidents';
          };
        }
      }
    });

    socket.on('emergency_resolved', () => {
      get().fetchCameras();
      get().fetchEmergencies();
    });

    socket.on('camera_added', (cam) => {
      set((state) => ({ cameras: [...state.cameras, cam] }));
      toast.success(`Kamera baru ditambahkan: ${cam.id}`);
    });

    socket.on('camera_deleted', ({ id }) => {
      set((state) => ({ cameras: state.cameras.filter((c) => c.id !== id) }));
      toast(`Kamera ${id} telah dihapus.`);
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
        const urgent = cameras
          .filter((c) => c.hasAlert)
          .map((c) => ({
            id: 'alert-' + c.id,
            cameraId: c.id,
            cameraName: c.name,
            message: c.alertType || 'Medical alert triggered',
            timeAgo: 'Just now'
          }));
        set({ cameras, urgentAlerts: urgent });
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
      toast.error('Gagal menambah kamera');
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
    } catch (err) {
      console.error('Trigger alert error:', err);
    }
  },

  reportCVDetection: async (cameraId, symptom, statusLabel, cvMethod, bboxLabel) => {
    try {
      await fetch(`${API_BASE}/emergency`, {
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
    } catch (err) {
      console.error('Report CV detection error:', err);
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

  openAlertTeamModal: () => {
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
    if (typeof window !== 'undefined') {
      import('./audioSiren').then((module) => {
        module.playSiren();
      });
    }
    set({ isSirenPlaying: true });
  },
  stopSiren: () => {
    if (typeof window !== 'undefined') {
      import('./audioSiren').then((module) => {
        module.stopSiren();
      });
    }
    set({ isSirenPlaying: false });
  },

  resolveAlert: async (incidentId, cameraId) => {
    const token = get().sessionToken;
    try {
      await fetch(`${API_BASE}/emergency/${incidentId}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Alert resolved for camera ${cameraId}`);
      get().fetchCameras();
      get().fetchEmergencies();
    } catch (err) {
      console.error(err);
    }
  },

  dispatchCamera: async (cameraId, responder, emergencyId) => {
    const token = get().sessionToken;
    try {
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
