# Tauri Android Kiosk - Blank White Screen Troubleshooting

## Quick Diagnosis

If you see a **blank white screen** on Android Tauri, follow these steps:

### Step 1: Check Browser Console

1. **On Android Device**: Press Ctrl+Shift+I or use `adb logcat` to view logs
2. **Look for `[v0]` debug messages** - They should appear immediately on app load
3. **Common messages you should see**:
   - `[v0] Supabase Init: { configured: true, url: "✓ set", key: "✓ set" }`
   - `[v0] Auth Init: { kioskMode: true, autoSignIn: true, hasEmail: true, hasPassword: true }`

### Step 2: Missing Environment Variables

If you see:
```
[v0] Supabase Init: { configured: false, url: "✗ missing", key: "✗ missing" }
```

**FIX**: You're missing Supabase credentials in your `.env.local`:

```bash
# Create .env.local in project root (use VITE_ prefix for Vite):
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Missing Auto-Signin Credentials

If you see:
```
[v0] Auth Init: { kioskMode: true, autoSignIn: true, hasEmail: false, hasPassword: false }
```

**FIX**: Add admin credentials to `.env.local`:

```bash
REACT_APP_KIOSK_MODE=true
REACT_APP_KIOSK_AUTO_SIGNIN=true
REACT_APP_KIOSK_ADMIN_EMAIL=admin@household.com
REACT_APP_KIOSK_ADMIN_PASSWORD=secure-password
```

### Step 4: Auto Sign-In Fails

If you see:
```
[Kiosk] Auto sign-in failed: Error: Incorrect email or password.
```

**Check**:
1. Email is correct and exists in Supabase
2. Password matches
3. User account is activated (not pending)

## Complete .env.local Template

Create `.env.local` in your project root with **ALL of these**:

```bash
# === SUPABASE (REQUIRED) ===
NEXT_PUBLIC_SUPABASE_URL=https://supabase-pink-yacht.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# === KIOSK MODE (REQUIRED FOR AUTO-SIGNIN) ===
REACT_APP_KIOSK_MODE=true
REACT_APP_KIOSK_AUTO_SIGNIN=true
REACT_APP_KIOSK_ADMIN_EMAIL=your-admin-email@example.com
REACT_APP_KIOSK_ADMIN_PASSWORD=your-admin-password

# === OPTIONAL ===
REACT_APP_KIOSK_HIDE_SIGNOUT=true
```

## Running Tauri Android

```bash
# Step 1: Ensure .env.local is set
cat .env.local

# Step 2: Start Tauri dev server
npm run tauri dev

# Step 3: Check logs in Android Studio or adb logcat
adb logcat | grep v0

# Step 4: Open browser DevTools (F12) and watch for [v0] messages
```

## Debug Flow

When app starts, you should see this sequence in console:

```
1. [v0] Supabase Init: { configured: true, url: "✓ set", key: "✓ set" }
2. [v0] Auth Init: { kioskMode: true, autoSignIn: true, hasEmail: true, hasPassword: true }
3. [v0] Attempting auto sign-in...
4. [v0] Auto sign-in successful
5. [Load app content...]
```

If you stop at step 1 or 2, check environment variables.
If you stop at step 3, check Supabase URL/key.
If you stop at step 4 with an error, check credentials.

## Get Supabase Credentials

1. Go to https://app.supabase.com
2. Select your project (supabase-pink-yacht)
3. Click **Project Settings** (bottom left gear icon)
4. Click **API** tab
5. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Remove Debug Logs (After Testing)

Once working, remove the `[v0]` debug console.logs:

```bash
grep -r "console.log.*\[v0\]" src/
```

Then Edit → Remove the lines manually.

## Still Blank?

If still blank after all steps:

1. **Clear Tauri cache**: `rm -rf src-tauri/target && npm run tauri dev`
2. **Rebuild Android**: `npm run tauri android dev`
3. **Check browser console**: F12 → Console tab
4. **Look for ANY red errors**, not just `[v0]` messages
5. **Run in Android Studio** for proper logcat: `Android Studio → Logcat → Filter: "v0"`

## Common Errors

| Error | Fix |
|-------|-----|
| `Cannot read property 'VITE_SUPABASE_URL' of undefined` | Missing NEXT_PUBLIC_SUPABASE_URL in .env.local |
| `Invalid login credentials` | Wrong email/password in REACT_APP_KIOSK_ADMIN_* |
| `Incorrect email or password` | Email doesn't exist or password is wrong |
| `CORS error` | Supabase URL is wrong or connection issue |
| `ERR_NAME_NOT_RESOLVED` | Network connectivity issue on device |

## Next Steps

- After fixing, remove the debug console.log statements
- Deploy to Vercel/build production with proper environment variables set
- Test with actual household data
