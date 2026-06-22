"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Sparkles, Loader2, Wifi, ScanLine } from "lucide-react"
import { useKiosk } from "@/lib/kiosk-provider"
import { buildPairingPayload } from "@/lib/kiosk-session"

const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
})

/**
 * Full-screen pairing experience shown on the wall display while the kiosk is
 * unclaimed. A family member opens the Lumora mobile app, scans this QR (or
 * types the code), and the device is claimed into their household.
 */
export function PairingScreen() {
  const { state, loading } = useKiosk()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [clock, setClock] = useState(() => new Date())

  // Live clock for ambient wall-display feel.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000 * 30)
    return () => clearInterval(t)
  }, [])

  // Render the QR whenever the pairing code changes.
  useEffect(() => {
    if (!state.pairingCode) {
      setQrDataUrl(null)
      return
    }
    const payload = buildPairingPayload(state.pairingCode)
    QRCode.toDataURL(payload, {
      width: 520,
      margin: 1,
      color: { dark: "#1f2421", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrDataUrl)
      .catch((err) => console.error("[v0] QR render failed:", err))
  }, [state.pairingCode])

  const time = clock.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between px-10 py-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Lumora</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wifi className="size-5" />
          <span className="text-lg font-medium tabular-nums">{time}</span>
        </div>
      </header>

      {/* Body: two panels */}
      <div className="flex flex-1 flex-col items-center justify-center gap-12 px-10 pb-16 lg:flex-row lg:gap-20">
        {/* Left: welcome copy */}
        <div className="max-w-lg text-center lg:text-left">
          <p className="text-base font-medium uppercase tracking-widest text-primary">
            {todayLabel}
          </p>
          <h1 className="mt-4 text-balance text-5xl font-bold leading-tight tracking-tight lg:text-6xl">
            Set up your family hub
          </h1>
          <p className="mt-6 text-pretty text-xl leading-relaxed text-muted-foreground">
            Open the Lumora app on your phone and scan the code to connect this
            display to your household. Your calendar, chores, lists and photos
            will appear here automatically.
          </p>

          <ol className="mx-auto mt-8 max-w-md space-y-3 text-left lg:mx-0">
            {[
              "Open Lumora on your phone",
              "Tap Add a Hub, then Scan",
              "Point your camera at the code",
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-lg">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Right: QR card */}
        <div className="flex flex-col items-center">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            {loading || !qrDataUrl ? (
              <div className="flex size-[340px] items-center justify-center lg:size-[420px]">
                <Loader2 className="size-10 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <img
                src={qrDataUrl || "/placeholder.svg"}
                alt="Scan this QR code with the Lumora app to pair this hub"
                className="size-[340px] rounded-xl lg:size-[420px]"
              />
            )}
          </div>

          {/* Manual code fallback */}
          <div className="mt-6 flex flex-col items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ScanLine className="size-4" />
              <span>Can&apos;t scan? Enter this code in the app</span>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
              {state.pairingCode ?? "••••••••"}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
