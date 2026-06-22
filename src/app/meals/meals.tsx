"use client"

import { useEffect, useState } from "react"
import { ChefHat, Plus } from "lucide-react"
import { type Meal, memberBg } from "@/lib/data"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { SwipeRow } from "@/components/ui/reusables/swipe-row"
import { BottomSheet, Field, inputClass } from "@/components/ui/reusables/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { useHighlight, useStore } from "@/lib/store"

const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const dayFull: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
}
const mealTypes = ["Breakfast", "Lunch", "Dinner", "Snack"]

type FormState = { day: string; type: string; name: string; memberId: string }

export function MealsView() {
  const { meals, members, getMember, can, addMeal, updateMeal, deleteMeal } = useStore()
  const canManage = can("meals")
  const { highlight, register, clearHighlight, refs } = useHighlight("meals")

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Meal | null>(null)
  const [form, setForm] = useState<FormState>({ day: "Mon", type: "Dinner", name: "", memberId: "" })
  const [deleteId, setDeleteId] = useState<string | null>(null)

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

  const openAdd = (day?: string) => {
    if (!canManage) return
    const targetDay = day ?? "Mon"
    const freeType = mealTypes.find((t) => !meals.some((m) => m.day === targetDay && m.type === t)) ?? "Dinner"
    setEditing(null)
    setForm({ day: targetDay, type: freeType, name: "", memberId: members[0]?.id ?? "" })
    setSheetOpen(true)
  }
  const openEdit = (m: Meal) => {
    if (!canManage) return
    setEditing(m)
    setForm({ day: m.day, type: m.type, name: m.name, memberId: m.memberId })
    setSheetOpen(true)
  }
  const save = () => {
    if (!form.name.trim()) return
    const payload = { day: form.day, type: form.type, name: form.name.trim(), memberId: form.memberId }
    if (editing) {
      updateMeal(editing.id, payload)
    } else {
      // Only one meal per (day, type) slot — replace an existing one if present.
      const existing = meals.find((m) => m.day === form.day && m.type === form.type)
      if (existing) updateMeal(existing.id, payload)
      else addMeal(payload)
    }
    setSheetOpen(false)
  }

  const deleting = deleteId ? meals.find((m) => m.id === deleteId) : null
  const byDay = dayOrder.map((d) => ({ day: d, items: meals.filter((m) => m.day === d) })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="rounded-3xl bg-card p-4 shadow-sm">
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

      {byDay.map(({ day, items }) => (
        <div key={day} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold">{dayFull[day]}</h2>
            {canManage && items.length < mealTypes.length ? (
              <button
                type="button"
                onClick={() => openAdd(day)}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                <Plus className="size-3.5" />
                Add
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {items.map((meal) => {
              const member = getMember(meal.memberId)
              return (
                <div key={meal.id} ref={register(meal.id)} className="rounded-3xl">
                  <SwipeRow
                    rounded="rounded-3xl"
                    onEdit={canManage ? () => openEdit(meal) : undefined}
                    onDelete={canManage ? () => setDeleteId(meal.id) : undefined}
                  >
                    <div className="flex items-center gap-3 bg-card pr-4">
                      {meal.image ? (
                        <img
                          src={meal.image || "/placeholder.svg"}
                          alt={meal.name}
                          width={56}
                          height={56}
                          className="size-14 shrink-0 object-cover"
                        />
                      ) : (
                        <span className={cn("flex size-14 shrink-0 items-center justify-center text-white", memberBg[member.color])}>
                          <ChefHat className="size-5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{meal.type}</p>
                        <p className="truncate font-semibold leading-tight">{meal.name}</p>
                      </div>
                      <MemberAvatar member={member} size="sm" />
                    </div>
                  </SwipeRow>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {canManage ? (
        <button
          type="button"
          onClick={() => openAdd()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
          Plan a meal
        </button>
      ) : null}

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
              {dayOrder.map((d) => (
                <option key={d} value={d}>
                  {dayFull[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Meal">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className={inputClass}
            >
              {mealTypes
                .filter(
                  (t) =>
                    // Hide slots already taken on this day, unless it's the meal we're editing.
                    !meals.some((m) => m.day === form.day && m.type === t && m.id !== editing?.id),
                )
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Cook">
          <select
            value={form.memberId}
            onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
            className={inputClass}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete meal?"
        message={deleting ? `“${deleting.name}” will be removed.` : ""}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMeal(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
