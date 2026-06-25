"use client"

import { useEffect, useRef, useState } from "react"
import {
  Wifi,
  WifiHigh,
  WifiLow,
  WifiOff,
} from "lucide-react"
import { currentNetwork, scanNetworks } from "@/lib/wifi-service"

// ---------------------------------------------------------------------------
// Clock hook — ticks every second and returns the formatted time + date.
// ---------------------------------------------------------------------------
function useClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Align the first tick to the next whole second so the display is crisp.
    const msToNextSecond = 1000 - (Date.now() % 1000)
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 1000)
    }, msToNextSecond)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  return { timeStr, dateStr }
}

// ---------------------------------------------------------------------------
// WiFi hook — reads current SSID + signal every 15 s via wifi-service.
// ---------------------------------------------------------------------------
type WifiInfo = {
  ssid: string | null
  /** 0-100 or null when unknown */
  signal: number | null
}

function useWifi(): WifiInfo {
  const [info, setInfo] = useState<WifiInfo>({ ssid: null, signal: null })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function poll() {
      try {
        const ssid = await currentNetwork()
        // Also grab signal from the scan list so we can show a quality icon.
        let signal: number | null = null
        if (ssid) {
          const nets = await scanNetworks()
          const match = nets.find((n) => n.ssid === ssid)
          signal = match?.signal ?? null
        }
        if (mountedRef.current) setInfo({ ssid, signal })
      } catch {
        /* non-fatal — keep last state */
      }
    }

    void poll()
    const id = setInterval(poll, 15_000)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [])

  return info
}

// ---------------------------------------------------------------------------
// Signal icon
// ---------------------------------------------------------------------------
function WifiIcon({ ssid, signal }: { ssid: string | null; signal: number | null }) {
  if (!ssid) return <WifiOff className="size-3.5" aria-hidden />
  if (signal === null || signal >= 66) return <WifiHigh className="size-3.5" aria-hidden />
  if (signal >= 33) return <Wifi className="size-3.5" aria-hidden />
  return <WifiLow className="size-3.5" aria-hidden />
}

// ---------------------------------------------------------------------------
// SystemStatusBar
// ---------------------------------------------------------------------------
/**
 * A slim always-visible status strip for the kiosk UI (32px tall).
 * Shows: WiFi SSID + signal icon | date | time
 *
 * Meant to live at the very top of every kiosk screen (setup wizard, pairing,
 * and the main app shell) so the operator can always see connectivity and
 * system time at a glance.
 */
export function SystemStatusBar() {
  const { timeStr, dateStr } = useClock()
  const { ssid, signal } = useWifi()

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-8 w-full items-center justify-between bg-card/80 px-4 text-[11px] font-medium text-muted-foreground backdrop-blur-sm border-b border-border/40"
    >
      {/* Left — WiFi */}
      <div className="flex items-center gap-1.5 min-w-0">
        <WifiIcon ssid={ssid} signal={signal} />
        <span className="truncate max-w-[160px]">
          {ssid ?? "No network"}
        </span>
      </div>

      {/* Right — date + time */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden sm:inline">{dateStr}</span>
        <span className="tabular-nums font-semibold text-foreground">{timeStr}</span>
      </div>
    </div>
  )
}
