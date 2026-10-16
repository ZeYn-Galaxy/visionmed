import { CameraFeed, IncidentRecord, UrgentAlert } from '../types';

export const INITIAL_CAMERAS: CameraFeed[] = [
  {
    id: 'CAM 01',
    numericId: '1',
    name: 'Queue Line A',
    location: 'Waiting Hall',
    badgeText: '• Normal',
    badgeType: 'green',
    statusText: 'Status: Normal',
    hasAlert: false,
    actionType: 'view',
    actionLabel: 'View',
    peopleCount: 8,
    cameraTimestamp: '11-14-2023 10:42:15'
  },
  {
    id: 'CAM 02',
    numericId: '2',
    name: 'Kiosk Area',
    location: 'Self-Service Kiosk',
    badgeText: '• Fall Detected',
    badgeType: 'red',
    statusText: 'Status: Critical Fall',
    hasAlert: true,
    alertType: 'Fall Detected',
    bboxLabel: 'Acute Collapse',
    actionType: 'dispatch',
    actionLabel: 'Dispatch',
    peopleCount: 5,
    cameraTimestamp: '12-15-2023 14:23:45'
  },
  {
    id: 'CAM 03',
    numericId: '3',
    name: 'Divider Line',
    location: 'Registration Stanchions',
    badgeText: '• Chest Pain',
    badgeType: 'red',
    statusText: 'Status: Distress',
    hasAlert: true,
    alertType: 'Chest Pain',
    bboxLabel: 'Chest Clutch',
    actionType: 'dispatch',
    actionLabel: 'Dispatch',
    peopleCount: 11,
    cameraTimestamp: '23-AUG-2023 09:14:10'
  },
  {
    id: 'CAM 05',
    numericId: '5',
    name: 'Counter 04',
    location: 'Admissions Counter',
    badgeText: '• Counter Slump',
    badgeType: 'red',
    statusText: 'Status: Pre-Syncope',
    hasAlert: true,
    alertType: 'Counter Slump',
    bboxLabel: 'Severe Slump',
    actionType: 'dispatch',
    actionLabel: 'Dispatch',
    peopleCount: 4,
    cameraTimestamp: 'CAMERA INTAKE 12'
  },
  {
    id: 'CAM 06',
    numericId: '6',
    name: 'Triage Intake',
    location: 'Triage Waiting Desk',
    badgeText: '• Supported',
    badgeType: 'blue',
    statusText: 'Status: Weakness',
    hasAlert: false,
    bboxLabel: 'Assisted',
    actionType: 'wheelchair',
    actionLabel: 'Wheelchair',
    peopleCount: 6,
    cameraTimestamp: 'TRIAGE DESK 2023'
  },
  {
    id: 'CAM 04',
    numericId: '4',
    name: 'Main Intake',
    location: 'Central Lobby',
    badgeText: '• Normal',
    badgeType: 'green',
    statusText: 'Status: Flow Steady',
    hasAlert: false,
    actionType: 'view',
    actionLabel: 'View',
    peopleCount: 14,
    cameraTimestamp: 'RECEPTION CHECK-IN'
  }
];

export const INITIAL_URGENT_ALERTS: UrgentAlert[] = [
  {
    id: 'alert-1',
    cameraId: 'CAM 02',
    cameraName: 'Cam 2',
    message: 'Fall detected',
    timeAgo: 'Just now'
  },
  {
    id: 'alert-2',
    cameraId: 'CAM 03',
    cameraName: 'Cam 3',
    message: 'Chest pain',
    timeAgo: '42s ago'
  }
];

export const INITIAL_INCIDENTS: IncidentRecord[] = [
  {
    id: 'inc-01',
    camera_id: 'CAM 02',
    camera_name: 'Kiosk Area',
    detected_symptom: '• Fall Detected',
    status_label: 'Status: Critical Fall',
    cv_method: 'Pose Estimation — Bounding Box Posture Transition',
    confidence_score: 94.2,
    duration: '10:21',
    timestamp: '12-15-2023 14:23:45',
    alert_status: 'CRITICAL',
    bbox_label: 'Acute Collapse',
    notes: 'Patient fell backwards near check-in kiosk. Response dispatched.',
    thumbnail_type: 'collapse'
  },
  {
    id: 'inc-02',
    camera_id: 'CAM 02',
    camera_name: 'Kiosk Area',
    detected_symptom: '• Fall Detected',
    status_label: 'Status: Critical Fall',
    cv_method: 'Pose Estimation — Bounding Box Posture Transition',
    confidence_score: 91.0,
    duration: '10:21',
    timestamp: '12-15-2023 14:23:45',
    alert_status: 'CRITICAL',
    bbox_label: 'Acute Collapse',
    notes: 'Secondary posture drop confirmation.',
    thumbnail_type: 'clutch'
  },
  {
    id: 'inc-03',
    camera_id: 'CAM 02',
    camera_name: 'Kiosk Area',
    detected_symptom: '• Fall Detected',
    status_label: 'Status: Critical Fall',
    cv_method: 'Pose Estimation — Bounding Box Posture Transition',
    confidence_score: 92.5,
    duration: '10:21',
    timestamp: '12-15-2023 14:23:45',
    alert_status: 'CRITICAL',
    bbox_label: 'Acute Collapse',
    notes: 'Medical team acknowledged.',
    thumbnail_type: 'slump'
  },
  {
    id: 'inc-04',
    camera_id: 'CAM 02',
    camera_name: 'Kiosk Area',
    detected_symptom: '• Fall Detected',
    status_label: 'Status: Critical Fall',
    cv_method: 'Pose Estimation — Bounding Box Posture Transition',
    confidence_score: 95.1,
    duration: '10:21',
    timestamp: '12-15-2023 14:23:45',
    alert_status: 'CRITICAL',
    bbox_label: 'Acute Collapse',
    notes: 'Wheelchair assistance mobilized.',
    thumbnail_type: 'collapse'
  }
];
