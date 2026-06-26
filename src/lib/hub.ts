import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Hub (kiosk device) actions and activity log.
 *
 * The kiosk runs Android OS inside a Tauri v2 webview. When the native
 * runtime is present we use Tauri APIs (process relaunch / exit, etc.);
 * otherwise we fall back to browser-safe behavior so the preview still works.
 */

export type HubLogLevel = "info" | "success" | "warning" | "error"

export type HubLogEntry = {
  id: string
  time: string // ISO timestamp
  level: HubLogLevel
  source: string
  message: string
}

/** True when running inside the Tauri runtime (native webview). */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function isHubDevice(): boolean {
  return isTauri()
}

// ---- Activity log (in-memory, newest first) -------------------------------

let logs: HubLogEntry[] = seedLogs()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeLogs(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getLogs(): HubLogEntry[] {
  return logs
}

export function addLog(level: HubLogLevel, source: string, message: string) {
  const entry: HubLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    level,
    source,
    message,
  }
  logs = [entry, ...logs].slice(0, 200)
  emit()
}

export function clearLogs() {
  logs = []
  emit()
}

function seedLogs(): HubLogEntry[] {
  const now = Date.now()
  const min = 60_000
  const mk = (
    offset: number,
    level: HubLogLevel,
    source: string,
    message: string,
  ): HubLogEntry => ({
    id: `seed-${offset}`,
    time: new Date(now - offset).toISOString(),
    level,
    source,
    message,
  })
  return [
    mk(2 * min, "info", "sync", "Calendar synced — 9 events up to date"),
    mk(11 * min, "success", "auth", "Sarah signed in from Kitchen Hub"),
    mk(46 * min, "warning", "network", "Wi-Fi signal dropped to fair, recovered"),
    mk(96 * min, "info", "system", "Nightly screen dimming activated"),
    mk(184 * min, "success", "updates", "Updated to v1.0.0"),
    mk(320 * min, "info", "push", "Delivered 3 notifications"),
    mk(742 * min, "info", "system", "Hub restarted (scheduled maintenance)"),
  ]
}

// ---- Device actions -------------------------------------------------------

/** Relaunch the whole app/kiosk. */
export async function restartHub(): Promise<void> {
  addLog("warning", "system", "Restart requested")
  if (isTauri()) {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
      return
    } catch {
      // fall through to reload
    }
  }
  window.location.reload()
}

/** Reload just the display/UI without restarting the process. */
export function reloadDisplay(): void {
  addLog("info", "system", "Display reloaded")
  window.location.reload()
}




/** Pretend to check for OTA updates. Returns whether an update is available. */

export async function checkForUpdates(): Promise<boolean> {
  try {
    const update = await check();

    return update !== null;
  } catch (error) {
    console.error("Failed to check for updates:", error);
    throw error; // Let the caller handle errors if desired
  }
}

/** Clear cached web data so the next load is fresh. */
export async function clearCache(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // ignore
  }
  addLog("success", "system", "Cache cleared")
}

/**
 * Factory reset the kiosk device.
 *
 * Steps performed:
 *   1. Clear all in-memory activity logs.
 *   2. Clear all browser/webview caches.
 *   3. Clear localStorage and sessionStorage.
 *   4. On Tauri: invoke the `factory_reset` Rust command which wipes the
 *      on-disk kiosk data directory and then terminates the process.
 *   5. On browser preview: reload so the app returns to the setup wizard.
 */
export async function factoryReset(): Promise<void> {
  // 1. Clear activity log.
  clearLogs()

  // 2. Clear web caches.
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // ignore
  }

  // 3. Clear browser storage.
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // ignore
  }

  // 4. Tauri: delegate the hard disk wipe + process exit to Rust.
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("factory_reset")
      // The Rust command calls std::process::exit(0) so we never get here,
      // but add a fallback relaunch just in case.
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
      return
    } catch {
      // fall through
    }
  }

  // 5. Browser preview fallback — reload to the setup wizard.
  window.location.reload()
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
