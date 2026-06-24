"use client"

import { Sparkles, Loader2, CloudOff, RefreshCw } from "lucide-react"

/**
 * "Registering Device…" screen — startup step 2 (Lumora Cloud enrollment).
 *
 * Shown while the Device Registration service enrolls this device. If
 * enrollment fails (offline, backend down), it flips to a retry state.
 */
export function RegisteringScreen({
  error,
  onRetry,
}: {
  error: string | null
  onRetry: () => void
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-8 text-center text-foreground">
      <div className="flex flex-col items-center gap-5">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-10" />
        </div>
        <span className="text-3xl font-bold tracking-tight">Lumora</span>
      </div>

      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-5">
          <CloudOff className="size-9 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">Couldn&apos;t register this device</p>
            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
              {error}
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm font-medium">Registering device with Lumora Cloud…</span>
        </div>
      )}
    </main>
  )
}
