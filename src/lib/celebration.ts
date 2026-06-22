import confetti from "canvas-confetti"

// Haptics fallback if Tauri is not available
let haptics: typeof import("@tauri-apps/plugin-haptics") | null = null

try {
  // Try to import Tauri haptics (will fail in web-only builds)
  const loadHaptics = async () => {
    try {
      haptics = await import("@tauri-apps/plugin-haptics")
    } catch {
      // Tauri not available, skip haptics
    }
  }
  loadHaptics()
} catch {
  // Build target doesn't support Tauri
}

export async function celebrateCompletion(intensity: "light" | "medium" | "strong" = "medium") {
  // Confetti animation
  const config = {
    light: { particleCount: 30, spread: 45, origin: { y: 0.6 } },
    medium: { particleCount: 80, spread: 60, origin: { y: 0.6 } },
    strong: { particleCount: 150, spread: 75, origin: { y: 0.5 } },
  }
  confetti(config[intensity])

  // Haptic feedback (Tauri only)
  if (haptics && haptics.vibrate) {
    try {
      const durations = {
        light: 30,
        medium: 50,
        strong: 100,
      }
      await haptics.vibrate(durations[intensity])
    } catch {
      // Haptics failed, continue anyway
    }
  }
}
