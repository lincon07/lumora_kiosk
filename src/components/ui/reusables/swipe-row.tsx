"use client"

import { useRef, useState, type ComponentType, type ReactNode, type PointerEvent } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

const ACTION_WIDTH = 80
const THRESHOLD = 40

/**
 * iOS-style swipeable row.
 * Swipe RIGHT  -> reveals Edit/Details action (left side).
 * Swipe LEFT   -> reveals Delete action (right side).
 */
export function SwipeRow({
  children,
  onEdit,
  onDelete,
  editLabel = "Details",
  editIcon: EditIcon = Pencil,
  className,
  rounded = "rounded-2xl",
}: {
  children: ReactNode
  onEdit?: () => void
  onDelete?: () => void
  editLabel?: string
  editIcon?: ComponentType<{ className?: string }>
  className?: string
  rounded?: string
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const moved = useRef(false)

  const maxLeft = onDelete ? -ACTION_WIDTH : 0
  const maxRight = onEdit ? ACTION_WIDTH : 0

  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX
    startOffset.current = offset
    moved.current = false
    draggingRef.current = true
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!draggingRef.current) return
    const delta = e.clientX - startX.current
    if (Math.abs(delta) > 6) moved.current = true
    let next = startOffset.current + delta
    next = Math.max(maxLeft, Math.min(maxRight, next))
    setOffset(next)
  }

  const settle = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    setOffset((cur) => (cur <= -THRESHOLD ? maxLeft : cur >= THRESHOLD ? maxRight : 0))
  }

  const close = () => setOffset(0)

  // If the row is swiped open, a tap on the foreground closes it instead of activating content.
  // Only intercept if the row is currently offset — never block clicks from a stationary tap.
  const onForegroundClickCapture = (e: React.MouseEvent) => {
    if (offset !== 0) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <div className={cn("relative overflow-hidden", rounded, className)}>
      {/* Edit action (revealed on swipe right) */}
      {onEdit ? (
        <button
          type="button"
          aria-label={editLabel}
          onClick={() => {
            close()
            onEdit()
          }}
          className="absolute inset-y-0 left-0 flex items-center justify-center bg-member-blue text-white"
          style={{ width: ACTION_WIDTH }}
        >
          <span className="flex flex-col items-center gap-0.5 text-[11px] font-semibold">
            <EditIcon className="size-4" />
            {editLabel}
          </span>
        </button>
      ) : null}

      {/* Delete action (revealed on swipe left) */}
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete"
          onClick={() => {
            close()
            onDelete()
          }}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-white"
          style={{ width: ACTION_WIDTH }}
        >
          <span className="flex flex-col items-center gap-0.5 text-[11px] font-semibold">
            <Trash2 className="size-4" />
            Delete
          </span>
        </button>
      ) : null}

      {/* Foreground */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onClickCapture={onForegroundClickCapture}
        className={cn("relative touch-pan-y", !dragging && "transition-transform duration-200 ease-out")}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
