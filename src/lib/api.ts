// ---------------------------------------------------------------------------
// Lumora API client
//
// The kiosk (Android) and the personal phone app (iOS) are BOTH this Tauri
// codebase. Neither talks to Neon directly — they only ever call this typed
// API client, which hits the dedicated backend (Next.js + Neon + Better Auth)
// at `VITE_API_BASE_URL`.
//
// Until that backend is deployed, an in-memory / localStorage mock adapter is
// used automatically (whenever VITE_API_BASE_URL is unset) so the full
// sign-up -> sign-in -> create member -> invite -> claim flow works in preview.
// When you set VITE_API_BASE_URL the real HTTP adapter is used instead, with no
// other code changes required.
// ---------------------------------------------------------------------------

import type {
  MemberColor,
  MemberRole,
  PermissionArea,
  Calendar,
  CalendarEvent,
  Chore,
  Checklist,
  Meal,
  Notification,
  Photo,
} from "./data"

// ----- Contract types (mirror these on the backend) ------------------------

export type User = {
  id: string
  email: string
  name: string
}

export type Household = {
  id: string
  name: string
}

/** A member belongs to a household and may be linked to a user account. */
export type ApiMember = {
  id: string
  householdId: string
  name: string
  color: MemberColor
  role: MemberRole
  dob?: string
  /** Linked account id, if this member has claimed/owns an account. */
  userId?: string
  /** Linked account email, for display. */
  account?: string
  /** Areas this member can manage (non-admins only; admins have all). */
  permissions?: PermissionArea[]
  /** True while an invite is outstanding and unclaimed. */
  pending?: boolean
}

export type Invite = {
  /** Opaque token embedded in the QR code. */
  token: string
  /** Short human-typable fallback code, e.g. "K3F-9Q2". */
  code: string
  householdId: string
  householdName: string
  /** The member slot this invite will fill once claimed. */
  memberId: string
  memberName: string
  role: MemberRole
  /** Prefilled email for the invited person's account (admin-provided). */
  email?: string
  expiresAt: string
}

export type Session = {
  user: User
  household: Household
}

export type SignUpInput = {
  name: string
  email: string
  password: string
  /** Optional household name when creating a brand-new family. */
  householdName?: string
}

export type SignInInput = { email: string; password: string }

export type CreateMemberInput = {
  name: string
  color: MemberColor
  role: MemberRole
  dob?: string
  /** Connected user account email, for display. */
  account?: string
  /** Areas this member can manage (non-admins only). */
  permissions?: PermissionArea[]
  /** Link this new member to the current signed-in user ("this is me"). */
  linkSelf?: boolean
}

export type CreateInviteInput = {
  name: string
  role: MemberRole
  color: MemberColor
  dob?: string
  /** Attach the invite to an existing member slot instead of creating a new one. */
  memberId?: string
  /** Prefilled email for the invited person's account. */
  email?: string
}

export type ClaimInviteInput = {
  token: string
  name: string
  email: string
  password: string
  dob?: string
  color?: MemberColor
}

export type ApiError = { error: string }

export interface LumoraApi {
  signUp(input: SignUpInput): Promise<Session & { token: string }>
  signIn(input: SignInInput): Promise<Session & { token: string }>
  /** OAuth sign-in with Apple. Redirects the browser; resolves on success or throws. */
  signInWithApple?(): Promise<void>
  signOut(): Promise<void>
  getSession(): Promise<Session | null>

  listMembers(): Promise<ApiMember[]>
  createMember(input: CreateMemberInput): Promise<ApiMember>
  updateMember(id: string, patch: Partial<CreateMemberInput>): Promise<ApiMember>
  deleteMember(id: string): Promise<void>

  /** Create an unclaimed member slot + invite (returns QR token + code). */
  createInvite(input: CreateInviteInput): Promise<Invite>
  /** Look up an invite by token or code (for the claim screen preview). */
  getInvite(tokenOrCode: string): Promise<Invite | null>
  /** Invited person creates their account + profile, claiming the slot. */
  claimInvite(input: ClaimInviteInput): Promise<Session & { token: string }>

