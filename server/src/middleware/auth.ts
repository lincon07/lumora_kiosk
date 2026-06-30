/**
 * auth.ts — JWT authentication middleware for Express routes and Socket.IO.
 *
 * Two token kinds are accepted:
 *  - Device tokens (kiosk/hub):  HS256, signed with on-disk secret at ~/.lumora/.secret
 *  - User tokens (Supabase):     HS256, signed by Supabase with SUPABASE_JWT_SECRET
 *
 * Detection: Supabase JWTs have iss="https://<ref>.supabase.co/auth/v1".
 * Device tokens have no iss field (or iss set to our own server).
 */

import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import type { Socket } from "socket.io"
import { getOrCreateSecret, getDb } from "../db"
import type { JwtPayload, ServerToClientEvents, ClientToServerEvents, SocketData } from "../types"
import { verifySupabaseToken } from "../lib/supabase"

export type AuthRequest = Request & {
  user: JwtPayload & { userId: string }
}

// ---------------------------------------------------------------------------
// Device token helpers (kiosk / hub — unchanged)
// ---------------------------------------------------------------------------

/** Sign a new device access token. Pass expiresIn to override default 24h. */
export function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresIn: string = "24h",
): string {
  return jwt.sign(payload, getOrCreateSecret(), {
    algorithm: "HS256",
    expiresIn,
  } as jwt.SignOptions)
}

/** Sign a device refresh token (30d expiry). */
export function signRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, getOrCreateSecret(), {
    algorithm: "HS256",
    expiresIn: "30d",
  } as jwt.SignOptions)
}

/** Verify and decode a device token. Throws on invalid/expired tokens. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getOrCreateSecret(), {
    algorithms: ["HS256"],
  }) as JwtPayload
}

// ---------------------------------------------------------------------------
// Token kind detection
// ---------------------------------------------------------------------------

function isSupabaseToken(token: string): boolean {
  try {
    const raw = jwt.decode(token) as Record<string, unknown> | null
    const iss = raw?.iss as string | undefined
    return typeof iss === "string" && iss.includes("supabase")
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * requireAuth — resolves req.user from either a Supabase user token or a
 * device (kiosk/hub) token. Responds 401 on missing/invalid tokens.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header." })
    return
  }
  const token = header.slice(7).trim()

  if (isSupabaseToken(token)) {
    // Async path — verify Supabase JWT
    void verifySupabaseToken(token).then((payload) => {
      if (!payload) {
        res.status(401).json({ error: "Invalid or expired Supabase token." })
        return
      }
      // Look up local user record by supabase_id to get householdId
      const db = getDb()
      const row = db
        .prepare("SELECT id, household_id, name, email FROM users WHERE supabase_id = ?")
        .get(payload.sub) as { id: string; household_id: string; name: string; email: string } | undefined

      ;(req as AuthRequest).user = {
        sub:         row?.id ?? payload.sub,
        userId:      row?.id ?? payload.sub,
        householdId: row?.household_id,
        email:       row?.email ?? payload.email,
        name:        row?.name ?? payload.user_metadata?.name ?? payload.user_metadata?.full_name,
        role:        "member",
      }
      next()
    })
    return
  }

  // Device token path (kiosk / hub — synchronous)
  try {
    const payload = verifyToken(token)

    if (payload.role === "kiosk" && !payload.householdId) {
      const row = getDb()
        .prepare("SELECT household_id FROM kiosk_devices WHERE id = ?")
        .get(payload.sub) as { household_id: string | null } | undefined
      if (row?.household_id) payload.householdId = row.household_id
    }

    ;(req as AuthRequest).user = { ...payload, userId: payload.sub }
    next()
  } catch (err) {
    const msg = err instanceof jwt.TokenExpiredError ? "Token expired." : "Invalid token."
    res.status(401).json({ error: msg })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  next()
}

// ---------------------------------------------------------------------------
// Socket.IO middleware
// ---------------------------------------------------------------------------

type AuthenticatedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

export function socketAuth(
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
): void {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    next(new Error("UNAUTHORIZED: No token provided."))
    return
  }

  if (isSupabaseToken(token)) {
    void verifySupabaseToken(token).then((payload) => {
      if (!payload) { next(new Error("UNAUTHORIZED: Invalid Supabase token.")); return }
      const db = getDb()
      const row = db
        .prepare("SELECT id, household_id, name, email FROM users WHERE supabase_id = ?")
        .get(payload.sub) as { id: string; household_id: string; name: string; email: string } | undefined

      socket.data.userId      = row?.id ?? payload.sub
      socket.data.householdId = row?.household_id ?? ""
      socket.data.email       = row?.email ?? payload.email ?? ""
      socket.data.name        = row?.name ?? payload.user_metadata?.name ?? ""
      next()
    })
    return
  }

  try {
    const payload = verifyToken(token)
    let householdId = payload.householdId ?? ""
    if (payload.role === "kiosk" && !householdId) {
      const row = getDb()
        .prepare("SELECT household_id FROM kiosk_devices WHERE id = ?")
        .get(payload.sub) as { household_id: string | null } | undefined
      householdId = row?.household_id ?? ""
    }
    socket.data.userId      = payload.sub
    socket.data.householdId = householdId
    socket.data.email       = payload.email ?? ""
    socket.data.name        = payload.name ?? ""
    next()
  } catch (err) {
    const msg = err instanceof jwt.TokenExpiredError ? "EXPIRED" : "UNAUTHORIZED"
    next(new Error(`${msg}: ${(err as Error).message}`))
  }
}
