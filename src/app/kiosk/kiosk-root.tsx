"use client"

import { Loader2 } from "lucide-react"
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
  const { state, loading } = useKiosk()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
