"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin, Plus, Settings2, Trash2, Check, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type CalendarEvent,
  type Calendar,
  type MemberColor,
  memberBg,
  memberSoft,
  toISODate,
  weekDates,
} from "@/lib/data"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { SwipeRow } from "@/components/ui/reusables/swipe-row"
import { BottomSheet, Field, inputClass } from "@/components/ui/reusables/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { useHighlight, useStore } from "@/lib/store"

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const calendarColors: MemberColor[] = ["blue", "coral", "teal", "amber", "pink", "green"]

function formatHour(h: number) {
  const ampm = h < 12 ? "AM" : "PM"
  const base = h % 12 === 0 ? 12 : h % 12
  return `${base}:00 ${ampm}`
}

type FormState = {
  title: string
  start: number
  end: number
  memberIds: string[]
  calendarId: string
  location: string
}

export function CalendarView() {
  const {
    events,
    calendars,
    members,
    getMember,
    activeMember,
    can,
    addEvent,
    updateEvent,
    deleteEvent,
    addCalendar,
    updateCalendar,
    deleteCalendar,
  } = useStore()
  const { highlight, register, clearHighlight, refs } = useHighlight("calendar")

  const canManage = can("calendar")
  const today = useMemo(() => new Date(), [])
  const todayISO = toISODate(today)

  const [selectorOpen, setSelectorOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"week" | "month">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("calendarViewMode") as "week" | "month") || "week"
    }
    return "week"
  })

  const [selectedDate, setSelectedDate] = useState(todayISO)

  const week = useMemo(() => {
    const selected = new Date(selectedDate)
    return weekDates(selected)
  }, [selectedDate])
  const [calFilter, setCalFilter] = useState<string | null>(null) // null = all calendars
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<FormState>({
    title: "",
    start: 9,
    end: 10,
    memberIds: [],
    calendarId: "",
    location: "",
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const visible = events
    .filter((e) => e.date === selectedDate)
    .filter((e) => (activeMember ? e.memberIds.includes(activeMember) : true))
    .filter((e) => (calFilter ? e.calendarId === calFilter : true))

  useEffect(() => {
    if (!highlight) return
    const el = refs.get(highlight.id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("highlight-flash")
    const t = setTimeout(() => {
      el.classList.remove("highlight-flash")
      clearHighlight()
    }, 2000)
    return () => clearTimeout(t)
  }, [highlight, refs, clearHighlight])

  const calColor = (id: string): MemberColor => calendars.find((c) => c.id === id)?.color ?? "blue"

  const openAdd = () => {
    if (!canManage) return
    setEditing(null)
    setForm({
      title: "",
      start: 9,
      end: 10,
      memberIds: activeMember ? [activeMember] : [],
      calendarId: calFilter ?? calendars[0]?.id ?? "",
      location: "",
    })
    setSheetOpen(true)
  }

  const openEdit = (e: CalendarEvent) => {
    if (!canManage) return
    setEditing(e)
    setForm({
      title: e.title,
      start: e.start,
      end: e.end,
      memberIds: e.memberIds,
      calendarId: e.calendarId,
      location: e.location ?? "",
    })
    setSheetOpen(true)
  }

  const toggleFormMember = (id: string) =>
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(id) ? f.memberIds.filter((m) => m !== id) : [...f.memberIds, id],
    }))

  const save = () => {
    if (!form.title.trim() || !form.calendarId) return
    const payload = {
      title: form.title.trim(),
      date: selectedDate,
      time: formatHour(form.start),
      start: form.start,
      end: Math.max(form.end, form.start + 1),
      memberIds: form.memberIds,
      calendarId: form.calendarId,
      location: form.location.trim() || undefined,
    }
    if (editing) updateEvent(editing.id, payload)
    else addEvent(payload)
    setSheetOpen(false)
  }

  const deleting = deleteId ? events.find((e) => e.id === deleteId) : null
  const selDate = new Date(`${selectedDate}T00:00:00`)
  const dateLabel = `${dayNames[selDate.getDay()]}, ${monthNames[selDate.getMonth()]} ${selDate.getDate()}`

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Calendar filter chips */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4">
        <FilterChip label="All" active={calFilter === null} onClick={() => setCalFilter(null)} />
        {calendars.map((c) => (
          <FilterChip
            key={c.id}
            label={c.name}
            color={c.color}
            active={calFilter === c.id}
            onClick={() => setCalFilter(c.id)}
          />
        ))}
        {canManage ? (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            aria-label="Manage calendars"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Settings2 className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Week selector and view mode */}
      <div className="flex items-center justify-between gap-2 pb-2">
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          {new Date(selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </button>
        <select
          value={viewMode}
          onChange={(e) => {
            const mode = e.target.value as "week" | "month"
            setViewMode(mode)
            localStorage.setItem("calendarViewMode", mode)
          }}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-medium"
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      {/* Week strip (smooth horizontal scroll) */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 scroll-smooth">
        {week.map((d) => {
          const iso = toISODate(d)
          const isSelected = iso === selectedDate
          const isToday = iso === todayISO
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDate(iso)}
              className={cn(
                "flex w-13 shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2.5 transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-card text-foreground hover:bg-secondary",
              )}
            >
              <span className={cn("text-xs font-medium", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {dayNames[d.getDay()]}
              </span>
              <span className="text-lg font-bold leading-none">{d.getDate()}</span>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isToday ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                )}
              />
            </button>
          )
        })}
      </div>

      {/* Day summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {visible.length} {visible.length === 1 ? "event" : "events"} · {dateLabel}
        </p>
        <div className="flex -space-x-2">
          {Array.from(new Set(visible.flatMap((e) => e.memberIds))).slice(0, 4).map((id) => (
            <MemberAvatar key={id} member={getMember(id)} size="sm" ring />
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {visible.map((event) => {
          const assignees = event.memberIds.map((id) => getMember(id))
          const color = calColor(event.calendarId)
          return (
            <div key={event.id} ref={register(event.id)} className="flex gap-5">
              <div className="w-16 shrink-0 pt-3 text-right text-xs font-medium text-muted-foreground">
                {event.time}
              </div>
              <div className="min-w-0 flex-1">
                <SwipeRow
                  onEdit={canManage ? () => openEdit(event) : undefined}
                  onDelete={canManage ? () => setDeleteId(event.id) : undefined}
                >
                  {/* Accent bar lives inside the swipe foreground so it moves with the card */}
                  <div className="flex bg-card">
                    <span className={cn("w-1 shrink-0 rounded-l-2xl", memberBg[color])} aria-hidden />
                    <div className="min-w-0 flex-1 p-3 pl-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold leading-tight">{event.title}</p>
                          {event.location ? (
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {event.location}
                            </p>
                          ) : null}
                        </div>
                        {assignees.length === 1 ? (
                          <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold", memberSoft[assignees[0].color])}>
                            {assignees[0].name}
                          </span>
                        ) : assignees.length > 1 ? (
                          <div className="flex shrink-0 -space-x-2">
                            {assignees.slice(0, 4).map((m) => (
                              <MemberAvatar key={m.id} member={m} size="sm" ring />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </SwipeRow>
              </div>
            </div>
          )
        })}

        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {calendars.length === 0 ? "Create a calendar to start adding events." : "No events for this day."}
          </p>
        ) : null}
      </div>

      {canManage && calendars.length > 0 ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Add event
          </button>
        </div>
      ) : null}

      {/* Add / edit event */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Edit event" : "New event"}
        footer={
          <button
            type="button"
            onClick={save}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {editing ? "Save changes" : "Add event"}
          </button>
        }
      >
        <Field label="Title">
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Soccer practice"
            className={inputClass}
          />
        </Field>
        <Field label="Calendar">
          <select
            value={form.calendarId}
            onChange={(e) => setForm((f) => ({ ...f, calendarId: e.target.value }))}
            className={inputClass}
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3">
          <Field label="Starts">
            <select
              value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: Number(e.target.value) }))}
              className={inputClass}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ends">
            <select
              value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: Number(e.target.value) }))}
              className={inputClass}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Assigned to">
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = form.memberIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleFormMember(m.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {m.name}
                </button>
              )
            })}
            {members.length === 0 ? (
              <span className="text-xs text-muted-foreground">Add family members first.</span>
            ) : null}
          </div>
        </Field>
        <Field label="Location (optional)">
          <input
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Field 3"
            className={inputClass}
          />
        </Field>
      </BottomSheet>

      {/* Manage calendars */}
      <ManageCalendarsSheet
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        calendars={calendars}
        members={members}
        onAdd={addCalendar}
        onUpdate={updateCalendar}
        onDelete={(id) => {
          if (calFilter === id) setCalFilter(null)
          deleteCalendar(id)
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete event?"
        message={deleting ? `"${deleting.title}" will be removed.` : ""}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteEvent(deleteId)
          setDeleteId(null)
        }}
      />

      {/* Date picker modal */}
      {selectorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectorOpen(false)}
        >
          <div
            className="w-80 rounded-2xl bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-semibold">Jump to date</h3>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                setSelectorOpen(false)
              }}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setSelectorOpen(false)}
              className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color?: MemberColor
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary",
      )}
    >
      {color ? <span className={cn("size-2 rounded-full", memberBg[color])} aria-hidden /> : null}
      {label}
    </button>
  )
}

