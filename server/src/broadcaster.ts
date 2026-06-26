/**
 * broadcaster.ts — thin wrapper around the Socket.IO server instance.
 *
 * Routes import `broadcast()` and call it after every DB mutation. The
 * server inits this module at startup by calling `setBroadcaster(io)`.
 * Rooms are keyed by household id: `household:<id>`.
 */

import type { Server } from "socket.io"
import type { ServerToClientEvents, ClientToServerEvents, SocketData } from "./types"

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
  // @ts-expect-error — variadic emit args; Socket.IO types need explicit cast
  _io.to(room).emit(event, ...args)
}
