/**
 * index.ts — Lumora local server entry point.
 *
 * Starts Express + Socket.IO on PORT (default 4000).
 * Binds to 0.0.0.0 so the API is reachable from phones/tablets on the LAN.
 * All routes require a valid HS256 JWT (except /auth/register and /auth/login).
 * Every DB write broadcasts a Socket.IO event to the household room.
 */

import express, { type Request, type Response, type NextFunction } from "express"
import { createServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import cors from "cors"
import path from "path"

import { getDb, PHOTOS_DIR, ensureDataDir, getOrCreateSecret } from "./db"
import { setBroadcaster } from "./broadcaster"
import { socketAuth } from "./middleware/auth"

import { authRouter } from "./routes/auth"
import { membersRouter } from "./routes/members"
import { invitesRouter } from "./routes/invites"
import { calendarsRouter } from "./routes/calendars"
import { eventsRouter } from "./routes/events"
import { choresRouter } from "./routes/chores"
import { listsRouter } from "./routes/lists"
import { mealsRouter } from "./routes/meals"
import { notificationsRouter } from "./routes/notifications"
import { photosRouter } from "./routes/photos"
import { snapshotRouter } from "./routes/snapshot"
import { kioskRouter } from "./routes/kiosk"

import type { ServerToClientEvents, ClientToServerEvents, SocketData } from "./types"

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

ensureDataDir()
getOrCreateSecret() // generate HMAC secret on first boot
getDb()             // open DB and run schema migration

const PORT = Number(process.env.LUMORA_PORT ?? 4000)

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

// CORS — allow requests from any LAN origin (Tauri webview, phone browsers).
// In production the secret + JWT provide the real security boundary.
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

app.use(express.json({ limit: "2mb" }))
app.use(express.urlencoded({ extended: true }))

// Serve photo files as authenticated static files.
// We handle auth manually here so we can validate the Bearer token.
app.use(
  "/photo-files",
  (req: Request, res: Response, next: NextFunction) => {
    // Allow token in query string for <img> tags that can't set headers.
    const token =
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : undefined) ??
      (typeof req.query.token === "string" ? req.query.token : undefined)
    if (!token) {
      res.status(401).json({ error: "Unauthorized." })
      return
    }
    try {
      const { verifyToken } = require("./middleware/auth") as typeof import("./middleware/auth")
      verifyToken(token)
      next()
    } catch {
      res.status(401).json({ error: "Invalid or expired token." })
    }
  },
  express.static(PHOTOS_DIR, { maxAge: "1d", etag: true }),
)

// API routes
app.use("/api/v1/auth", authRouter)
app.use("/api/v1/members", membersRouter)
app.use("/api/v1/invites", invitesRouter)
app.use("/api/v1/calendars", calendarsRouter)
app.use("/api/v1/events", eventsRouter)
app.use("/api/v1/chores", choresRouter)
app.use("/api/v1/lists", listsRouter)
app.use("/api/v1/meals", mealsRouter)
app.use("/api/v1/notifications", notificationsRouter)
app.use("/api/v1/photos", photosRouter)
app.use("/api/v1/snapshot", snapshotRouter)
app.use("/api/v1/kiosk", kioskRouter)
// Alias used by kiosk-status.ts heartbeat publisher
app.use("/api/v1/kiosk-devices", kioskRouter)

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", ts: new Date().toISOString() })
})

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found." })
})

// ---------------------------------------------------------------------------
// HTTP server + Socket.IO
// ---------------------------------------------------------------------------

const httpServer = createServer(app)

const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // Allow clients to reconnect after brief network drops.
  pingTimeout: 30_000,
  pingInterval: 10_000,
})

// Authenticate every socket connection.
io.use(socketAuth)

io.on("connection", (socket) => {
  const { userId, householdId, name } = socket.data

  // Join the household-scoped room so broadcasts are scoped.
  const room = `household:${householdId}`
  void socket.join(room)

  console.log(`[socket] ${name} (${userId}) connected — joined ${room}`)

  socket.on("disconnect", (reason) => {
    console.log(`[socket] ${name} (${userId}) disconnected — ${reason}`)
  })
})

// Wire up the broadcaster so routes can call broadcast().
setBroadcaster(io)

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[lumora] Server listening on http://0.0.0.0:${PORT}`)
  console.log(`[lumora] API base: http://0.0.0.0:${PORT}/api/v1`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[lumora] SIGTERM received — shutting down")
  httpServer.close(() => {
    getDb().close()
    process.exit(0)
  })
})

process.on("SIGINT", () => {
  console.log("[lumora] SIGINT received — shutting down")
  httpServer.close(() => {
    getDb().close()
    process.exit(0)
  })
})
