"use client"

import { Heart, ImageIcon, Upload } from "lucide-react"
import { useStore } from "@/lib/store"

export function PhotosView() {
  const { photos } = useStore()

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-muted-foreground">
          <ImageIcon className="size-7" />
        </span>
        <div className="space-y-1">
          <p className="font-bold">No photos yet</p>
          <p className="text-pretty text-sm text-muted-foreground">
            Upload family moments to show them on your hub.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Upload className="size-4" />
          Upload photos
        </button>
      </div>
    )
  }

  const [featured, ...rest] = photos

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Featured slideshow card */}
      <div className="relative overflow-hidden rounded-3xl shadow-md">
        <img
          src={featured.src || "/placeholder.svg"}
          alt={featured.caption}
          width={800}
          height={500}
          className="h-56 w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <p className="text-sm font-semibold text-white">{featured.caption}</p>
          <p className="text-xs text-white/80">Now showing on your hub</p>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-1 text-[11px] font-medium text-white ios-blur">
          Slideshow
        </span>
      </div>

      {rest.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {rest.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-2xl shadow-sm">
              <img
                src={photo.src || "/placeholder.svg"}
                alt={photo.caption}
                width={400}
                height={400}
                className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
              />
              <button
                type="button"
                aria-label="Favorite photo"
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/30 text-white ios-blur transition-colors hover:text-primary"
              >
                <Heart className="size-3.5" />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                <p className="text-xs font-medium text-white">{photo.caption}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Upload className="size-4" />
        Upload photos
      </button>
    </div>
  )
}
