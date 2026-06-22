"use client"

import { useState } from "react"
import { Home, Link2Off, Loader2, MonitorSmartphone, Wifi } from "lucide-react"
import { useKiosk } from "@/lib/kiosk-provider"

/**
 * Kiosk-specific settings: shows which household this display is connected to
 * and lets someone detach it (so it can be claimed by a different household).
 * There is no account/sign-out here — the kiosk is a device, not a user.
 */
export function KioskSettingsView() {
  const { state, unpair } = useKiosk()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleUnpair = async () => {
    setBusy(true)
    try {
      await unpair()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-5 px-1 py-2">
      {/* Connection card */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Home className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Connected household</h2>
            <p className="text-sm text-muted-foreground">
              {state.householdName ?? "This hub"}
            </p>
          </div>
        </div>
      </section>

      {/* Device card */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <MonitorSmartphone className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{state.deviceName}</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Wifi className="size-3.5" />
              Online and syncing
            </p>
          </div>
        </div>
      </section>

      {/* Danger: unpair */}
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="text-base font-semibold text-foreground">Disconnect this hub</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Removes this display from {state.householdName ?? "your household"}. The
          hub will show a new pairing code so it can be connected to a different
          family account.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-card px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <Link2Off className="size-4" />
            Disconnect hub
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUnpair}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2Off className="size-4" />}
              Yes, disconnect
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
