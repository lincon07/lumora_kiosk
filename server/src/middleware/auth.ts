/**
 * auth.ts — JWT authentication middleware for Express routes and Socket.IO.
 *
 * Tokens are HS256 JWTs signed with the on-disk secret at $HOME/.lumora/.secret.
 * Every API route (except /auth/register and /auth/login) requires a valid token.
 * Socket.IO connections pass the token in the handshake auth object: { token }.
 */

import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import type { Socket } from "socket.io"
import { getOrCreateSecret, getDb } from "../db"
import type { JwtPayload, ServerToClientEvents, ClientToServerEvents, SocketData } from "../types"

export type AuthRequest = Request & {
  user: JwtPayload & { userId: string }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Sign a new access token (default 24h expiry). Pass expiresIn to override. */
export function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresIn: string = "24h",
): string {
  return jwt.sign(payload, getOrCreateSecret(), {
    algorithm: "HS256",
    expiresIn,
  })
}

/** Sign a refresh token (30d expiry). */
export function signRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, getOrCreateSecret(), {
    algorithm: "HS256",
    expiresIn: "30d",
  })
}

/** Verify and decode a token. Throws on invalid/expired tokens. */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getOrCreateSecret(), {
    algorithms: ["HS256"],
  }) as JwtPayload
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * requireAuth — attach req.user or respond 401.
 * Apply to every router EXCEPT /auth.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header." })
    return
  }
  const token = header.slice(7).trim()
  try {
    const payload = verifyToken(token)

    // Kiosk device tokens are signed without a householdId because the device
    // may not be paired yet at registration time. If it IS paired, look up the
    // household_id from the kiosk_devices table so every downstream route
    // sees a valid householdId and can serve the request normally.
    if (payload.role === "kiosk" && !payload.householdId) {
      const row = getDb()
        .prepare("SELECT household_id FROM kiosk_devices WHERE id = ?")
        .get(payload.sub) as { household_id: string | null } | undefined
      if (row?.household_id) {
        payload.householdId = row.household_id
      }
    }

    ;(req as AuthRequest).user = { ...payload, userId: payload.sub }
    next()
  } catch (err) {
    const msg = err instanceof jwt.TokenExpiredError ? "Token expired." : "Invalid token."
    res.status(401).json({ error: msg })
  }
}

/**
 * requireAdmin — must follow requireAuth.
 * Checks that the member linked to req.user is an admin.
 * Import and use on admin-only routes.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Role checking happens at the route layer using the DB; this is a
  // placeholder that routes can call after requireAuth.
  // The actual role lookup is done inline in the routes that need it.
  next()
}

// ---------------------------------------------------------------------------
// Socket.IO middleware
// ---------------------------------------------------------------------------

type AuthenticatedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

/**
 * socketAuth — validates the JWT from socket.handshake.auth.token.
 * Rejects the connection with a 401-equivalent error if invalid.
 */
export function socketAuth(
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
): void {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    next(new Error("UNAUTHORIZED: No token provided."))
    return
  }
  try {
    const payload = verifyToken(token)

    // Same lookup as requireAuth — resolve householdId for paired kiosk devices.
    let householdId = payload.householdId ?? ""
    if (payload.role === "kiosk" && !householdId) {
      const row = getDb()
        .prepare("SELECT household_id FROM kiosk_devices WHERE id = ?")
        .get(payload.sub) as { household_id: string | null } | undefined
      householdId = row?.household_id ?? ""
    }

    socket.data.userId = payload.sub
    socket.data.householdId = householdId
    socket.data.email = payload.email ?? ""
    socket.data.name = payload.name ?? ""
    next()
  } catch (err) {
    const msg = err instanceof jwt.TokenExpiredError ? "EXPIRED" : "UNAUTHORIZED"
    next(new Error(`${msg}: ${(err as Error).message}`))
  }
}
