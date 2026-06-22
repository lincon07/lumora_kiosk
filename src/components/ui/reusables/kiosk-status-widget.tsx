import { useStore } from "@/lib/store"
import { Wifi, Activity, Battery, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

export function KioskStatusWidget() {
  const { kioskDevices } = useStore()
  const kiosk = kioskDevices[0]

  if (!kiosk) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No kiosk connected
      </div>
    )
  }

  const lastSeen = new Date(kiosk.last_heartbeat)
  const timeSinceUpdate = Math.round((Date.now() - lastSeen.getTime()) / 1000)
  const isRecent = timeSinceUpdate < 60 // Within 60 seconds

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{kiosk.device_name}</h3>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
            kiosk.is_online
              ? "bg-green-500/10 text-green-700"
              : "bg-red-500/10 text-red-700"
          )}
        >
          <div
            className={cn(
              "size-2 rounded-full",
              kiosk.is_online ? "bg-green-500" : "bg-red-500"
            )}
          />
          {kiosk.is_online ? "Online" : "Offline"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* WiFi Signal */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
          <Wifi className="size-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">WiFi</p>
            <p className="text-sm font-semibold">{kiosk.wifi_signal} dBm</p>
          </div>
        </div>

        {/* Ping Latency */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
          <Activity className="size-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Ping</p>
            <p className="text-sm font-semibold">{kiosk.ping_latency_ms}ms</p>
          </div>
        </div>

        {/* Battery */}
        {kiosk.battery_percent !== null && kiosk.battery_percent !== undefined && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
            <Battery className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Battery</p>
              <p className="text-sm font-semibold">{kiosk.battery_percent}%</p>
            </div>
          </div>
        )}

        {/* Last Update */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
          <Clock className="size-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Last seen</p>
            <p className="text-sm font-semibold">
              {isRecent ? `${timeSinceUpdate}s ago` : lastSeen.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* Device Info */}
      {kiosk.device_info && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-xs text-muted-foreground">
            {JSON.parse(kiosk.device_info).platform}
          </p>
        </div>
      )}
    </div>
  )
}
