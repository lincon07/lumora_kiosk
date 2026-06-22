-- Create kiosk_devices table to track kiosk status in realtime
-- Each kiosk reports its connectivity, ping, WiFi signal, and battery status periodically

CREATE TABLE IF NOT EXISTS kiosk_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Kiosk Display',
  
  -- Network metrics
  wifi_signal INTEGER, -- -30 to -90 dBm
  ping_latency_ms INTEGER NOT NULL DEFAULT 0, -- ms round-trip to Supabase
  is_online BOOLEAN NOT NULL DEFAULT true,
  
  -- Device info
  battery_percent INTEGER, -- 0-100
  device_info JSONB, -- platform, userAgent, timezone
  
  -- Timestamps
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique per household (one device record per kiosk)
  UNIQUE(household_id, device_name)
);

-- Enable RLS
ALTER TABLE kiosk_devices ENABLE ROW LEVEL SECURITY;

-- Only members of the household can view their kiosk status
CREATE POLICY "kiosk_devices_select_by_household" ON kiosk_devices
  FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM members WHERE user_id = auth.uid()
    )
  );

-- Only the app/API can insert/update kiosk status
-- In production, restrict this to the kiosk service account
CREATE POLICY "kiosk_devices_insert" ON kiosk_devices
  FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "kiosk_devices_update" ON kiosk_devices
  FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM members WHERE user_id = auth.uid()
    )
  );

-- Index for efficient realtime subscriptions
CREATE INDEX idx_kiosk_devices_household_id ON kiosk_devices(household_id);
CREATE INDEX idx_kiosk_devices_updated_at ON kiosk_devices(updated_at DESC);

-- Auto-update the updated_at timestamp
CREATE TRIGGER update_kiosk_devices_updated_at
BEFORE UPDATE ON kiosk_devices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
