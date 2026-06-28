"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// Global counter so multiple sheets (or rapid open/close) don't fight over
// body overflow. We only lock when count > 0 and unlock when it hits 0.
let _openCount = 0
function lockScroll() {
  _openCount++
  document.body.style.overflow = "hidden"
}
function unlockScroll() {
  _openCount = Math.max(0, _openCount - 1)
  if (_openCount === 0) document.body.style.overflow = ""
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Portal mount guard
  useEffect(() => { setMounted(true) }, [])

  // Drive open/close animation
  useEffect(() => {
    if (open) {
      setVisible(true)
      // Tiny delay so the element is in the DOM before we trigger the CSS transition
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)))
    } else {
      setAnimating(false)
      closeTimerRef.current = setTimeout(() => setVisible(false), 300)
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [open])

  const requestClose = useCallback(() => {
    const active = document.activeElement as HTMLElement | null
    if (active && typeof active.blur === "function") active.blur()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose()
    document.addEventListener("keydown", onKey)
    lockScroll()
    return () => {
      document.removeEventListener("keydown", onKey)
      unlockScroll()
    }
  }, [open, requestClose])

  if (!mounted || !visible) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: animating ? 1 : 0,
          transition: "opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onClick={requestClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-sm flex-col bg-card shadow-2xl"
        style={{
          transform: animating ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: "1.5rem 0 0 1.5rem",
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
          <div className="space-y-4">{children}</div>
        </div>

        {/* Footer */}
        {footer ? (
          <div className="shrink-0 border-t border-border px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

export const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
