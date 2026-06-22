"use client"

import { Calendar, CircleCheck, ListChecks, UtensilsCrossed, Image, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TabKey } from "@/lib/store"

const tabs: { key: TabKey; label: string; icon: typeof Calendar }[] = [
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "chores", label: "Chores", icon: CircleCheck },
  { key: "lists", label: "Lists", icon: ListChecks },
  { key: "meals", label: "Meals", icon: UtensilsCrossed },
  { key: "photos", label: "Photos", icon: Image },
  { key: "settings", label: "Settings", icon: Settings },
]

export function SideNav({
  active,
  onChange,
}: {
  active: TabKey
  onChange: (tab: TabKey) => void
}) {
  return (
    <nav
      aria-label="Primary"
      className="sticky left-0 top-0 h-dvh w-24 border-r border-border/60 bg-card flex flex-col items-center justify-start py-8 gap-4 md:w-32"
    >
      <ul className="flex flex-col items-center gap-4 w-full px-2">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <li key={key} className="w-full">
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={isActive ? "page" : undefined}
                title={label}
                className={cn(
                  "flex flex-col items-center gap-2 w-full py-4 px-3 rounded-2xl transition-colors",
                  isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="size-8 md:size-10" strokeWidth={isActive ? 2.4 : 2} />
                <span className="text-[9px] md:text-xs font-medium text-center leading-tight">
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
