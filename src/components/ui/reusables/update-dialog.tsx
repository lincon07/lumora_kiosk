"use client"

import { useSyncExternalStore, useState } from "react"
import {
  DownloadCloud,
  ShieldCheck,
  Calendar,
  Hash,
  FileText,
  Loader2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getPendingUpdate,
  subscribeUpdate,
  dismissUpdate,
  installUpdate,
} from "@/lib/hub"

/** Read the current app version from Tauri's app metadata (injected at build time). */
async function getTauriVersion(): Promise<string | null> {
  try {
    const { getVersion } = await import("@tauri-apps/api/app")
    return await getVersion()
  } catch {
    return null
  }
}

function useCurrentVersion(): string {
  const [ver, setVer] = useState<string>("—")
  // Fetch once on mount — only works inside Tauri runtime.
  useState(() => {
    void getTauriVersion().then((v) => { if (v) setVer(v) })
  })
  return ver
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
  className,
}: {
  icon: typeof Hash
  label: string
  value: string | null | undefined
  mono?: boolean
  className?: string
}) {
  if (!value) return null
  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 break-all text-sm leading-snug text-foreground",
            mono && "font-mono text-[12px]",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

/**
 * Auto-update available dialog.
 *
 * Reads from the hub's `pendingUpdate` store via `useSyncExternalStore`,
 * so it opens automatically whenever `checkForUpdates()` finds a new version.
 */
export function UpdateDialog() {
  const update = useSyncExternalStore(subscribeUpdate, getPendingUpdate, getPendingUpdate)
  const currentVersion = useCurrentVersion()
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = !!update && !installing

  const handleInstall = async () => {
    setError(null)
    setInstalling(true)
    try {
      await installUpdate()
      // installUpdate() calls relaunch(), so we only reach here in non-Tauri preview.
      dismissUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed. Please try again.")
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    if (installing) return
    dismissUpdate()
    setError(null)
  }

  // Format date nicely if present.
  const formattedDate = update?.date
    ? (() => {
        try {
          return new Date(update.date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        } catch {
          return update.date
        }
      })()
    : null

  return (
    <Dialog open={open || installing} onOpenChange={(o) => { if (!o) handleDismiss() }}>
      <DialogContent showCloseButton={false} className="max-w-sm gap-0 overflow-hidden p-0">
        {/* Header banner */}
        <div className="relative flex flex-col items-center gap-2 bg-primary px-6 pb-5 pt-6 text-primary-foreground">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground/10 backdrop-blur-sm ring-1 ring-primary-foreground/20">
            <DownloadCloud className="size-7" />
          </div>
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-lg font-bold text-primary-foreground">
              Update Available
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/70">
              A new version of Lumora is ready to install.
            </DialogDescription>
          </DialogHeader>

          {/* Version badge */}
          <div className="mt-1 flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-1.5 text-sm font-semibold">
            <span className="text-primary-foreground/60">{currentVersion}</span>
            <span className="text-primary-foreground/40">→</span>
            <span className="text-primary-foreground">
              {update?.version ?? "…"}
            </span>
          </div>

          {/* Signed badge */}
          {update?.signed && (
            <span className="mt-1 flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-[11px] font-semibold text-green-300 ring-1 ring-green-400/30">
              <ShieldCheck className="size-3.5" />
              Cryptographically signed
            </span>
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            disabled={installing}
            aria-label="Dismiss update"
            className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-primary-foreground/10 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/20 disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="divide-y divide-border/60 px-4 py-1">
          {update?.date && (
            <InfoRow icon={Calendar} label="Release date" value={formattedDate} />
          )}
          {update?.sha256 && (
            <InfoRow icon={Hash} label="SHA-256" value={update.sha256} mono />
          )}
          {update?.body && (
            <div className="py-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <FileText className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Release notes
                  </p>
                  <div className="mt-1.5 max-h-40 overflow-y-auto overscroll-contain">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {update.body}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mx-4 mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 px-4 py-3">
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={installing}
            className="flex-1"
          >
            Later
          </Button>
          <Button
            onClick={() => void handleInstall()}
            disabled={installing}
            className="flex-1 gap-2"
          >
            {installing ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Installing…
              </>
            ) : (
              <>
                <DownloadCloud className="size-4" data-icon="inline-start" />
                Install & Restart
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
