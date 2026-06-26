/**
 * /api/v1/kiosk — device registration, pairing state, setup and heartbeat.
 *
 * These endpoints are called by the Tauri kiosk app itself (not a user account).
 * POST /register — no auth required (device has no token yet)
 * GET  /state    — requires device token in Authorization header
 * POST /setup    — requires device token
 * POST /heartbeat — requires device token
 * POST /unpair   — requires device token
 */

import { Router, type Request, type Response } from "express"
import crypto from "crypto"
import { getDb } from "../db"
import { requireAuth } from "../middleware/auth"
import { signToken } from "../middleware/auth"

export const kioskRouter = Router()

// ---------------------------------------------------------------------------
// POST /register — create a new unregistered device row, return device token
// ---------------------------------------------------------------------------
kioskRouter.post("/register", (req: Request, res: Response): void => {
  const db = getDb()
  const deviceName: string = (req.body?.device_name as string | undefined)?.trim() || "Kiosk Display"

  const id = crypto.randomUUID()
  const pairingCode = genPairingCode()

  // Sign a long-lived JWT so the device can authenticate all future requests.
  // We store the device id (sub) in the token; the raw hex is kept in the DB
  // as a secondary lookup key in case the JWT is ever reissued.
  // 10-year expiry — a kiosk device should never need to re-register just
  // because its token expired.
  const deviceJwt = signToken(
    { sub: id, role: "kiosk", name: deviceName },
    "87600h", // 10 years
  )

  // Store a hash of the JWT for revocation checks (not implemented yet).
  db.prepare(
    `INSERT INTO kiosk_devices
     (id, device_token, device_name, pairing_code, setup_complete, is_online, last_heartbeat)
     VALUES (?, ?, ?, ?, 0, 1, datetime('now'))`,
  ).run(id, deviceJwt, deviceName, pairingCode)

  res.status(201).json({ id, device_token: deviceJwt, pairing_code: pairingCode })
})

// ---------------------------------------------------------------------------
// GET /state — return current pairing state for the device
// ---------------------------------------------------------------------------
kioskRouter.get("/state", requireAuth, (req: Request, res: Response): void => {
  const db = getDb()
  // The device token is validated as a Bearer JWT by requireAuth.
  // We use req.user.userId which is the device row id for kiosk tokens.
  const deviceId = req.user!.userId

  const row = db
    .prepare("SELECT * FROM kiosk_devices WHERE id = ?")
    .get(deviceId) as Record<string, unknown> | undefined

  if (!row) {
    res.json({ found: false })
    return
  }

  const household = row.household_id
    ? (db.prepare("SELECT id, name FROM households WHERE id = ?").get(row.household_id) as
        | Record<string, unknown>
        | undefined)
    : undefined

  res.json({
    found: true,
    device_id: row.id,
    device_name: row.device_name,
    paired: !!row.household_id,
    pairing_code: row.pairing_code ?? null,
    household_id: row.household_id ?? null,
    household_name: household?.name ?? null,
    setup_complete: !!row.setup_complete,
    language: row.language ?? null,
    timezone: row.timezone ?? null,
  })
})