  // calendars
  listCalendars(): Promise<Calendar[]>
  createCalendar(input: Omit<Calendar, "id">): Promise<Calendar>
  updateCalendar(id: string, patch: Partial<Omit<Calendar, "id">>): Promise<Calendar>
  deleteCalendar(id: string): Promise<void>

  // events
  listEvents(): Promise<CalendarEvent[]>
  createEvent(input: Omit<CalendarEvent, "id">): Promise<CalendarEvent>
  updateEvent(id: string, patch: Partial<Omit<CalendarEvent, "id">>): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>

  // chores
  listChores(): Promise<Chore[]>
  createChore(input: Omit<Chore, "id">): Promise<Chore>
  updateChore(id: string, patch: Partial<Omit<Chore, "id">>): Promise<Chore>
  deleteChore(id: string): Promise<void>

  // lists (items are nested; item mutations return the updated list)
  listLists(): Promise<Checklist[]>
  createList(input: { title: string; color: MemberColor }): Promise<Checklist>
  updateList(id: string, patch: { title?: string; color?: MemberColor }): Promise<Checklist>
  deleteList(id: string): Promise<void>
  addListItem(listId: string, label: string): Promise<Checklist>
  updateListItem(listId: string, itemId: string, patch: { label?: string; done?: boolean }): Promise<Checklist>
  deleteListItem(listId: string, itemId: string): Promise<Checklist>

  // meals
  listMeals(): Promise<Meal[]>
  createMeal(input: Omit<Meal, "id">): Promise<Meal>
  updateMeal(id: string, patch: Partial<Omit<Meal, "id">>): Promise<Meal>
  deleteMeal(id: string): Promise<void>

  // notifications — content is shared across the household, but read/dismiss
  // state is tracked per signed-in user.
  /** Notifications the current user hasn't dismissed, with their own read flag. */
  listNotifications(): Promise<Notification[]>
  /** Create a shared notification for the household. */
  createNotification(input: Omit<Notification, "id">): Promise<Notification>
  /** Update shared content and/or the current user's `read` flag. */
  updateNotification(id: string, patch: Partial<Omit<Notification, "id">>): Promise<Notification>
  /** Dismiss a notification for the current user only. */
  deleteNotification(id: string): Promise<void>
  /** Mark every visible notification read for the current user. */
  markAllNotificationsRead(): Promise<void>
  /** Dismiss every visible notification for the current user. */
  clearNotifications(): Promise<void>

  // photos
  listPhotos(): Promise<Photo[]>
  createPhoto(input: Omit<Photo, "id">): Promise<Photo>
  deletePhoto(id: string): Promise<void>
}

// ----- Token storage --------------------------------------------------------

const TOKEN_KEY = "lumora.token"

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

// ----- HTTP adapter (used when VITE_API_BASE_URL is set) --------------------

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")

