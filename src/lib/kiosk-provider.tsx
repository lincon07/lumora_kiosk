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

type KioskContextValue = {
  /** Current pairing/claim state for this device. */
  state: KioskState
  /** True until the first state resolves on launch. */
  loading: boolean
  /** Re-poll the claim state immediately. */
  refresh: () => Promise<void>
  /** Detach this kiosk from its household; a fresh pairing code is issued. */
  unpair: () => Promise<void>
}

const KioskContext = createContext<KioskContextValue | null>(null)

// How often to poll claim-state while UNPAIRED (waiting for a family member to
// scan). Kept brisk so pairing feels instant.
const PAIR_POLL_MS = 3000
// How often to poll once paired (just to catch an external unpair) + heartbeat.
const PAIRED_POLL_MS = 30000

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
  const pairedRef = useRef(false)

  const refresh = useCallback(async () => {
    const next = await fetchKioskState()
    pairedRef.current = next.paired
    setState(next)
    return
  }, [])

  const unpair = useCallback(async () => {
    await unpairKiosk()
    await refresh()
  }, [refresh])

  // Register the device once on launch, then resolve initial state.
  useEffect(() => {
    let alive = true
    ;(async () => {
      await ensureRegistered()
      if (!alive) return
      await refresh()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  // Adaptive polling: fast while waiting to be claimed, slow once paired.
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const loop = async () => {
      if (!alive) return
      try {
        await refresh()
        // Send a heartbeat on the paired cadence so the mobile app sees status.
        if (pairedRef.current) {
          const m = await collectKioskMetrics()
          await sendHeartbeat(m)
        }
      } catch {
        /* transient; next tick retries */
      }
      if (!alive) return
      timer = setTimeout(loop, pairedRef.current ? PAIRED_POLL_MS : PAIR_POLL_MS)
    }

    timer = setTimeout(loop, pairedRef.current ? PAIRED_POLL_MS : PAIR_POLL_MS)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [refresh])

  const value = useMemo<KioskContextValue>(
    () => ({ state, loading, refresh, unpair }),
    [state, loading, refresh, unpair],
  )

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>
}

export function useKiosk() {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error("useKiosk must be used within KioskProvider")
  return ctx
}
