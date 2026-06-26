import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import tailwindcss from "@tailwindcss/vite"

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // Load ALL env vars (no prefix filter) so LUMORA_SERVER_URL can be set
  // without requiring the VITE_ prefix on disk.
  const env = loadEnv(mode, process.cwd(), "")

  // The local Express + Socket.IO server. Defaults to localhost:4000.
  // Override with LUMORA_SERVER_URL (or VITE_LUMORA_SERVER_URL) if you need
  // a non-standard address during development.
  const serverUrl =
    env.VITE_LUMORA_SERVER_URL || env.LUMORA_SERVER_URL || "http://localhost:4000"

  return {
    plugins: [react(), tailwindcss()],

    define: {
      // Exposed to frontend code as import.meta.env.VITE_LUMORA_SERVER_URL
      "import.meta.env.VITE_LUMORA_SERVER_URL": JSON.stringify(serverUrl),
    },

    // Tauri-specific Vite options — only relevant in `tauri dev` / `tauri build`
    clearScreen: false,
    server: {
      port: 1422,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1423,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      // Proxy /api, /socket.io and /photo-files to the Express server so the
      // browser never makes a cross-origin request — eliminates CORS / access-
      // control errors in the dev preview entirely.
      proxy: {
        "/api": {
          target: serverUrl,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: serverUrl,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        "/photo-files": {
          target: serverUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
