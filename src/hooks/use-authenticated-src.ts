import { useEffect, useState } from "react"
import { tokenStore, LOCAL_API_BASE } from "@/lib/local-api"

/**
 * Resolves a `/photo-files/…` path (or any server-relative path) into a
 * blob: URL by fetching it with the current auth token.
 *
 * - Returns `null` while loading so callers can show a placeholder.
 * - Revokes the blob URL when the component unmounts or the src changes.
 * - Falls back gracefully: if the src is already an http(s) URL it is returned
 *   as-is without an extra fetch (those URLs are already public or presigned).
 */
export function useAuthenticatedSrc(src: string | undefined | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!src) {
      setBlobUrl(null)
      return
    }

    // Absolute http(s) URLs are served publicly — no token needed.
    if (src.startsWith("http://") || src.startsWith("https://")) {
      setBlobUrl(src)
      return
    }

    let revoked = false
    let objectUrl: string | null = null

    const fullUrl = `${LOCAL_API_BASE}${src.startsWith("/") ? "" : "/"}${src}`
    const token = tokenStore.get()

    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // Avoid caching issues: each call is treated as a fresh credential check.
      cache: "force-cache",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Photo fetch failed: ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        if (revoked) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(() => {
        if (!revoked) setBlobUrl(null)
      })

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setBlobUrl(null)
    }
  }, [src])

  return blobUrl
}
