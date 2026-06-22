"use client"

import { Loader2, WifiOff } from "lucide-react"
import { KioskProvider, useKiosk } from "@/lib/kiosk-provider"
import { StoreProvider } from "@/lib/store"
import { PairingScreen } from "./pairing-screen"
import { KioskAppShell } from "./kiosk-app-shell"

/**
 * Root for the kiosk experience (a wall-mounted family display).
 *
 * Unlike the mobile app, the kiosk has no user login. It identifies itself with
 * a device token and is "claimed" to a household by a family member scanning a
 * QR code in the phone app. Until claimed it shows the PairingScreen; once
 * claimed it renders the read-only family dashboard.
 */
function KioskGate() {
  const { state, loading, initError, refresh } = useKiosk()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Supabase RPC unavailable or network failure on init
  if (initError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <WifiOff className="size-10 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold text-foreground">Could not connect</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty max-w-xs">
            {initError}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!state.paired) {
    return <PairingScreen />
  }

  // Paired: load the household data (read-only kiosk source) and show the app.
  return (
    <StoreProvider kioskMode>
      <KioskAppShell />
    </StoreProvider>
  )
}

export function KioskRoot() {
  return (
    <KioskProvider>
      <KioskGate />
    </KioskProvider>
  )
}
