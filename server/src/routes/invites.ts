import { Router, type Request, type Response } from "express"
import { v4 as uuidv4 } from "uuid"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { getDb } from "../db"
import { requireAuth, signToken, signRefreshToken, type AuthRequest } from "../middleware/auth"
import type { Invite } from "../types"

const router = Router()

function inviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(6)
  const code = Array.from(bytes, b => chars[b % chars.length]).join("")
  return `${code.slice(0, 3)}-${code.slice(3, 6)}`
}

function rowToInvite(r: Record<string, unknown>): Invite {
  return {
    id: r.id as string,
    householdId: r.household_id as string,
    memberId: r.member_id as string,
    token: r.token as string,
    code: r.code as string,
    name: r.name as string,
    role: r.role as Invite["role"],
    color: r.color as Invite["color"],
    dob: (r.dob as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    expiresAt: r.expires_at as string,
    createdAt: r.created_at as string,
  }
}

// POST /invites — create invite (authenticated)
router.post("/", requireAuth, (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const { name, role = "adult", color = "blue", dob, memberId, email } = req.body as {
    name?: string
    role?: string
    color?: string
    dob?: string
    memberId?: string
    email?: string
  }

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required." })
    return
  }

  const db = getDb()
  let finalMemberId = memberId

  if (finalMemberId) {
    // Update existing member slot to pending
    const patch: unknown[] = []
    const sets: string[] = ["pending = 1"]
    if (email) { sets.push("account = ?"); patch.push(email) }
    patch.push(finalMemberId, householdId)
    db.prepare(`UPDATE members SET ${sets.join(", ")} WHERE id = ? AND household_id = ?`).run(...patch)
  } else {
    // Create a pending member slot
    finalMemberId = uuidv4()
    db.prepare(
      `INSERT INTO members (id, household_id, name, initial, color, role, dob, account, permissions, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 1)`,
    ).run(finalMemberId, householdId, name.trim(), name.trim().charAt(0).toUpperCase(), color, role, dob ?? null, email ?? null)
  }

  // Drop stale invite for this member slot
  db.prepare("DELETE FROM invites WHERE member_id = ?").run(finalMemberId)

  const id = uuidv4()
  const token = `inv_${uuidv4().replace(/-/g, "")}`
  const code = inviteCode()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  db.prepare(
    `INSERT INTO invites (id, household_id, member_id, token, code, name, role, color, dob, email, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, householdId, finalMemberId, token, code, name.trim(), role, color, dob ?? null, email ?? null, expiresAt)

  const row = db.prepare("SELECT * FROM invites WHERE id = ?").get(id) as Record<string, unknown>
  res.status(201).json(rowToInvite(row))
})

// GET /invites/:tokenOrCode — look up an invite (no auth required for claim flow)
router.get("/:tokenOrCode", (req: Request, res: Response) => {
  const key = req.params.tokenOrCode.trim()
  const db = getDb()

  const row = (
    db.prepare("SELECT i.*, h.name AS household_name FROM invites i JOIN households h ON h.id = i.household_id WHERE i.token = ?").get(key) ??
    db.prepare("SELECT i.*, h.name AS household_name FROM invites i JOIN households h ON h.id = i.household_id WHERE UPPER(i.code) = UPPER(?)").get(key)
  ) as (Record<string, unknown> & { household_name: string }) | undefined

  if (!row) {
    res.status(404).json({ error: "Invite not found or expired." })
    return
  }

  if (new Date(row.expires_at as string) < new Date()) {
    res.status(410).json({ error: "This invite has expired." })
    return
  }

  res.json({
    ...rowToInvite(row),
    householdName: row.household_name,
    memberName: row.name,
  })
})

// POST /invites/claim — create an account + claim the invite slot
router.post("/claim", async (req: Request, res: Response) => {
  const { token, name, email, password, dob, color } = req.body as {
    token?: string
    name?: string
    email?: string
    password?: string
    dob?: string
    color?: string
  }

  if (!token || !name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "token, name, email and password are required." })
    return
  }

  const db = getDb()
  const invite = db
    .prepare("SELECT * FROM invites WHERE token = ?")
    .get(token) as Record<string, unknown> | undefined

  if (!invite) {
    res.status(404).json({ error: "Invite not found or already used." })
    return
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    res.status(410).json({ error: "This invite has expired." })
    return
  }

  const emailLower = email.trim().toLowerCase()
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(emailLower)
  if (existingUser) {
    res.status(409).json({ error: "An account with this email already exists." })
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const userId = uuidv4()
  const householdId = invite.household_id as string

  db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, household_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, householdId, emailLower, name.trim(), passwordHash)

    // Claim the member slot
    db.prepare(
      "UPDATE members SET user_id = ?, name = ?, initial = ?, dob = ?, color = ?, account = ?, pending = 0 WHERE id = ?",
    ).run(userId, name.trim(), name.trim().charAt(0).toUpperCase(), dob ?? null, color ?? invite.color, emailLower, invite.member_id)

    // Consume the invite
    db.prepare("DELETE FROM invites WHERE id = ?").run(invite.id)
  })()

  const household = db
    .prepare("SELECT id, name FROM households WHERE id = ?")
    .get(householdId) as { id: string; name: string }

  const payload = { sub: userId, householdId, email: emailLower, name: name.trim() }
  const accessToken = signToken(payload)
  const refreshToken = signRefreshToken(payload)

  res.status(201).json({
    token: accessToken,
    refreshToken,
    user: { id: userId, email: emailLower, name: name.trim() },
    household,
  })
})

// DELETE /invites/:id — revoke / cancel an outstanding invite (authenticated)
router.delete("/:id", requireAuth, (req: Request, res: Response) => {
  const { householdId } = (req as AuthRequest).user
  const { id } = req.params
  const db = getDb()

  const invite = db
    .prepare("SELECT id, member_id FROM invites WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { id: string; member_id: string } | undefined

  if (!invite) {
    res.status(404).json({ error: "Invite not found." })
    return
  }

  db.transaction(() => {
    db.prepare("DELETE FROM invites WHERE id = ?").run(invite.id)
    // Clear the pending flag on the member slot so it stops showing "Invited".
    db.prepare("UPDATE members SET pending = 0 WHERE id = ? AND household_id = ?")
      .run(invite.member_id, householdId)
  })()

  res.status(204).end()
})

export { router as invitesRouter }
