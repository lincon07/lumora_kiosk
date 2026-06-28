"use client"

import { useEffect, useState } from "react"
import { ChefHat, Plus, Copy, Calendar, X } from "lucide-react"
import { type Meal, memberBg } from "@/lib/data"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { BottomSheet, Field, inputClass } from "@/components/ui/reusables/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { useHighlight, useStore } from "@/lib/store"

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_FULL: Record<string, string> = {
  Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun",
}
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"]

type FormState = {
  day: string
  type: string
  name: string
  memberId: string
  repeatDays: string[]
}

// Lookup for today's abbreviated day name.
function todayAbbr(): string {
  const js = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return js[new Date().getDay()]
}

export function MealsView() {
  const { meals, members, getMember, can, addMeal, updateMeal, deleteMeal, addEvent, events } = useStore()
  const canManage = can("meals")
  const { highlight, register, clearHighlight, refs } = useHighlight("meals")

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Meal | null>(null)
  const [form, setForm] = useState<FormState>({ day: "Mon", type: "Dinner", name: "", memberId: "", repeatDays: [] })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const today = todayAbbr()

  useEffect(() => {
    if (!highlight) return
    const el = refs.get(highlight.id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("highlight-flash")
    const t = setTimeout(() => { el.classList.remove("highlight-flash"); clearHighlight() }, 2000)
    return () => clearTimeout(t)
  }, [highlight, refs, clearHighlight])

  const openAdd = (day: string, type: string) => {
    if (!canManage) return
    setEditing(null)
    setForm({ day, type, name: "", memberId: members[0]?.id ?? "", repeatDays: [] })
    setSheetOpen(true)
  }

  const openEdit = (m: Meal) => {
    if (!canManage) return
    setEditing(m)
    setForm({ day: m.day, type: m.type, name: m.name, memberId: m.memberId ?? "", repeatDays: [] })
    setSheetOpen(true)
  }

  const save = () => {
    if (!form.name.trim()) return
    const payload = { day: form.day, type: form.type, name: form.name.trim(), memberId: form.memberId }

    if (editing) {
      updateMeal(editing.id, payload)
    } else {
      // Primary slot
      const existing = meals.find((m) => m.day === form.day && m.type === form.type)
      if (existing) updateMeal(existing.id, payload)
      else addMeal(payload)

      // Repeat to additional days
      for (const rDay of form.repeatDays) {
        if (rDay === form.day) continue
        const rExisting = meals.find((m) => m.day === rDay && m.type === form.type)
        if (rExisting) updateMeal(rExisting.id, { ...payload, day: rDay })
        else addMeal({ ...payload, day: rDay })
      }
    }
    setSheetOpen(false)
  }

  const addToCalendar = (meal: Meal) => {
    // Find the ISO date for this week's meal day.
    const dayIdx = DAY_ABBR.indexOf(meal.day)
    const now = new Date()
    const todayIdx = (now.getDay() + 6) % 7 // Mon=0
    const diff = dayIdx - todayIdx
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    const date = d.toISOString().slice(0, 10)
    addEvent({ title: `🍽 ${meal.name}`, date, time: "18:00", start: 18, end: 19, memberIds: meal.memberId ? [meal.memberId] : [], calendarId: "", location: undefined })
  }

  const deleting = deleteId ? meals.find((m) => m.id === deleteId) : null

  // Build grid: rows = meal types, cols = days
  const mealGrid = Object.fromEntries(
    MEAL_TYPES.map((type) => [
      type,
      Object.fromEntries(DAY_ABBR.map((day) => [day, meals.find((m) => m.day === day && m.type === type) ?? null])),
    ]),
  )

  const visibleDays = activeDay ? [activeDay] : DAY_ABBR

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Header card */}
      <div className="rounded-3xl bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-member-amber/15 text-member-amber">
              <ChefHat className="size-5" />
            </span>
            <div>
              <p className="font-bold leading-tight">This Week&apos;s Menu</p>
              <p className="text-sm text-muted-foreground">{meals.length} meals planned</p>
            </div>
          </div>
        </div>

        {/* Day filter pills */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {DAY_ABBR.map((d) => {
            const isToday = d === today
            const isActive = activeDay === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDay(activeDay === d ? null : d)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isToday
                      ? "border border-primary text-primary"
                      : "border border-border text-muted-foreground hover:border-primary hover:text-primary",
                )}
              >
                {DAY_FULL[d]}
              </button>
            )
          })}
          {activeDay ? (
            <button
              type="button"
              onClick={() => setActiveDay(null)}
              className="shrink-0 flex items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground"
            >
              <X className="size-3" /> All
            </button>
          ) : null}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[560px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="w-24 py-3 pl-4 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Meal
              </th>
              {visibleDays.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "py-3 text-center text-xs font-semibold uppercase tracking-wide",
                    d === today ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {DAY_FULL[d]}
                  {d === today ? <span className="ml-1 inline-block size-1.5 rounded-full bg-primary align-middle" /> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_TYPES.map((type, ti) => (
              <tr key={type} className={ti < MEAL_TYPES.length - 1 ? "border-b border-border" : ""}>
                <td className="py-3 pl-4 pr-2">
                  <span className="text-xs font-semibold text-muted-foreground">{type}</span>
                </td>
                {visibleDays.map((day) => {
                  const meal = mealGrid[type][day]
                  const member = meal?.memberId ? getMember(meal.memberId) : null
                  return (
                    <td key={day} className="p-1.5">
                      {meal ? (
                        <div
                          ref={register(meal.id)}
                          className="group relative rounded-2xl bg-secondary p-2.5 transition-colors hover:bg-secondary/80"
                        >
                          <p className="truncate text-xs font-semibold leading-tight">{meal.name}</p>
                          {member ? (
                            <div className="mt-1.5 flex items-center justify-between">
                              <MemberAvatar member={member} size="sm" />
                              {canManage ? (
                                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    type="button"
                                    title="Add to calendar"
                                    onClick={() => addToCalendar(meal)}
                                    className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-primary"
                                  >
                                    <Calendar className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit"
                                    onClick={() => openEdit(meal)}
                                    className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                                  >
                                    <Copy className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete"
                                    onClick={() => setDeleteId(meal.id)}
                                    className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-destructive"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => openAdd(day, type)}
                          className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-border py-3 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      ) : (
                        <div className="h-10 rounded-2xl bg-secondary/30" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add sheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Edit meal" : "Plan a meal"}
        footer={
          <button
            type="button"
            onClick={save}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {editing ? "Save changes" : "Add meal"}
          </button>
        }
      >
        <Field label="Dish">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Taco Night"
            className={inputClass}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Day">
            <select
              value={form.day}
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
              className={inputClass}
            >
              {DAY_ABBR.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Meal type">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className={inputClass}
            >
              {MEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Cook">
          <select
            value={form.memberId}
            onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
            className={inputClass}
          >
            <option value="">No one assigned</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        {!editing ? (
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Also repeat on
            </span>
            <div className="flex flex-wrap gap-2">
              {DAY_ABBR.filter((d) => d !== form.day).map((d) => {
                const on = form.repeatDays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        repeatDays: on ? f.repeatDays.filter((x) => x !== d) : [...f.repeatDays, d],
                      }))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary",
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete meal?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMeal(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
