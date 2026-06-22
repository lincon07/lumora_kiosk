"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import {
  Tablet,
  ChevronRight,
  Bell,
  RefreshCw,
  Moon,
  Sun,
  Battery,
  Wifi,
  Monitor,
  Send,
  ShieldCheck,
  User,
  CreditCard,
  HelpCircle,
  LogOut,
  Trash2,
  Lock,
  Volume2,
  CalendarClock,
  Power,
  RotateCcw,
  ScrollText,
  DownloadCloud,
  Eraser,
  Info,
  AlertTriangle,
  CheckCircle2,
  Cake,
  Mail,
  UserPlus,
  Unplug,
  UserCheck,
  Copy,
  Check,
  Loader2,
  QrCode as QrCodeIcon,
  type LucideIcon,
} from "lucide-react"
import {
  roleLabels,
  calculateAge,
  memberBg,
  permissionAreas,
  permissionLabels,
  permissionDescriptions,
  type Member,
  type MemberColor,
  type MemberRole,
  type PermissionArea,
} from "@/lib/data"
import { cn } from "@/lib/utils"
import { useTheme, type Theme } from "@/components/theme-provider"
import { MemberAvatar } from "@/components/ui/reusables/member-avatar"
import { ConfirmDialog } from "@/components/ui/reusables/confirm-dialog"
import { BottomSheet } from "@/components/ui/reusables/bottom-sheet"
import { QrCode } from "@/components/ui/reusables/qr-code"
import { useStore } from "@/lib/store"
import { useAuth } from "@/lib/auth"
import { type Invite } from "@/lib/api"
import {
  getPushPermission,
  requestPushPermission,
  sendTestNotification,
  isPushSupported,
  type PushPermission,
} from "@/lib/push"
import {
  restartHub,
  reloadDisplay,
  checkForUpdates,
  clearCache,
  getLogs,
  subscribeLogs,
  clearLogs,
  relativeTime,
  type HubLogLevel,
} from "@/lib/hub"

function Toggle({
  label,
  description,
  icon: Icon,
  defaultOn = false,
}: {
  label: string
  description?: string
  icon: LucideIcon
  defaultOn?: boolean
}) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          on ? "bg-member-green" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            on ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  )
}

function ActionRow({
  label,
  description,
  icon: Icon,
  onClick,
  destructive = false,
  trailing,
}: {
  label: string
  description?: string
  icon: LucideIcon
  onClick?: () => void
  destructive?: boolean
  trailing?: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xl",
          destructive ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium", destructive && "text-destructive")}>{label}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      {trailing ?? <ChevronRight className={cn("size-4", destructive ? "text-destructive/60" : "text-muted-foreground")} />}
    </button>
  )
}

const appearanceOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
]

