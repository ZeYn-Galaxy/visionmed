-- ==============================================================================
-- VISIONMED SUPABASE DATABASE SCHEMA
-- Real-Time AI Medical Emergency Detection Dashboard
-- ==============================================================================

-- 1. PROFILES TABLE (Role-based Access Control: security vs receptionist)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('security', 'receptionist')),
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. EMERGENCIES TABLE (Incidents logged by CV detection / security)
CREATE TABLE IF NOT EXISTS emergencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_tracking_id TEXT NOT NULL,           -- e.g. "bbox-0"
  camera_id TEXT NOT NULL,                     -- e.g. "CAM 02"
  camera_name TEXT NOT NULL,                   -- e.g. "Kiosk Area"
  detected_symptom TEXT NOT NULL,              -- e.g. "Fall / Syncope Detected"
  cv_method TEXT NOT NULL,                     -- e.g. "Pose Estimation - Bounding Box Posture Transition"
  confidence_score NUMERIC(5,2) NOT NULL,      -- e.g. 91.50
  alert_status TEXT NOT NULL DEFAULT 'CRITICAL' CHECK (alert_status IN ('CRITICAL', 'RESOLVED', 'DISPATCHED')),
  notes TEXT,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. DISPATCHES TABLE (Team dispatch records & response times)
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id UUID NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  dispatched_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  responded_by TEXT,
  status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'RESPONDED', 'CLOSED'))
);

-- 4. CAMERA SETTINGS TABLE (Configurable detection thresholds & recording modes)
CREATE TABLE IF NOT EXISTS camera_settings (
  camera_id TEXT PRIMARY KEY,
  camera_name TEXT NOT NULL,
  recording_mode TEXT DEFAULT 'always' CHECK (recording_mode IN ('always', 'motion')),
  alert_thresholds JSONB DEFAULT '{"fall": 0.85, "seizure": 0.85, "heart_rate": 0.85, "respiratory": 0.85, "stroke": 0.85, "pain": 0.85}'::jsonb,
  alert_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SEED INITIAL CAMERA SETTINGS FOR 6 CAMERAS MATCHING THE DESIGN
INSERT INTO camera_settings (camera_id, camera_name) VALUES
  ('CAM 01', 'Queue Line A'),
  ('CAM 02', 'Kiosk Area'),
  ('CAM 03', 'Divider Line'),
  ('CAM 04', 'Main Intake'),
  ('CAM 05', 'Counter 04'),
  ('CAM 06', 'Triage Intake')
ON CONFLICT (camera_id) DO NOTHING;

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

ALTER TABLE emergencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Security inserts emergencies"
  ON emergencies FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'security')
  );

CREATE POLICY "All authenticated users read emergencies"
  ON emergencies FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "All authenticated users update emergencies"
  ON emergencies FOR UPDATE USING (auth.role() = 'authenticated');

ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Security manages dispatches"
  ON dispatches FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'security')
  );

ALTER TABLE camera_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Security manages camera settings"
  ON camera_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'security')
  );

-- ENABLE SUPABASE REALTIME ON emergencies
-- In Supabase dashboard: Database -> Replication -> Enable for 'emergencies' table
