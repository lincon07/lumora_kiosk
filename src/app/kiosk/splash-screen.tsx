"use client"

import { Sparkles, Loader2 } from "lucide-react"

/**
 * Lumora splash screen.
 *
 * Shown the instant the appliance boots while we load local device state and
 * decide which startup phase to enter. Deliberately minimal and brand-forward
 * so the user never glimpses Linux/Ubuntu underneath.
 */
export function SplashScreen({ message = "Starting up" }: { message?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background text-foreground">
      <div className="flex flex-col items-center gap-5">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-10" />
        </div>
        <span className="text-3xl font-bold tracking-tight">Lumora</span>
      </div>

      <div className="flex items-center gap-2.5 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm font-medium">{message}…</span>
      </div>
    </main>
  )
}