function AppearanceControl() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex items-center justify-between rounded-3xl bg-card px-4 py-3 shadow-sm">
      <span className="text-sm font-medium">Theme</span>
      <div className="inline-flex items-center gap-0.5 rounded-full bg-secondary p-0.5">
        {appearanceOptions.map(({ value, label, icon: Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              aria-label={label}
              title={label}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const permissionMeta: Record<PushPermission, { label: string; className: string }> = {
  granted: { label: "Enabled", className: "bg-member-green/15 text-member-green" },
  denied: { label: "Blocked", className: "bg-destructive/15 text-destructive" },
  default: { label: "Not set", className: "bg-secondary text-muted-foreground" },
  unsupported: { label: "Unavailable", className: "bg-secondary text-muted-foreground" },
}

function PushNotificationsSection() {
  const { addNotification } = useStore()
  const [permission, setPermission] = useState<PushPermission>("default")
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getPushPermission().then((p) => {
      if (active) setPermission(p)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const meta = permissionMeta[permission]
  const supported = isPushSupported()

  const enable = async () => {
    const result = await requestPushPermission()
    setPermission(result)
    setToast(result === "granted" ? "Push notifications enabled" : "Permission " + result)
  }

  const test = async () => {
    const ok = await sendTestNotification({
      title: "Lumora Hub",
      body: "Test notification — push is working!",
    })
    setPermission(await getPushPermission())
    // Always log it into the in-app notification center too.
    addNotification({
      title: "Test notification",
      body: ok ? "Delivered to your device." : "Could not deliver — check permissions.",
      time: "Just now",
      memberId: "family",
      read: false,
    })
    setToast(ok ? "Test notification sent" : "Enable notifications first")
  }

  return (
    <section>
      <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Push Notifications</h2>
      <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Bell className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Device permission</span>
            <span className="block text-xs text-muted-foreground">
              {supported ? "Allow alerts on this device" : "Not supported in this environment"}
            </span>
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.className)}>
            {meta.label}
          </span>
        </div>

        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            onClick={enable}
            disabled={!supported || permission === "granted"}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ShieldCheck className="size-4" />
            {permission === "granted" ? "Allowed" : "Enable"}
          </button>
          <button
            type="button"
            onClick={test}
            disabled={!supported}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-40"
          >
            <Send className="size-4" />
            Send test
          </button>
        </div>

        {permission === "denied" ? (
          <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            Notifications are blocked. Re-enable them in your device or browser settings.
          </p>
        ) : null}

        {toast ? (
          <p className="border-t border-border/60 bg-secondary/40 px-4 py-2.5 text-xs font-medium text-foreground">
            {toast}
          </p>
        ) : null}
      </div>
    </section>
  )
}

const logLevelMeta: Record<HubLogLevel, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-member-blue" },
  success: { icon: CheckCircle2, className: "text-member-green" },
  warning: { icon: AlertTriangle, className: "text-member-amber" },
  error: { icon: AlertTriangle, className: "text-destructive" },
}

function HistoryLogsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const logs = useSyncExternalStore(subscribeLogs, getLogs, getLogs)

  return (
    <BottomSheet open={open} onClose={onClose} title="Activity logs">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{logs.length} recent events</p>
        <button
          type="button"
          onClick={() => clearLogs()}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-40"
        >
          <Eraser className="size-3.5" />
          Clear
        </button>
      </div>
      <ul className="max-h-[55vh] divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-2xl bg-background">
        {logs.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">No log entries</li>
        ) : (
          logs.map((entry) => {
            const meta = logLevelMeta[entry.level]
            const Icon = meta.icon
            return (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.source}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(entry.time)}</span>
                  </div>
                  <p className="text-sm leading-snug">{entry.message}</p>
                </div>
              </li>
            )
          })
        )}
      </ul>
    </BottomSheet>
  )
}

function HubActionsSection() {
  const { can } = useStore()
  const [logsOpen, setLogsOpen] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const onCheckUpdates = async () => {
    const available = await checkForUpdates()
    setToast(available ? "Update available — installing" : "You're on the latest version")
  }

  const onClearCache = async () => {
    await clearCache()
    setToast("Cache cleared")
  }

  return (
    <section>
      <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Hub Actions</h2>
      <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card shadow-sm">
        <ActionRow
          icon={ScrollText}
          label="Activity logs"
          description="View recent hub events"
          onClick={() => setLogsOpen(true)}
        />
        <ActionRow
          icon={DownloadCloud}
          label="Check for updates"
          description="Currently on v1.0.0"
          onClick={onCheckUpdates}
        />
        <ActionRow
          icon={RotateCcw}
          label="Reload display"
          description="Refresh the on-screen UI"
          onClick={reloadDisplay}
        />
        <ActionRow
          icon={Eraser}
          label="Clear cache"
          description="Free up cached web data"
          onClick={onClearCache}
        />
          {can("hub") ? (
            <ActionRow
              icon={Power}
              label="Restart hub"
              description="Reboot the kiosk device"
              onClick={() => setConfirmRestart(true)}
              destructive
            />
          ) : null}
      </div>

      {toast ? (
        <p className="mt-2 rounded-2xl bg-secondary/60 px-4 py-2.5 text-xs font-medium text-foreground">{toast}</p>
      ) : null}

      <HistoryLogsSheet open={logsOpen} onClose={() => setLogsOpen(false)} />

      <ConfirmDialog
        open={confirmRestart}
        title="Restart hub?"
        message="The display will go dark and reboot. This takes about a minute."
        confirmLabel="Restart"
        onCancel={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false)
          void restartHub()
        }}
      />
    </section>
  )
}

const colorOptions: MemberColor[] = ["coral", "amber", "teal", "blue", "pink", "green"]
const roleOptions: MemberRole[] = ["admin", "adult", "teen", "child"]

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"

type MemberDraft = {
  name: string
  dob: string
  role: MemberRole
  color: MemberColor
  account: string
  permissions: PermissionArea[]
}

