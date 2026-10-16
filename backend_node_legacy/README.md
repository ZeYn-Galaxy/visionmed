# VisionMed - Backend Architecture & Documentation

## Overview
VisionMed uses a lightweight, serverless backend architecture centered around Supabase (PostgreSQL, Auth, Realtime) and Next.js 14 API Route Handlers. All compute-heavy Computer Vision tasks run on the client side, keeping backend infrastructure costs near zero.

## Key Services
1. **Supabase PostgreSQL & Realtime**:
   - `profiles`: Role storage (`security` vs `receptionist`).
   - `emergencies`: Incident and alert records with CV confidence scores and symptoms.
   - `dispatches`: Response tracking and resolution statuses.
   - `camera_settings`: Camera metadata and confidence threshold overrides.
   - Supabase Realtime notifies receptionist clients immediately when an emergency is inserted.

2. **Next.js API Routes** (served from `frontend/app/api` or standalone microservice):
   - `POST /api/emergency`: Records new detected emergency and triggers Twilio SMS.
   - `GET /api/incidents`: Retrieves incident logs with filters (camera, status, timestamp).
   - `PATCH /api/incidents`: Updates incident status and staff annotations.
   - `POST /api/dispatch`: Creates and assigns a medical response team.

3. **Twilio SMS Gateway**:
   - Server-side only alert dispatch to on-duty staff.

## Database Setup
Run `schema.sql` in your Supabase SQL Editor.
