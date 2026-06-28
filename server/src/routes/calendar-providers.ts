// ---------------------------------------------------------------------------
// /api/v1/calendar-providers — manage connected Google / Microsoft calendars
//
// iOS completes PKCE OAuth on-device, then POSTs the resulting tokens here.
// The server stores them and owns all future syncing.
// ---------------------------------------------------------------------------

import { Router, type Request, type Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { getDb } from "../db"
import { requireAuth, type AuthRequest } from "../middleware/auth"
import { syncHousehold } from "../services/calendar-sync"

const router = Router()
router.use(requireAuth)

type ProviderRow = {
  id: string
  household_id: string
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: number | null
  email: string | null
  connected_at: string
}

function rowToPublic(r: ProviderRow) {
  return {
    provider: r.provider,
    email: r.email,
    connectedAt: r.connected_at,
  }
}

// GET /api/v1/calendar-providers
// Returns the list of connected providers (no tokens exposed).
router.get("/", (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const rows = getDb()
    .prepare("SELECT * FROM calendar_providers WHERE household_id = ?")
    .all(householdId) as ProviderRow[]
  res.json(rows.map(rowToPublic))
})

// POST /api/v1/calendar-providers/:provider/tokens
// iOS sends the tokens it obtained via PKCE. Body:
//   { access_token, refresh_token?, expires_at?, email? }
router.post("/:provider/tokens", (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const { provider } = req.params

  if (!["google", "microsoft"].includes(provider)) {
    res.status(400).json({ error: "Unsupported provider." })
    return
  }

  const { access_token, refresh_token, expires_at, email } = req.body as {
    access_token?: string
    refresh_token?: string
    expires_at?: number
    email?: string
  }

  if (!access_token) {
    res.status(400).json({ error: "access_token is required." })
    return
  }

  const db = getDb()
  const existing = db
    .prepare("SELECT id FROM calendar_providers WHERE household_id=? AND provider=?")
    .get(householdId, provider) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE calendar_providers
       SET access_token=?, refresh_token=?, expires_at=?, email=?
       WHERE id=?`,
    ).run(access_token, refresh_token ?? null, expires_at ?? null, email ?? null, existing.id)
  } else {
    db.prepare(
      `INSERT INTO calendar_providers (id, household_id, provider, access_token, refresh_token, expires_at, email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuidv4(),
      householdId,
      provider,
      access_token,
      refresh_token ?? null,
      expires_at ?? null,
      email ?? null,
    )
  }

  // Kick off an immediate sync for this household (non-blocking).
  void syncHousehold(householdId).catch(() => {})

  const row = db
    .prepare("SELECT * FROM calendar_providers WHERE household_id=? AND provider=?")
    .get(householdId, provider) as ProviderRow

  res.status(existing ? 200 : 201).json(rowToPublic(row))
})

// DELETE /api/v1/calendar-providers/:provider
// Disconnects a provider and removes its events from the events table.
router.delete("/:provider", (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const { provider } = req.params

  const db = getDb()
  db.prepare(
    "DELETE FROM events WHERE household_id=? AND source=?",
  ).run(householdId, provider)
  db.prepare(
    "DELETE FROM calendar_providers WHERE household_id=? AND provider=?",
  ).run(householdId, provider)

  res.status(204).end()
})

// POST /api/v1/calendar-providers/sync
// Manual sync trigger — iOS can call this after reconnecting or on pull-to-refresh.
router.post("/sync", (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  void syncHousehold(householdId).catch(() => {})
  res.json({ ok: true })
})

export { router as calendarProvidersRouter }