function toDraft(member: Member | null): MemberDraft {
  return {
    name: member?.name ?? "",
    dob: member?.dob ?? "",
    role: member?.role ?? "child",
    color: member?.color ?? "blue",
    account: member?.account ?? "",
    permissions: member?.permissions ?? [],
  }
}

function MemberSheet({
  open,
  member,
  onClose,
  onDelete,
  onInvite,
}: {
  open: boolean
  member: Member | null
  onClose: () => void
  onDelete?: () => void
  onInvite?: () => void
}) {
  const { addMember, updateMember } = useStore()
  const { user } = useAuth()
  const [draft, setDraft] = useState<MemberDraft>(() => toDraft(member))

  // Re-seed the form whenever a different member (or add mode) opens.
  useEffect(() => {
    if (open) setDraft(toDraft(member))
  }, [open, member])

  const isEdit = !!member
  const age = calculateAge(draft.dob || undefined)
  const set = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    const name = draft.name.trim()
    if (!name) return
    // Admins implicitly have every permission, so we don't store a list for them.
    const permissions = draft.role === "admin" ? undefined : draft.permissions

    if (isEdit && member) {
      updateMember(member.id, {
        name,
        dob: draft.dob || undefined,
        role: draft.role,
        color: draft.color,
        account: draft.account.trim() || undefined,
        permissions,
      })
    } else {
      addMember({
        name,
        dob: draft.dob || undefined,
        role: draft.role,
        color: draft.color,
        account: draft.account.trim() || undefined,
        permissions,
      })
    }
    onClose()
  }

  const togglePermission = (area: PermissionArea) =>
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(area)
        ? d.permissions.filter((a) => a !== area)
        : [...d.permissions, area],
    }))

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit member" : "Add member"}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={!draft.name.trim()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isEdit ? "Save changes" : "Add member"}
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Full name"
            autoFocus={!isEdit}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth">
            <input
              type="date"
              className={inputClass}
              value={draft.dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set("dob", e.target.value)}
            />
          </Field>
          <Field label="Age">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm">
              <Cake className="size-4 text-muted-foreground" />
              <span>{age === null ? "—" : `${age} yrs`}</span>
            </div>
          </Field>
        </div>

        <Field label="Role">
          <div className="grid grid-cols-4 gap-1.5">
            {roleOptions.map((r) => {
              const active = draft.role === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("role", r)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl py-2 text-xs font-semibold transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {roleLabels[r]}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Color">
          <div className="flex gap-2">
            {colorOptions.map((c) => {
              const active = draft.color === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  aria-label={c}
                  aria-pressed={active}
                  className={cn(
                    "size-8 rounded-full transition-transform",
                    memberBg[c],
                    active ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : "hover:scale-105",
                  )}
                />
              )
            })}
          </div>
        </Field>

        <Field label="Connected account">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              className={cn(inputClass, "pl-9")}
              value={draft.account}
              onChange={(e) => set("account", e.target.value)}
              placeholder="name@family.com"
            />
          </div>
          {user && draft.account.trim().toLowerCase() !== user.email.toLowerCase() ? (
            <button
              type="button"
              onClick={() => set("account", user.email)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary"
            >
              <UserCheck className="size-3.5" />
              This is me — link my account ({user.email})
            </button>
          ) : null}
          {user && draft.account.trim().toLowerCase() === user.email.toLowerCase() ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-member-green">
              <Check className="size-3.5" />
              Linked to your account
            </p>
          ) : null}
        </Field>

        {/* Invite to app */}
        {isEdit && onInvite ? (
          <button
            type="button"
            onClick={onInvite}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <QrCodeIcon className="size-4 text-primary" />
            Invite to the app
          </button>
        ) : null}

        {/* Permissions — admins implicitly have everything */}
        {draft.role === "admin" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-border/70 p-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Full access</span>
              <span className="block text-xs text-muted-foreground">
                Admins can manage everything in the household.
              </span>
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 p-3">
            <div className="mb-1 flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Permissions</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Choose what {draft.name.trim() || "this member"} can manage.
            </p>
            <div className="space-y-1">
              {permissionAreas.map((area) => {
                const on = draft.permissions.includes(area)
                return (
                  <div key={area} className="flex items-center gap-3 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{permissionLabels[area]}</span>
                      <span className="block text-xs text-muted-foreground">{permissionDescriptions[area]}</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Can manage ${permissionLabels[area]}`}
                      onClick={() => togglePermission(area)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        on ? "bg-member-green" : "bg-border",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                          on ? "left-[1.375rem]" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isEdit && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <Trash2 className="size-4" />
            Remove member
          </button>
        ) : null}
      </div>
    </BottomSheet>
  )
}

function InviteSheet({ open, member, onClose }: { open: boolean; member: Member | null; onClose: () => void }) {
  const { inviteMember } = useStore()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !member) return
    setInvite(null)
    setError(null)
    setCopied(false)
    setBusy(true)
    inviteMember(member)
      .then(setInvite)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not create invite."))
      .finally(() => setBusy(false))
  }, [open, member, inviteMember])

  // QR payload the claim flow understands (token + human-typable code).
  const payload = invite ? JSON.stringify({ app: "lumora", token: invite.token, code: invite.code }) : ""

  const copyCode = async () => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Invite ${member?.name ?? "member"}`}>
      <div className="flex flex-col items-center text-center">
        {busy ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>
        ) : invite ? (
          <>
            <p className="mb-4 max-w-xs text-pretty text-sm text-muted-foreground">
              Have {member?.name} open Lumora on their phone, tap{" "}
              <span className="font-semibold text-foreground">I have an invite</span>, and scan this code to set up
              their profile.
            </p>
            <QrCode value={payload} size={208} />
            <div className="mt-4 w-full">
              <p className="text-xs font-semibold text-muted-foreground">Or share this code</p>
              <button
                type="button"
                onClick={copyCode}
                className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-lg font-bold tracking-widest text-foreground"
              >
                {invite.code}
                {copied ? <Check className="size-4 text-member-green" /> : <Copy className="size-4 text-muted-foreground" />}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">Expires in 7 days</p>
            </div>
          </>
        ) : null}
      </div>
    </BottomSheet>
  )
}

function FamilyMembersSection() {
  const { members, deleteMember, can } = useStore()
  const canManageMembers = can("members")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null)
  const [inviteMember, setInviteMember] = useState<Member | null>(null)

  const people = members.filter((m) => m.id !== "family")

  const openAdd = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openEdit = (m: Member) => {
    setEditing(m)
    setSheetOpen(true)
  }

  return (
    <section>
      <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Family Members</h2>
      <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
        <ul className="divide-y divide-border/60">
          {people.map((m) => {
            const age = calculateAge(m.dob)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  disabled={!canManageMembers}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
                >
                  <MemberAvatar member={m} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {roleLabels[m.role]}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {age !== null ? <span>{age} yrs</span> : <span>No DOB</span>}
                      <span aria-hidden>·</span>
                      {m.pending ? (
                        <span className="flex items-center gap-1 text-member-amber">
                          <Send className="size-3" />
                          Invited
                        </span>
                      ) : m.userId || m.account ? (
                        <span className="flex items-center gap-1 text-member-green">
                          <UserCheck className="size-3" />
                          Linked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Unplug className="size-3" />
                          Not linked
                        </span>
                      )}
                    </span>
                  </span>
                  {canManageMembers ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
        {canManageMembers ? (
          <button
            type="button"
            onClick={openAdd}
            className="flex w-full items-center gap-2 border-t border-border/60 px-4 py-3 text-sm font-semibold text-primary"
          >
            <UserPlus className="size-4" />
            Add member
          </button>
        ) : null}
      </div>

      <MemberSheet
        open={sheetOpen}
        member={editing}
        onClose={() => setSheetOpen(false)}
        onDelete={
          editing && canManageMembers
            ? () => {
                setConfirmDelete(editing)
                setSheetOpen(false)
              }
            : undefined
        }
        onInvite={
          editing
            ? () => {
                setInviteMember(editing)
                setSheetOpen(false)
              }
            : undefined
        }
      />

      <InviteSheet open={!!inviteMember} member={inviteMember} onClose={() => setInviteMember(null)} />

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Remove ${confirmDelete?.name ?? "member"}?`}
        message="This removes the member and unlinks their account. This cannot be undone."
        confirmLabel="Remove"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) deleteMember(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </section>
  )
}

export function SettingsView() {
  const { clearNotifications, can } = useStore()
  const { user, household, signOut } = useAuth()
  const [confirm, setConfirm] = useState<null | "signout" | "clear" | "reset" | "delete">(null)

  const confirmMeta = {
    signout: {
      title: "Sign out?",
      message: "You will need to sign back in to access your family hub.",
      confirmLabel: "Sign out",
      onConfirm: () => {
        void signOut()
      },
    },
    clear: {
      title: "Clear notifications?",
      message: "All notifications will be permanently removed.",
      confirmLabel: "Clear all",
      onConfirm: () => clearNotifications(),
    },
    reset: {
      title: "Clear hub data?",
      message: "All events, chores, lists and meals will be permanently removed. This cannot be undone.",
      confirmLabel: "Clear data",
      onConfirm: () => {},
    },
    delete: {
      title: "Delete account?",
      message: "This permanently deletes your account and all family data. This cannot be undone.",
      confirmLabel: "Delete account",
      onConfirm: () => {
        void signOut()
      },
    },
  } as const

  const active = confirm ? confirmMeta[confirm] : null

  return (
    <div className="space-y-5 px-4 py-4">
      {/* Device card */}
      <div className="rounded-3xl bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <Tablet className="size-6" />
          </span>
          <div className="flex-1">
            <p className="font-bold leading-tight">Kitchen Hub</p>
            <p className="text-sm text-muted-foreground">{household ? household.name : "15\" Display · Living Room"}</p>
          </div>
          <span className="rounded-full bg-member-green/15 px-2 py-1 text-[11px] font-semibold text-member-green">
            Online
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-secondary py-2">
            <Wifi className="mx-auto size-4 text-member-blue" />
            <p className="mt-1 text-xs font-medium">Strong</p>
          </div>
          <div className="rounded-2xl bg-secondary py-2">
            <Battery className="mx-auto size-4 text-member-green" />
            <p className="mt-1 text-xs font-medium">92%</p>
          </div>
          <div className="rounded-2xl bg-secondary py-2">
            <RefreshCw className="mx-auto size-4 text-primary" />
            <p className="mt-1 text-xs font-medium">2m ago</p>
          </div>
        </div>
      </div>

      {/* Account */}
      <section>
        <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Account</h2>
        <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card shadow-sm">
          <ActionRow
            icon={User}
            label="Profile"
            description={user ? `${user.name} · ${user.email}` : "Not signed in"}
          />
          <ActionRow icon={CreditCard} label="Subscription" description="Lumora Plus · Renews Jul 1" />
          <ActionRow icon={Lock} label="Privacy & Security" />
          <ActionRow icon={HelpCircle} label="Help & Support" />
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Appearance</h2>
        <AppearanceControl />
      </section>

      {/* Push notifications */}
      <PushNotificationsSection />

      {/* Hub actions */}
      <HubActionsSection />

      {/* Family members */}
      <FamilyMembersSection />

      {/* Preferences */}
      <section>
        <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">Preferences</h2>
        <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card shadow-sm">
          <Toggle label="In-app alerts" description="Show banners inside the hub" icon={Bell} defaultOn />
          <Toggle label="Sound effects" description="Play a chime on updates" icon={Volume2} />
          <Toggle label="Auto-sync calendar" description="Keep events up to date" icon={RefreshCw} defaultOn />
          <Toggle label="Event reminders" description="Notify before events start" icon={CalendarClock} defaultOn />
          <Toggle label="Screen saver dimming" description="Dim the display at night" icon={Moon} />
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="px-1 pb-2 text-sm font-semibold text-destructive">Danger Zone</h2>
        <div className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card shadow-sm">
          <ActionRow icon={Bell} label="Clear notifications" onClick={() => setConfirm("clear")} />
          {can("hub") ? (
            <ActionRow icon={RefreshCw} label="Reset hub data" onClick={() => setConfirm("reset")} destructive />
          ) : null}
          <ActionRow icon={LogOut} label="Sign out" onClick={() => setConfirm("signout")} destructive />
          {can("hub") ? (
            <ActionRow icon={Trash2} label="Delete account" onClick={() => setConfirm("delete")} destructive />
          ) : null}
        </div>
      </section>

      <p className="pb-2 text-center text-xs text-muted-foreground">SkyNest Hub · v1.0.0</p>

      <ConfirmDialog
        open={!!active}
        title={active?.title ?? ""}
        message={active?.message ?? ""}
        confirmLabel={active?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          active?.onConfirm()
          setConfirm(null)
        }}
      />
    </div>
  )
}
