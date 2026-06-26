/**
 * GET /api/v1/snapshot
 *
 * Returns the full household dataset in a single response.
 * Used by the kiosk display (which has a device token, not a user JWT) and
 * by the React app on first load when it wants to hydrate all tables at once.
 *
 * Auth: requireAuth — the device token or a user JWT both satisfy this
 * middleware; the household_id is resolved from the verified payload.
 */

import { Router } from "express"
import { requireAuth } from "../middleware/auth"
import { getDb } from "../db"

export const snapshotRouter = Router()

snapshotRouter.get("/", requireAuth, (req, res) => {
  const db = getDb()
  const hid = (req as import("../middleware/auth").AuthRequest).user.householdId

  // Guard against undefined/null/empty — kiosk device not yet paired, or
  // token resolved no household from DB. Return empty collections rather than
  // passing an invalid bind param to SQLite (which throws and causes a 500).
  if (hid == null || hid === "") {
    res.json({ members: [], calendars: [], events: [], chores: [], lists: [],
      list_items: [], meals: [], notifications: [], photos: [] })
    return
  }

  try {
  const members = db
    .prepare("SELECT * FROM members WHERE household_id = ? ORDER BY created_at ASC")
    .all(hid)

  const calendars = db
    .prepare("SELECT * FROM calendars WHERE household_id = ? ORDER BY created_at ASC")
    .all(hid)

  const events = db
    .prepare("SELECT * FROM events WHERE household_id = ? ORDER BY date ASC, start_hour ASC")
    .all(hid)

  const chores = db
    .prepare("SELECT * FROM chores WHERE household_id = ? ORDER BY created_at ASC")
    .all(hid)

  const lists = db
    .prepare("SELECT * FROM lists WHERE household_id = ? ORDER BY position ASC, created_at ASC")
    .all(hid)

  const list_items = db
    .prepare(
      `SELECT li.* FROM list_items li
       JOIN lists l ON l.id = li.list_id
       WHERE l.household_id = ?
       ORDER BY li.position ASC`,
    )
    .all(hid)

  const meals = db
    .prepare("SELECT * FROM meals WHERE household_id = ? ORDER BY created_at ASC")
    .all(hid)

  const notifications = db
    .prepare(
      `SELECT * FROM notifications WHERE household_id = ?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .all(hid)

  // photos table may not exist in older DB files before migration
  let photos: unknown[] = []
  try {
    photos = db
      .prepare("SELECT * FROM photos WHERE household_id = ? ORDER BY created_at DESC")
      .all(hid)
  } catch {
    /* table not yet migrated — return empty */
  }

  res.json({ members, calendars, events, chores, lists, list_items, meals, notifications, photos })
  } catch (err) {
    console.error("[snapshot] query error:", err)
    res.status(500).json({ error: "Failed to load snapshot.", detail: String(err) })
  }
})
