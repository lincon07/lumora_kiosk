"use client"

import { supabase } from "./supabase"
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

/**
 * Read-only data path for a PAIRED kiosk.
 *
 * The kiosk has no Supabase user session, so it cannot use the normal RLS-scoped
 * queries. Instead it calls the `kiosk_fetch_all` SECURITY DEFINER RPC with its
 * device token, which returns the full household snapshot in one shot. We map the
 * raw rows into the same domain types the app store already uses.
 */

type Row = Record<string, any>

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
    id: r.id,
    name: r.name,
    initial: initialOf(r.name ?? ""),
    color: r.color as MemberColor,
    role: r.role,
    dob: r.dob ?? undefined,
    userId: r.user_id ?? undefined,
    account: r.account ?? undefined,
    permissions: r.permissions ?? [],
    pending: r.pending ?? false,
  }
}

function toCalendar(r: Row): Calendar {
  return {
    id: r.id,
    name: r.name,
    color: r.color as MemberColor,
    memberIds: r.member_ids ?? [],
  }
}

function toEvent(r: Row): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    time: r.time ?? "",
    start: Number(r.start_hour) || 0,
    end: Number(r.end_hour) || 0,
    memberIds: r.member_ids ?? [],
    calendarId: r.calendar_id ?? "",
    location: r.location ?? undefined,
  }
}

function toChore(r: Row): Chore {
  return {
    id: r.id,
    title: r.title,
    memberId: r.member_id ?? "",
    done: r.done ?? false,
    points: r.points ?? 0,
    due: r.due ?? "",
  }
}

function toMeal(r: Row): Meal {
  return {
    id: r.id,
    day: r.day,
    name: r.name,
    type: r.type,
    image: r.image ?? undefined,
    memberId: r.member_id ?? "",
  }
}

function toPhoto(r: Row): Photo {
  return { id: r.id, src: r.src, caption: r.caption ?? "" }
}

function buildLists(lists: Row[], items: Row[]): Checklist[] {
  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    color: l.color as MemberColor,
    items: items
      .filter((i) => i.list_id === l.id)
      .map((i) => ({ id: i.id, label: i.label, done: i.done ?? false })),
  }))
}

function buildNotifications(rows: Row[]): Notification[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    time: r.time ?? "",
    memberId: r.member_id ?? "",
    // Kiosk is a shared display: read-state is per-user, so treat all as read
    // (no unread badge noise on a wall display).
    read: true,
  }))
}

/** Fetch + map the full household snapshot for the paired kiosk. */
export async function fetchKioskSnapshot(): Promise<KioskSnapshot> {
  const token = getDeviceToken()
  if (!token) return EMPTY

  const { data, error } = await supabase.rpc("kiosk_fetch_all", { p_device_token: token })
  if (error) {
    console.error("[v0] kiosk_fetch_all failed:", error.message)
    return EMPTY
  }

  const d = data as {
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

  return {
    members: (d.members ?? []).map(toMember),
    calendars: (d.calendars ?? []).map(toCalendar),
    events: (d.events ?? []).map(toEvent),
    chores: (d.chores ?? []).map(toChore),
    lists: buildLists(d.lists ?? [], d.list_items ?? []),
    meals: (d.meals ?? []).map(toMeal),
    notifications: buildNotifications(d.notifications ?? []),
    photos: (d.photos ?? []).map(toPhoto),
  }
}
