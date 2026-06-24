"use client"

/**
 * WiFi service abstraction.
 *
 * The Lumora setup wizard shows a fully custom WiFi UI — users never see the
 * Ubuntu / NetworkManager system dialogs. The actual network management runs in
 * the Tauri Rust backend (see `wifi_scan` / `wifi_connect` / `wifi_status` in
 * `src-tauri/src/lib.rs`), which will talk to NetworkManager on Linux.
 *
 * This module is the single boundary the UI uses. Right now the Rust commands
 * are stubs, so:
 *   - In the native shell with no backend yet, `scanNetworks()` returns [] and
 *     `connect()` reports a not-implemented failure.
 *   - In the browser/dev preview (no Tauri), we serve a small mock network list
 *     so the wizard flow can be designed and exercised end-to-end.
 *
 * When the NetworkManager implementation lands in Rust, nothing here or in the
 * UI needs to change.
 */

export type WifiSecurity = "open" | "wpa" | "wep"

export type WifiNetwork = {
  ssid: string
  /** Signal strength as a percentage (0-100). */
  signal: number
  security: WifiSecurity
  /** Whether the kiosk is currently connected to this network. */
  connected: boolean
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core")
  return mod.invoke<T>(cmd, args)
}

// Mock list used only in the browser/dev preview so the wizard is exercisable.
const MOCK_NETWORKS: WifiNetwork[] = [
  { ssid: "Lumora Home", signal: 92, security: "wpa", connected: false },
  { ssid: "Living Room 5G", signal: 78, security: "wpa", connected: false },
  { ssid: "Pek Family", signal: 64, security: "wpa", connected: false },
  { ssid: "Guest Network", signal: 51, security: "open", connected: false },
  { ssid: "Neighbor_2.4", signal: 28, security: "wep", connected: false },
]

let _connectedSsid: string | null = null

/** Scan for nearby WiFi networks, sorted strongest-first. */
export async function scanNetworks(): Promise<WifiNetwork[]> {
  if (isTauri()) {
    try {
      const nets = await invoke<WifiNetwork[]>("wifi_scan")
      return [...nets].sort((a, b) => b.signal - a.signal)
    } catch (err) {
      console.error("[v0] wifi-service: scan failed:", err)
      return []
    }
  }
  // Dev fallback — simulate a short scan delay then return mock networks.
  await new Promise((r) => setTimeout(r, 900))
  return MOCK_NETWORKS.map((n) => ({ ...n, connected: n.ssid === _connectedSsid }))
}

/**
 * Connect to a network. Returns true on success.
 *
 * In dev (no Tauri) this always "succeeds" after a short delay so the wizard
 * can advance; on a real device it delegates to NetworkManager via Rust.
 */
export async function connect(ssid: string, password?: string): Promise<boolean> {
  if (isTauri()) {
    return invoke<boolean>("wifi_connect", { ssid, password: password ?? null })
  }
  await new Promise((r) => setTimeout(r, 1200))
  _connectedSsid = ssid
  return true
}

/** Return the SSID of the currently connected network, if any. */
export async function currentNetwork(): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string | null>("wifi_status")
    } catch {
      return null
    }
  }
  return _connectedSsid
}

/** Whether a security type requires a password. */
export function needsPassword(security: WifiSecurity): boolean {
  return security !== "open"
}
