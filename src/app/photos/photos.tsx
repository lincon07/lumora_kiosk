"use client"

import { useRef, useState } from "react"
import { Heart, ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { useStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"
import { isSupabaseConfigured } from "@/lib/supabase"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { cn } from "@/lib/utils"

async function uploadToStorage(file: File, householdId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `${householdId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from("photos").getPublicUrl(path)
  return data.publicUrl
}

export function PhotosView() {
  const { photos, can, addPhoto, deletePhoto } = useStore()
  const canManage = can("photos" as any) // photos uses same "photos" area
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue
        let src: string

        if (isSupabaseConfigured) {
          // Get the household id from the first available auth session
          const {
            data: { user },
          } = await supabase.auth.getUser()
          // Derive household id via RPC (same as the store does)
          const { data: hhData } = await supabase
            .from("members")
            .select("household_id")
            .eq("user_id", user?.id ?? "")
            .single()
          const householdId = hhData?.household_id ?? "shared"
          src = await uploadToStorage(file, householdId)
        } else {
          // In mock/dev mode use a local object URL
          src = URL.createObjectURL(file)
        }

        const caption = file.name.replace(/\.[^.]+$/, "")
        addPhoto({ src, caption })
      }
    } catch (err) {
      console.error("[v0] photo upload error:", err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const deletingPhoto = deleteTarget ? photos.find((p) => p.id === deleteTarget) : null

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
        {canManage ? (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {uploading ? "Uploading…" : "Upload photos"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </>
        ) : null}
      </div>
    )
  }

  const [featured, ...rest] = photos

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Featured / slideshow card */}
      <div className="relative overflow-hidden rounded-3xl shadow-md group">
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
        <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-1 text-[11px] font-medium text-white">
          Slideshow
        </span>
        {canManage ? (
          <button
            type="button"
            aria-label="Delete photo"
            onClick={() => setDeleteTarget(featured.id)}
            className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Grid */}
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
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:text-primary"
              >
                <Heart className="size-3.5" />
              </button>
              {canManage ? (
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={() => setDeleteTarget(photo.id)}
                  className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                <p className="text-xs font-medium text-white">{photo.caption}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload button (hidden on kiosk) */}
      {canManage ? (
        <>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary",
              uploading && "opacity-50 cursor-not-allowed",
            )}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "Uploading…" : "Upload photos"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete photo?"
        message={deletingPhoto ? `"${deletingPhoto.caption}" will be removed from all devices.` : ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deletePhoto(deleteTarget)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
