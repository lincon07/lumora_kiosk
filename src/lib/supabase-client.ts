// ---------------------------------------------------------------------------
// Supabase adapter for the Lumora API contract.
//
// Implements the same `LumoraApi` interface as the mock/HTTP/Neon adapters, but
// backed by Supabase Auth + Postgres (with RLS) + RPC functions. Supabase Auth
// uses bearer tokens in the Authorization header rather than cookies, so it
// works inside the Tauri iOS webview without the origin/CSRF workarounds Neon
// Auth required. Realtime is wired separately in the store.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase"
import type {
  LumoraApi,
  ApiMember,
  User,
  Household,
} from "./api"
import type {
  Calendar,
  CalendarEvent,
  Chore,
  Checklist,
  Meal,
  Notification,
  Photo,
  MemberColor,
  MemberRole,
} from "./data"

type Row = Record<string, any>

// Cached for the lifetime of a session so we don't re-resolve on every write.
let cachedHouseholdId: string | null = null
let cachedHouseholdName: string | null = null

function clearHouseholdCache() {
  cachedHouseholdId = null
  cachedHouseholdName = null
}

// Drop cached household when the auth state changes (sign out / new sign in).
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN") clearHouseholdCache()
})

/** Throw a clean Error on a Supabase query error, else return data. */
function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function rid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

function inviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${pick(3)}-${pick(3)}`
}

// ----- Row -> type mappers --------------------------------------------------

function toMember(r: Row): ApiMember {
  return {
    id: r.id,
    householdId: r.household_id,
    name: r.name,
    color: r.color as MemberColor,
    role: r.role as MemberRole,
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

function toNotification(r: Row, state?: Row): Notification {
  return {
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    time: r.time ?? "",
    memberId: r.member_id ?? "",
    read: state?.read ?? false,
  }
}

function toPhoto(r: Row): Photo {
  return { id: r.id, src: r.src, caption: r.caption ?? "" }
}

// ----- Session / household helpers ------------------------------------------

async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  const u = data.user
  if (!u) return null
  const name =
    (u.user_metadata?.name as string | undefined) ||
    (u.user_metadata?.full_name as string | undefined) ||
    (u.email ? u.email.split("@")[0] : "Me")
  return { id: u.id, email: u.email ?? "", name }
}

/**
 * Resolve (and cache) the signed-in user's household. If the user has no member
 * row yet (e.g. first Apple sign-in), bootstrap a new household for them.
 */
async function ensureHousehold(opts?: { name?: string; householdName?: string }): Promise<Household> {
  const user = await currentUser()
  if (!user) throw new Error("Not signed in.")

  // Existing membership?
  const existing = unwrap(
    await supabase.from("members").select("household_id").eq("user_id", user.id).limit(1),
  ) as Row[]

  let householdId: string
  if (existing.length > 0) {
    householdId = existing[0].household_id
  } else {
    householdId = unwrap(
      await supabase.rpc("bootstrap_household", {
        p_name: opts?.name ?? user.name,
        p_household_name: opts?.householdName ?? "",
      }),
    ) as string
  }

  const household = unwrap(
    await supabase.from("households").select("id, name").eq("id", householdId).single(),
  ) as Row
  cachedHouseholdId = household.id
  cachedHouseholdName = household.name
  return { id: household.id, name: household.name }
}

async function requireHouseholdId(): Promise<string> {
  if (cachedHouseholdId) return cachedHouseholdId
  const h = await ensureHousehold()
  return h.id
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ""
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error("Not authenticated")
  return data.user.id
}

// ----- Adapter --------------------------------------------------------------

export function createSupabaseApi(): LumoraApi {
  /** Fetch a single list with its items nested, as a Checklist. */
  async function fetchList(listId: string): Promise<Checklist> {
    const list = unwrap(
      await supabase.from("lists").select("id, title, color").eq("id", listId).single(),
    ) as Row
    const items = unwrap(
      await supabase
        .from("list_items")
        .select("id, label, done, position")
        .eq("list_id", listId)
        .order("position", { ascending: true }),
    ) as Row[]
    return {
      id: list.id,
      title: list.title,
      color: list.color as MemberColor,
      items: items.map((i) => ({ id: i.id, label: i.label, done: i.done ?? false })),
    }
  }

  return {
    // ----- auth -----
    async signUp(input) {
      const email = input.email.trim().toLowerCase()
      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: { data: { name: input.name.trim() } },
      })
      if (error) throw new Error(error.message)
      // Accounts are auto-confirmed server-side, but GoTrue still withholds the
      // session on signup while "Confirm email" is enabled. Sign in right away
      // with the same credentials to obtain a session token.
      let token = data.session?.access_token
      if (!token) {
        const signInRes = await supabase.auth.signInWithPassword({ email, password: input.password })
        if (signInRes.error || !signInRes.data.session) {
          throw new Error(signInRes.error?.message ?? "Could not start a session. Please try signing in.")
        }
        token = signInRes.data.session.access_token
      }
      const household = await ensureHousehold({
        name: input.name.trim(),
        householdName: input.householdName,
      })
      const user = (await currentUser())!
      return { token, user, household }
    },

    async signIn(input) {
      const email = input.email.trim().toLowerCase()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      })
      if (error) throw new Error("Incorrect email or password.")
      const household = await ensureHousehold()
      const user = (await currentUser())!
      return { token: data.session?.access_token ?? "", user, household }
    },

    async signInWithApple() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
    },

    async signOut() {
      clearHouseholdCache()
      await supabase.auth.signOut()
    },

    async getSession() {
      const user = await currentUser()
      if (!user) return null
      const household = await ensureHousehold({ name: user.name })
      return { user, household }
    },

    // ----- members -----
    async listMembers() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("members").select("*").eq("household_id", hid).order("created_at"),
      ) as Row[]
      return rows.map(toMember)
    },

    async createMember(input) {
      const hid = await requireHouseholdId()
      const { data: userData } = await supabase.auth.getUser()
      const inserted = unwrap(
        await supabase
          .from("members")
          .insert({
            household_id: hid,
            name: input.name.trim(),
            initial: initialOf(input.name),
            color: input.color,
            role: input.role,
            dob: input.dob ?? null,
            account: input.account ?? (input.linkSelf ? userData.user?.email : null),
            user_id: input.linkSelf ? userData.user?.id : null,
            permissions: input.role === "admin" ? [] : input.permissions ?? [],
            pending: false,
          })
          .select(),
      ) as Row[]
      return toMember(inserted[0])
    },

    async updateMember(id, patch) {
      const row: Row = {}
      if (patch.name !== undefined) {
        row.name = patch.name.trim()
        row.initial = initialOf(patch.name)
      }
      if (patch.color !== undefined) row.color = patch.color
      if (patch.role !== undefined) row.role = patch.role
      if (patch.dob !== undefined) row.dob = patch.dob ?? null
      if (patch.account !== undefined) row.account = patch.account ?? null
      if (patch.permissions !== undefined) row.permissions = patch.permissions ?? []
      const updated = unwrap(await supabase.from("members").update(row).eq("id", id).select()) as Row[]
      if (!updated[0]) throw new Error("Member not found.")
      return toMember(updated[0])
    },

    async deleteMember(id) {
      unwrap(await supabase.from("invites").delete().eq("member_id", id))
      unwrap(await supabase.from("members").delete().eq("id", id).select())
    },

    // ----- invites -----
    async createInvite(input) {
      const hid = await requireHouseholdId()
      const householdName = cachedHouseholdName ?? "Family"
      let memberId = input.memberId
      let memberName = input.name.trim()
      let role = input.role

      if (memberId) {
        const patch: Row = { pending: true }
        if (input.email) patch.account = input.email
        const updated = unwrap(
          await supabase.from("members").update(patch).eq("id", memberId).select(),
        ) as Row[]
        if (updated[0]) {
          memberName = updated[0].name
          role = updated[0].role
        }
      } else {
        const inserted = unwrap(
          await supabase
            .from("members")
            .insert({
              household_id: hid,
              name: memberName,
              initial: initialOf(memberName),
              color: input.color,
              role: input.role,
              dob: input.dob ?? null,
              account: input.email ?? null,
              pending: true,
            })
            .select(),
        ) as Row[]
        memberId = inserted[0].id
      }

      // Drop any stale invite on this slot.
      unwrap(await supabase.from("invites").delete().eq("member_id", memberId!))

      const token = rid("inv")
      const code = inviteCode()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      unwrap(
        await supabase
          .from("invites")
          .insert({
            household_id: hid,
            token,
            code,
            member_id: memberId,
            name: memberName,
            role,
            color: input.color,
            dob: input.dob ?? null,
            email: input.email ?? null,
            expires_at: expiresAt,
          })
          .select(),
      )
      return {
        token,
        code,
        householdId: hid,
        householdName,
        memberId: memberId!,
        memberName,
        role,
        email: input.email,
        expiresAt,
      }
    },

    async getInvite(tokenOrCode) {
      // Runs before the new member has an account — lookup_invite is callable by
      // the anon role, and the anon key is already attached by the client.
      const rows = unwrap(
        await supabase.rpc("lookup_invite", { p_key: tokenOrCode.trim() }),
      ) as Row[]
      const r = Array.isArray(rows) ? rows[0] : (rows as Row)
      if (!r) return null
      return {
        token: r.token,
        code: r.code,
        householdId: r.household_id,
        householdName: r.household_name,
        memberId: r.member_id,
        memberName: r.member_name,
        role: r.role as MemberRole,
        email: r.email ?? undefined,
        expiresAt: r.expires_at,
      }
    },

    async claimInvite(input) {
      const email = input.email.trim().toLowerCase()
      // Create the member's account. If the email already exists, fall back to
      // signing in so an existing user can still claim their invite.
      const signUpRes = await supabase.auth.signUp({
        email,
        password: input.password,
        options: { data: { name: input.name.trim() } },
      })
      if (signUpRes.error || !signUpRes.data.session) {
        const signInRes = await supabase.auth.signInWithPassword({ email, password: input.password })
        if (signInRes.error) {
          throw new Error(
            signUpRes.error?.message ||
              "Check your email to confirm your account, then open the invite again.",
          )
        }
      }

      // claim_invite stamps the member row with auth.uid(), so it must run while
      // authenticated (the session is now active).
      const householdId = unwrap(
        await supabase.rpc("claim_invite", {
          p_token: input.token,
          p_name: input.name.trim(),
          p_dob: input.dob ?? null,
          p_color: input.color ?? null,
        }),
      ) as string

      clearHouseholdCache()

      // Record a household notification so existing members' live-sync surfaces
      // (and pushes) the join. Best-effort — never fail the claim over this.
      try {
        await supabase.from("notifications").insert({
          household_id: householdId,
          title: "New member joined",
          body: `${input.name.trim()} accepted their invite and joined the family.`,
          time: "Just now",
          member_id: null,
        })
      } catch {
        /* non-fatal */
      }

      const household = unwrap(
        await supabase.from("households").select("id, name").eq("id", householdId).single(),
      ) as Row
      cachedHouseholdId = household.id
      cachedHouseholdName = household.name
      const user = (await currentUser())!
      return {
        token: await accessToken(),
        user,
        household: { id: household.id, name: household.name },
      }
    },

    // ----- calendars -----
    async listCalendars() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("calendars").select("*").eq("household_id", hid).order("created_at"),
      ) as Row[]
      return rows.map(toCalendar)
    },

    async createCalendar(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("calendars")
          .insert({
            household_id: hid,
            name: input.name,
            color: input.color,
            member_ids: input.memberIds ?? [],
          })
          .select(),
      ) as Row[]
      return toCalendar(inserted[0])
    },

    async updateCalendar(id, patch) {
      const row: Row = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.color !== undefined) row.color = patch.color
      if (patch.memberIds !== undefined) row.member_ids = patch.memberIds
      const updated = unwrap(await supabase.from("calendars").update(row).eq("id", id).select()) as Row[]
      if (!updated[0]) throw new Error("Calendar not found.")
      return toCalendar(updated[0])
    },

    async deleteCalendar(id) {
      unwrap(await supabase.from("calendars").delete().eq("id", id).select())
    },

    // ----- events -----
    async listEvents() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("events").select("*").eq("household_id", hid),
      ) as Row[]
      return rows.map(toEvent)
    },

    async createEvent(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("events")
          .insert({
            household_id: hid,
            title: input.title,
            date: input.date,
            time: input.time ?? null,
            start_hour: input.start ?? 0,
            end_hour: input.end ?? 0,
            member_ids: input.memberIds ?? [],
            calendar_id: input.calendarId || null,
            location: input.location ?? null,
          })
          .select(),
      ) as Row[]
      return toEvent(inserted[0])
    },

    async updateEvent(id, patch) {
      const row: Row = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.date !== undefined) row.date = patch.date
      if (patch.time !== undefined) row.time = patch.time ?? null
      if (patch.start !== undefined) row.start_hour = patch.start
      if (patch.end !== undefined) row.end_hour = patch.end
      if (patch.memberIds !== undefined) row.member_ids = patch.memberIds ?? []
      if (patch.calendarId !== undefined) row.calendar_id = patch.calendarId || null
      if (patch.location !== undefined) row.location = patch.location ?? null
      const updated = unwrap(await supabase.from("events").update(row).eq("id", id).select()) as Row[]
      if (!updated[0]) throw new Error("Event not found.")
      return toEvent(updated[0])
    },

    async deleteEvent(id) {
      unwrap(await supabase.from("events").delete().eq("id", id).select())
    },

    // ----- chores -----
    async listChores() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("chores").select("*").eq("household_id", hid).order("created_at"),
      ) as Row[]
      return rows.map(toChore)
    },

    async createChore(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("chores")
          .insert({
            household_id: hid,
            title: input.title,
            member_id: input.memberId || null,
            done: input.done ?? false,
            points: input.points ?? 0,
            due: input.due ?? null,
          })
          .select(),
      ) as Row[]
      return toChore(inserted[0])
    },

    async updateChore(id, patch) {
      const row: Row = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.memberId !== undefined) row.member_id = patch.memberId || null
      if (patch.done !== undefined) row.done = patch.done
      if (patch.points !== undefined) row.points = patch.points
      if (patch.due !== undefined) row.due = patch.due ?? null
      const updated = unwrap(await supabase.from("chores").update(row).eq("id", id).select()) as Row[]
      if (!updated[0]) throw new Error("Chore not found.")
      return toChore(updated[0])
    },

    async deleteChore(id) {
      unwrap(await supabase.from("chores").delete().eq("id", id).select())
    },

    // ----- lists -----
    async listLists() {
      const hid = await requireHouseholdId()
      const lists = unwrap(
        await supabase
          .from("lists")
          .select("id, title, color, position")
          .eq("household_id", hid)
          .order("position", { ascending: true }),
      ) as Row[]
      const items = unwrap(
        await supabase
          .from("list_items")
          .select("id, list_id, label, done, position")
          .eq("household_id", hid)
          .order("position", { ascending: true }),
      ) as Row[]
      return lists.map((l) => ({
        id: l.id,
        title: l.title,
        color: l.color as MemberColor,
        items: items
          .filter((i) => i.list_id === l.id)
          .map((i) => ({ id: i.id, label: i.label, done: i.done ?? false })),
      }))
    },

    async createList(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("lists")
          .insert({ household_id: hid, title: input.title, color: input.color })
          .select(),
      ) as Row[]
      return { id: inserted[0].id, title: inserted[0].title, color: inserted[0].color, items: [] }
    },

    async updateList(id, patch) {
      const row: Row = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.color !== undefined) row.color = patch.color
      unwrap(await supabase.from("lists").update(row).eq("id", id).select())
      return fetchList(id)
    },

    async deleteList(id) {
      unwrap(await supabase.from("list_items").delete().eq("list_id", id))
      unwrap(await supabase.from("lists").delete().eq("id", id).select())
    },

    async addListItem(listId, label) {
      const hid = await requireHouseholdId()
      const countRes = await supabase
        .from("list_items")
        .select("id", { count: "exact", head: true })
        .eq("list_id", listId)
      const position = countRes.count ?? 0
      unwrap(
        await supabase
          .from("list_items")
          .insert({ household_id: hid, list_id: listId, label, done: false, position })
          .select(),
      )
      return fetchList(listId)
    },

    async updateListItem(listId, itemId, patch) {
      const row: Row = {}
      if (patch.label !== undefined) row.label = patch.label
      if (patch.done !== undefined) row.done = patch.done
      unwrap(await supabase.from("list_items").update(row).eq("id", itemId).select())
      return fetchList(listId)
    },

    async deleteListItem(listId, itemId) {
      unwrap(await supabase.from("list_items").delete().eq("id", itemId).select())
      return fetchList(listId)
    },

    // ----- meals -----
    async listMeals() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("meals").select("*").eq("household_id", hid).order("created_at"),
      ) as Row[]
      return rows.map(toMeal)
    },

    async createMeal(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("meals")
          .insert({
            household_id: hid,
            day: input.day,
            type: input.type,
            name: input.name,
            image: input.image ?? null,
            member_id: input.memberId || null,
          })
          .select(),
      ) as Row[]
      return toMeal(inserted[0])
    },

    async updateMeal(id, patch) {
      const row: Row = {}
      if (patch.day !== undefined) row.day = patch.day
      if (patch.type !== undefined) row.type = patch.type
      if (patch.name !== undefined) row.name = patch.name
      if (patch.image !== undefined) row.image = patch.image ?? null
      if (patch.memberId !== undefined) row.member_id = patch.memberId || null
      const updated = unwrap(await supabase.from("meals").update(row).eq("id", id).select()) as Row[]
      if (!updated[0]) throw new Error("Meal not found.")
      return toMeal(updated[0])
    },

    async deleteMeal(id) {
      unwrap(await supabase.from("meals").delete().eq("id", id).select())
    },

    // ----- notifications -----
    // Notification content is shared across the household; each user's read /
    // dismissed state lives in `notification_states` (RLS-scoped to that user).
    async listNotifications() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase
          .from("notifications")
          .select("*, notification_states(read, dismissed)")
          .eq("household_id", hid)
          .order("created_at", { ascending: false }),
      ) as Row[]
      return rows
        .filter((r) => !(r.notification_states?.[0]?.dismissed))
        .map((r) => toNotification(r, r.notification_states?.[0]))
    },

    async createNotification(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("notifications")
          .insert({
            household_id: hid,
            title: input.title,
            body: input.body ?? null,
            time: input.time ?? null,
            member_id: input.memberId || null,
          })
          .select(),
      ) as Row[]
      return toNotification(inserted[0])
    },

    async updateNotification(id, patch) {
      // Shared content fields update the notification row...
      const row: Row = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.body !== undefined) row.body = patch.body ?? null
      if (patch.time !== undefined) row.time = patch.time ?? null
      if (patch.memberId !== undefined) row.member_id = patch.memberId || null
      let result: Row | undefined
      if (Object.keys(row).length > 0) {
        const updated = unwrap(
          await supabase.from("notifications").update(row).eq("id", id).select(),
        ) as Row[]
        if (!updated[0]) throw new Error("Notification not found.")
        result = updated[0]
      } else {
        const fetched = unwrap(
          await supabase.from("notifications").select("*").eq("id", id),
        ) as Row[]
        if (!fetched[0]) throw new Error("Notification not found.")
        result = fetched[0]
      }
      // ...while `read` updates only the current user's per-notification state.
      let read: boolean | undefined
      if (patch.read !== undefined) {
        const uid = await requireUserId()
        unwrap(
          await supabase
            .from("notification_states")
            .upsert(
              { notification_id: id, user_id: uid, read: patch.read, updated_at: new Date().toISOString() },
              { onConflict: "notification_id,user_id" },
            )
            .select(),
        )
        read = patch.read
      }
      return toNotification(result, read !== undefined ? { read } : undefined)
    },

    async deleteNotification(id) {
      // Dismiss for the current user only (content stays for everyone else).
      const uid = await requireUserId()
      unwrap(
        await supabase
          .from("notification_states")
          .upsert(
            { notification_id: id, user_id: uid, dismissed: true, updated_at: new Date().toISOString() },
            { onConflict: "notification_id,user_id" },
          )
          .select(),
      )
    },

    async markAllNotificationsRead() {
      const hid = await requireHouseholdId()
      const uid = await requireUserId()
      const rows = unwrap(
        await supabase.from("notifications").select("id").eq("household_id", hid),
      ) as Row[]
      if (rows.length === 0) return
      const now = new Date().toISOString()
      unwrap(
        await supabase
          .from("notification_states")
          .upsert(
            rows.map((r) => ({ notification_id: r.id, user_id: uid, read: true, updated_at: now })),
            { onConflict: "notification_id,user_id" },
          )
          .select(),
      )
    },

    async clearNotifications() {
      const hid = await requireHouseholdId()
      const uid = await requireUserId()
      const rows = unwrap(
        await supabase.from("notifications").select("id").eq("household_id", hid),
      ) as Row[]
      if (rows.length === 0) return
      const now = new Date().toISOString()
      unwrap(
        await supabase
          .from("notification_states")
          .upsert(
            rows.map((r) => ({ notification_id: r.id, user_id: uid, dismissed: true, updated_at: now })),
            { onConflict: "notification_id,user_id" },
          )
          .select(),
      )
    },

    // ----- photos -----
    async listPhotos() {
      const hid = await requireHouseholdId()
      const rows = unwrap(
        await supabase.from("photos").select("*").eq("household_id", hid).order("created_at", { ascending: false }),
      ) as Row[]
      return rows.map(toPhoto)
    },

    async createPhoto(input) {
      const hid = await requireHouseholdId()
      const inserted = unwrap(
        await supabase
          .from("photos")
          .insert({
            household_id: hid,
            src: input.src,
            caption: input.caption ?? "",
          })
          .select(),
      ) as Row[]
      return toPhoto(inserted[0])
    },

    async deletePhoto(id) {
      // Look up the src so we can clean up storage too (best-effort).
      const { data: row } = await supabase.from("photos").select("src").eq("id", id).single()
      unwrap(await supabase.from("photos").delete().eq("id", id).select())
      if (row?.src) {
        // Extract path relative to bucket root (everything after "/object/public/photos/")
        try {
          const url = new URL(row.src)
          const marker = "/object/public/photos/"
          const idx = url.pathname.indexOf(marker)
          if (idx !== -1) {
            const path = url.pathname.slice(idx + marker.length)
            await supabase.storage.from("photos").remove([path])
          }
        } catch {
          /* noop if URL parsing fails */
        }
      }
    },
  }
}
