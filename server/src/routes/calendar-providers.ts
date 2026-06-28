// ---------------------------------------------------------------------------
// /api/v1/calendar-providers — manage connected Google / Microsoft calendars
//
// iOS sends the PKCE auth code to POST /:provider/exchange. The server does
// the token exchange using the client secret (never exposed to the frontend).
// ---------------------------------------------------------------------------

import { Router, type Request, type Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { getDb } from "../db"
import { requireAuth, type AuthRequest } from "../middleware/auth"
import { syncHousehold } from "../services/calendar-sync"

const GOOGLE_CLIENT_ID     = process.env.VITE_GOOGLE_CLIENT_ID ?? ""
const GOOGLE_CLIENT_SECRET = process.env.VITE_GOOGLE_CLIENT_SECRET ?? ""
const MICROSOFT_CLIENT_ID     = process.env.VITE_MICROSOFT_CLIENT_ID ?? ""
const MICROSOFT_CLIENT_SECRET = process.env.VITE_MICROSOFT_CLIENT_SECRET ?? ""
const MICROSOFT_TENANT_ID     = process.env.VITE_MICROSOFT_TENANT_ID ?? "common"

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
// POST /api/v1/calendar-providers/:provider/exchange
// iOS sends { code, code_verifier, redirect_uri }.
// Server exchanges for tokens using the client secret, then stores them.
router.post("/:provider/exchange", async (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const { provider } = req.params

  if (!["google", "microsoft"].includes(provider)) {
    res.status(400).json({ error: "Unsupported provider." })
    return
  }

  const { code, code_verifier, redirect_uri } = req.body as {
    code?: string
    code_verifier?: string
    redirect_uri?: string
  }

  if (!code || !code_verifier || !redirect_uri) {
    res.status(400).json({ error: "code, code_verifier, and redirect_uri are required." })
    return
  }

  try {
    type TokenJson = {
      access_token: string
      refresh_token?: string
      expires_in?: number
      id_token?: string
      error_description?: string
    }

    let tokenRes: Response | globalThis.Response
    if (provider === "google") {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        res.status(500).json({ error: "Google credentials not configured on server." })
        return
      }
      tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri,
          grant_type: "authorization_code",
          code_verifier,
        }),
      })
    } else {
      if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        res.status(500).json({ error: "Microsoft credentials not configured on server." })
        return
      }
      tokenRes = await fetch(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            redirect_uri,
            grant_type: "authorization_code",
            code_verifier,
            scope: "Calendars.Read offline_access openid email",
          }),
        },
      )
    }

    const json = (await (tokenRes as globalThis.Response).json()) as TokenJson
    if (!(tokenRes as globalThis.Response).ok) {
      res.status(400).json({ error: json.error_description ?? "Token exchange failed." })
      return
    }

    // Decode email from id_token if present.
    let email: string | null = null
    if (json.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(json.id_token.split(".")[1], "base64").toString("utf8"),
        ) as { email?: string }
        email = payload.email ?? null
      } catch { /* ignore */ }
    }

    const expiresAt = json.expires_in
      ? Math.floor(Date.now() / 1000) + json.expires_in - 60
      : null

    // Upsert into calendar_providers.
    const db = getDb()
    const existing = db
      .prepare("SELECT id FROM calendar_providers WHERE household_id=? AND provider=?")
      .get(householdId, provider) as { id: string } | undefined

    if (existing) {
      db.prepare(
        `UPDATE calendar_providers SET access_token=?, refresh_token=?, expires_at=?, email=? WHERE id=?`,
      ).run(json.access_token, json.refresh_token ?? null, expiresAt, email, existing.id)
    } else {
      db.prepare(
        `INSERT INTO calendar_providers (id, household_id, provider, access_token, refresh_token, expires_at, email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(uuidv4(), householdId, provider, json.access_token, json.refresh_token ?? null, expiresAt, email)
    }

    void syncHousehold(householdId).catch(() => {})

    const row = db
      .prepare("SELECT * FROM calendar_providers WHERE household_id=? AND provider=?")
      .get(householdId, provider) as { provider: string; email: string | null; connected_at: string }

    res.status(existing ? 200 : 201).json({
      provider: row.provider,
      email: row.email,
      connectedAt: row.connected_at,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error."
    res.status(500).json({ error: msg })
  }
})

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
