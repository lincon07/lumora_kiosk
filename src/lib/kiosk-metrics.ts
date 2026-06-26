// ---------------------------------------------------------------------------
// kiosk-metrics.ts
//
// Device metric collection for kiosk heartbeats.
// Previously pinged Supabase to measure latency — now pings the local server.
// ---------------------------------------------------------------------------

import { LOCAL_API_BASE } from "./local-api"

export type KioskMetrics = {
  wifi: number     // estimated dBm (-30 strong .. -90 weak)
  ping: number     // ms round-trip to the local server
  battery: number | null
  deviceInfo: string
}

async function estimateWifi(): Promise<number> {
  try {
    const start = performance.now()
    await fetch(`${LOCAL_API_BASE}/health`, { method: "HEAD" })
    const latency = performance.now() - start
    if (latency < 5)   return -30
    if (latency < 20)  return -50
    if (latency < 60)  return -65
    return -80
  } catch {
    return -75
  }
}

async function measurePing(): Promise<number> {
  try {
    const start = performance.now()
    await fetch(`${LOCAL_API_BASE}/health`, { method: "HEAD" })
    return Math.round(performance.now() - start)
  } catch {
    return 0
  }
}

async function readBattery(): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const battery = await (navigator as any).getBattery?.()
    return battery ? Math.round(battery.level * 100) : null
  } catch {
    return null
  }
}

export async function collectKioskMetrics(): Promise<KioskMetrics> {
  const [wifi, ping, battery] = await Promise.all([estimateWifi(), measurePing(), readBattery()])
  const deviceInfo = JSON.stringify({
    platform: typeof navigator !== "undefined" ? navigator.platform : "Unknown",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.substring(0, 100) : "Unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  return { wifi, ping, battery, deviceInfo }
}
