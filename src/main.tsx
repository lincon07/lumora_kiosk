import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { UpdateDialog } from "./components/ui/reusables/update-dialog";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      {/* Global Sonner toaster — receives toast() calls from anywhere in the app */}
      <Toaster position="bottom-right" richColors closeButton />
      {/* Global update dialog — auto-opens when checkForUpdates() finds a new version */}
      <UpdateDialog />
    </ThemeProvider>
  </React.StrictMode>,
);
