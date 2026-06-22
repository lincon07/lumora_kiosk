"use client"

import { supabase } from "./supabase"

/**
 * Device metric collection for kiosk heartbeats.
 *
 * Browsers don't expose raw WiFi signal, so we estimate from network latency.
 * In a Tauri build these could be swapped for real system APIs later.
 */

export type KioskMetrics = {
  wifi: number // estimated dBm (-30 strong .. -90 weak)
  ping: number // ms latency to Supabase
  battery: number | null // 0-100, if the Battery API is available
  deviceInfo: string // JSON string: platform / ua / timezone
}

async function estimateWifi(): Promise<number> {
  try {
    const start = performance.now()
    await fetch("https://www.gstatic.com/generate_204", { method: "HEAD", mode: "no-cors" })
    const latency = performance.now() - start
    if (latency < 50) return -30
    if (latency < 150) return -60
    return -90
  } catch {
    return -75
  }
}

async function measurePing(): Promise<number> {
  try {
    const start = performance.now()
    await supabase.from("kiosk_devices").select("id").limit(1)
    return Math.round(performance.now() - start)
  } catch {
    return 0
  }
}

async function readBattery(): Promise<number | null> {
  try {
    // @ts-ignore - Battery API isn't in the standard lib types
    const battery = await navigator.getBattery?.()
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
