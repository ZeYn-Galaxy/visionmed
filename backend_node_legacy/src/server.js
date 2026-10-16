import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, initDB } from './db.js';

await initDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// SINGLE-SESSION & SINGLE-ACCOUNT LOGIC (1 Web 1 Akun, No Switch Role)
// -------------------------------------------------------------
const activeSockets = new Map(); // userId -> Set of socket IDs

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  const sessionToken = socket.handshake.query.token;

  if (userId && sessionToken) {
    const user = db.data.users.find(u => u.id === userId);
    if (!user || user.active_session_token !== sessionToken) {
      socket.emit('session_terminated', { reason: 'Akun Anda telah login di browser atau perangkat lain.' });
      socket.disconnect(true);
      return;
    }

    if (!activeSockets.has(userId)) {
      activeSockets.set(userId, new Set());
    }
    activeSockets.get(userId).add(socket.id);
  }

  socket.on('disconnect', () => {
    if (userId && activeSockets.has(userId)) {
      activeSockets.get(userId).delete(socket.id);
      if (activeSockets.get(userId).size === 0) {
        activeSockets.delete(userId);
      }
    }
  });
});

// Middleware to verify active session token
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sesi tidak valid atau belum login' });
  }

  const token = authHeader.split(' ')[1];
  const user = db.data.users.find(u => u.active_session_token === token);

  if (!user) {
    return res.status(401).json({ error: 'Sesi berakhir atau akun telah login di tempat lain (Single Session Limit).' });
  }

  req.user = user;
  next();
}

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi' });
  }

  await db.read();
  const user = db.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }

  // Generate new unique session token
  const newSessionToken = crypto.randomBytes(32).toString('hex');

  // Terminate any old active sockets for this user (1 Web 1 Akun)
  if (activeSockets.has(user.id)) {
    for (const socketId of activeSockets.get(user.id)) {
      io.to(socketId).emit('session_terminated', {
        reason: 'Akun Anda baru saja login di sesi browser lain. Sesi lama otomatis ditutup.'
      });
    }
  }

  // Update session token in DB
  user.active_session_token = newSessionToken;
  user.last_active_at = new Date().toISOString();
  await db.write();

  res.json({
    message: 'Login berhasil',
    token: newSessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role, // ROLE FIX & LOCKED: Cannot switch role
      avatar: user.avatar,
      title: user.title
    }
  });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      avatar: req.user.avatar,
      title: req.user.title
    }
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  req.user.active_session_token = null;
  await db.write();
  res.json({ success: true });
});

// -------------------------------------------------------------
// CAMERAS CRUD
// -------------------------------------------------------------

// GET /api/cameras
app.get('/api/cameras', async (req, res) => {
  await db.read();
  res.json(db.data.cameras);
});

// POST /api/cameras (Add Camera)
app.post('/api/cameras', requireAuth, async (req, res) => {
  const { id, name, location, feedSource, streamUrl, enabledDetections } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Nama kamera harus diisi' });
  }

  await db.read();
  const nextNum = db.data.cameras.length + 1;
  const camId = id || `CAM ${nextNum < 10 ? '0' + nextNum : nextNum}`;
  const numericId = String(nextNum);

  const newCamera = {
    id: camId,
    numericId,
    name,
    location: location || 'Clinical Zone',
    badgeText: '• Normal',
    badgeType: 'green',
    statusText: 'Status: Normal',
    hasAlert: false,
    alertType: null,
    bboxLabel: null,
    actionType: 'view',
    actionLabel: 'View',
    cameraTimestamp: new Date().toLocaleTimeString(),
    peopleCount: Math.floor(Math.random() * 5) + 1,
    feedSource: feedSource || 'webcam',
    streamUrl: streamUrl || null,
    isActive: true,
    enabledDetections: enabledDetections || ['Fall / Syncope']
  };

  db.data.cameras.push(newCamera);
  await db.write();

  io.emit('camera_added', newCamera);
  res.status(201).json(newCamera);
});

// DELETE /api/cameras/:id
app.delete('/api/cameras/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.read();
  db.data.cameras = db.data.cameras.filter(c => c.id !== id);
  await db.write();

  io.emit('camera_deleted', { id });
  res.json({ success: true, id });
});

// PATCH /api/cameras/:id/toggle
app.patch('/api/cameras/:id/toggle', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.read();
  const camera = db.data.cameras.find(c => c.id === id);
  if (!camera) return res.status(404).json({ error: 'Kamera tidak ditemukan' });

  camera.isActive = !camera.isActive;
  await db.write();

  io.emit('camera_toggled', { id, isActive: camera.isActive });
  res.json({ success: true, id, isActive: camera.isActive });
});

