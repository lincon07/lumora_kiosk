/**
 * routes/auth.ts — local account registration, login, refresh, and session.
 *
 * POST /auth/register   — create account + household (first-time setup)
 * POST /auth/login      — email + password -> access + refresh tokens
 * POST /auth/refresh    — swap a valid refresh token for a new access token
 * GET  /auth/session    — validate access token and return current user
 */

import { Router } from "express"
import bcrypt from "bcryptjs"
import { v4 as uuidv4 } from "uuid"
import { getDb, parseJson } from "../db"
import { signToken, signRefreshToken, verifyToken, requireAuth, type AuthRequest } from "../middleware/auth"
import type { Request, Response } from "express"

const router = Router()

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
router.post("/register", async (req: Request, res: Response) => {
  const { name, email, password, householdName } = req.body as {
    name?: string
    email?: string
    password?: string
    householdName?: string
  }

  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "name, email and password are required." })
    return
  }

  const db = getDb()
  const emailLower = email.trim().toLowerCase()

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(emailLower)
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const userId = uuidv4()
  const householdId = uuidv4()
  const memberId = uuidv4()
  const calendarId = uuidv4()
  const hhName = householdName?.trim() || `${name.trim()}'s Family`

  db.transaction(() => {
    db.prepare(
      "INSERT INTO households (id, name) VALUES (?, ?)",
    ).run(householdId, hhName)

    db.prepare(
      "INSERT INTO users (id, household_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, householdId, emailLower, name.trim(), passwordHash)

    db.prepare(
      `INSERT INTO members (id, household_id, user_id, name, initial, color, role, permissions, account)
       VALUES (?, ?, ?, ?, ?, 'blue', 'admin', '[]', ?)`,
    ).run(memberId, householdId, userId, name.trim(), name.trim().charAt(0).toUpperCase(), emailLower)

    // Seed a default "Family" calendar
    db.prepare(
      `INSERT INTO calendars (id, household_id, name, color, member_ids)
       VALUES (?, ?, 'Family', 'blue', ?)`,
    ).run(calendarId, householdId, JSON.stringify([memberId]))
  })()

  const accessToken = signToken({ sub: userId, householdId, email: emailLower, name: name.trim() })
  const refreshToken = signRefreshToken({ sub: userId, householdId, email: emailLower, name: name.trim() })

  res.status(201).json({
    token: accessToken,
    refreshToken,
    user: { id: userId, email: emailLower, name: name.trim() },
    household: { id: householdId, name: hhName },
  })
})

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "email and password are required." })
    return
  }

  const db = getDb()
  const emailLower = email.trim().toLowerCase()
  const user = db
    .prepare("SELECT id, household_id, name, password_hash FROM users WHERE email = ?")
    .get(emailLower) as { id: string; household_id: string; name: string; password_hash: string } | undefined

  if (!user) {
    res.status(401).json({ error: "Incorrect email or password." })
    return
  }

  const match = await bcrypt.compare(password, user.password_hash)
  if (!match) {
    res.status(401).json({ error: "Incorrect email or password." })
    return
  }

  const household = db
    .prepare("SELECT id, name FROM households WHERE id = ?")
    .get(user.household_id) as { id: string; name: string }

  const payload = { sub: user.id, householdId: user.household_id, email: emailLower, name: user.name }
  const accessToken = signToken(payload)
  const refreshToken = signRefreshToken(payload)

  res.json({
    token: accessToken,
    refreshToken,
    user: { id: user.id, email: emailLower, name: user.name },
    household,
  })
})

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
router.post("/refresh", (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string }
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken is required." })
    return
  }
  try {
    const payload = verifyToken(refreshToken)
    const newAccess = signToken({
      sub: payload.sub,
      householdId: payload.householdId,
      email: payload.email,
      name: payload.name,
    })
    res.json({ token: newAccess })
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token." })
  }
})

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------
router.get("/session", requireAuth, (req: Request, res: Response) => {
  const { sub, householdId, email, name } = (req as AuthRequest).user
  const db = getDb()
  const household = db
    .prepare("SELECT id, name FROM households WHERE id = ?")
    .get(householdId) as { id: string; name: string } | undefined

  if (!household) {
    res.status(404).json({ error: "Household not found." })
    return
  }
  res.json({
    user: { id: sub, email, name },
    household,
  })
})

// ---------------------------------------------------------------------------
// POST /auth/change-password
// ---------------------------------------------------------------------------
router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?: string
  }
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required." })
    return
  }
  const db = getDb()
  const { sub } = (req as AuthRequest).user
  const user = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(sub) as { password_hash: string } | undefined

  if (!user) {
    res.status(404).json({ error: "User not found." })
    return
  }
  const match = await bcrypt.compare(currentPassword, user.password_hash)
  if (!match) {
    res.status(401).json({ error: "Current password is incorrect." })
    return
  }
  const newHash = await bcrypt.hash(newPassword, 12)
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, sub)
  res.status(204).end()
})

export { router as authRouter }
