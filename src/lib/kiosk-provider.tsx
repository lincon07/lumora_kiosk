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
  fetchKioskState,
  saveSetup,
  sendHeartbeat,
  unpairKiosk,
  type KioskState,
} from "./kiosk-session"
import { collectKioskMetrics } from "./kiosk-metrics"
import { notify } from "./push"
import {
  loadDeviceState,
  patchDeviceState,
  type DeviceState,
} from "./device-state"
import { registerDevice, isDeviceRegistered } from "./registration-service"
import type { SetupValues } from "@/app/kiosk/setup/setup-wizard"

/**
 * The phases of the kiosk startup flow, in order:
 *   splash      – loading local device state on boot
 *   registering – enrolling with Lumora Cloud (step 2); may surface a retry
 *   setup       – running the setup wizard (step 3)
 *   pairing     – waiting to be claimed by a household (step 4)
 *   ready       – registered + set up + claimed; show the Home dashboard
 */
export type KioskPhase = "splash" | "registering" | "setup" | "pairing" | "ready"

type KioskContextValue = {
  /** Current pairing/claim state for this device. */
  state: KioskState
  /** Locally-persisted device state object (setup, language, timezone, name). */
  deviceState: DeviceState
  /** Which screen of the startup flow to show. */
  phase: KioskPhase
  /** True until the first state resolves on launch. */
  loading: boolean
  /** Set when registration fails — drives the retry screen. */
  registrationError: string | null
  /** Set when state fetch/setup hits a hard error (e.g. RPC not deployed). */
  initError: string | null
  /** True while the setup wizard values are being persisted. */
  savingSetup: boolean
  /** Error from persisting setup, surfaced inside the wizard. */
  setupError: string | null
  /** Retry Lumora Cloud registration after a failure. */
  retryRegistration: () => Promise<void>
  /** Persist setup values (local + cloud) and advance the flow. */
  completeSetup: (values: SetupValues) => Promise<void>
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

const INITIAL_STATE: KioskState = {
  found: false,
  deviceId: null,
  deviceName: "Kiosk Display",
  paired: false,
  pairingCode: null,
  householdId: null,
  householdName: null,
  setupComplete: false,
  language: null,
  timezone: null,
}

export function KioskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KioskState>(INITIAL_STATE)
  const [deviceState, setDeviceState] = useState<DeviceState>({
    setupComplete: false,
    language: null,
    timezone: null,
    deviceName: null,
    orientation: null,
  })
  const [phase, setPhase] = useState<KioskPhase>("splash")
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [savingSetup, setSavingSetup] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  // Tracks whether the device is currently paired so the polling loop and
  // Realtime handler can compare before/after to fire push notifications.
  const pairedRef = useRef(false)
  // Guards the poll loop — it must not start until registration resolves.
  const registeredRef = useRef(false)
  // Local setup-complete flag the gate trusts even before the network responds.
  const setupCompleteRef = useRef(false)

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

  /**
   * Step 2 — register with Lumora Cloud (MDM) via the Device Registration
   * service. Idempotent. Resolves to true on success. On failure it surfaces a
   * retry screen and resolves false.
   */
  const doRegister = useCallback(async (deviceName?: string): Promise<boolean> => {
    setRegistrationError(null)
    setPhase("registering")
    try {
      await registerDevice(deviceName)
      registeredRef.current = true
      return true
    } catch (err) {
      console.error("[kiosk] registration error:", err)
      setRegistrationError(
        err instanceof Error ? err.message : "Couldn't reach Lumora Cloud.",
      )
      return false
    }
  }, [])

  /** Recompute which startup phase to show from local + server state. */
  const resolvePhase = useCallback((local: DeviceState, server: KioskState) => {
    // Trust local OR server for setup completion (whichever knows first).
    const setupDone = local.setupComplete || server.setupComplete
    setupCompleteRef.current = setupDone
    if (!setupDone) {
      setPhase("setup")
    } else if (!server.paired) {
      setPhase("pairing")
    } else {
      setPhase("ready")
    }
  }, [])

  /**
   * Step 3 — persist setup values locally (Store + localStorage) and to Lumora
   * Cloud, then advance. Errors surface inside the wizard so the user can retry
   * without losing their input.
   */
  const completeSetup = useCallback(
    async (values: SetupValues) => {
      setSavingSetup(true)
      setSetupError(null)
      try {
        // Persist locally first so the appliance remembers even if the network
        // write fails — the device-state object is the on-device source of truth.
        const nextLocal = await patchDeviceState({
          setupComplete: true,
          language: values.language,
          timezone: values.timezone,
          deviceName: values.deviceName,
          orientation: values.orientation,
        })
        setDeviceState(nextLocal)
        setupCompleteRef.current = true
      } catch (err) {
        console.error("[kiosk] completeSetup local persist error:", err)
        setSetupError(
          err instanceof Error ? err.message : "Couldn't save your setup. Try again.",
        )
        setSavingSetup(false)
        return
      }

      // Mirror to Supabase (Lumora Cloud). This is best-effort — if the RPC
      // isn't deployed yet or the network is unavailable, we still advance
      // because the local device-state is the on-device source of truth.
      try {
        await saveSetup(values)
        await refresh()
      } catch (err) {
        console.error("[kiosk] completeSetup cloud sync error (non-fatal):", err)
        // Surface a soft warning but don't block advancing.
        setSetupError(
          "Setup saved locally. Cloud sync failed — reconnect to sync later.",
        )
      }

      // Advance regardless of cloud sync outcome.
      setPhase(pairedRef.current ? "ready" : "pairing")
      setSavingSetup(false)
    },
    [refresh],
  )

  const retryRegistration = useCallback(async () => {
    const ok = await doRegister(deviceState.deviceName ?? undefined)
    if (ok) {
      await refresh()
      const local = await loadDeviceState()
      setDeviceState(local)
      resolvePhase(local, await fetchKioskState())
    }
  }, [doRegister, refresh, resolvePhase, deviceState.deviceName])

  // Boot sequence: splash -> (register) -> resolve phase.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 1. Load local device state while the splash shows.
        const local = await loadDeviceState()
        if (!alive) return
        setDeviceState(local)
        setupCompleteRef.current = local.setupComplete

        // 2. Ensure registered with Lumora Cloud.
        if (!isDeviceRegistered()) {
          const ok = await doRegister(local.deviceName ?? undefined)
          if (!alive) return
          if (!ok) {
            // Stay on the registering/retry screen; boot resumes via retry.
            setLoading(false)
            return
          }
        } else {
          registeredRef.current = true
        }

        // 3 & 4. Resolve setup + pairing from server state.
        const server = await fetchKioskState()
        if (!alive) return
        pairedRef.current = server.paired
        setState(server)
        resolvePhase(local, server)
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
  }, [doRegister, resolvePhase])

  // Keep phase in sync as pairing state changes (e.g. claimed while waiting).
  useEffect(() => {
    if (!registeredRef.current || !setupCompleteRef.current) return
    if (state.paired) setPhase("ready")
    else if (phase === "ready") setPhase("pairing")
  }, [state.paired, phase])

  // While unpaired: poll briskly so claiming feels instant.
  // While paired: only send a periodic heartbeat (data stays fresh via Realtime).
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const loop = async () => {
      if (!alive) return
      // Don't run until registration has completed and setup is done.
      if (!registeredRef.current || !setupCompleteRef.current) {
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
    () => ({
      state,
      deviceState,
      phase,
      loading,
      registrationError,
      initError,
      savingSetup,
      setupError,
      retryRegistration,
      completeSetup,
      refresh,
      unpair,
    }),
    [
      state,
      deviceState,
      phase,
      loading,
      registrationError,
      initError,
      savingSetup,
      setupError,
      retryRegistration,
      completeSetup,
      refresh,
      unpair,
    ],
  )

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>
}

export function useKiosk() {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error("useKiosk must be used within KioskProvider")
  return ctx
}
