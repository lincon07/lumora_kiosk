"use client"

import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { MemberAvatar } from "./member-avatar"

export function MemberChips() {
  const { members, activeMember, setActiveMember } = useStore()

  return (
    <div className="ios-blur sticky top-0 z-20 border-b border-border/60 bg-background/80">
      <div className="no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-2.5">
        <button
          type="button"
          onClick={() => setActiveMember(null)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            activeMember === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-accent",
          )}
        >
          Everyone
        </button>
        {members
          .filter((m) => m.id !== "family")
          .map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveMember(m.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-all",
                activeMember === m.id
                  ? "bg-foreground text-background"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              <MemberAvatar member={m} size="sm" />
              {m.name}
            </button>
          ))}
      </div>
    </div>
  )
}
