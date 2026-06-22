import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path"
import tailwindcss from "@tailwindcss/vite"


const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // Vite automatically exposes env vars with VITE_ prefix to client code
  // via import.meta.env.VITE_*. Users should set VITE_SUPABASE_URL and
  // VITE_SUPABASE_ANON_KEY in their .env files.
  const env = loadEnv(mode, process.cwd(), "VITE_")

  return {
  plugins: [react(), tailwindcss()],

  define: {},

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },


  },

   resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  }
});
