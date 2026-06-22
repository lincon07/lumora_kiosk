import { supabase } from "./supabase"

export interface KioskDeviceStatus {
  id: string
  household_id: string
  device_name: string
  wifi_signal: number // -30 to -90 dBm
  ping_latency_ms: number
  battery_percent?: number
  device_info?: string
  last_heartbeat: string
  is_online: boolean
}

let statusInterval: NodeJS.Timeout | null = null
let currentHouseholdId: string | null = null

export async function startKioskStatusTracking(householdId: string, deviceName: string = "Kiosk Display") {
  currentHouseholdId = householdId

  // Initial publish
  await publishKioskStatus(householdId, deviceName)

  // Publish every 30 seconds
  if (statusInterval) clearInterval(statusInterval)
  statusInterval = setInterval(() => {
    if (currentHouseholdId) {
      publishKioskStatus(currentHouseholdId, deviceName).catch((err) =>
        console.error("[Kiosk] Failed to publish status:", err)
      )
    }
  }, 30000)
}

export async function stopKioskStatusTracking() {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
  currentHouseholdId = null
}

async function publishKioskStatus(householdId: string, deviceName: string) {
  try {
    const status = await getKioskMetrics()

    // Upsert into kiosk_devices table
    const { error } = await supabase.from("kiosk_devices").upsert(
      {
        household_id: householdId,
        device_name: deviceName,
        ...status,
      },
      { onConflict: "household_id,device_name" }
    )

    if (error) {
      console.error("[Kiosk] Supabase upsert error:", error)
    }
  } catch (err) {
    console.error("[Kiosk] Error publishing status:", err)
  }
}

async function getKioskMetrics(): Promise<Omit<KioskDeviceStatus, "id" | "household_id" | "device_name">> {
  // Get WiFi signal strength (simplified - browser doesn't have direct access)
  // We'll use a heuristic based on connection latency
  const wifiSignal = await getWiFiSignal()

  // Get ping latency to Supabase
  const pingLatency = await measurePing()

  // Get battery info if available (PWA)
  const batteryPercent = await getBatteryPercent()

  // Get device info
  const deviceInfo = {
    platform: navigator.platform,
    userAgent: navigator.userAgent.substring(0, 100),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }

  return {
    wifi_signal: wifiSignal,
    ping_latency_ms: pingLatency,
    battery_percent: batteryPercent,
    device_info: JSON.stringify(deviceInfo),
    last_heartbeat: new Date().toISOString(),
    is_online: navigator.onLine,
  }
}

async function getWiFiSignal(): Promise<number> {
  try {
    // Browser doesn't have direct WiFi signal API, estimate based on connection
    // In a Tauri app, you could use actual system APIs
    const startTime = performance.now()
    await fetch("https://www.gstatic.com/generate_204", { method: "HEAD", mode: "no-cors" })
    const latency = performance.now() - startTime

    // Rough estimate: -30 to -90 dBm based on latency
    // < 50ms = -30dBm (strong), 50-150ms = -60dBm (good), > 150ms = -90dBm (weak)
    if (latency < 50) return -30
    if (latency < 150) return -60
    return -90
  } catch {
    return -75 // Default to medium signal on error
  }
}

async function measurePing(): Promise<number> {
  try {
    const startTime = performance.now()
    await supabase.from("households").select("id").limit(1)
    const latency = Math.round(performance.now() - startTime)
    return latency
  } catch {
    return 0
  }
}

async function getBatteryPercent(): Promise<number | undefined> {
  try {
    // @ts-ignore - Battery API not in standard types
    const battery = await navigator.getBattery?.()
    return battery ? Math.round(battery.level * 100) : undefined
  } catch {
    return undefined
  }
}

// Subscribe to realtime updates for status changes
export function subscribeToKioskStatus(
  householdId: string,
  callback: (status: KioskDeviceStatus) => void
) {
  return supabase
    .channel(`kiosk-status:${householdId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "kiosk_devices",
        filter: `household_id=eq.${householdId}`,
      },
      (payload: any) => {
        callback(payload.new as KioskDeviceStatus)
      }
    )
    .subscribe()
}
