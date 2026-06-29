/**
 * broadcaster.ts — thin wrapper around the Socket.IO server instance.
 *
 * Routes import `broadcast()` and call it after every DB mutation. The
 * server inits this module at startup by calling `setBroadcaster(io)`.
 * Rooms are keyed by household id: `household:<id>`.
 */

import type { Server } from "socket.io"
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from "./types"
import { relayEvent } from "./lib/central-socket-client"

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

let _io: IO | null = null

export function setBroadcaster(io: IO): void {
  _io = io
}

/** Emit a Socket.IO event to all clients in a household room. */
export function broadcast<E extends keyof ServerToClientEvents>(
  householdId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  if (!_io) return
  const room = `household:${householdId}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(_io.to(room) as any).emit(event, ...args)

  // Relay the same event via the central socket so kiosks and mobile apps
  // connected to the relay receive it (replaces the need for a local socket).
  relayEvent(event as string, args[0])
}
