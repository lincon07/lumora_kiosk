/**
 * ota-poll.ts — polls the central API for pending OTA jobs for each registered kiosk.
 *
 * The central API pushes OTA jobs via socket on creation, but a device that was
 * offline at push time would never receive it. This poller checks every 5 minutes
 * so those devices pick up their job when they come back online.
 */

import { getDb } from "../db"
import { getCentralKioskCredentials } from "../lib/central-registry"
import { relayEvent } from "../lib/central-socket-client"

const CENTRAL_API_URL = process.env.CENTRAL_API_URL ?? "http://localhost:4000"
const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function pollKioskOta(localDeviceId: string): Promise<void> {
  const creds = getCentralKioskCredentials(localDeviceId)
  if (!creds) return

  try {
    const res = await fetch(`${CENTRAL_API_URL}/devices/ota/check`, {
      headers: { Authorization: `Bearer ${creds.central_jwt}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return

    const data = (await res.json()) as { pending: boolean; job?: { id: string; version: string; download_url: string; changelog?: string } }
    if (!data.pending || !data.job) return

    // Ack the job so the central API knows we're processing it
    await fetch(`${CENTRAL_API_URL}/devices/ota/${data.job.id}/ack`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.central_jwt}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})

    // Relay ota:push to the kiosk via central socket (hub:relay → device room)
    relayEvent("ota:push", {
      job_id:  data.job.id,
      version: data.job.version,
      url:     data.job.download_url,
      notes:   data.job.changelog ?? undefined,
      ts:      new Date().toISOString(),
    })
    console.log(`[ota-poll] Relayed OTA job ${data.job.id} v${data.job.version} → local device ${localDeviceId}`)
  } catch {
    // Silently ignore — will retry next interval
  }
}

async function pollAll(): Promise<void> {
  const db = getDb()
  const kiosks = db.prepare(
    "SELECT id FROM kiosk_devices WHERE household_id IS NOT NULL AND is_online = 1"
  ).all() as Array<{ id: string }>

  await Promise.allSettled(kiosks.map(k => pollKioskOta(k.id)))
}

export function startOtaPollScheduler(): void {
  void pollAll() // run once on startup
  setInterval(() => { void pollAll() }, POLL_INTERVAL_MS)
  console.log("[ota-poll] OTA poll scheduler started (every 5 min)")
}
