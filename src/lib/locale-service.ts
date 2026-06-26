"use client"

/**
 * Locale service abstraction — language and timezone.
 *
 * Mirrors the wifi-service pattern exactly:
 *
 *   React UI
 *     ↓
 *   invoke() (this file)
 *     ↓
 *   Rust Commands  (src-tauri/src/lib.rs)
 *     ↓
 *   localectl / timedatectl  (Ubuntu / Raspberry Pi OS)
 *
 * In the browser / dev preview (no Tauri runtime), operations succeed with a
 * short simulated delay and the chosen values are stored in module-level vars
 * so the wizard flow is fully exercisable without a real device.
 *
 * When the Tauri backend is present the actual system locale and timezone are
 * read and written via the `locale_*` / `timezone_*` commands — the UI never
 * opens system settings dialogs.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocaleResult = {
  /** BCP-47 locale code stored in LANG, e.g. "en_US.UTF-8" or "fr_FR.UTF-8". */
  lang: string
  /** The raw locale code as returned by the system, may differ from the
   *  wizard's BCP-47 code (e.g. "en_US.UTF-8" vs "en-US"). */
  raw: string
}

export type ScreenOrientation = "normal" | "left" | "right" | "inverted" | "portrait"

export type TimezoneResult = {
  /** IANA timezone identifier, e.g. "America/New_York". */
  timezone: string
  /** Human-readable UTC offset string returned by the system, e.g. "UTC-05:00". */
  utcOffset: string
}

// ─── Tauri detection ──────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core")
  return mod.invoke<T>(cmd, args)
}

// ─── Dev-preview state ────────────────────────────────────────────────────────

/** Simulated state used only when Tauri is not available (browser / Vite dev). */
let _devLang: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? "en-US"
  } catch {
    return "en-US"
  }
})()

let _devTimezone: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York"
  } catch {
    return "America/New_York"
  }
})()

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a BCP-47 code (e.g. "en-US") to the POSIX locale format that
 * `localectl` expects (e.g. "en_US.UTF-8").
 */
function bcp47ToPosix(code: string): string {
  // "en-US" → "en_US.UTF-8"
  // Use replace with regex to handle codes that already use underscore.
  return code.replace(/-/, "_") + ".UTF-8"
}

/**
 * Normalise a raw locale string (POSIX or BCP-47) into a BCP-47 code so it
 * can be matched against SUPPORTED_LANGUAGES in the UI.
 *
 * Examples:
 *   "en_US.UTF-8" → "en-US"
 *   "fr_FR.UTF-8" → "fr-FR"
 *   "en-US"       → "en-US"  (already normalised)
 *   "C"           → "en-US"  (POSIX C/POSIX → default to English)
 */
export function normaliseToBcp47(raw: string): string {
  if (!raw || raw === "C" || raw === "POSIX") return "en-US"
  // Strip encoding suffix (e.g. ".UTF-8", ".utf8")
  const withoutEncoding = raw.split(".")[0]
  // Replace underscore separator with hyphen: "en_US" → "en-US"
  return withoutEncoding.replace(/_/, "-")
}

// ─── Language ─────────────────────────────────────────────────────────────────

/**
 * Read the current system language.
 * On Tauri: calls `locale_get` → `localectl status`.
 * In dev: returns the browser's detected locale.
 */
export async function getLanguage(): Promise<LocaleResult> {
  if (isTauri()) {
    try {
      const raw = await invoke<LocaleResult>("locale_get")
      // Rust returns the raw POSIX locale (e.g. "en_US.UTF-8").
      // Normalise it to BCP-47 (e.g. "en-US") so the UI can match it.
      return {
        lang: normaliseToBcp47(raw.lang),
        raw: raw.raw,
      }
    } catch (err) {
      console.error("[locale-service] getLanguage failed:", err)
      return { lang: "en-US", raw: "en_US.UTF-8" }
    }
  }
  await new Promise((r) => setTimeout(r, 300))
  return { lang: _devLang, raw: bcp47ToPosix(_devLang) }
}

/**
 * Apply a new system language.
 *
 * On Tauri: calls `locale_set` → `localectl set-locale LANG=<posix>`.
 * In dev: stores in module state and resolves.
 *
 * @param code - BCP-47 code, e.g. "en-US", "fr-FR", "ja-JP".
 * @returns true on success.
 */
export async function setLanguage(code: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const posix = bcp47ToPosix(code)
      return await invoke<boolean>("locale_set", { lang: posix })
    } catch (err) {
      console.error("[locale-service] setLanguage failed:", err)
      return false
    }
  }
  await new Promise((r) => setTimeout(r, 600))
  _devLang = code
  return true
}

// ─── Timezone ─────────────────────────────────────────────────────────────────

/**
 * Read the current system timezone.
 * On Tauri: calls `timezone_get` → `timedatectl show`.
 * In dev: returns the browser's detected timezone.
 */
export async function getTimezone(): Promise<TimezoneResult> {
  if (isTauri()) {
    try {
      return await invoke<TimezoneResult>("timezone_get")
    } catch (err) {
      console.error("[locale-service] getTimezone failed:", err)
      return { timezone: "America/New_York", utcOffset: "UTC-05:00" }
    }
  }
  await new Promise((r) => setTimeout(r, 300))
  return { timezone: _devTimezone, utcOffset: "UTC" }
}

/**
 * Apply a new system timezone.
 *
 * On Tauri: calls `timezone_set` → `timedatectl set-timezone <tz>`.
 * In dev: stores in module state and resolves.
 *
 * @param timezone - IANA identifier, e.g. "America/New_York", "Europe/Paris".
 * @returns true on success.
 */
export async function setTimezone(timezone: string): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>("timezone_set", { timezone })
    } catch (err) {
      console.error("[locale-service] setTimezone failed:", err)
      return false
    }
  }
  await new Promise((r) => setTimeout(r, 600))
  _devTimezone = timezone
  return true
}

// ─── Orientation ──────────────────────────────────────────────────────────────

/**
 * Rotate the physical display via xrandr (Tauri) or a simulated store (dev).
 *
 * @param rotation - One of "normal" | "left" | "right" | "inverted".
 * @returns true on success.
 */
export async function setOrientation(rotation: ScreenOrientation): Promise<boolean> {
  if (isTauri()) {
    try {
      await invoke<void>("screen_orientation_set", { rotation })
      return true
    } catch (err) {
      console.error("[locale-service] setOrientation failed:", err)
      return false
    }
  }
  await new Promise((r) => setTimeout(r, 400))
  return true
}

// ─── Combined apply (used by setup wizard finish) ─────────────────────────────

/**
 * Apply language, timezone, and (optionally) screen orientation in parallel.
 * Call this on wizard completion so the OS is configured before state persists.
 */
export async function applyLocaleSettings(params: {
  language: string
  timezone: string
  orientation?: ScreenOrientation
}): Promise<{ languageOk: boolean; timezoneOk: boolean; orientationOk: boolean }> {
  const [languageOk, timezoneOk, orientationOk] = await Promise.all([
    setLanguage(params.language),
    setTimezone(params.timezone),
    params.orientation ? setOrientation(params.orientation) : Promise.resolve(true),
  ])
  return { languageOk, timezoneOk, orientationOk }
}
