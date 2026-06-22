"use client"

import { useEffect, useState } from "react"
import { Check, Plus, Star } from "lucide-react"
import { type Chore, memberBg } from "@/lib/data"
import { cn } from "@/lib/utils"
import { celebrateCompletion } from "@/lib/celebration"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { SwipeRow } from "@/components/ui/reusables/swipe-row"
import { BottomSheet, Field, inputClass } from "@/components/ui/reusables/bottom-sheet"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { useHighlight, useStore } from "@/lib/store"

const dueOptions = ["Today", "Tomorrow", "Sat", "Sun", "This week"]

type FormState = { title: string; memberId: string; points: number; due: string }
const emptyForm: FormState = { title: "", memberId: "", points: 10, due: "Today" }

export function ChoresView() {
  const { chores, members, getMember, activeMember, can, addChore, updateChore, deleteChore, toggleChore } = useStore()
  const canManage = can("chores")
  const { highlight, register, clearHighlight, refs } = useHighlight("chores")

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Chore | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const visible = chores.filter((c) => (activeMember ? c.memberId === activeMember : true))
  const earned = visible.filter((c) => c.done).reduce((s, c) => s + c.points, 0)
  const total = visible.reduce((s, c) => s + c.points, 0)
  const pct = total ? Math.round((earned / total) * 100) : 0

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

  const openAdd = () => {
    if (!canManage) return
    setEditing(null)
    setForm({ ...emptyForm, memberId: activeMember ?? members[0]?.id ?? "" })
    setSheetOpen(true)
  }

  const openEdit = (c: Chore) => {
    if (!canManage) return
    setEditing(c)
    setForm({ title: c.title, memberId: c.memberId, points: c.points, due: c.due })
    setSheetOpen(true)
  }

  const save = () => {
    if (!form.title.trim()) return
    const payload = { title: form.title.trim(), memberId: form.memberId, points: form.points, due: form.due }
    if (editing) updateChore(editing.id, payload)
    else addChore({ ...payload, done: false })
    setSheetOpen(false)
  }

  const deleting = deleteId ? chores.find((c) => c.id === deleteId) : null

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Compact progress line */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">{earned}</span> / {total} pts earned today
        </p>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{pct}%</span>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((chore) => {
          const member = getMember(chore.memberId)
          return (
            <div key={chore.id} ref={register(chore.id)} className="rounded-2xl">
              <SwipeRow
                onEdit={canManage ? () => openEdit(chore) : undefined}
                onDelete={canManage ? () => setDeleteId(chore.id) : undefined}
              >
                <div className="flex items-center gap-3 bg-card p-3">
                  <button
                    type="button"
                    onClick={() => {
                      toggleChore(chore.id)
                      // Check if all remaining chores will be done
                      const willBeDone = chores.filter((c) => c.due === chore.due && c.id !== chore.id).every((c) => c.done)
                      if (!chore.done && willBeDone) {
                        celebrateCompletion("strong")
                      }
                    }}
                    aria-pressed={chore.done}
                    aria-label={chore.done ? `Mark ${chore.title} not done` : `Mark ${chore.title} done`}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      chore.done ? cn(memberBg[member.color], "border-transparent text-white") : "border-border text-transparent",
                    )}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                  <div className="flex-1">
                    <p className={cn("font-medium leading-tight", chore.done && "text-muted-foreground line-through")}>
                      {chore.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{chore.due}</p>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-sm font-semibold",
                      chore.done ? "text-muted-foreground" : "text-member-amber",
                    )}
                  >
                    <Star className={cn("size-3.5", chore.done ? "fill-muted-foreground" : "fill-member-amber")} />
                    {chore.points}
                  </span>
                  <MemberAvatar member={member} size="sm" />
                </div>
              </SwipeRow>
            </div>
          )
        })}

        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No chores for this filter.</p>
        ) : null}
      </div>

      {canManage ? (
        <button
          type="button"
          onClick={openAdd}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
          Assign chore
        </button>
      ) : null}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Edit chore" : "Assign chore"}
        footer={
          <button
            type="button"
            onClick={save}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {editing ? "Save changes" : "Assign chore"}
          </button>
        }
      >
        <Field label="Chore">
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Take out trash"
            className={inputClass}
          />
        </Field>
        <Field label="Assigned to">
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
        <div className="flex gap-3">
          <Field label="Points">
            <select
              value={form.points}
              onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))}
              className={inputClass}
            >
              {[5, 10, 15, 20, 25].map((p) => (
                <option key={p} value={p}>
                  {p} pts
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due">
            <select
              value={form.due}
              onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))}
              className={inputClass}
            >
              {dueOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete chore?"
        message={deleting ? `“${deleting.title}” will be removed.` : ""}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteChore(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}
