"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, MapPin, Plus, Settings2, Trash2, Check, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type CalendarEvent,
  type Calendar,
  type MemberColor,
  memberBg,
  memberSoft,
  toISODate,
} from "@/lib/data"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { SwipeRow } from "@/components/ui/reusables/swipe-row"
import { BottomSheet, Field, inputClass } from "@/components/ui/reusables/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { useHighlight, useStore } from "@/lib/store"

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const dayNamesShort = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
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

type ViewMode = "day" | "week" | "month"

type FormState = {
  title: string
  start: number
  end: number
  memberIds: string[]
  calendarId: string
  location: string
}

// ---- helpers ----------------------------------------------------------------

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Build a 6-row grid of dates for the month view (may include prev/next overflow). */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(year, month)
  const firstDow = first.getDay() // 0=Sun
  const total = 42 // 6 weeks × 7
  const grid: Date[] = []
  for (let i = 0; i < total; i++) {
    const d = new Date(year, month, 1 - firstDow + i)
    grid.push(d)
  }
  return grid
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  return r
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

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("calendarViewMode") as ViewMode) || "month"
    }
    return "month"
  })

  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [calFilter, setCalFilter] = useState<string | null>(null)
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

  const selDateObj = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])
  const [viewYear, setViewYear] = useState(selDateObj.getFullYear())
  const [viewMonth, setViewMonth] = useState(selDateObj.getMonth())

  // Keep viewYear/viewMonth in sync when selectedDate changes externally
  useEffect(() => {
    const d = new Date(`${selectedDate}T00:00:00`)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }, [selectedDate])

  const filteredEvents = useMemo(
    () =>
      events
        .filter((e) => (activeMember ? e.memberIds.includes(activeMember) : true))
        .filter((e) => (calFilter ? e.calendarId === calFilter : true)),
    [events, activeMember, calFilter],
  )

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

  const openAdd = (date?: string) => {
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
    if (date) setSelectedDate(date)
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

  // ---- navigation -----------------------------------------------------------

  const navigatePrev = () => {
    if (viewMode === "day") {
      setSelectedDate(toISODate(addDays(selDateObj, -1)))
    } else if (viewMode === "week") {
      setSelectedDate(toISODate(addDays(selDateObj, -7)))
    } else {
      const d = new Date(viewYear, viewMonth - 1, 1)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  const navigateNext = () => {
    if (viewMode === "day") {
      setSelectedDate(toISODate(addDays(selDateObj, 1)))
    } else if (viewMode === "week") {
      setSelectedDate(toISODate(addDays(selDateObj, 7)))
    } else {
      const d = new Date(viewYear, viewMonth + 1, 1)
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }

  const goToday = () => {
    setSelectedDate(todayISO)
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  const switchView = (v: ViewMode) => {
    setViewMode(v)
    localStorage.setItem("calendarViewMode", v)
  }

  // ---- period label ---------------------------------------------------------

  const periodLabel = useMemo(() => {
    if (viewMode === "day") {
      return selDateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    }
    if (viewMode === "week") {
      const ws = startOfWeek(selDateObj)
      const we = addDays(ws, 6)
      if (ws.getMonth() === we.getMonth()) {
        return `${monthNames[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      }
      return `${monthNames[ws.getMonth()]} ${ws.getDate()} – ${monthNames[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    }
    return `${monthNames[viewMonth]} ${viewYear}`
  }, [viewMode, selDateObj, viewMonth, viewYear])

  // ---- event helpers --------------------------------------------------------

  const eventsForDate = (iso: string) =>
    filteredEvents.filter((e) => e.date === iso)

  return (
    <div className="flex flex-col gap-0 pb-6">
      {/* ---- toolbar -------------------------------------------------------- */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/60 px-4 pt-3 pb-2 space-y-2">
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

        {/* Navigation bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={navigatePrev}
            aria-label="Previous"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <span className="truncate text-sm font-semibold">{periodLabel}</span>
            <button
              type="button"
              onClick={goToday}
              className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              Today
            </button>
          </div>

          <button
            type="button"
            onClick={navigateNext}
            aria-label="Next"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* View toggle */}
          <div className="flex shrink-0 rounded-lg border border-border overflow-hidden">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                  viewMode === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- views ---------------------------------------------------------- */}
      <div className="flex-1">
        {viewMode === "month" ? (
          <MonthView
            year={viewYear}
            month={viewMonth}
            todayISO={todayISO}
            selectedDate={selectedDate}
            events={filteredEvents}
            calendars={calendars}
            onSelectDate={(iso) => {
              setSelectedDate(iso)
              switchView("day")
            }}
            onAddEvent={canManage ? (iso) => openAdd(iso) : undefined}
          />
        ) : viewMode === "week" ? (
          <WeekView
            anchorDate={selDateObj}
            todayISO={todayISO}
            selectedDate={selectedDate}
            events={filteredEvents}
            calendars={calendars}
            getMember={getMember}
            register={register}
            onSelectDate={(iso) => {
              setSelectedDate(iso)
              switchView("day")
            }}
            onEdit={canManage ? openEdit : undefined}
            onDelete={canManage ? (id) => setDeleteId(id) : undefined}
          />
        ) : (
          <DayView
            selectedDate={selectedDate}
            events={eventsForDate(selectedDate)}
            calendars={calendars}
            getMember={getMember}
            register={register}
            canManage={canManage}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </div>

      {/* Add event FAB */}
      {canManage && calendars.length > 0 ? (
        <div className="flex justify-center pt-2 pb-2">
          <button
            type="button"
            onClick={() => openAdd(selectedDate)}
            className="inline-flex items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Add event
          </button>
        </div>
      ) : null}

      {/* Add / edit event sheet */}
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
    </div>
  )
}

// ---- Month view -------------------------------------------------------------

function MonthView({
  year,
  month,
  todayISO,
  selectedDate,
  events,
  calendars,
  onSelectDate,
  onAddEvent,
}: {
  year: number
  month: number
  todayISO: string
  selectedDate: string
  events: CalendarEvent[]
  calendars: Calendar[]
  onSelectDate: (iso: string) => void
  onAddEvent?: (iso: string) => void
}) {
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const calColor = (id: string): MemberColor => calendars.find((c) => c.id === id)?.color ?? "blue"

  return (
    <div className="px-2 pt-3">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNamesShort.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {grid.map((date, i) => {
          const iso = toISODate(date)
          const isCurrentMonth = date.getMonth() === month
          const isToday = iso === todayISO
          const isSelected = iso === selectedDate
          const dayEvents = events.filter((e) => e.date === iso).slice(0, 3)

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDate(iso)}
              onDoubleClick={() => onAddEvent?.(iso)}
              className={cn(
                "flex flex-col items-center rounded-xl py-1 px-0.5 transition-colors min-h-[4.5rem]",
                isSelected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary",
                !isCurrentMonth && "opacity-30",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold leading-none mb-0.5",
                  isToday ? "bg-primary text-primary-foreground" : isSelected ? "text-primary" : "text-foreground",
                )}
              >
                {date.getDate()}
              </span>
              {/* Event pills */}
              <div className="flex w-full flex-col gap-px px-0.5">
                {dayEvents.map((ev) => (
                  <span
                    key={ev.id}
                    className={cn(
                      "truncate rounded-sm px-1 py-px text-[9px] font-semibold leading-tight text-white",
                      memberBg[calColor(ev.calendarId)],
                    )}
                  >
                    {ev.title}
                  </span>
                ))}
                {events.filter((e) => e.date === iso).length > 3 ? (
                  <span className="text-[9px] font-medium text-muted-foreground text-center">
                    +{events.filter((e) => e.date === iso).length - 3}
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---- Week view --------------------------------------------------------------

function WeekView({
  anchorDate,
  todayISO,
  selectedDate,
  events,
  calendars,
  getMember,
  register,
  onSelectDate,
  onEdit,
  onDelete,
}: {
  anchorDate: Date
  todayISO: string
  selectedDate: string
  events: CalendarEvent[]
  calendars: Calendar[]
  getMember: (id: string) => { id: string; name: string; color: MemberColor; initial: string; role: string }
  register: (id: string) => (el: HTMLElement | null) => void
  onSelectDate: (iso: string) => void
  onEdit?: (e: CalendarEvent) => void
  onDelete?: (id: string) => void
}) {
  const ws = startOfWeek(anchorDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const calColor = (id: string): MemberColor => calendars.find((c) => c.id === id)?.color ?? "blue"

  return (
    <div className="overflow-x-auto">
      {/* Day header strip */}
      <div className="flex border-b border-border/60 px-4 sticky top-0 bg-background z-10">
        {days.map((d) => {
          const iso = toISODate(d)
          const isToday = iso === todayISO
          const isSelected = iso === selectedDate
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              className={cn(
                "flex-1 flex flex-col items-center py-2 rounded-t-lg transition-colors",
                isSelected ? "bg-primary/10" : "hover:bg-secondary",
              )}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {dayNamesShort[d.getDay()]}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Hourly grid */}
      <div className="relative">
        {/* Hour rows */}
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex border-b border-border/30" style={{ minHeight: 48 }}>
            <div className="w-12 shrink-0 pr-2 pt-1 text-right text-[10px] text-muted-foreground">
              {h === 0 ? "" : formatHour(h)}
            </div>
            <div className="flex flex-1 gap-px">
              {days.map((d) => {
                const iso = toISODate(d)
                const dayEvs = events.filter((e) => e.date === iso && e.start === h)
                return (
                  <div key={iso} className="flex-1 relative min-w-0">
                    {dayEvs.map((ev) => (
                      <div
                        key={ev.id}
                        ref={register(ev.id) as React.RefCallback<HTMLDivElement>}
                        className={cn(
                          "absolute inset-x-0.5 rounded-md px-1 py-0.5 text-[10px] font-semibold text-white overflow-hidden cursor-pointer hover:opacity-90 transition-opacity",
                          memberBg[calColor(ev.calendarId)],
                        )}
                        style={{ top: 2, minHeight: Math.max(ev.end - ev.start, 1) * 48 - 4 }}
                        onClick={() => onEdit?.(ev)}
                      >
                        <span className="truncate block">{ev.title}</span>
                        {ev.end - ev.start > 1 && ev.location ? (
                          <span className="truncate block opacity-80 flex items-center gap-0.5 mt-0.5">
                            <MapPin className="size-2.5 inline" />{ev.location}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Day view ---------------------------------------------------------------

function DayView({
  selectedDate,
  events,
  calendars,
  getMember,
  register,
  canManage,
  onEdit,
  onDelete,
}: {
  selectedDate: string
  events: CalendarEvent[]
  calendars: Calendar[]
  getMember: (id: string) => { id: string; name: string; color: MemberColor; initial: string; role: string }
  register: (id: string) => (el: HTMLElement | null) => void
  canManage: boolean
  onEdit: (e: CalendarEvent) => void
  onDelete: (id: string) => void
}) {
  const calColor = (id: string): MemberColor => calendars.find((c) => c.id === id)?.color ?? "blue"

  const selDate = new Date(`${selectedDate}T00:00:00`)
  const dateLabel = `${dayNames[selDate.getDay()]}, ${monthNames[selDate.getMonth()]} ${selDate.getDate()}`

  // Group events by hour
  const byHour = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const e of events) {
      const arr = map.get(e.start) ?? []
      arr.push(e)
      map.set(e.start, arr)
    }
    return map
  }, [events])

  return (
    <div className="px-4 pt-3 space-y-1">
      {/* Day summary */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"} · {dateLabel}
        </p>
        <div className="flex -space-x-2">
          {Array.from(new Set(events.flatMap((e) => e.memberIds))).slice(0, 4).map((id) => {
            const m = getMember(id)
            return <MemberAvatar key={id} member={m} size="sm" ring />
          })}
        </div>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {calendars.length === 0 ? "Create a calendar to start adding events." : "No events for this day."}
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const assignees = event.memberIds.map((id) => getMember(id))
            const color = calColor(event.calendarId)
            return (
              <div key={event.id} ref={register(event.id) as React.RefCallback<HTMLDivElement>} className="flex gap-5">
                <div className="w-16 shrink-0 pt-3 text-right text-xs font-medium text-muted-foreground">
                  {event.time}
                </div>
                <div className="min-w-0 flex-1">
                  <SwipeRow
                    onEdit={canManage ? () => onEdit(event) : undefined}
                    onDelete={canManage ? () => onDelete(event.id) : undefined}
                  >
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
        </div>
      )}
    </div>
  )
}

// ---- Filter chip ------------------------------------------------------------

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

// ---- Manage calendars sheet -------------------------------------------------

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
        message={confirmDelete ? `"${confirmDelete.name}" and all of its events will be removed.` : ""}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) onDelete(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </BottomSheet>
  )
}
