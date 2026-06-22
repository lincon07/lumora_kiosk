"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, BellOff, Check, Moon, Search, Sun, X } from "lucide-react"
import { memberSoft } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/theme-provider"
import { useStore } from "@/lib/store"
import { MemberAvatar } from "./member-avatar"
import { SwipeRow } from "./swipe-row"

export function HeaderNav({ title, subtitle }: { title: string; subtitle?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const {
    search,
    navigateToResult,
    notifications,
    unreadCount,
    toggleNotificationRead,
    deleteNotification,
    markAllNotificationsRead,
    getMember,
  } = useStore()

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [notifOpen, setNotifOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const unread = unreadCount
  const results = search(query)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  const closeSearch = () => {
    setQuery("")
    setSearchOpen(false)
  }

  return (
    <header className="ios-blur sticky top-0 z-30 border-b border-border/60 bg-card/70 pt-safe">
      <div className="mx-auto max-w-2xl px-4 pt-3 pb-2">
        {/* Inline title + actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-balance">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search"
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-colors active:scale-95",
                searchOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Search className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
            >
              {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full transition-colors active:scale-95",
                  notifOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Bell className="size-5" />
                {unread > 0 ? (
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-member-coral ring-2 ring-card" />
                ) : null}
              </button>

              {notifOpen ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-11 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                      <p className="text-sm font-bold">Notifications</p>
                      {unread > 0 ? (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          Mark all read
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-muted-foreground">All caught up</span>
                      )}
                    </div>
                    {notifications.length > 0 ? (
                      <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto overscroll-contain">
                        {notifications.map((n) => {
                          const member = getMember(n.memberId)
                          return (
                            <li key={n.id}>
                              <SwipeRow
                                rounded=""
                                editLabel={n.read ? "Unread" : "Read"}
                                editIcon={n.read ? BellOff : Check}
                                onEdit={() => toggleNotificationRead(n.id)}
                                onDelete={() => deleteNotification(n.id)}
                              >
                                <div className={cn("flex gap-3 bg-card px-4 py-3", !n.read && "bg-secondary")}>
                                  <MemberAvatar member={member} size="sm" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                                        {!n.read ? (
                                          <span className="size-1.5 shrink-0 rounded-full bg-member-coral" aria-hidden />
                                        ) : null}
                                        <span className="truncate">{n.title}</span>
                                      </p>
                                      <span className="shrink-0 text-[11px] text-muted-foreground">{n.time}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{n.body}</p>
                                  </div>
                                </div>
                              </SwipeRow>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                          <BellOff className="size-5" />
                        </span>
                        <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Search panel */}
        {searchOpen ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, chores, lists, meals…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                aria-label="Close search"
                onClick={closeSearch}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {query.trim() ? (
              <div className="mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-border/60 bg-card shadow-sm">
                {results.length > 0 ? (
                  <ul className="divide-y divide-border/60">
                    {results.map((r) => {
                      const member = getMember(r.memberId)
                      return (
                        <li key={r.key}>
                          <button
                            type="button"
                            onClick={() => {
                              navigateToResult(r)
                              closeSearch()
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
                          >
                            <MemberAvatar member={member} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{r.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{r.detail}</p>
                            </div>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", memberSoft[member.color])}>
                              {r.category}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No matches for &ldquo;{query}&rdquo;
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}
