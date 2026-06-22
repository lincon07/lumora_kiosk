"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { cn } from "@/lib/utils"

export function QrCode({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url)
      })
      .catch(() => {
        if (active) setDataUrl(null)
      })
    return () => {
      active = false
    }
  }, [value, size])

  return (
    <div
      className={cn("flex items-center justify-center rounded-2xl bg-white p-3 shadow-sm", className)}
      style={{ width: size + 24, height: size + 24 }}
    >
      {dataUrl ? (
        <img src={dataUrl || "/placeholder.svg"} alt="Invite QR code" width={size} height={size} />
      ) : (
        <div className="size-full animate-pulse rounded-lg bg-secondary" />
      )}
    </div>
  )
}
