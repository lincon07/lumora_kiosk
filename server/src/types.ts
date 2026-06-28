/**
 * types.ts — shared TypeScript types for the Lumora local server.
 *
 * These mirror the frontend types in src/lib/data.ts and src/lib/api.ts.
 * Keep them in sync when the frontend contract changes.
 */

// ---------------------------------------------------------------------------
// Domain types (mirror frontend data.ts)
// ---------------------------------------------------------------------------

export type MemberColor = "coral" | "amber" | "teal" | "blue" | "pink" | "green"
export type MemberRole = "admin" | "adult" | "teen" | "child"
export type PermissionArea = "calendar" | "chores" | "lists" | "meals" | "members" | "hub"

export type Household = {
  id: string
  name: string
  createdAt: string
}

export type User = {
  id: string
  householdId: string
  email: string
  name: string
  createdAt: string
}

export type Member = {
  id: string
  householdId: string
  userId?: string
  name: string
  initial: string
  color: MemberColor
  role: MemberRole
  dob?: string
  account?: string
  permissions: PermissionArea[]
  pending: boolean
  createdAt: string
}

export type Invite = {
  id: string
  householdId: string
  memberId: string
  token: string
  code: string
  name: string
  role: MemberRole
  color: MemberColor
  dob?: string
  email?: string
  expiresAt: string
  createdAt: string
}

export type Calendar = {
  id: string
  householdId: string
  name: string
  color: MemberColor
  memberIds: string[]
  createdAt: string
}

export type CalendarEvent = {
  id: string
  householdId: string
  calendarId?: string
  title: string
  date: string
  time?: string
  startHour: number
  endHour: number
  memberIds: string[]
  location?: string
  createdAt: string
  source?: string
}

export type Chore = {
  id: string
  householdId: string
  memberId?: string
  title: string
  done: boolean
  points: number
  due: string
  createdAt: string
}

export type ListItem = {
  id: string
  listId: string
  label: string
  done: boolean
  position: number
  createdAt: string
}

export type ChecklistRow = {
  id: string
  householdId: string
  title: string
  color: MemberColor
  createdAt: string
}

export type Checklist = ChecklistRow & { items: ListItem[] }

export type Meal = {
  id: string
  householdId: string
  memberId?: string
  day: string
  name: string
  type: string
  image?: string
  createdAt: string
}

export type Notification = {
  id: string
  householdId: string
  memberId?: string
  title: string
  body: string
  time: string
  createdAt: string
}

export type NotificationWithState = Notification & { read: boolean }

export type Photo = {
  id: string
  householdId: string
  filename: string
  src: string
  caption: string
  createdAt: string
}

export type KioskDevice = {
  id: string
  householdId: string
  name: string
  deviceToken: string
  lastSeen?: string
  online: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

export type JwtPayload = {
  sub: string           // user id OR kiosk device id
  householdId?: string  // absent for unregistered kiosk tokens
  email?: string        // absent for kiosk tokens
  name?: string         // absent for kiosk tokens
  role?: "kiosk" | "member" | "admin"
  iat?: number
  exp?: number
}

// ---------------------------------------------------------------------------
// Hub remote-command types
// ---------------------------------------------------------------------------

export type HubCommand =
  | { type: "restart" }
  | { type: "reload" }
  | { type: "clear_cache" }
  | { type: "set_orientation"; orientation: "normal" | "left" | "right" | "inverted" | "portrait" }

// ---------------------------------------------------------------------------
// Socket.IO event map
// ---------------------------------------------------------------------------

/** Events emitted FROM the server TO clients. */
export type ServerToClientEvents = {
  // table:action e.g. "members:created", "events:updated", "chores:deleted"
  "members:created": (row: Member) => void
  "members:updated": (row: Member) => void
  "members:deleted": (id: string) => void

  "calendars:created": (row: Calendar) => void
  "calendars:updated": (row: Calendar) => void
  "calendars:deleted": (id: string) => void

  "events:created": (row: CalendarEvent) => void
  "events:updated": (row: CalendarEvent) => void
  "events:deleted": (id: string) => void

  "chores:created": (row: Chore) => void
  "chores:updated": (row: Chore) => void
  "chores:deleted": (id: string) => void

  "lists:created": (row: Checklist) => void
  "lists:updated": (row: Checklist) => void
  "lists:deleted": (id: string) => void

  "meals:created": (row: Meal) => void
  "meals:updated": (row: Meal) => void
  "meals:deleted": (id: string) => void

  "notifications:created": (row: NotificationWithState) => void
  "notifications:updated": (row: NotificationWithState) => void
  "notifications:deleted": (id: string) => void

  "photos:created": (row: Photo) => void
  "photos:deleted": (id: string) => void

  "hub:command": (cmd: HubCommand) => void
}

/** Events emitted FROM clients TO the server (currently none needed server-side). */
export type ClientToServerEvents = Record<string, never>

/** Per-socket data stored by the auth middleware. */
export type SocketData = {
  userId: string
  householdId: string
  email: string
  name: string
}