type CalDraft = { name: string; color: MemberColor; memberIds: string[] }

function ManageCalendarsSheet({
  open,
  onClose,
  calendars,
  members,
  onAdd,
  onUpdate,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  calendars: Calendar[]
  members: { id: string; name: string }[]
  onAdd: (c: Omit<Calendar, "id">) => void
  onUpdate: (id: string, patch: Partial<Omit<Calendar, "id">>) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<CalDraft>({ name: "", color: "coral", memberIds: [] })
  const [confirmDelete, setConfirmDelete] = useState<Calendar | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CalDraft>({ name: "", color: "coral", memberIds: [] })

  const submit = () => {
    if (!draft.name.trim()) return
    onAdd({ name: draft.name.trim(), color: draft.color, memberIds: draft.memberIds })
    setDraft({ name: "", color: "coral", memberIds: [] })
  }

  const toggleMember = (id: string) =>
    setDraft((d) => ({
      ...d,
      memberIds: d.memberIds.includes(id) ? d.memberIds.filter((m) => m !== id) : [...d.memberIds, id],
    }))

  const startEdit = (c: Calendar) => {
    setEditingId(c.id)
    setEditDraft({ name: c.name, color: c.color, memberIds: c.memberIds })
  }

  const saveEdit = (id: string) => {
    if (!editDraft.name.trim()) return
    onUpdate(id, { name: editDraft.name.trim(), color: editDraft.color, memberIds: editDraft.memberIds })
    setEditingId(null)
  }

  const toggleEditMember = (id: string) =>
    setEditDraft((d) => ({
      ...d,
      memberIds: d.memberIds.includes(id) ? d.memberIds.filter((m) => m !== id) : [...d.memberIds, id],
    }))

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Manage calendars"
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!draft.name.trim()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add calendar
        </button>
      }
    >
      {/* Existing calendars */}
      <div className="space-y-2">
        {calendars.map((c) =>
          editingId === c.id ? (
            <div key={c.id} className="space-y-3 rounded-2xl border border-primary/50 p-3">
              <Field label="Name">
                <input
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  {calendarColors.map((col) => (
                    <button
                      key={col}
                      type="button"
                      aria-label={`Color ${col}`}
                      onClick={() => setEditDraft((d) => ({ ...d, color: col }))}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-all",
                        memberBg[col],
                        editDraft.color === col ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-card" : "",
                      )}
                    >
                      {editDraft.color === col ? <Check className="size-4 text-white" /> : null}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Shared with">
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const on = editDraft.memberIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleEditMember(m.id)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                          on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                        )}
                      >
                        {m.name}
                      </button>
                    )
                  })}
                  {members.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Add family members first.</span>
                  ) : null}
                </div>
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => saveEdit(c.id)}
                  disabled={!editDraft.name.trim()}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  aria-label="Cancel editing"
                  className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-secondary"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
              <span className={cn("size-3 shrink-0 rounded-full", memberBg[c.color])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.memberIds.length} {c.memberIds.length === 1 ? "member" : "members"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => startEdit(c)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setConfirmDelete(c)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ),
        )}
        {calendars.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No calendars yet. Create your first below.</p>
        ) : null}
      </div>

      {/* New calendar form */}
      <div className="mt-4 space-y-3 rounded-2xl border border-border/70 p-3">
        <p className="text-sm font-semibold">New calendar</p>
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Friends, Work, Sports…"
            className={inputClass}
          />
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-2">
            {calendarColors.map((col) => (
              <button
                key={col}
                type="button"
                aria-label={`Color ${col}`}
                onClick={() => setDraft((d) => ({ ...d, color: col }))}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-all",
                  memberBg[col],
                  draft.color === col ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-card" : "",
                )}
              >
                {draft.color === col ? <Check className="size-4 text-white" /> : null}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Shared with">
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = draft.memberIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {m.name}
                </button>
              )
            })}
            {members.length === 0 ? (
              <span className="text-xs text-muted-foreground">Add family members first.</span>
            ) : null}
          </div>
        </Field>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete calendar?"
        message={confirmDelete ? `“${confirmDelete.name}” and all of its events will be removed.` : ""}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) onDelete(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </BottomSheet>
  )
}
