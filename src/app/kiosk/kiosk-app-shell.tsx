"use client"

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

  return (
    <div className="flex min-h-dvh bg-background">
      <SideNav active={tab} onChange={setTab} />

      <div className="flex flex-1 flex-col">
        <HeaderNav title={head.title} subtitle={head.subtitle} />
        {head.showMembers ? <MemberChips /> : null}

        <main className="flex-1 overflow-auto">
          {loading && tab !== "settings" ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mx-auto max-w-6xl px-4 py-4">
              {tab === "calendar" && <CalendarView />}
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
  )
}
