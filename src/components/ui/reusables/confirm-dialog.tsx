"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
      closeTimerRef.current = setTimeout(() => setVisible(false), 280)
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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      style={{
        opacity: animating ? 1 : 0,
        transition: "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden
      />

      {/* Card */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-xs rounded-3xl bg-card shadow-2xl overflow-hidden"
        style={{
          transform: animating ? "scale(1) translateY(0)" : "scale(0.95) translateY(8px)",
          transition: "transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div className="p-6">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 px-5 pb-5 pt-4">
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
