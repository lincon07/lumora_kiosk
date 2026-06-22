"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  ensureRegistered,
  fetchKioskState,
  sendHeartbeat,
  unpairKiosk,
  type KioskState,
} from "./kiosk-session"
import { collectKioskMetrics } from "./kiosk-metrics"
import { notify } from "./push"

type KioskContextValue = {
  /** Current pairing/claim state for this device. */
  state: KioskState
  /** True until the first state resolves on launch. */
  loading: boolean
  /** Set when the initial registration/fetch fails (e.g. RPC not deployed). */
  initError: string | null
  /** Re-poll the claim state immediately. */
  refresh: () => Promise<void>
  /** Detach this kiosk from its household; a fresh pairing code is issued. */
  unpair: () => Promise<void>
}

const KioskContext = createContext<KioskContextValue | null>(null)

// How often to poll claim-state while UNPAIRED (waiting for a family member to
// scan). Kept brisk so pairing feels instant.
const PAIR_POLL_MS = 3000
// How often to send a heartbeat once paired.
const HEARTBEAT_MS = 30000

export function KioskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KioskState>({
    found: false,
    deviceId: null,
    deviceName: "Kiosk Display",
    paired: false,
    pairingCode: null,
    householdId: null,
    householdName: null,
  })
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  // Tracks whether the device is currently paired so the polling loop and
  // Realtime handler can compare before/after to fire push notifications.
  const pairedRef = useRef(false)
  // Guards the poll loop — it must not start until ensureRegistered() resolves.
  const initializedRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const prev = pairedRef.current
      const next = await fetchKioskState()
      pairedRef.current = next.paired
      setState(next)

      // Fire a push notification on state transitions.
      if (!prev && next.paired && next.householdName) {
        void notify(
          "Kiosk claimed",
          `This hub is now connected to ${next.householdName}.`,
        )
      }
      if (prev && !next.paired) {
        void notify("Kiosk disconnected", "This hub has been unpaired from its household.")
      }
    } catch (err) {
      console.error("[kiosk] fetchKioskState error:", err)
      // Don't throw — keep last known state so polling can retry
    }
  }, [])

  const unpair = useCallback(async () => {
    await unpairKiosk()
    await refresh()
  }, [refresh])

  // Register the device once on launch, then resolve initial state.
  // The in-flight promise lock in kiosk-session.ts prevents StrictMode
  // double-mount from creating two device rows.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await ensureRegistered()
        if (!alive) return
        await refresh()
        initializedRef.current = true
      } catch (err) {
        console.error("[kiosk] init error:", err)
        if (alive) {
          setInitError(
            err instanceof Error ? err.message : "Failed to connect to server.",
          )
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  // While unpaired: poll briskly so claiming feels instant.
  // While paired: only send a periodic heartbeat (data stays fresh via Realtime).
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const loop = async () => {
      if (!alive) return
      // Don't run until ensureRegistered() has completed at least once.
      if (!initializedRef.current) {
        timer = setTimeout(loop, 500)
        return
      }
      try {
        if (!pairedRef.current) {
          // Still waiting to be claimed — refresh pairing state briskly.
          await refresh()
        } else {
          // Paired — just heartbeat; Realtime handles data freshness.
          const m = await collectKioskMetrics()
          await sendHeartbeat(m)
        }
      } catch {
        /* transient; next tick retries */
      }
      if (!alive) return
      timer = setTimeout(loop, pairedRef.current ? HEARTBEAT_MS : PAIR_POLL_MS)
    }

    timer = setTimeout(loop, PAIR_POLL_MS)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [refresh])

  const value = useMemo<KioskContextValue>(
    () => ({ state, loading, initError, refresh, unpair }),
    [state, loading, initError, refresh, unpair],
  )

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>
}

export function useKiosk() {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error("useKiosk must be used within KioskProvider")
  return ctx
}
