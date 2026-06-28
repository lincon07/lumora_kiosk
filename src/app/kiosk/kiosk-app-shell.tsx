"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { SideNav } from "@/components/ui/reusables/side-nav"
import { HeaderNav } from "@/components/ui/reusables/header-nav"
import { MemberChips } from "@/components/ui/reusables/member-chips"
import { CalendarView } from "@/app/calendar/calender"
import { ChoresView } from "@/app/chores/chores"
import { ListsView } from "@/app/lists/lists"
import { MealsView } from "@/app/meals/meals"
import { PhotosView } from "@/app/photos/photos"
import { SettingsView } from "@/app/settings/settings"
import { useStore, type TabKey } from "@/lib/store"
import { SystemStatusBar } from "@/components/ui/reusables/system-status-bar"
import { liveSocket } from "@/lib/local-api"
import { restartHub, reloadDisplay, clearCache, addLog } from "@/lib/hub"
import { setOrientation } from "@/lib/locale-service"

const todaySubtitle = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
})

const headers: Record<TabKey, { title: string; subtitle?: string; showMembers: boolean }> = {
  calendar: { title: "Calendar", subtitle: todaySubtitle, showMembers: true },
  chores: { title: "Chores", subtitle: "Keep the streak going", showMembers: true },
  lists: { title: "Lists", subtitle: "Shared with the family", showMembers: false },
  meals: { title: "Meals", subtitle: "Dinner plan for the week", showMembers: false },
  photos: { title: "Photos", subtitle: "Family moments on your hub", showMembers: false },
  settings: { title: "Settings", subtitle: "Hub & connection", showMembers: false },
}

/**
 * Paired-kiosk shell. Same family views as the mobile app, but data is
 * read-only (sourced via the kiosk RPC) and the Settings tab is the kiosk's own
 * device/connection panel instead of the account settings.
 */
export function KioskAppShell() {
  const { tab, setTab, loading } = useStore()
  const head = headers[tab]

  useEffect(() => {
    return liveSocket.subscribeHubCommand((cmd) => {
      switch (cmd.type) {
        case "restart":
          void restartHub()
          break
        case "reload":
          reloadDisplay()
          break
        case "clear_cache":
          void clearCache()
          break
        case "set_orientation":
          void setOrientation(cmd.orientation)
            .then((ok) => {
              if (!ok) addLog("warning", "system", "Remote orientation change failed")
            })
          break
      }
    })
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* System status bar — WiFi, date, clock — always visible at top */}
      <SystemStatusBar />

      {/* flex-1 + overflow-hidden so this row fills remaining height exactly */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — fixed height, no scroll */}
        <SideNav active={tab} onChange={setTab} />

        {/* Right panel: header + optional chips + scrollable content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <HeaderNav title={head.title} subtitle={head.subtitle} />
          {head.showMembers ? <MemberChips /> : null}

          {/* Only this element scrolls — overflow-y-auto, never x */}
          <main className={`overflow-x-hidden ${tab === "calendar" ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto"}`}>
            {loading && tab !== "settings" ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : tab === "calendar" ? (
              <CalendarView />
            ) : (
              <div className="mx-auto max-w-6xl px-4 py-4">
                {tab === "chores" && <ChoresView />}
                {tab === "lists" && <ListsView />}
                {tab === "meals" && <MealsView />}
                {tab === "photos" && <PhotosView />}
                {tab === "settings" && <SettingsView />}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
