import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.resolve(__dirname, '../../visionmed_db.json');

const defaultData = {
  users: [],
  cameras: [],
  emergencies: [],
  dispatches: []
};

export const db = await JSONFilePreset(dbFile, defaultData);

export async function initDB() {
  await db.read();

  // Seed default users if empty
  if (!db.data.users || db.data.users.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('hospital123', salt);

    db.data.users = [
      {
        id: 'usr-1',
        email: 'reed.security@visionmed.hospital',
        password: hash,
        name: 'Reed',
        role: 'security',
        avatar: '👮',
        title: 'Senior Surveillance Officer',
        active_session_token: null,
        last_active_at: null
      },
      {
        id: 'usr-2',
        email: 'sarah.reception@visionmed.hospital',
        password: hash,
        name: 'Sarah Jenkins',
        role: 'receptionist',
        avatar: '👩‍⚕️',
        title: 'Emergency Triage Receptionist',
        active_session_token: null,
        last_active_at: null
      },
      {
        id: 'usr-3',
        email: 'admin@visionmed.hospital',
        password: hash,
        name: 'Dr. Aris Thorne',
        role: 'admin',
        avatar: '👨‍💼',
        title: 'Clinical Operations Director',
        active_session_token: null,
        last_active_at: null
      }
    ];
  }

  // Seed cameras if empty
  if (!db.data.cameras || db.data.cameras.length === 0) {
    db.data.cameras = [
      {
        id: 'CAM 01',
        numericId: '1',
        name: 'Queue Line A (Real Webcam)',
        location: 'Waiting Hall',
        badgeText: '• Normal',
        badgeType: 'green',
        statusText: 'Status: Normal',
        hasAlert: false,
        alertType: null,
        bboxLabel: null,
        actionType: 'view',
        actionLabel: 'View',
        cameraTimestamp: '11-14-2023 10:42:15',
        peopleCount: 8,
        feedSource: 'webcam',
        isActive: true,
        enabledDetections: ['Fall / Syncope', 'Chest Pain', 'Pre-Syncope / Slump', 'Seizures / Convulsions', 'Respiratory Distress', 'Stroke Symptoms']
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
        cameraTimestamp: '12-15-2023 14:23:45',
        peopleCount: 5,
        feedSource: 'simulated',
        isActive: true,
        enabledDetections: ['Fall / Syncope', 'Pre-Syncope / Slump']
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
        cameraTimestamp: '23-AUG-2023 09:14:10',
        peopleCount: 11,
        feedSource: 'simulated',
        isActive: true,
        enabledDetections: ['Chest Pain', 'Respiratory Distress']
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
        cameraTimestamp: 'CAMERA INTAKE 12',
        peopleCount: 4,
        feedSource: 'simulated',
        isActive: true,
        enabledDetections: ['Pre-Syncope / Slump', 'Fall / Syncope']
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
        alertType: null,
        bboxLabel: 'Assisted',
        actionType: 'wheelchair',
        actionLabel: 'Wheelchair',
        cameraTimestamp: 'TRIAGE DESK 2023',
        peopleCount: 6,
        feedSource: 'simulated',
        isActive: true,
        enabledDetections: ['Fall / Syncope', 'Pre-Syncope / Slump']
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
        alertType: null,
        bboxLabel: null,
        actionType: 'view',
        actionLabel: 'View',
        cameraTimestamp: 'RECEPTION CHECK-IN',
        peopleCount: 14,
        feedSource: 'simulated',
        isActive: true,
        enabledDetections: ['Fall / Syncope', 'Chest Pain', 'Respiratory Distress']
      }
    ];
  }

  // Seed emergencies if empty
  if (!db.data.emergencies || db.data.emergencies.length === 0) {
    db.data.emergencies = [
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
        thumbnail_type: 'collapse',
        created_at: new Date().toISOString()
      },
      {
        id: 'inc-02',
        camera_id: 'CAM 03',
        camera_name: 'Divider Line',
        detected_symptom: '• Chest Pain',
        status_label: 'Status: Distress',
        cv_method: 'Chest/Shoulder Displacement Tracking',
        confidence_score: 91.0,
        duration: '10:21',
        timestamp: '12-15-2023 14:23:45',
        alert_status: 'CRITICAL',
        bbox_label: 'Chest Clutch',
        notes: 'Patient clutching chest in line.',
        thumbnail_type: 'clutch',
        created_at: new Date().toISOString()
      },
      {
        id: 'inc-03',
        camera_id: 'CAM 05',
        camera_name: 'Counter 04',
        detected_symptom: '• Counter Slump',
        status_label: 'Status: Pre-Syncope',
        cv_method: 'Head-to-Torso Angle & Counter Velocity',
        confidence_score: 92.5,
        duration: '10:21',
        timestamp: '12-15-2023 14:23:45',
        alert_status: 'CRITICAL',
        bbox_label: 'Severe Slump',
        notes: 'Person slumped on counter glass.',
        thumbnail_type: 'slump',
        created_at: new Date().toISOString()
      }
    ];
  }

  if (!db.data.dispatches) {
    db.data.dispatches = [];
  }

  await db.write();
}
