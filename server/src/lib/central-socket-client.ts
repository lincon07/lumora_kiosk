/**
 * central-socket-client.ts — connects the hub server to lumora_central_socket_io.
 *
 * The hub authenticates as kind="hub" and joins hub:{hub_id} room.
 * After each local DB broadcast the hub emits hub:relay so all connected
 * kiosks and mobile apps receive the table:action event via the central relay.
 */

import { io, type Socket } from "socket.io-client"

const CENTRAL_SOCKET_URL = process.env.CENTRAL_SOCKET_URL ?? "http://localhost:5001"

let _socket: Socket | null = null
let _hubJwt: string | null = null

/** Connect to the central socket server using the hub's JWT. */
export function connectHubToCentral(hubJwt: string): void {
  if (_socket?.connected && _hubJwt === hubJwt) return

  if (_socket) {
    _socket.disconnect()
    _socket = null
  }

  _hubJwt = hubJwt

  _socket = io(CENTRAL_SOCKET_URL, {
    auth:        { token: hubJwt },
    transports:  ["websocket"],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30_000,
  })

  _socket.on("connect", () => {
    console.log("[central-socket] Hub connected to central socket  url=" + CENTRAL_SOCKET_URL)
    // Send initial heartbeat so portal sees the hub as online
    _socket?.emit("hub:heartbeat", { kiosk_count: 0, online_count: 0 })
  })

  _socket.on("disconnect", (reason: string) => {
    console.log("[central-socket] Hub disconnected from central socket:", reason)
  })

  _socket.on("connect_error", (err: Error) => {
    console.warn("[central-socket] connect_error:", err.message)
  })
}

/**
 * Relay a local table:action event to all clients in the hub's room via
 * the central socket server. Called by broadcaster.ts after every DB write.
 *
 * The central socket server handles the "hub:relay" event by re-emitting
 * the payload to the hub:{hub_id} room — reaching all kiosks and mobile apps.
 */
export function relayEvent(event: string, payload: unknown): void {
  if (!_socket?.connected) return
  _socket.emit("hub:relay", { event, payload })
}

export function isCentralConnected(): boolean {
  return _socket?.connected ?? false
}
