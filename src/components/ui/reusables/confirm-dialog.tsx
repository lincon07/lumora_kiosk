"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle } from "lucide-react"

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (open) {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)))
    } else {
      setAnimating(false)
      closeTimerRef.current = setTimeout(() => setVisible(false), 300)
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  if (!mounted || !visible) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: animating ? 1 : 0,
          transition: "opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onClick={onCancel}
        aria-hidden
      />

      {/* Panel — narrower than BottomSheet, centred vertically */}
      <div
        className="relative z-10 my-auto mr-0 flex w-full max-w-xs flex-col bg-card shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          transform: animating ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: "1.5rem 0 0 1.5rem",
        }}
      >
        <div className="p-6 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-7" />
          </span>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl bg-destructive py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-secondary py-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
