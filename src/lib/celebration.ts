import confetti from "canvas-confetti"

export async function celebrateCompletion(intensity: "light" | "medium" | "strong" = "medium") {
  // Confetti animation only
  const config = {
    light: { particleCount: 30, spread: 45, origin: { y: 0.6 } },
    medium: { particleCount: 80, spread: 60, origin: { y: 0.6 } },
    strong: { particleCount: 150, spread: 75, origin: { y: 0.5 } },
  }
  confetti(config[intensity])
}
