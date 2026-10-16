export type CameraStatusType = 'normal' | 'alert' | 'supported' | 'warning';

export type UserRole = 'security' | 'receptionist' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  title: string;
}

export interface CameraFeed {
  id: string; // e.g. "CAM 01"
  numericId: string; // "1", "2", etc.
  name: string; // e.g. "Queue Line A"
  location: string;
  badgeText: string; // "• Normal", "• Fall Detected", "• Chest Pain", etc.
  badgeType: 'red' | 'green' | 'blue';
  statusText: string; // "Status: Normal", "Status: Critical Fall", etc.
  hasAlert: boolean;
  alertType?: string; // "Fall Detected", "Chest Pain", "Counter Slump"
  bboxLabel?: string; // "Acute Collapse", "Chest Clutch", "Severe Slump", "Assisted"
  actionType: 'dispatch' | 'view' | 'wheelchair';
  actionLabel: string; // "Dispatch", "View", "Wheelchair"
  cameraTimestamp?: string;
  peopleCount: number;
  feedSource?: 'simulated' | 'webcam' | 'rtsp';
  rtspUrl?: string;
  isActive?: boolean;
  enabledDetections?: string[];
}

export interface IncidentRecord {
  id: string;
  camera_id: string; // "CAM 02"
  camera_name: string; // "Kiosk Area"
  detected_symptom: string; // "• Fall Detected"
  status_label: string; // "Status: Critical Fall"
  cv_method: string;
  confidence_score: number;
  duration: string; // "10:21"
  timestamp: string; // "12-15-2023 14:23:45"
  alert_status: 'CRITICAL' | 'RESOLVED' | 'DISPATCHED';
  bbox_label: string;
  notes?: string;
  thumbnail_type: 'collapse' | 'clutch' | 'slump' | 'queue';
}

export interface UrgentAlert {
  id: string;
  cameraId: string;
  cameraName: string;
  message: string;
  timeAgo: string;
}
