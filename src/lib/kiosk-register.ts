import { supabase } from "./supabase"

export interface KioskRegistration {
  id: string
  household_id: string
  device_name: string
  is_registered: boolean
  claimed_at: string | null
}

/** Check if kiosk is registered and claim it if needed */
export async function registerOrClaimKiosk(householdId: string, deviceName: string = "Kiosk Display"): Promise<KioskRegistration> {
  try {
    console.log("[v0] Checking/registering kiosk:", { householdId, deviceName })

    // Try to find existing kiosk registration
    const { data: existing, error: selectError } = await supabase
      .from("kiosk_devices")
      .select("id, household_id, device_name, created_at")
      .eq("household_id", householdId)
      .eq("device_name", deviceName)
      .single()

    if (existing) {
      console.log("[v0] Kiosk already registered:", existing.id)
      return {
        id: existing.id,
        household_id: householdId,
        device_name: deviceName,
        is_registered: true,
        claimed_at: existing.created_at,
      }
    }

    // If no error and no data, create new registration
    if (!selectError || selectError.code === "PGRST116") {
      console.log("[v0] Creating new kiosk registration...")
      const { data: newKiosk, error: insertError } = await supabase
        .from("kiosk_devices")
        .insert({
          household_id: householdId,
          device_name: deviceName,
          wifi_signal: 0,
          ping_latency_ms: 0,
          is_online: true,
          device_info: JSON.stringify({
            platform: typeof navigator !== "undefined" ? navigator.platform : "Unknown",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent.substring(0, 100) : "Unknown",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        })
        .select("id, household_id, device_name, created_at")
        .single()

      if (insertError) {
        console.error("[v0] Failed to register kiosk:", insertError)
        throw insertError
      }

      if (newKiosk) {
        console.log("[v0] Kiosk registered successfully:", newKiosk.id)
        return {
          id: newKiosk.id,
          household_id: householdId,
          device_name: deviceName,
          is_registered: true,
          claimed_at: newKiosk.created_at,
        }
      }
    }

    throw new Error("Failed to register kiosk: Unknown error")
  } catch (err) {
    console.error("[v0] Kiosk registration error:", err)
    throw err
  }
}

/** Generate a QR code URL for claiming this kiosk from iOS app */
export function generateKioskClaimQRCode(householdId: string, deviceName: string = "Kiosk Display"): string {
  // QR code data format: kiosk://claim/{householdId}/{deviceName}
  const data = `kiosk://claim/${householdId}/${encodeURIComponent(deviceName)}`
  // Use QR code API to generate visual code
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`
}
