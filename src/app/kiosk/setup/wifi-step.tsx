"use client"

import { useCallback, useEffect, useState } from "react"
import { Wifi, WifiLow, WifiHigh, Lock, Loader2, Check, RefreshCw, ChevronRight } from "lucide-react"
import {
  scanNetworks,
  connect as wifiConnect,
  needsPassword,
  type WifiNetwork,
} from "@/lib/wifi-service"

/** Pick a signal icon by strength so the list reads at a glance. */
function SignalIcon({ signal }: { signal: number }) {
  if (signal >= 66) return <WifiHigh className="size-5" />
  if (signal >= 33) return <Wifi className="size-5" />
  return <WifiLow className="size-5" />
}

/**
 * WiFi setup step. Fully custom UI — the user never sees Ubuntu's network
 * settings. Talks to the WiFi service abstraction, which delegates to
 * NetworkManager via Tauri on a real device (mocked in dev).
 */
export function WifiStep({
  connectedSsid,
  onConnected,
  onSkip,
}: {
  connectedSsid: string | null
  onConnected: (ssid: string) => void
  onSkip: () => void
}) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(true)
  const [selected, setSelected] = useState<WifiNetwork | null>(null)
  const [password, setPassword] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const nets = await scanNetworks()
      setNetworks(nets)
    } catch {
      setError("Couldn't scan for networks.")
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void runScan()
  }, [runScan])

  const handleSelect = (net: WifiNetwork) => {
    setSelected(net)
    setPassword("")
    setError(null)
    // Open networks connect immediately.
    if (!needsPassword(net.security)) {
      void doConnect(net, undefined)
    }
  }

  const doConnect = async (net: WifiNetwork, pwd?: string) => {
    setConnecting(true)
    setError(null)
    try {
      const ok = await wifiConnect(net.ssid, pwd)
      if (ok) {
        onConnected(net.ssid)
        setSelected(null)
      } else {
        setError("Couldn't connect. Check the password and try again.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect to this network.")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-base text-muted-foreground">
          {connectedSsid ? (
            <span className="inline-flex items-center gap-2 text-foreground">
              <Check className="size-5 text-primary" />
              Connected to <span className="font-semibold">{connectedSsid}</span>
            </span>
          ) : (
            "Choose a network to get your hub online."
          )}
        </p>
        <button
          type="button"
          onClick={() => void runScan()}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${scanning ? "animate-spin" : ""}`} />
          Rescan
        </button>
      </div>

      {/* Network list */}
      <div className="flex-1 overflow-auto rounded-2xl border border-border bg-card">
        {scanning && networks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Scanning for networks…</span>
          </div>
        ) : networks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <Wifi className="size-6" />
            <span className="text-sm text-pretty">
              No networks found. Make sure WiFi is in range, then rescan.
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {networks.map((net) => {
              const isConnected = net.ssid === connectedSsid
              return (
                <li key={net.ssid}>
                  <button
                    type="button"
                    onClick={() => handleSelect(net)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted"
                  >
                    <span className="text-muted-foreground">
                      <SignalIcon signal={net.signal} />
                    </span>
                    <span className="flex-1 text-lg font-medium">{net.ssid}</span>
                    {needsPassword(net.security) ? (
                      <Lock className="size-4 text-muted-foreground" />
                    ) : null}
                    {isConnected ? (
                      <Check className="size-5 text-primary" />
                    ) : (
                      <ChevronRight className="size-5 text-muted-foreground" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Skip for now */}
      <button
        type="button"
        onClick={onSkip}
        className="mt-5 self-center text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Set up WiFi later
      </button>

      {/* Password sheet */}
      {selected && needsPassword(selected.security) ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-8">
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-7 shadow-lg sm:rounded-3xl">
            <h3 className="text-xl font-bold">Connect to {selected.ssid}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Enter the network password.</p>
            <input
              autoFocus
              type="password"
              inputMode="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) void doConnect(selected, password)
              }}
              placeholder="Password"
              className="mt-5 w-full rounded-xl border border-input bg-background px-4 py-3.5 text-lg outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setError(null)
                }}
                disabled={connecting}
                className="flex-1 rounded-xl border border-border bg-background py-3.5 text-base font-semibold hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doConnect(selected, password)}
                disabled={connecting || !password}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-50"
              >
                {connecting ? <Loader2 className="size-5 animate-spin" /> : null}
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Connecting overlay for open networks */}
      {selected && !needsPassword(selected.security) && connecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Connecting to {selected.ssid}…</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
