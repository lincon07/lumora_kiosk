// ---------------------------------------------------------------------------
// kiosk-data.ts
//
// Read-only data path for the PAIRED kiosk display (no user session needed).
//
// Previously this called a Supabase SECURITY DEFINER RPC (`kiosk_fetch_all`)
// with a device token. It now calls the local Express server at
// GET /api/v1/snapshot using the same device token as a Bearer credential.
//
// The server verifies the device token, resolves the household, and returns
// the full snapshot in one JSON response — same shape as before.
// ---------------------------------------------------------------------------

import { LOCAL_API_BASE } from "./local-api"
import { getDeviceToken } from "./kiosk-session"
import type {
  Calendar,
  CalendarEvent,
  Checklist,
  Chore,
  Meal,
  Member,
  MemberColor,
  Notification,
  Photo,
} from "./data"

type Row = Record<string, unknown>

export type KioskSnapshot = {
  members: Member[]
  calendars: Calendar[]
  events: CalendarEvent[]
  chores: Chore[]
  lists: Checklist[]
  meals: Meal[]
  notifications: Notification[]
  photos: Photo[]
}

const EMPTY: KioskSnapshot = {
  members: [],
  calendars: [],
  events: [],
  chores: [],
  lists: [],
  meals: [],
  notifications: [],
  photos: [],
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function toMember(r: Row): Member {
  return {
    id: r.id as string,
    name: r.name as string,
    initial: initialOf((r.name as string) ?? ""),
    color: r.color as MemberColor,
    role: r.role as Member["role"],
    dob: (r.dob ?? undefined) as string | undefined,
    userId: (r.user_id ?? undefined) as string | undefined,
    account: (r.account ?? undefined) as string | undefined,
    permissions: (r.permissions as string[] | undefined) ?? [],
    pending: (r.pending as boolean | undefined) ?? false,
  }
}

function toCalendar(r: Row): Calendar {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as MemberColor,
    memberIds: (r.member_ids ?? r.memberIds ?? []) as string[],
  }
}

function toEvent(r: Row): CalendarEvent {
  return {
    id: r.id as string,
    title: r.title as string,
    date: r.date as string,
    time: (r.time ?? "") as string,
    start: Number(r.start_hour ?? r.start) || 0,
    end: Number(r.end_hour ?? r.end) || 0,
    memberIds: (r.member_ids ?? r.memberIds ?? []) as string[],
    calendarId: (r.calendar_id ?? r.calendarId ?? "") as string,
    location: (r.location ?? undefined) as string | undefined,
  }
}

function toChore(r: Row): Chore {
  return {
    id: r.id as string,
    title: r.title as string,
    memberId: (r.member_id ?? r.memberId ?? "") as string,
    done: (r.done as boolean | undefined) ?? false,
    points: Number(r.points) || 0,
    due: (r.due ?? "") as string,
  }
}

function toMeal(r: Row): Meal {
  return {
    id: r.id as string,
    day: r.day as string,
    name: r.name as string,
    type: r.type as string,
    image: (r.image ?? undefined) as string | undefined,
    memberId: (r.member_id ?? r.memberId ?? "") as string,
  }
}

function toPhoto(r: Row): Photo {
  const rawSrc = (r.src ?? r.file_path ?? "") as string
  const src = rawSrc.startsWith("http") ? rawSrc : `${LOCAL_API_BASE}${rawSrc}`
  return { id: r.id as string, src, caption: (r.caption ?? "") as string }
}

function buildLists(lists: Row[], items: Row[]): Checklist[] {
  return lists.map((l) => ({
    id: l.id as string,
    title: l.title as string,
    color: l.color as MemberColor,
    items: items
      .filter((i) => i.list_id === l.id)
      .map((i) => ({
        id: i.id as string,
        label: i.label as string,
        done: (i.done as boolean | undefined) ?? false,
      })),
  }))
}

function buildNotifications(rows: Row[]): Notification[] {
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: (r.body ?? "") as string,
    time: (r.time ?? "") as string,
    memberId: (r.member_id ?? r.memberId ?? "") as string,
    // Kiosk is a shared display — treat all notifications as read to avoid
    // the unread badge noise on a wall display.
    read: true,
  }))
}

/** Fetch the full household snapshot for the paired kiosk display. */
export async function fetchKioskSnapshot(): Promise<KioskSnapshot> {
  const token = getDeviceToken()
  if (!token) return EMPTY

  const url = `${LOCAL_API_BASE}/api/v1/snapshot`

  let data: {
    members?: Row[]
    calendars?: Row[]
    events?: Row[]
    chores?: Row[]
    lists?: Row[]
    list_items?: Row[]
    meals?: Row[]
    notifications?: Row[]
    photos?: Row[]
  }

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      console.error("[kiosk-data] snapshot request failed:", res.status)
      return EMPTY
    }
    data = await res.json() as typeof data
  } catch (err) {
    console.error("[kiosk-data] snapshot fetch error:", err)
    return EMPTY
  }

  return {
    members: (data.members ?? []).map(toMember),
    calendars: (data.calendars ?? []).map(toCalendar),
    events: (data.events ?? []).map(toEvent),
    chores: (data.chores ?? []).map(toChore),
    lists: buildLists(data.lists ?? [], data.list_items ?? []),
    meals: (data.meals ?? []).map(toMeal),
    notifications: buildNotifications(data.notifications ?? []),
    photos: (data.photos ?? []).map(toPhoto),
  }
}
