export type MemberColor =
  | "coral"
  | "amber"
  | "teal"
  | "blue"
  | "pink"
  | "green"

export type MemberRole = "admin" | "adult" | "teen" | "child"

/** Areas a non-admin member can be granted management rights over. */
export type PermissionArea = "calendar" | "chores" | "lists" | "meals" | "members" | "hub"

export const permissionAreas: PermissionArea[] = [
  "calendar",
  "chores",
  "lists",
  "meals",
  "members",
  "hub",
]

export const permissionLabels: Record<PermissionArea, string> = {
  calendar: "Calendar",
  chores: "Chores",
  lists: "Lists",
  meals: "Meals",
  members: "Members",
  hub: "Hub & account",
}

export const permissionDescriptions: Record<PermissionArea, string> = {
  calendar: "Create, edit and delete events and calendars",
  chores: "Create, edit and delete chores",
  lists: "Create, edit and delete lists and items",
  meals: "Plan, edit and delete meals",
  members: "Add, edit and remove family members",
  hub: "Reset hub data, restart the hub and manage the account",
}

export type Member = {
  id: string
  name: string
  initial: string
  color: MemberColor
  role: MemberRole
  dob?: string // ISO date, e.g. "1986-03-14"
  /** Linked auth user id, if this member has claimed/owns an account. */
  userId?: string
  account?: string // connected user account email
  /** Areas this member can manage. Admins implicitly have all areas. */
  permissions?: PermissionArea[]
  /** True while an invite is outstanding and unclaimed. */
  pending?: boolean
}

export const roleLabels: Record<MemberRole, string> = {
  admin: "Admin",
  adult: "Adult",
  teen: "Teen",
  child: "Child",
}

/** Whether a member can manage a given area (admins always can). */
export function memberCan(member: Member | null | undefined, area: PermissionArea): boolean {
  if (!member) return false
  if (member.role === "admin") return true
  return member.permissions?.includes(area) ?? false
}

/** Whole-year age from an ISO date-of-birth string. */
export function calculateAge(dob?: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1
  return age
}

/** Human-friendly DOB, e.g. "Mar 14, 1986". */
export function formatDob(dob?: string): string | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

// Tailwind class maps so colors are statically analyzable
export const memberBg: Record<MemberColor, string> = {
  coral: "bg-member-coral",
  amber: "bg-member-amber",
  teal: "bg-member-teal",
  blue: "bg-member-blue",
  pink: "bg-member-pink",
  green: "bg-member-green",
}

export const memberText: Record<MemberColor, string> = {
  coral: "text-member-coral",
  amber: "text-member-amber",
  teal: "text-member-teal",
  blue: "text-member-blue",
  pink: "text-member-pink",
  green: "text-member-green",
}

// soft tinted background using color-mix for event chips
export const memberSoft: Record<MemberColor, string> = {
  coral: "bg-member-coral/12 text-member-coral",
  amber: "bg-member-amber/15 text-member-amber",
  teal: "bg-member-teal/15 text-member-teal",
  blue: "bg-member-blue/12 text-member-blue",
  pink: "bg-member-pink/12 text-member-pink",
  green: "bg-member-green/15 text-member-green",
}

/** A named calendar (e.g. Family, Friends, Work) that owns events. */
export type Calendar = {
  id: string
  name: string
  color: MemberColor
  /** Members assigned to / sharing this calendar. */
  memberIds: string[]
}

export type CalendarEvent = {
  id: string
  title: string
  /** ISO calendar date, e.g. "2026-06-21". */
  date: string
  time: string
  start: number // hour, 24h
  end: number
  /** Members assigned to this event (one event can involve several people). */
  memberIds: string[]
  /** The calendar this event belongs to. */
  calendarId: string
  location?: string
}

/** ISO date (yyyy-mm-dd) for a Date, in local time. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** The 7 dates of the week containing `ref`, starting Monday. */
export function weekDates(ref: Date): Date[] {
  const base = new Date(ref)
  base.setHours(0, 0, 0, 0)
  const dow = (base.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(base)
  monday.setDate(base.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export type Chore = {
  id: string
  title: string
  memberId: string
  done: boolean
  points: number
  due: string
}

export type ListItem = { id: string; label: string; done: boolean }
export type Checklist = {
  id: string
  title: string
  color: MemberColor
  items: ListItem[]
}

export type Meal = {
  id: string
  day: string
  name: string
  type: string
  image?: string
  memberId: string
}

export type Photo = {
  id: string
  src: string
  caption: string
  createdAt?: string
}

export type Notification = {
  id: string
  title: string
  body: string
  time: string
  memberId: string
  /** Per-user read state for the signed-in member (notifications are shared,
   * but read/dismiss state is tracked per person). */
  read: boolean
}

// Live data is loaded via the API client (src/lib/api.ts) and held in the
// shared store (src/lib/store.tsx). This module now only defines types and
// pure presentation helpers — no seed/dummy data.