function createHttpApi(baseUrl: string): LumoraApi {
  async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = tokenStore.get()
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      let message = `Request failed (${res.status})`
      try {
        const data = (await res.json()) as ApiError
        if (data?.error) message = data.error
      } catch {
        /* ignore parse errors */
      }
      throw new Error(message)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    signUp: (input) => req("/auth/sign-up", "POST", input),
    signIn: (input) => req("/auth/sign-in", "POST", input),
    signOut: () => req("/auth/sign-out", "POST"),
    getSession: () => req("/auth/session", "GET"),
    listMembers: () => req("/members", "GET"),
    createMember: (input) => req("/members", "POST", input),
    updateMember: (id, patch) => req(`/members/${id}`, "PATCH", patch),
    deleteMember: (id) => req(`/members/${id}`, "DELETE"),
    createInvite: (input) => req("/invites", "POST", input),
    getInvite: (tokenOrCode) => req(`/invites/${encodeURIComponent(tokenOrCode)}`, "GET"),
    claimInvite: (input) => req("/invites/claim", "POST", input),

    listCalendars: () => req("/calendars", "GET"),
    createCalendar: (input) => req("/calendars", "POST", input),
    updateCalendar: (id, patch) => req(`/calendars/${id}`, "PATCH", patch),
    deleteCalendar: (id) => req(`/calendars/${id}`, "DELETE"),

    listEvents: () => req("/events", "GET"),
    createEvent: (input) => req("/events", "POST", input),
    updateEvent: (id, patch) => req(`/events/${id}`, "PATCH", patch),
    deleteEvent: (id) => req(`/events/${id}`, "DELETE"),

    listChores: () => req("/chores", "GET"),
    createChore: (input) => req("/chores", "POST", input),
    updateChore: (id, patch) => req(`/chores/${id}`, "PATCH", patch),
    deleteChore: (id) => req(`/chores/${id}`, "DELETE"),

    listLists: () => req("/lists", "GET"),
    createList: (input) => req("/lists", "POST", input),
    updateList: (id, patch) => req(`/lists/${id}`, "PATCH", patch),
    deleteList: (id) => req(`/lists/${id}`, "DELETE"),
    addListItem: (listId, label) => req(`/lists/${listId}/items`, "POST", { label }),
    updateListItem: (listId, itemId, patch) => req(`/lists/${listId}/items/${itemId}`, "PATCH", patch),
    deleteListItem: (listId, itemId) => req(`/lists/${listId}/items/${itemId}`, "DELETE"),

    listMeals: () => req("/meals", "GET"),
    createMeal: (input) => req("/meals", "POST", input),
    updateMeal: (id, patch) => req(`/meals/${id}`, "PATCH", patch),
    deleteMeal: (id) => req(`/meals/${id}`, "DELETE"),

    listNotifications: () => req("/notifications", "GET"),
    createNotification: (input) => req("/notifications", "POST", input),
    updateNotification: (id, patch) => req(`/notifications/${id}`, "PATCH", patch),
    deleteNotification: (id) => req(`/notifications/${id}`, "DELETE"),
    markAllNotificationsRead: () => req("/notifications/read-all", "POST"),
    clearNotifications: () => req("/notifications", "DELETE"),

    listPhotos: () => req("/photos", "GET"),
    createPhoto: (input) => req("/photos", "POST", input),
    deletePhoto: (id) => req(`/photos/${id}`, "DELETE"),
  }
}

// ----- Mock adapter (used when VITE_API_BASE_URL is unset) ------------------

type Owned<T> = T & { householdId: string }

type MockDb = {
  users: Array<User & { password: string; householdId: string }>
  households: Household[]
  members: ApiMember[]
  invites: Invite[]
  sessions: Record<string, string> // token -> userId
  calendars: Array<Owned<Calendar>>
  events: Array<Owned<CalendarEvent>>
  chores: Array<Owned<Chore>>
  lists: Array<Owned<Checklist>>
  meals: Array<Owned<Meal>>
  notifications: Array<Owned<Notification>>
  photos: Array<Owned<Photo>>
}

const MOCK_KEY = "lumora.mockdb"

function emptyMockDb(): MockDb {
  return {
    users: [],
    households: [],
    members: [],
    invites: [],
    sessions: {},
    calendars: [],
    events: [],
    chores: [],
    lists: [],
    meals: [],
    notifications: [],
    photos: [],
  }
}

function loadMockDb(): MockDb {
  try {
    const raw = localStorage.getItem(MOCK_KEY)
    if (raw) return { ...emptyMockDb(), ...(JSON.parse(raw) as Partial<MockDb>) }
  } catch {
    /* ignore */
  }
  return emptyMockDb()
}

