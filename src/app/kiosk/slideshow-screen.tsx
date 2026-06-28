"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuthenticatedSrc } from "@/hooks/use-authenticated-src"
import { cn } from "@/lib/utils"
import type { Photo } from "@/lib/data"

// Duration each photo is shown before crossfading to the next
const SLIDE_DURATION_MS = 8_000
const FADE_DURATION_MS = 800

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return null
  }
}

/** Single slide: blurred bg fills sides, sharp photo centered, caption + date overlay. */
function Slide({ photo, visible }: { photo: Photo; visible: boolean }) {
  const src = useAuthenticatedSrc(photo.src)
  const date = formatDate(photo.createdAt)

  return (
    <div
      className={cn(
        "absolute inset-0 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
    >
      {src ? (
        <>
          {/* Blurred backdrop — same image scaled up to fill the screen edge-to-edge */}
          <img
            src={src}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50"
          />

          {/* Sharp photo centered, contained so it never crops */}
          <img
            src={src}
            alt={photo.caption}
            className="absolute inset-0 m-auto h-full w-full object-contain"
          />

          {/* Bottom caption + date */}
          {(photo.caption || date) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-8 pb-10 pt-16">
              {photo.caption ? (
                <p className="text-lg font-semibold leading-snug text-white drop-shadow">
                  {photo.caption}
                </p>
              ) : null}
              {date ? (
                <p className="mt-1 text-sm text-white/70 drop-shadow">{date}</p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        // Loading state — keep the background black while image fetches
        <div className="absolute inset-0 bg-black" />
      )}
    </div>
  )
}

interface SlideshowScreenProps {
  photos: Photo[]
  onDismiss: () => void
}

export function SlideshowScreen({ photos, onDismiss }: SlideshowScreenProps) {
  const [index, setIndex] = useState(0)

  // Pre-load the next slide index to allow smooth crossfades
  const [nextIndex, setNextIndex] = useState<number | null>(null)
  const [fading, setFading] = useState(false)

  const advance = useCallback(() => {
    if (photos.length <= 1) return
    const next = (index + 1) % photos.length
    setNextIndex(next)
    setFading(true)
    setTimeout(() => {
      setIndex(next)
      setNextIndex(null)
      setFading(false)
    }, FADE_DURATION_MS)
  }, [index, photos.length])

  // Auto-advance timer
  useEffect(() => {
    if (photos.length <= 1) return
    const t = setTimeout(advance, SLIDE_DURATION_MS)
    return () => clearTimeout(t)
  }, [advance, photos.length])

  // Any user interaction dismisses the slideshow
  useEffect(() => {
    const dismiss = () => onDismiss()
    window.addEventListener("pointerdown", dismiss)
    window.addEventListener("keydown", dismiss)
    return () => {
      window.removeEventListener("pointerdown", dismiss)
      window.removeEventListener("keydown", dismiss)
    }
  }, [onDismiss])

  if (photos.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Current slide */}
      <Slide photo={photos[index]} visible={!fading} />

      {/* Next slide fades in during transition */}
      {nextIndex !== null && (
        <Slide photo={photos[nextIndex]} visible={fading} />
      )}

      {/* Progress dots */}
      {photos.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
          {photos.map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-all",
                i === index ? "w-4 bg-white" : "bg-white/40",
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
