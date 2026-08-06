-- Andrea Aan De Top - Database Schema
-- Run this in your Supabase SQL Editor

-- Trips (vakanties) table
CREATE TABLE trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Vakantie',
  description TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities table
CREATE TABLE activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Activiteit',
  sport TEXT DEFAULT 'cycling',
  date TIMESTAMPTZ,
  distance REAL,
  duration REAL,
  elevation_gain REAL,
  elevation_loss REAL,
  avg_speed REAL,
  max_speed REAL,
  avg_hr INTEGER,
  max_hr INTEGER,
  avg_cadence INTEGER,
  avg_power INTEGER,
  file_name TEXT,
  route_data JSONB,
  climbs JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_date ON activities(date DESC);
CREATE INDEX idx_activities_trip ON activities(trip_id);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all trips" ON trips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all activities" ON activities FOR ALL USING (true) WITH CHECK (true);
