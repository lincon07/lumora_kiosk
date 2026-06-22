"use client"

import { supabase } from "./supabase"

/**
 * Kiosk pairing session.
 *
 * A kiosk is NOT a user account. It is a physical device that holds a secret
 * `device_token` (persisted in localStorage). The token is created once via the
 * `kiosk_register` RPC and from then on identifies this device to the backend.
 *
 * Lifecycle:
 *  - unregistered  -> no token stored. Call `ensureRegistered()` to create one.
 *  - unpaired      -> token exists, but no household claimed it yet. The screen
 *                     shows a pairing code / QR for a family member to scan.
 *  - paired        -> a household member claimed the code via the mobile app.
 *                     `kiosk_fetch_all` now returns that household's data.
 *
 * All access goes through SECURITY DEFINER RPCs (see migration
 * `kiosk_pairing_rpcs`); the device never authenticates as a Supabase user.
 */

const TOKEN_KEY = "lumora.kiosk.deviceToken"
const NAME_KEY = "lumora.kiosk.deviceName"

export type KioskState = {
  found: boolean
  deviceId: string | null
  deviceName: string
  paired: boolean
  pairingCode: string | null
  householdId: string | null
  householdName: string | null
}

const UNPAIRED: KioskState = {
  found: false,
  deviceId: null,
  deviceName: "Kiosk Display",
  paired: false,
  pairingCode: null,
  householdId: null,
  householdName: null,
}

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setDeviceToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable */
  }
}

function clearDeviceToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* noop */
  }
}

export function getDeviceName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "Kiosk Display"
  } catch {
    return "Kiosk Display"
  }
}

export function setDeviceName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* noop */
  }
}

/**
 * Ensure this device has a token. Registers a fresh unclaimed device the first
 * time the kiosk is ever launched, then returns the token.
 */
export async function ensureRegistered(deviceName?: string): Promise<string | null> {
  const existing = getDeviceToken()
  if (existing) return existing

  const name = deviceName || getDeviceName()
  const { data, error } = await supabase.rpc("kiosk_register", { p_device_name: name })
  if (error) {
    console.error("[v0] kiosk_register failed:", error.message)
    return null
  }
  const token = (data as { device_token?: string })?.device_token ?? null
  if (token) {
    setDeviceToken(token)
    setDeviceName(name)
  }
  return token
}

/** Poll the current claim/pairing state for this device. */
export async function fetchKioskState(): Promise<KioskState> {
  const token = getDeviceToken()
  if (!token) return UNPAIRED

  const { data, error } = await supabase.rpc("kiosk_get_state", { p_device_token: token })
  if (error) {
    console.error("[v0] kiosk_get_state failed:", error.message)
    return UNPAIRED
  }

  const row = data as {
    found?: boolean
    device_id?: string
    device_name?: string
    paired?: boolean
    pairing_code?: string
    household_id?: string
    household_name?: string
  }

  // Token not found server-side (device row deleted) -> reset so we re-register.
  if (!row?.found) {
    clearDeviceToken()
    return UNPAIRED
  }

  return {
    found: true,
    deviceId: row.device_id ?? null,
    deviceName: row.device_name ?? "Kiosk Display",
    paired: !!row.paired,
    pairingCode: row.pairing_code ?? null,
    householdId: row.household_id ?? null,
    householdName: row.household_name ?? null,
  }
}

/** Report live device metrics to the backend (heartbeat). */
export async function sendHeartbeat(metrics: {
  wifi: number
  ping: number
  battery?: number | null
  deviceInfo?: string | null
}): Promise<void> {
  const token = getDeviceToken()
  if (!token) return
  const { error } = await supabase.rpc("kiosk_heartbeat", {
    p_device_token: token,
    p_wifi: metrics.wifi,
    p_ping: metrics.ping,
    p_battery: metrics.battery ?? null,
    p_device_info: metrics.deviceInfo ?? null,
  })
  if (error) console.error("[v0] kiosk_heartbeat failed:", error.message)
}

/**
 * Unpair this kiosk from its household (kiosk-initiated). The device keeps its
 * token and is issued a fresh pairing code, ready to be claimed by a different
 * household.
 */
export async function unpairKiosk(): Promise<string | null> {
  const token = getDeviceToken()
  if (!token) return null
  const { data, error } = await supabase.rpc("kiosk_unclaim", { p_device_token: token })
  if (error) {
    console.error("[v0] kiosk_unclaim failed:", error.message)
    return null
  }
  return (data as { pairing_code?: string })?.pairing_code ?? null
}

/** Build the deep-link / QR payload a family member scans to claim this kiosk. */
export function buildPairingPayload(pairingCode: string): string {
  // The mobile app handles this scheme and calls kiosk_claim(code, householdId).
  return `lumora://claim-kiosk?code=${encodeURIComponent(pairingCode)}`
}
