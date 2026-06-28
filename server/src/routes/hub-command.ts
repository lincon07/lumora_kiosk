/**
 * hub-command.ts — Remote hub control endpoint.
 *
 * POST /api/v1/hub/command
 * Body: { type: "restart" | "reload" | "clear_cache" | "set_orientation", orientation?: string }
 *
 * The server validates the command and broadcasts it to the kiosk via the
 * "hub:command" Socket.IO event. The kiosk receives it and executes the action.
 * Requires a valid user JWT (any role).
 */

import { Router } from "express"
import { requireAuth, type AuthRequest } from "../middleware/auth"
import { broadcast } from "../broadcaster"
import type { HubCommand } from "../types"

export const hubCommandRouter = Router()

const VALID_TYPES = new Set(["restart", "reload", "clear_cache", "set_orientation"])
const VALID_ORIENTATIONS = new Set(["normal", "left", "right", "inverted", "portrait"])

hubCommandRouter.post("/command", requireAuth, (req, res) => {
  const user = (req as AuthRequest).user
  const householdId = user.householdId
  if (!householdId) {
    res.status(403).json({ error: "Not associated with a household." })
    return
  }

  const body = req.body as Record<string, unknown>
  const type = body.type as string | undefined

  if (!type || !VALID_TYPES.has(type)) {
    res.status(400).json({ error: `Invalid command type. Must be one of: ${[...VALID_TYPES].join(", ")}` })
    return
  }

  let cmd: HubCommand

  if (type === "set_orientation") {
    const orientation = body.orientation as string | undefined
    if (!orientation || !VALID_ORIENTATIONS.has(orientation)) {
      res.status(400).json({ error: `Invalid orientation. Must be one of: ${[...VALID_ORIENTATIONS].join(", ")}` })
      return
    }
    cmd = { type: "set_orientation", orientation: orientation as "normal" | "left" | "right" | "inverted" | "portrait" }
  } else {
    cmd = { type } as HubCommand
  }

  broadcast(householdId, "hub:command", cmd)
  res.json({ ok: true, command: cmd })
})
