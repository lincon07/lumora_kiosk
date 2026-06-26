// ---------------------------------------------------------------------------
// kiosk-status.ts
//
// Publishes periodic heartbeats for this kiosk device to the local Express
// server at POST /api/v1/kiosk-devices/heartbeat. No Supabase dependency.
//
// The liveSocket will relay kiosk_devices:updated events to store.tsx so
// the settings view sees up-to-date device status without polling.
// ---------------------------------------------------------------------------

import { LOCAL_API_BASE, tokenStore } from "./local-api"

export interface KioskDeviceStatus {
  id: string
  household_id: string
  device_name: string
  wifi_signal: number      // estimated dBm  (-30 strong → -90 weak)
  ping_latency_ms: number  // round-trip to local server in ms
  battery_percent?: number
  device_info?: string
  last_heartbeat: string
  is_online: boolean
}

let statusInterval: NodeJS.Timeout | null = null
let currentHouseholdId: string | null = null
let currentDeviceName: string | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startKioskStatusTracking(
  householdId: string,
  deviceName = "Kiosk Display",
) {
  currentHouseholdId = householdId
  currentDeviceName = deviceName

  await publishKioskStatus(householdId, deviceName)

  if (statusInterval) clearInterval(statusInterval)
  statusInterval = setInterval(() => {
    if (currentHouseholdId && currentDeviceName) {
      publishKioskStatus(currentHouseholdId, currentDeviceName).catch((err) =>
        console.error("[kiosk-status] Failed to publish:", err),
      )
    }
  }, 30_000)
}

export function stopKioskStatusTracking() {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
  currentHouseholdId = null
  currentDeviceName = null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function publishKioskStatus(householdId: string, deviceName: string) {
  const metrics = await getKioskMetrics()
  const token = tokenStore.get()
  if (!token) return

  try {
    await fetch(`${LOCAL_API_BASE}/api/v1/kiosk-devices/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        household_id: householdId,
        device_name: deviceName,
        ...metrics,
      }),
    })
  } catch (err) {
    console.error("[kiosk-status] heartbeat failed:", err)
  }
}

async function getKioskMetrics(): Promise<
  Omit<KioskDeviceStatus, "id" | "household_id" | "device_name">
> {
  const wifiSignal = await getWiFiSignal()
  const pingLatency = await measurePing()
  const batteryPercent = await getBatteryPercent()

  return {
    wifi_signal: wifiSignal,
    ping_latency_ms: pingLatency,
    battery_percent: batteryPercent,
    device_info: JSON.stringify({
      platform: navigator.platform,
      userAgent: navigator.userAgent.substring(0, 100),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    last_heartbeat: new Date().toISOString(),
    is_online: navigator.onLine,
  }
}

async function getWiFiSignal(): Promise<number> {
  try {
    const t0 = performance.now()
    await fetch(`${LOCAL_API_BASE}/health`, { method: "HEAD" })
    const ms = performance.now() - t0
    if (ms < 5) return -30
    if (ms < 20) return -50
    if (ms < 60) return -65
    return -80
  } catch {
    return -75
  }
}

async function measurePing(): Promise<number> {
  try {
    const t0 = performance.now()
    await fetch(`${LOCAL_API_BASE}/health`, { method: "HEAD" })
    return Math.round(performance.now() - t0)
  } catch {
    return 0
  }
}

async function getBatteryPercent(): Promise<number | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const battery = await (navigator as any).getBattery?.()
    return battery ? Math.round(battery.level * 100) : undefined
  } catch {
    return undefined
  }
}