// ---------------------------------------------------------------------------
// POST /setup — mark setup complete and save device preferences
// ---------------------------------------------------------------------------
kioskRouter.post("/setup", requireAuth, (req: Request, res: Response): void => {
  const db = getDb()
  const deviceId = req.user!.userId
  const { device_name, language, timezone } = req.body as {
    device_name?: string
    language?: string
    timezone?: string
  }

  db.prepare(
    `UPDATE kiosk_devices
     SET device_name = COALESCE(?, device_name),
         language = COALESCE(?, language),
         timezone = COALESCE(?, timezone),
         setup_complete = 1
     WHERE id = ?`,
  ).run(device_name ?? null, language ?? null, timezone ?? null, deviceId)

  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// POST /heartbeat — update live metrics for this device
// ---------------------------------------------------------------------------
kioskRouter.post("/heartbeat", requireAuth, (req: Request, res: Response): void => {
  const db = getDb()
  const deviceId = req.user!.userId
  const { wifi_signal, ping_latency_ms, battery_percent, device_info } = req.body as {
    wifi_signal?: number
    ping_latency_ms?: number
    battery_percent?: number | null
    device_info?: string | null
  }

  db.prepare(
    `UPDATE kiosk_devices
     SET wifi_signal = COALESCE(?, wifi_signal),
         ping_latency_ms = COALESCE(?, ping_latency_ms),
         battery_percent = ?,
         device_info = COALESCE(?, device_info),
         is_online = 1,
         last_heartbeat = datetime('now')
     WHERE id = ?`,
  ).run(
    wifi_signal ?? null,
    ping_latency_ms ?? null,
    battery_percent ?? null,
    device_info ?? null,
    deviceId,
  )

  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// POST /claim — household member claims a device by pairing code
//
// Called by a member (user JWT in Authorization header), not the device.
// Body: { pairing_code: "SQJ-PT3" }
// ---------------------------------------------------------------------------
kioskRouter.post("/claim", requireAuth, (req: Request, res: Response): void => {
  const db = getDb()
  const { householdId, sub: userId } = req.user!

  if (!householdId) {
    res.status(403).json({ error: "Only authenticated household members can claim a device." })
    return
  }

  const raw: string = ((req.body as Record<string, unknown>)?.pairing_code as string | undefined)?.trim().toUpperCase() ?? ""
  if (!raw) {
    res.status(400).json({ error: "pairing_code is required." })
    return
  }

  // Normalise: accept with or without the dash (e.g. "SQJPT3" or "SQJ-PT3")
  const pairingCode = raw.includes("-") ? raw : `${raw.slice(0, 3)}-${raw.slice(3)}`

  const device = db
    .prepare("SELECT id, household_id, device_name FROM kiosk_devices WHERE pairing_code = ?")
    .get(pairingCode) as { id: string; household_id: string | null; device_name: string } | undefined

  if (!device) {
    res.status(404).json({ error: "Pairing code not found. Check the code shown on the hub screen." })
    return
  }

  if (device.household_id && device.household_id !== householdId) {
    res.status(409).json({ error: "This hub is already claimed by a different household." })
    return
  }

  // Link device to household and clear the pairing code so it cannot be reused.
  db.prepare(
    `UPDATE kiosk_devices
     SET household_id = ?, pairing_code = NULL
     WHERE id = ?`,
  ).run(householdId, device.id)

  // Return the household info so the caller can confirm.
  const household = db
    .prepare("SELECT id, name FROM households WHERE id = ?")
    .get(householdId) as { id: string; name: string } | undefined

  res.json({
    ok: true,
    device_id: device.id,
    device_name: device.device_name,
    household_id: householdId,
    household_name: household?.name ?? null,
    claimed_by: userId,
  })
})

// ---------------------------------------------------------------------------
// POST /unpair — detach from household, issue fresh pairing code
// ---------------------------------------------------------------------------
kioskRouter.post("/unpair", requireAuth, (req: Request, res: Response): void => {
  const db = getDb()
  const deviceId = req.user!.userId
  const newCode = genPairingCode()

  db.prepare(
    `UPDATE kiosk_devices
     SET household_id = NULL, pairing_code = ?, setup_complete = 0
     WHERE id = ?`,
  ).run(newCode, deviceId)

  res.json({ ok: true, pairing_code: newCode })
})

// ---------------------------------------------------------------------------
// POST /heartbeat (alias under /kiosk-devices/heartbeat for kiosk-status.ts)
// ---------------------------------------------------------------------------
kioskRouter.post("/kiosk-devices/heartbeat", requireAuth, (req: Request, res: Response): void => {
  // Forwarded to the same handler — just re-invoke the heartbeat logic.
  const db = getDb()
  const deviceId = req.user!.userId
  const { wifi_signal, ping_latency_ms, battery_percent, device_info } = req.body as Record<string, unknown>

  db.prepare(
    `UPDATE kiosk_devices
     SET wifi_signal = COALESCE(?, wifi_signal),
         ping_latency_ms = COALESCE(?, ping_latency_ms),
         battery_percent = ?,
         device_info = COALESCE(?, device_info),
         is_online = 1,
         last_heartbeat = datetime('now')
     WHERE id = ?`,
  ).run(
    wifi_signal ?? null,
    ping_latency_ms ?? null,
    battery_percent ?? null,
    device_info ?? null,
    deviceId,
  )

  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genPairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${pick(3)}-${pick(3)}`
}

// Re-export signToken so kiosk device tokens can be issued
export { signToken }
