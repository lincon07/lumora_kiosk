"use client"

import { useMemo, useState } from "react"
import {
  Sparkles,
  Languages,
  Wifi,
  Clock,
  Tag,
  Check,
  ChevronLeft,
  Loader2,
} from "lucide-react"
import { WifiStep } from "./wifi-step"

export type SetupValues = {
  language: string
  timezone: string
  deviceName: string
}

type StepId = "language" | "wifi" | "timezone" | "name"

const STEPS: { id: StepId; title: string; subtitle: string; icon: typeof Wifi }[] = [
  { id: "language", title: "Choose your language", subtitle: "Select the language for this hub.", icon: Languages },
  { id: "wifi", title: "Connect to WiFi", subtitle: "Get your hub online.", icon: Wifi },
  { id: "timezone", title: "Set your time zone", subtitle: "So schedules show the right time.", icon: Clock },
  { id: "name", title: "Name this hub", subtitle: "Pick a name your family will recognize.", icon: Tag },
]

const LANGUAGES = [
  { code: "en-US", label: "English", region: "United States" },
  { code: "en-GB", label: "English", region: "United Kingdom" },
  { code: "es-ES", label: "Español", region: "España" },
  { code: "fr-FR", label: "Français", region: "France" },
  { code: "de-DE", label: "Deutsch", region: "Deutschland" },
  { code: "pt-BR", label: "Português", region: "Brasil" },
  { code: "ja-JP", label: "日本語", region: "日本" },
  { code: "zh-CN", label: "中文", region: "中国" },
]

const NAME_SUGGESTIONS = ["Kitchen Hub", "Living Room", "Family Hub", "Hallway", "Office"]

/** A curated timezone list plus the device's detected zone, deduped. */
function useTimezones() {
  return useMemo(() => {
    const curated = [
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Sao_Paulo",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
    ]
    let detected = ""
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      detected = ""
    }
    const all = detected && !curated.includes(detected) ? [detected, ...curated] : curated
    return { list: all, detected }
  }, [])
}

function StepShell({
  index,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  index: number
  title: string
  subtitle: string
  icon: typeof Wifi
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-7 flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-6" />
        </div>
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Step {index + 1} of {STEPS.length}
          </p>
          <h2 className="mt-1 text-balance text-3xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Device setup wizard — startup step 3. Collects language, WiFi, timezone and
 * device name, then hands the values to the caller to persist (local + cloud).
 */
export function SetupWizard({
  defaults,
  saving,
  saveError,
  onComplete,
}: {
  defaults: Partial<SetupValues>
  saving: boolean
  saveError: string | null
  onComplete: (values: SetupValues) => void
}) {
  const { list: timezones, detected } = useTimezones()
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]

  const [language, setLanguage] = useState(defaults.language ?? "en-US")
  const [connectedSsid, setConnectedSsid] = useState<string | null>(null)
  const [timezone, setTimezone] = useState(defaults.timezone ?? detected ?? "America/New_York")
  const [deviceName, setDeviceName] = useState(defaults.deviceName ?? "")

  const isLast = stepIdx === STEPS.length - 1
  const canAdvance = step.id === "name" ? deviceName.trim().length > 0 : true

  const next = () => {
    if (isLast) {
      onComplete({ language, timezone, deviceName: deviceName.trim() })
      return
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }
  const back = () => setStepIdx((i) => Math.max(i - 1, 0))

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-7">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Lumora</span>
        </div>
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-2 rounded-full transition-all ${
                i === stepIdx ? "w-8 bg-primary" : i < stepIdx ? "w-2 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-8 pb-8">
        <StepShell index={stepIdx} title={step.title} subtitle={step.subtitle} icon={step.icon}>
          {step.id === "language" ? (
            <div className="grid flex-1 grid-cols-2 content-start gap-3">
              {LANGUAGES.map((l) => {
                const active = l.code === language
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    aria-pressed={active}
                    className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span>
                      <span className="block text-lg font-semibold">{l.label}</span>
                      <span className="block text-sm text-muted-foreground">{l.region}</span>
                    </span>
                    {active ? <Check className="size-5 text-primary" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {step.id === "wifi" ? (
            <WifiStep
              connectedSsid={connectedSsid}
              onConnected={(ssid) => setConnectedSsid(ssid)}
              onSkip={next}
            />
          ) : null}

          {step.id === "timezone" ? (
            <div className="grid flex-1 grid-cols-1 content-start gap-2 overflow-auto sm:grid-cols-2">
              {timezones.map((tz) => {
                const active = tz === timezone
                const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
                return (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => setTimezone(tz)}
                    aria-pressed={active}
                    className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <span>
                      <span className="block text-lg font-semibold">{city}</span>
                      <span className="block text-sm text-muted-foreground">
                        {tz === detected ? "Detected · " : ""}
                        {tz}
                      </span>
                    </span>
                    {active ? <Check className="size-5 shrink-0 text-primary" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {step.id === "name" ? (
            <div className="flex flex-1 flex-col">
              <input
                autoFocus
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canAdvance && !saving) next()
                }}
                maxLength={40}
                placeholder="e.g. Kitchen Hub"
                className="w-full rounded-2xl border border-input bg-background px-5 py-4 text-2xl font-semibold outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {NAME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDeviceName(s)}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {saveError ? (
                <p className="mt-5 text-sm text-destructive">{saveError}</p>
              ) : null}
            </div>
          ) : null}
        </StepShell>

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={stepIdx === 0 || saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-base font-semibold text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="size-5" />
            Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance || saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : null}
            {isLast ? (saving ? "Finishing…" : "Finish setup") : "Continue"}
          </button>
        </div>
      </div>
    </main>
  )
}
