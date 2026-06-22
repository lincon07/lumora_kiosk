# Lumora Kiosk Setup Guide

This app has been refactored from the iOS mobile app to work as a desktop kiosk application. This guide covers the key changes and how to configure it for kiosk deployment.

## What Changed

### UI/Layout
- **Navigation**: Changed from bottom tab navigation to left-side vertical navigation bar
- **Layout**: Full-width desktop layout optimized for larger screens (6xl max-width content area)
- **Screen**: No iOS safe-area padding, proper desktop responsiveness

### iOS-Specific Features Removed
- iOS blur effects (`ios-blur` class)
- Safe-area insets (`pt-safe`, `pb-safe`)
- iOS haptic feedback (Tauri vibrations)
- Active scale animations (`active:scale-95`)

### Authentication
- Supports pre-configured admin auto-signin via environment variables
- Sign-out button can be hidden in kiosk mode for persistent login
- Maintains the same session-based authentication system

## Kiosk Configuration

The kiosk is configured via environment variables in `.env` or `.env.local`:

### Environment Variables

```env
# Enable kiosk mode (default: false)
REACT_APP_KIOSK_MODE=true

# Admin credentials for auto-signin (required for autoSignIn)
REACT_APP_KIOSK_ADMIN_EMAIL=owner@example.com
REACT_APP_KIOSK_ADMIN_PASSWORD=password123

# Auto-signin on startup (requires both email and password set)
REACT_APP_KIOSK_AUTO_SIGNIN=true

# Hide the sign-out button (default: true, set to false to show it)
REACT_APP_KIOSK_HIDE_SIGNOUT=true
```

### Configuration Priority

1. **Best Practice**: Use `REACT_APP_KIOSK_AUTO_SIGNIN=true` with stored admin credentials
   - This allows the kiosk to automatically sign in the admin account on startup
   - The sign-out button is hidden by default in kiosk mode

2. **Alternative**: Use `REACT_APP_KIOSK_HIDE_SIGNOUT=true` without auto-signin
   - Users still see the login screen but cannot sign out once logged in
   - Useful if you want flexibility in who signs in

### Security Notes

- **Environment Variables**: Store credentials securely - use your deployment platform's secret management (Vercel Secrets, AWS Secrets Manager, etc.)
- **Pre-configured Accounts**: The admin account should be dedicated to the kiosk with appropriate permissions
- **Physical Security**: The kiosk should be in a secure location - anyone with access can see the account
- **Never Hardcode**: Don't commit credentials to version control

## Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Set the environment variables in your Vercel project settings:
   - Go to Settings > Environment Variables
   - Add all `REACT_APP_*` variables needed for kiosk mode

3. Deploy as normal - the kiosk will use these environment variables on production

### Local Development

1. Create `.env.local` in the project root:
```env
REACT_APP_KIOSK_MODE=true
REACT_APP_KIOSK_ADMIN_EMAIL=test@example.com
REACT_APP_KIOSK_ADMIN_PASSWORD=testpass
REACT_APP_KIOSK_AUTO_SIGNIN=true
```

2. Run the dev server:
```bash
npm run dev
```

## Features

- ✅ Side navigation optimized for kiosk/desktop
- ✅ Full-screen content area
- ✅ Admin-only authentication support
- ✅ Optional sign-out button hiding
- ✅ Auto-signin capability
- ✅ All original family hub features (Calendar, Chores, Lists, Meals, Photos, Settings)

## Reverting iOS Features

If you need to restore any iOS-specific features:
- The `ios-blur`, `pt-safe`, and `pb-safe` utilities are still defined in `src/App.css` but removed from components
- Haptic feedback code was removed from `src/lib/celebration.ts` - if needed, you'd need to re-add the Tauri haptics plugin
- The bottom navigation component still exists in `src/components/ui/reusables/bottom-nav.tsx` for reference

## Next Steps

1. Configure your admin account credentials securely
2. Set environment variables in your deployment platform
3. Test the kiosk mode locally before production deployment
4. Deploy to Vercel with appropriate environment variable secrets