function saveMockDb(db: MockDb) {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(db))
  } catch {
    /* ignore */
  }
}

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function inviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${pick(3)}-${pick(3)}`
}

async function delay<T>(value: T): Promise<T> {
  await new Promise((r) => setTimeout(r, 220))
  return value
}

/** Strip the internal householdId before returning a record to the client. */
function pub<T>(row: Owned<T>): T {
  const { householdId: _householdId, ...rest } = row
  return rest as unknown as T
}

function createMockApi(): LumoraApi {
  function currentUser(db: MockDb) {
    const token = tokenStore.get()
    const userId = token ? db.sessions[token] : undefined
    return db.users.find((u) => u.id === userId) ?? null
  }

  function requireHouseholdId(db: MockDb): string {
    const user = currentUser(db)
    if (!user) throw new Error("Not signed in.")
    const full = db.users.find((u) => u.id === user.id)!
    return full.householdId
  }

  return {
    async signUp(input) {
      const db = loadMockDb()
      const email = input.email.trim().toLowerCase()
      if (db.users.some((u) => u.email === email)) {
        throw new Error("An account with this email already exists.")
      }
      const household: Household = { id: rid("hh"), name: input.householdName?.trim() || `${input.name}'s Family` }
      const user: User & { password: string; householdId: string } = {
        id: rid("usr"),
        email,
        name: input.name.trim(),
        password: input.password,
        householdId: household.id,
      }
      const token = rid("tok")
      // The account owner is the household's first member and an admin.
      const ownerMember: ApiMember = {
        id: rid("mem"),
        householdId: household.id,
        name: user.name,
        color: "blue",
        role: "admin",
        userId: user.id,
        account: user.email,
      }
      // Every household starts with a shared "Family" calendar.
      const familyCalendar: Owned<Calendar> = {
        id: rid("cal"),
        householdId: household.id,
        name: "Family",
        color: "blue",
        memberIds: [ownerMember.id],
      }
      db.households.push(household)
      db.users.push(user)
      db.members.push(ownerMember)
      db.calendars.push(familyCalendar)
      db.sessions[token] = user.id
      saveMockDb(db)
      tokenStore.set(token)
      return delay({ token, user: { id: user.id, email: user.email, name: user.name }, household })
    },

    async signIn(input) {
      const db = loadMockDb()
      const email = input.email.trim().toLowerCase()
      const user = db.users.find((u) => u.email === email)
      if (!user || user.password !== input.password) {
        throw new Error("Incorrect email or password.")
      }
      const household = db.households.find((h) => h.id === user.householdId)!
      const token = rid("tok")
      db.sessions[token] = user.id
      saveMockDb(db)
      tokenStore.set(token)
      return delay({ token, user: { id: user.id, email: user.email, name: user.name }, household })
    },

    async signOut() {
      const db = loadMockDb()
      const token = tokenStore.get()
      if (token) delete db.sessions[token]
      saveMockDb(db)
      tokenStore.clear()
      return delay(undefined)
    },

    async getSession() {
      const db = loadMockDb()
      const user = currentUser(db)
      if (!user) return delay(null)
      const full = db.users.find((u) => u.id === user.id)!
      const household = db.households.find((h) => h.id === full.householdId)!
      return delay({ user, household })
    },

    async listMembers() {
      const db = loadMockDb()
      const user = currentUser(db)
      if (!user) throw new Error("Not signed in.")
      const full = db.users.find((u) => u.id === user.id)!
      return delay(db.members.filter((m) => m.householdId === full.householdId))
    },

    async createMember(input) {
      const db = loadMockDb()
      const user = currentUser(db)
      if (!user) throw new Error("Not signed in.")
      const full = db.users.find((u) => u.id === user.id)!
      const member: ApiMember = {
        id: rid("mem"),
        householdId: full.householdId,
        name: input.name.trim(),
        color: input.color,
        role: input.role,
        dob: input.dob,
        userId: input.linkSelf ? user.id : undefined,
        account: input.account ?? (input.linkSelf ? user.email : undefined),
        permissions: input.role === "admin" ? undefined : input.permissions ?? [],
      }
      db.members.push(member)
      saveMockDb(db)
      return delay(member)
    },

    async updateMember(id, patch) {
      const db = loadMockDb()
      const idx = db.members.findIndex((m) => m.id === id)
      if (idx === -1) throw new Error("Member not found.")
      db.members[idx] = { ...db.members[idx], ...patch }
      saveMockDb(db)
      return delay(db.members[idx])
    },

    async deleteMember(id) {
      const db = loadMockDb()
      db.members = db.members.filter((m) => m.id !== id)
      db.invites = db.invites.filter((i) => i.memberId !== id)
      saveMockDb(db)
      return delay(undefined)
    },

    async createInvite(input) {
      const db = loadMockDb()
      const user = currentUser(db)
      if (!user) throw new Error("Not signed in.")
      const full = db.users.find((u) => u.id === user.id)!
      const household = db.households.find((h) => h.id === full.householdId)!
      // Reuse the existing member slot when provided; otherwise create one.
      let member = input.memberId ? db.members.find((m) => m.id === input.memberId) : undefined
      if (member) {
        member.pending = true
        if (input.email && !member.account) member.account = input.email
      } else {
        member = {
          id: rid("mem"),
          householdId: full.householdId,
          name: input.name.trim(),
          color: input.color,
          role: input.role,
          dob: input.dob,
          account: input.email,
          pending: true,
        }
        db.members.push(member)
      }
      // Drop any stale invite already attached to this member slot.
      db.invites = db.invites.filter((i) => i.memberId !== member!.id)
      const invite: Invite = {
        token: rid("inv"),
        code: inviteCode(),
        householdId: household.id,
        householdName: household.name,
        memberId: member.id,
        memberName: member.name,
        role: member.role,
        email: input.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
      db.invites.push(invite)
      saveMockDb(db)
      return delay(invite)
    },

    async getInvite(tokenOrCode) {
      const db = loadMockDb()
      const key = tokenOrCode.trim().toUpperCase()
      const invite =
        db.invites.find((i) => i.token === tokenOrCode) ??
        db.invites.find((i) => i.code.toUpperCase() === key)
      return delay(invite ?? null)
    },

    async claimInvite(input) {
      const db = loadMockDb()
      const invite = db.invites.find((i) => i.token === input.token)
      if (!invite) throw new Error("This invite is invalid or has expired.")
      const email = input.email.trim().toLowerCase()
      if (db.users.some((u) => u.email === email)) {
        throw new Error("An account with this email already exists.")
      }
      const user: User & { password: string; householdId: string } = {
        id: rid("usr"),
        email,
        name: input.name.trim(),
        password: input.password,
        householdId: invite.householdId,
      }
      db.users.push(user)
      // Fill the pending member slot.
      const member = db.members.find((m) => m.id === invite.memberId)
      if (member) {
        member.pending = false
        member.userId = user.id
        member.account = user.email
        member.name = input.name.trim() || member.name
        if (input.dob) member.dob = input.dob
        if (input.color) member.color = input.color
      }
      db.invites = db.invites.filter((i) => i.token !== invite.token)
      const token = rid("tok")
      db.sessions[token] = user.id
      saveMockDb(db)
      tokenStore.set(token)
      const household = db.households.find((h) => h.id === invite.householdId)!
      return delay({ token, user: { id: user.id, email: user.email, name: user.name }, household })
    },

    // ----- collections (all scoped to the signed-in user's household) -----

    async listCalendars() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.calendars.filter((c) => c.householdId === hh).map(pub))
    },
    async createCalendar(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<Calendar> = { ...input, id: rid("cal"), householdId: hh }
      db.calendars.push(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateCalendar(id, patch) {
      const db = loadMockDb()
      const idx = db.calendars.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error("Calendar not found.")
      db.calendars[idx] = { ...db.calendars[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.calendars[idx]))
    },
    async deleteCalendar(id) {
      const db = loadMockDb()
      db.calendars = db.calendars.filter((c) => c.id !== id)
      // Remove the events that belonged to the deleted calendar.
      db.events = db.events.filter((e) => e.calendarId !== id)
      saveMockDb(db)
      return delay(undefined)
    },

    async listEvents() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.events.filter((e) => e.householdId === hh).map(pub))
    },
    async createEvent(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<CalendarEvent> = { ...input, id: rid("evt"), householdId: hh }
      db.events.push(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateEvent(id, patch) {
      const db = loadMockDb()
      const idx = db.events.findIndex((e) => e.id === id)
      if (idx === -1) throw new Error("Event not found.")
      db.events[idx] = { ...db.events[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.events[idx]))
    },
    async deleteEvent(id) {
      const db = loadMockDb()
      db.events = db.events.filter((e) => e.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },

    async listChores() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.chores.filter((c) => c.householdId === hh).map(pub))
    },
    async createChore(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<Chore> = { ...input, id: rid("chr"), householdId: hh }
      db.chores.push(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateChore(id, patch) {
      const db = loadMockDb()
      const idx = db.chores.findIndex((c) => c.id === id)
      if (idx === -1) throw new Error("Chore not found.")
      db.chores[idx] = { ...db.chores[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.chores[idx]))
    },
    async deleteChore(id) {
      const db = loadMockDb()
      db.chores = db.chores.filter((c) => c.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },

    async listLists() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.lists.filter((l) => l.householdId === hh).map(pub))
    },
    async createList(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<Checklist> = { id: rid("lst"), title: input.title, color: input.color, items: [], householdId: hh }
      db.lists.push(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateList(id, patch) {
      const db = loadMockDb()
      const idx = db.lists.findIndex((l) => l.id === id)
      if (idx === -1) throw new Error("List not found.")
      db.lists[idx] = { ...db.lists[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.lists[idx]))
    },
    async deleteList(id) {
      const db = loadMockDb()
      db.lists = db.lists.filter((l) => l.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },
    async addListItem(listId, label) {
      const db = loadMockDb()
      const list = db.lists.find((l) => l.id === listId)
      if (!list) throw new Error("List not found.")
      list.items.push({ id: rid("itm"), label, done: false })
      saveMockDb(db)
      return delay(pub(list))
    },
    async updateListItem(listId, itemId, patch) {
      const db = loadMockDb()
      const list = db.lists.find((l) => l.id === listId)
      if (!list) throw new Error("List not found.")
      list.items = list.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
      saveMockDb(db)
      return delay(pub(list))
    },
    async deleteListItem(listId, itemId) {
      const db = loadMockDb()
      const list = db.lists.find((l) => l.id === listId)
      if (!list) throw new Error("List not found.")
      list.items = list.items.filter((i) => i.id !== itemId)
      saveMockDb(db)
      return delay(pub(list))
    },

    async listMeals() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.meals.filter((m) => m.householdId === hh).map(pub))
    },
    async createMeal(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      // Only one meal per (day, type) slot — replace any existing one.
      const existing = db.meals.find(
        (m) => m.householdId === hh && m.day === input.day && m.type === input.type,
      )
      if (existing) {
        Object.assign(existing, input)
        saveMockDb(db)
        return delay(pub(existing))
      }
      const row: Owned<Meal> = { ...input, id: rid("mea"), householdId: hh }
      db.meals.push(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateMeal(id, patch) {
      const db = loadMockDb()
      const idx = db.meals.findIndex((m) => m.id === id)
      if (idx === -1) throw new Error("Meal not found.")
      db.meals[idx] = { ...db.meals[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.meals[idx]))
    },
    async deleteMeal(id) {
      const db = loadMockDb()
      db.meals = db.meals.filter((m) => m.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },

    async listNotifications() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.notifications.filter((n) => n.householdId === hh).map(pub))
    },
    async createNotification(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<Notification> = { ...input, id: rid("ntf"), householdId: hh }
      db.notifications.unshift(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async updateNotification(id, patch) {
      const db = loadMockDb()
      const idx = db.notifications.findIndex((n) => n.id === id)
      if (idx === -1) throw new Error("Notification not found.")
      db.notifications[idx] = { ...db.notifications[idx], ...patch }
      saveMockDb(db)
      return delay(pub(db.notifications[idx]))
    },
    async deleteNotification(id) {
      const db = loadMockDb()
      db.notifications = db.notifications.filter((n) => n.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },
    async markAllNotificationsRead() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      db.notifications = db.notifications.map((n) => (n.householdId === hh ? { ...n, read: true } : n))
      saveMockDb(db)
      return delay(undefined)
    },
    async clearNotifications() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      db.notifications = db.notifications.filter((n) => n.householdId !== hh)
      saveMockDb(db)
      return delay(undefined)
    },

    async listPhotos() {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      return delay(db.photos.filter((p) => p.householdId === hh).map(pub))
    },
    async createPhoto(input) {
      const db = loadMockDb()
      const hh = requireHouseholdId(db)
      const row: Owned<Photo> = { ...input, id: rid("pho"), householdId: hh }
      db.photos.unshift(row)
      saveMockDb(db)
      return delay(pub(row))
    },
    async deletePhoto(id) {
      const db = loadMockDb()
      db.photos = db.photos.filter((p) => p.id !== id)
      saveMockDb(db)
      return delay(undefined)
    },
  }
}

// ----- Mutation guard -------------------------------------------------------
//
// Live-sync polling re-fetches every table on an interval. To avoid a poll
// clobbering an optimistic local change that hasn't round-tripped yet, every
// mutating call stamps `lastMutationAt`; the poller skips reconciling for a
// short grace window afterwards.

export const syncGuard = {
  lastMutationAt: 0,
  note() {
    this.lastMutationAt = Date.now()
  },
  /** True if a local mutation happened within the last `ms` milliseconds. */
  isBusy(ms = 4000) {
    return Date.now() - this.lastMutationAt < ms
  },
}

/** Method names that change server state (vs. read-only `list*`/`get*`). */
const MUTATING_METHODS = new Set<keyof LumoraApi>([
  "createMember", "updateMember", "deleteMember",
  "createInvite", "claimInvite",
  "createCalendar", "updateCalendar", "deleteCalendar",
  "createEvent", "updateEvent", "deleteEvent",
  "createChore", "updateChore", "deleteChore",
  "createList", "updateList", "deleteList",
  "addListItem", "updateListItem", "deleteListItem",
  "createMeal", "updateMeal", "deleteMeal",
  "createNotification", "updateNotification", "deleteNotification",
  "markAllNotificationsRead", "clearNotifications",
  "createPhoto", "deletePhoto",
])

/** Wrap the adapter so every mutating method stamps the sync guard. */
function withMutationGuard(adapter: LumoraApi): LumoraApi {
  const wrapped = {} as Record<string, unknown>
  for (const key of Object.keys(adapter) as (keyof LumoraApi)[]) {
    const fn = adapter[key]
    if (typeof fn === "function" && MUTATING_METHODS.has(key)) {
      wrapped[key] = (...args: unknown[]) => {
        syncGuard.note()
        return (fn as (...a: unknown[]) => unknown).apply(adapter, args)
      }
    } else if (typeof fn === "function") {
      wrapped[key] = (fn as (...a: unknown[]) => unknown).bind(adapter)
    } else {
      wrapped[key] = fn
    }
  }
  return wrapped as unknown as LumoraApi
}

// ----- Export the active adapter -------------------------------------------

import { createSupabaseApi } from "./supabase-client"
import { isSupabaseConfigured } from "./supabase"

// Prefer Supabase (Auth + Postgres + Realtime) when configured, then a custom
// HTTP backend, otherwise the in-browser mock used for local preview.
export const isMockApi = !isSupabaseConfigured && !BASE_URL
export const isSupabaseApi = isSupabaseConfigured
export const api: LumoraApi = withMutationGuard(
  isSupabaseConfigured
    ? createSupabaseApi()
    : BASE_URL
      ? createHttpApi(BASE_URL)
      : createMockApi(),
)
