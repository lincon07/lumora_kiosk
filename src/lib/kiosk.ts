/**
 * Kiosk mode configuration
 *
 * When running as a kiosk/hub, the app can be configured to:
 * - Skip the login screen and auto-sign in with stored admin credentials
 * - Prevent sign-out functionality
 * - Hide admin-level controls
 */

export const kioskConfig = {
  // Enable kiosk mode (enables status tracking, disables sign-out, hides auth screen if credentials stored)
  enabled: import.meta.env.REACT_APP_KIOSK_MODE === "true" || false,

  // Pre-stored admin email for auto-login (set via environment variable)
  adminEmail: import.meta.env.REACT_APP_KIOSK_ADMIN_EMAIL || null,

  // Pre-stored admin password for auto-login (set via environment variable)
  adminPassword: import.meta.env.REACT_APP_KIOSK_ADMIN_PASSWORD || null,

  // Whether to auto-sign in on startup (requires both email and password)
  autoSignIn: !!(import.meta.env.REACT_APP_KIOSK_AUTO_SIGNIN === "true" && import.meta.env.REACT_APP_KIOSK_ADMIN_EMAIL && import.meta.env.REACT_APP_KIOSK_ADMIN_PASSWORD),

  // Whether to hide the sign-out button
  hideSignOut: import.meta.env.REACT_APP_KIOSK_HIDE_SIGNOUT !== "false",
}