// -------------------------------------------------------------
// EMERGENCIES & MOTION CV DETECTION (6 Symptoms)
// -------------------------------------------------------------

// GET /api/emergencies
app.get('/api/emergencies', async (req, res) => {
  await db.read();
  res.json(db.data.emergencies);
});

// POST /api/emergency (Triggered by MediaPipe Detection or Test)
app.post('/api/emergency', async (req, res) => {
  const {
    camera_id,
    detected_symptom,
    status_label,
    cv_method,
    confidence_score,
    bbox_label,
    thumbnail_type
  } = req.body;

  await db.read();
  const camera = db.data.cameras.find(c => c.id === camera_id);
  if (!camera) {
    return res.status(404).json({ error: 'Kamera tidak ditemukan' });
  }

  const emergencyId = 'inc-' + Date.now();
  const now = new Date();
  const timestamp = `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()} ${now.toTimeString().split(' ')[0]}`;

  // Update Camera Status to Alert
  camera.hasAlert = true;
  camera.alertType = detected_symptom;
  camera.bboxLabel = bbox_label || detected_symptom;
  camera.badgeText = `• ${detected_symptom}`;
  camera.badgeType = 'red';
  camera.statusText = status_label || 'Status: Critical';
  camera.actionType = 'dispatch';
  camera.actionLabel = 'Dispatch';

  // Insert into emergencies log
  const newEmergency = {
    id: emergencyId,
    camera_id,
    camera_name: camera.name,
    detected_symptom: `• ${detected_symptom}`,
    status_label: status_label || 'Status: Critical',
    cv_method: cv_method || 'Real-Time Motion & Pose Landmark Tracking',
    confidence_score: confidence_score || 95.0,
    duration: '00:01',
    timestamp,
    alert_status: 'CRITICAL',
    bbox_label: bbox_label || detected_symptom,
    notes: 'Terdeteksi otomatis via client-side computer vision motion tracking.',
    thumbnail_type: thumbnail_type || 'collapse',
    created_at: now.toISOString()
  };

  db.data.emergencies.unshift(newEmergency);
  await db.write();

  // Broadcast to all clients (Security gets audible siren, Receptionist gets OS Notification)
  io.emit('emergency_detected', {
    emergency: newEmergency,
    camera_id,
    detected_symptom,
    timestamp
  });

  res.status(201).json({ success: true, emergency: newEmergency });
});

// POST /api/emergency/:id/resolve
app.post('/api/emergency/:id/resolve', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.read();
  const emergency = db.data.emergencies.find(e => e.id === id);
  if (!emergency) return res.status(404).json({ error: 'Insiden tidak ditemukan' });

  emergency.alert_status = 'RESOLVED';

  // Reset camera if no other critical alerts on this camera
  const remaining = db.data.emergencies.filter(e => e.camera_id === emergency.camera_id && e.alert_status === 'CRITICAL');
  if (remaining.length === 0) {
    const cam = db.data.cameras.find(c => c.id === emergency.camera_id);
    if (cam) {
      cam.hasAlert = false;
      cam.alertType = null;
      cam.bboxLabel = null;
      cam.badgeText = '• Normal';
      cam.badgeType = 'green';
      cam.statusText = 'Status: Normal';
      cam.actionType = 'view';
      cam.actionLabel = 'View';
    }
  }

  await db.write();
  io.emit('emergency_resolved', { id, camera_id: emergency.camera_id });
  res.json({ success: true });
});

// POST /api/dispatch
app.post('/api/dispatch', requireAuth, async (req, res) => {
  const { camera_id, responder, notes, emergency_id } = req.body;
  const dispatchId = 'disp-' + Date.now();

  await db.read();
  db.data.dispatches.push({
    id: dispatchId,
    emergency_id: emergency_id || null,
    camera_id,
    responder,
    notes: notes || null,
    dispatched_at: new Date().toISOString()
  });

  const cam = db.data.cameras.find(c => c.id === camera_id);
  if (cam) {
    cam.statusText = `Dispatched (${responder})`;
    cam.actionLabel = 'Dispatched';
  }

  await db.write();
  io.emit('dispatch_updated', { camera_id, responder, notes });
  res.json({ success: true, id: dispatchId });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[VisionMed Backend] Server aktif di http://localhost:${PORT}`);
});
