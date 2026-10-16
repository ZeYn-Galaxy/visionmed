# VisionMed — Real-Time AI Emergency Medical Detection System
> **Joints-26 Hackathon Project** | Automated Clinical CCTV Surveillance & Incident Response

VisionMed adalah sistem monitoring CCTV rumah sakit berbasis Computer Vision & AI real-time berkecepatan tinggi. Sistem mendeteksi dan melacak pergerakan seluruh orang (*Multi-Person Detection*) secara simultan menggunakan model **YOLO11-Pose** yang telah dilatih pada dataset resmi **COCO-Keypoints** (200.000+ citra dan 250.000+ anotasi pose manusia 17 titik anatomi tubuh), dioperasikan oleh backend **Python FastAPI + ONNXRuntime** dengan sinkronisasi bi-directional WebSockets ke Next.js frontend.

---

## 🚀 Fitur Unggulan

### 1. Multi-Person Detection dengan Dataset COCO-Keypoints (YOLO11-Pose)
Sistem Computer Vision didukung oleh neural network berbasis dataset berstandar industri:
- **Deteksi Seluruh Orang di Frame (Full Multi-Person)**: Tidak dibatasi 1 atau 2 orang. Model mendeteksi seluruh manusia di sudut pandang CCTV dan melacaknya dengan ID unik (`PERSON #01`, `PERSON #02`, dst.) beserta probabilitas confidence dan 17 keypoints anatomi (hidung, mata, telinga, bahu, siku, pergelangan tangan, pinggul, lutut, dan pergelangan kaki).
- **Dataset-Trained Model**: Model `yolo11n-pose.onnx` dioptimasi menggunakan ONNXRuntime (inferensi ~40-60 ms per frame) sehingga berjalan sangat responsif di CPU maupun GPU tanpa lag.
- **Kamera Device Selector**: Memungkinkan pemilihan perangkat video input (Webcam Terintegrasi, USB Camera eksternal, OBS Virtual Camera, dsb.) secara langsung melalui dropdown pada setiap kartu CCTV tanpa navigasi yang tidak disengaja.
- **Tampilan Otentik "Camera Unavailable"**: Kamera yang offline tidak lagi menggunakan animasi stickman buatan, melainkan menampilkan status monitor sekuriti profesional dengan kode diagnostik RTSP.
- **Evaluasi 6 Gejala Klinis Kedaruratan**:
  1. **Fall / Syncope (Jatuh Tiba-tiba)**: Akselerasi vertikal ke arah lantai $\Delta Y / \Delta t$ yang drastis kemudian posisi horizontal.
  2. **Chest Pain / Heart Clutch (Nyeri Dada / Serangan Jantung)**: Tangan menempel pada sternum dada disertai postur membungkuk.
  3. **Pre-Syncope / Counter Slump (Hampir Pingsan / Terkulai)**: Penurunan gradual kepala di bawah garis bahu dan hilangnya keseimbangan motorik.
  4. **Seizures / Convulsions (Kejang / Tremor)**: Osilasi frekuensi tinggi pada ekstremitas ($> 2\text{ Hz}$).
  5. **Respiratory Distress / Tachypnea (Sesak Napas Berat)**: Tripod posture (kedua tangan di lutut sambil membungkuk) atau elevasi ritmik bahu cepat ($> 30\text{ siklus/menit}$).
  6. **Acute Stroke / Bilateral Motor Asymmetry (Defisit Motorik Unilateral)**: Deviasi disparitas pergerakan ekstremitas kiri dan kanan (arm-drift test) dan facial/shoulder droop.

---

### 2. Aturan "1 Web 1 Akun" (Single Session Enforcement)
- **Role Locked**: Peran akun (`security`, `receptionist`, `admin`) ditentukan murni dari database akun terdaftar dan **terkunci permanen**. Tidak ada fitur ganti role bebas di dalam aplikasi.
- **Single-Session Enforcement**: Ketika akun yang sama login di tab, jendela, atau perangkat lain:
  1. Backend secara otomatis mencabut token sesi lama.
  2. Mengirimkan sinyal WebSocket `session_terminated`.
  3. Sesi lama langsung terkunci otomatis dengan notifikasi modal: *"Akun Anda baru saja login di perangkat/browser lain."* dan dialihkan ke halaman `/login`.

---

### 3. Matriks Notifikasi & Eskalasi Insiden
- **Security Guard (`security`)**:
  - Web Audio API Dual-Tone Alarm Siren (suara sirene darurat melengking).
  - Modal darurat merah berkedip (*flash red overlay*).
  - Quick Dispatch Ambulance / Security Team.
- **Receptionist (`receptionist`)**:
  - Desain *Silent Alert*: Menjaga suasana lobi/ruang tunggu tetap tenang tanpa kepanikan pengunjung.
  - In-app discreet toast banner.
  - **Browser Web Notifications API**: Notifikasi desktop OS native muncul bahkan saat resepsionis sedang membuka tab rekam medis lain.

---

## 🔑 Akun Uji Coba (Ready to Test)

Semua akun menggunakan password yang sama: `hospital123`

| Peran (Role) | Email | Nama Petugas | Karakteristik Notifikasi |
|---|---|---|---|
| **Security Guard** | `reed.security@visionmed.hospital` | Officer Reed Vance | Sirine Audio Nyaring + Red Alert Modal |
| **Receptionist** | `sarah.reception@visionmed.hospital` | Sarah Jenkins | Notifikasi Desktop OS (Web Notification) + Discreet Toast |
| **Admin** | `admin@visionmed.hospital` | Dr. Aris Danuarta | Akses Manajemen Kamera CRUD & Global Log |

---

## 🛠️ Cara Menjalankan Sistem

### 1. Python Backend Server
```bash
cd backend
# Buat dan aktifkan virtualenv (sudah tersedia di repository)
.venv\Scripts\activate
# Jalankan backend FastAPI + Socket.IO
python run.py
# Server aktif di http://localhost:5000
```

### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
# Buka http://localhost:3000 di browser
```

---

## 🧪 Skenario Pengujian Hackathon

1. **Pengujian Login & Single Session**:
   - Buka browser biasa di `http://localhost:3000`, login dengan akun `reed.security@visionmed.hospital`.
   - Buka jendela *Incognito* / tab baru, login dengan akun yang sama.
   - Perhatikan tab pertama: Sesi langsung tertutup seketika (*auto-logout & kicked*).
2. **Pengujian Computer Vision Real Webcam**:
   - Klik CCTV feed channel atau pilih tombol **"Gunakan Webcam Saya"**.
   - Berikan izin kamera browser.
   - Gerakkan tangan ke dada (meniru serangan jantung) atau jatuhkan badan secara tiba-tiba: HUD akan menampilkan kalkulasi probabilitas dan membunyikan alarm otomatis saat confidence $> 85\%$.
3. **Pengujian Manajemen Kamera**:
   - Klik tombol **"+ Tambah Kamera CCTV"** di bilah atas.
   - Tambahkan kamera baru dengan zona spesifik (misal: Ruang Radiologi, Poliklinik).
   - Kamera langsung tersinkronisasi ke seluruh layar monitor via WebSocket.
