// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use std::process::Command;
use serde::{Deserialize, Serialize};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// A WiFi network as surfaced to the Lumora setup UI.
///
/// Produced by parsing `nmcli` output on Linux (NetworkManager).
/// The shape MUST stay in sync with `WifiNetwork` in `src/lib/wifi-service.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WifiNetwork {
    ssid: String,
    /// Signal strength as a percentage (0-100).
    signal: u8,
    /// One of: "open" | "wpa" | "wep".
    security: String,
    /// Whether the kiosk is currently connected to this network.
    connected: bool,
}

// ─── nmcli helpers ────────────────────────────────────────────────────────────

/// Parse a single terse nmcli line (`:` separated, backslash-escaped).
///
/// Fields: SSID, SIGNAL, SECURITY, IN-USE
fn parse_nmcli_wifi_line(line: &str) -> Option<WifiNetwork> {
    // nmcli -t escapes literal colons as `\:`. Split on unescaped colons only.
    let mut fields: Vec<String> = Vec::with_capacity(4);
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            // consume the next char as a literal
            if let Some(next) = chars.next() {
                current.push(next);
            }
        } else if c == ':' {
            fields.push(current.clone());
            current.clear();
        } else {
            current.push(c);
        }
    }
    fields.push(current);

    if fields.len() < 4 {
        return None;
    }

    let ssid = fields[0].trim().to_string();
    if ssid.is_empty() {
        return None; // hidden/empty SSID — skip
    }

    let signal: u8 = fields[1].trim().parse().unwrap_or(0);

    let sec_raw = fields[2].trim().to_uppercase();
    let security = if sec_raw == "--" || sec_raw.is_empty() {
        "open"
    } else if sec_raw.contains("WEP") {
        "wep"
    } else {
        "wpa" // WPA1, WPA2, WPA3, OWE, etc.
    }
    .to_string();

    // IN-USE is "*" when connected, empty otherwise.
    let connected = fields[3].trim() == "*";

    Some(WifiNetwork { ssid, signal, security, connected })
}

// ─── WiFi commands ────────────────────────────────────────────────────────────

/// Scan for nearby WiFi networks using NetworkManager's `nmcli`.
///
/// Triggers a fresh rescan (`--rescan yes`) before listing, deduplicates by
/// SSID (nmcli can list the same network multiple times on different BSSIDs),
/// and returns networks sorted strongest-first.
///
/// All Command::new calls are wrapped in spawn_blocking so they never block
/// the Tokio executor thread. Returns an empty list when nmcli is unavailable
/// (e.g. during development outside the kiosk), causing the frontend to fall
/// back to its mock list.
#[tauri::command]
async fn wifi_scan() -> Result<Vec<WifiNetwork>, String> {
    let output = tokio::task::spawn_blocking(|| {
        Command::new("nmcli")
            .args([
                "--terse",
                "--fields", "SSID,SIGNAL,SECURITY,IN-USE",
                "dev", "wifi", "list",
                "--rescan", "yes",
            ])
            .output()
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let output = match output {
        Ok(o) => o,
        Err(_) => {
            // nmcli not available (e.g. macOS dev machine) — return mock networks
            // so the wizard flow is exercisable without a real kiosk device.
            return Ok(dev_mock_networks());
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut networks: Vec<WifiNetwork> = stdout
        .lines()
        .filter_map(parse_nmcli_wifi_line)
        .filter(|n| seen.insert(n.ssid.clone())) // deduplicate by SSID
        .collect();

    // Strongest signal first.
    networks.sort_by(|a, b| b.signal.cmp(&a.signal));

    Ok(networks)
}

/// Mock network list returned when nmcli is unavailable (dev / macOS).
/// Mirrors the mock data in `src/lib/wifi-service.ts` so the wizard is
/// fully exercisable without a real kiosk device.
fn dev_mock_networks() -> Vec<WifiNetwork> {
    vec![
        WifiNetwork { ssid: "Lumora Home".into(),     signal: 92, security: "wpa".into(), connected: false },
        WifiNetwork { ssid: "Living Room 5G".into(),  signal: 78, security: "wpa".into(), connected: false },
        WifiNetwork { ssid: "Pek Family".into(),      signal: 64, security: "wpa".into(), connected: false },
        WifiNetwork { ssid: "Guest Network".into(),   signal: 51, security: "open".into(), connected: false },
        WifiNetwork { ssid: "Neighbor_2.4".into(),    signal: 28, security: "wep".into(), connected: false },
    ]
}

/// Connect to a WiFi network via `nmcli dev wifi connect`.
///
/// For open networks omit the `password` argument entirely.
/// Returns `true` on success, or a human-readable error string on failure.
///
/// The blocking nmcli call is run in spawn_blocking so it doesn't stall the
/// Tokio runtime — nmcli can take several seconds to complete a handshake.
#[tauri::command]
async fn wifi_connect(ssid: String, password: Option<String>) -> Result<bool, String> {
    // Clone into owned Strings so they can be moved into the blocking closure.
    let ssid_owned = ssid.clone();
    let password_owned = password.clone();

    let output = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("nmcli");
        cmd.args(["dev", "wifi", "connect", &ssid_owned]);

        if let Some(ref pwd) = password_owned {
            cmd.args(["password", pwd]);
        }

        // Capture both stdout and stderr for error diagnosis.
        cmd.output()
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    // nmcli not available (dev / macOS) — simulate success.
    let output = match output {
        Ok(o) => o,
        Err(_) => return Ok(true),
    };

    if output.status.success() {
        // Verify the connection actually came up by checking device status.
        // nmcli exits 0 even when the connection profile was created but the
        // device failed to associate (e.g. wrong password on first attempt).
        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();

        // nmcli prints "Error:" on stderr even when exit code is 0 for some
        // NetworkManager versions (notably on Ubuntu 22.04).
        if stderr.contains("error") || stderr.contains("secrets were required") {
            let msg = String::from_utf8_lossy(&output.stderr);
            return Err(humanise_nmcli_error(msg.trim()));
        }

        // Successful output contains "successfully activated" or the device name.
        if stdout.contains("successfully activated") || stdout.contains("device") {
            return Ok(true);
        }

        // For open networks nmcli may just exit 0 with no specific message.
        if password.is_none() {
            return Ok(true);
        }

        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let combined = format!("{} {}", stderr.trim(), stdout.trim());
        Err(humanise_nmcli_error(&combined))
    }
}

/// Translate raw nmcli error text into a short, user-facing message.
fn humanise_nmcli_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("secrets were required") || lower.contains("no secrets") || lower.contains("wrong password") {
        return "Incorrect password — please try again.".to_string();
    }
    if lower.contains("timeout") || lower.contains("timed out") {
        return "Connection timed out. Move closer to the router and try again.".to_string();
    }
    if lower.contains("not found") || lower.contains("no network") {
        return "Network not found. Rescan and try again.".to_string();
    }
    if lower.contains("already connected") {
        return "Already connected to this network.".to_string();
    }
    // Fall back to the raw message, but strip any leading "Error:" prefix.
    let clean = raw
        .trim()
        .trim_start_matches("Error:")
        .trim_start_matches("error:")
        .trim();
    if clean.is_empty() {
        "Could not connect. Check the password and try again.".to_string()
    } else {
        clean.to_string()
    }
}

/// Return the SSID of the currently active WiFi connection, if any.
///
/// Reads the active device list from `nmcli` and returns the connection name
/// for any device of type `wifi` that is in the `connected` state.
#[tauri::command]
async fn wifi_status() -> Result<Option<String>, String> {
    let output = tokio::task::spawn_blocking(|| {
        Command::new("nmcli")
            .args([
                "--terse",
                "--fields", "DEVICE,TYPE,STATE,CONNECTION",
                "dev", "status",
            ])
            .output()
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let output = match output {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Lines are: DEVICE:TYPE:STATE:CONNECTION
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(4, ':').collect();
        if parts.len() < 4 {
            continue;
        }
        if parts[1] == "wifi" && parts[2] == "connected" {
            let conn = parts[3].trim().to_string();
            if !conn.is_empty() {
                return Ok(Some(conn));
            }
        }
    }

    Ok(None)
}

// ─── Locale ───────────────────────────────────────────────────────────────────

/// Result returned to the frontend by `locale_get`.
#[derive(Debug, Serialize, Deserialize)]
struct LocaleResult {
    /// Normalised BCP-47-style code, e.g. "en_US.UTF-8".
    lang: String,
    /// Raw value exactly as reported by the system.
    raw: String,
}

/// Read the current system locale via `localectl status`.
///
/// Parses the `System Locale: LANG=…` line.  Falls back to reading the LANG
/// environment variable, and finally to "en_US.UTF-8" if neither is set.
/// All syscalls run in spawn_blocking.
#[tauri::command]
async fn locale_get() -> Result<LocaleResult, String> {
    let output = tokio::task::spawn_blocking(|| {
        Command::new("localectl").arg("status").output()
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    // If localectl is not available (e.g. non-systemd Linux), fall back to LANG env.
    let lang = match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            // Look for "   System Locale: LANG=en_US.UTF-8"
            stdout
                .lines()
                .find_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.starts_with("System Locale:") {
                        trimmed
                            .split_once('=')
                            .map(|(_, v)| v.split_whitespace().next().unwrap_or(v).to_string())
                    } else {
                        None
                    }
                })
                .or_else(|| std::env::var("LANG").ok())
                .unwrap_or_else(|| "en_US.UTF-8".to_string())
        }
        _ => std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".to_string()),
    };

    Ok(LocaleResult {
        lang: lang.clone(),
        raw: lang,
    })
}

/// Set the system locale.
///
/// Strategy (tried in order until one succeeds):
///   1. `localectl set-locale LANG=<posix>` — works when the kiosk process runs
///      as root or the system has a permissive polkit rule for localectl.
///   2. `sudo localectl set-locale LANG=<posix>` — works when the kiosk user
///      is in sudoers with NOPASSWD for localectl (common on Raspberry Pi OS /
///      Ubuntu kiosk builds).
///   3. Direct write to /etc/locale.conf — last resort; survives a reboot.
///
/// All blocking calls are wrapped in spawn_blocking.
#[tauri::command]
async fn locale_set(lang: String) -> Result<bool, String> {
    let lang_owned = lang.clone();

    let result = tokio::task::spawn_blocking(move || {
        let locale_arg = format!("LANG={lang_owned}");

        // Attempt 1: plain localectl (succeeds when running as root or with
        // a permissive polkit rule).
        let r1 = Command::new("localectl")
            .args(["set-locale", &locale_arg])
            .status();

        if let Ok(s) = r1 {
            if s.success() {
                return Ok(true);
            }
        }

        // Attempt 2: sudo localectl (NOPASSWD entry in /etc/sudoers).
        let r2 = Command::new("sudo")
            .args(["localectl", "set-locale", &locale_arg])
            .status();

        if let Ok(s) = r2 {
            if s.success() {
                return Ok(true);
            }
        }

        // Attempt 3: write directly to /etc/locale.conf (survives reboots;
        // some minimal distros / containers don't have localectl at all).
        let content = format!("{}\n", locale_arg);
        match std::fs::write("/etc/locale.conf", content.as_bytes()) {
            Ok(_) => Ok(true),
            Err(e) => Err(format!(
                "Could not set locale via localectl or /etc/locale.conf: {e}"
            )),
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    result
}

// ─── Timezone ─────────────────────────────────────────────────────────────────

/// Result returned to the frontend by `timezone_get`.
#[derive(Debug, Serialize, Deserialize)]
struct TimezoneResult {
    /// IANA timezone identifier, e.g. "America/New_York".
    timezone: String,
    /// UTC offset string, e.g. "UTC-05:00".
    utc_offset: String,
}

/// Read the current system timezone via `timedatectl show`.
///
/// Falls back to reading /etc/timezone or the TZ env var if timedatectl is
/// not available. All blocking calls run in spawn_blocking.
#[tauri::command]
async fn timezone_get() -> Result<TimezoneResult, String> {
    let output = tokio::task::spawn_blocking(|| {
        Command::new("timedatectl").arg("show").output()
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let timezone = match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout
                .lines()
                .find_map(|line| line.trim().strip_prefix("Timezone=").map(|v| v.to_string()))
                // Fall back to /etc/timezone (Debian/Ubuntu without systemd-timesyncd)
                .or_else(|| {
                    std::fs::read_to_string("/etc/timezone")
                        .ok()
                        .map(|s| s.trim().to_string())
                })
                .or_else(|| std::env::var("TZ").ok())
                .unwrap_or_else(|| "America/New_York".to_string())
        }
        _ => std::fs::read_to_string("/etc/timezone")
            .ok()
            .map(|s| s.trim().to_string())
            .or_else(|| std::env::var("TZ").ok())
            .unwrap_or_else(|| "America/New_York".to_string()),
    };

    let utc_offset = get_utc_offset_string(&timezone);

    Ok(TimezoneResult {
        timezone,
        utc_offset,
    })
}

/// Set the system timezone.
///
/// Strategy (tried in order):
///   1. `timedatectl set-timezone <tz>` — takes effect immediately.
///   2. `sudo timedatectl set-timezone <tz>` — for NOPASSWD sudoers setups.
///   3. Write the IANA identifier to /etc/timezone (survives reboots; minimal
///      distros / containers that lack systemd may rely on this alone).
///
/// All blocking calls run in spawn_blocking.
#[tauri::command]
async fn timezone_set(timezone: String) -> Result<bool, String> {
    let tz_owned = timezone.clone();

    let result = tokio::task::spawn_blocking(move || {
        // Attempt 1: plain timedatectl.
        let r1 = Command::new("timedatectl")
            .args(["set-timezone", &tz_owned])
            .status();

        if let Ok(s) = r1 {
            if s.success() {
                // Also write /etc/timezone so it survives without systemd-timesyncd.
                let _ = std::fs::write("/etc/timezone", format!("{}\n", &tz_owned));
                return Ok(true);
            }
        }

        // Attempt 2: sudo timedatectl.
        let r2 = Command::new("sudo")
            .args(["timedatectl", "set-timezone", &tz_owned])
            .status();

        if let Ok(s) = r2 {
            if s.success() {
                let _ = std::fs::write("/etc/timezone", format!("{}\n", &tz_owned));
                return Ok(true);
            }
        }

        // Attempt 3: direct write.
        match std::fs::write("/etc/timezone", format!("{}\n", &tz_owned)) {
            Ok(_) => Ok(true),
            Err(e) => Err(format!(
                "Could not set timezone via timedatectl or /etc/timezone: {e}"
            )),
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    result
}

/// Derive a rough "UTC±HH:MM" string by reading /etc/localtime symlink target
/// for display in the UI.  Falls back to "UTC" on any error.
// ─── Factory Reset ────────────────────────────────────────────────────────────

/// Wipe all persistent kiosk data and terminate the process.
///
/// What this does:
///   1. Deletes every file inside the Tauri app data / config directory so
///      the next launch starts the setup wizard fresh.
///   2. Calls `std::process::exit(0)` — the OS will restart the kiosk process
///      via the configured systemd/autostart service, which will then show the
///      first-run wizard because the data directory is empty.
///
/// **This is irreversible.** The frontend must enforce a two-step confirmation
/// before invoking this command.
#[tauri::command]
async fn factory_reset(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    // Collect paths to wipe.
    let mut dirs_to_clear: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(p) = app.path().app_data_dir() {
        dirs_to_clear.push(p);
    }
    if let Ok(p) = app.path().app_config_dir() {
        dirs_to_clear.push(p);
    }
    if let Ok(p) = app.path().app_cache_dir() {
        dirs_to_clear.push(p);
    }
    if let Ok(p) = app.path().app_log_dir() {
        dirs_to_clear.push(p);
    }

    // Remove everything inside each directory (not the directory itself so
    // the app can recreate it on next launch without permission issues).
    for dir in &dirs_to_clear {
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let _ = std::fs::remove_dir_all(&path);
                    } else {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }

    // Give the filesystem a moment to flush, then hard-exit.
    std::thread::sleep(std::time::Duration::from_millis(200));
    std::process::exit(0);
}

/// Set the physical screen rotation via xrandr.
///
/// Detects the first connected display output at runtime so this works
/// regardless of whether the Pi is connected via HDMI-1, HDMI-2, etc.
/// Rotation must be one of: "normal" | "left" | "right" | "inverted".
#[tauri::command]
async fn screen_orientation_set(rotation: String) -> Result<(), String> {
    let valid = ["normal", "left", "right", "inverted"];
    if !valid.contains(&rotation.as_str()) {
        return Err(format!("Invalid rotation value: {rotation}"));
    }
    tokio::task::spawn_blocking(move || {
        // Detect the first connected output (e.g. "HDMI-1", "DSI-1").
        let probe = Command::new("xrandr").output().unwrap_or_else(|_| {
            std::process::Output {
                status: std::process::ExitStatus::default(),
                stdout: b"HDMI-1 connected".to_vec(),
                stderr: vec![],
            }
        });
        let xrandr_text = String::from_utf8_lossy(&probe.stdout);
        let display = xrandr_text
            .lines()
            .find(|l| l.contains(" connected"))
            .and_then(|l| l.split_whitespace().next())
            .unwrap_or("HDMI-1")
            .to_string();

        let result = Command::new("xrandr")
            .args(["--output", &display, "--rotate", &rotation])
            .output()
            .map_err(|e| format!("xrandr failed: {e}"))?;

        if result.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&result.stderr).trim().to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn get_utc_offset_string(timezone: &str) -> String {
    // Use the `date` command for a reliable, dependency-free offset string.
    let output = Command::new("date")
        .args(["+%z"])
        .env("TZ", timezone)
        .output();

    match output {
        Ok(o) => {
            let raw = String::from_utf8_lossy(&o.stdout).trim().to_string();
            // raw is like "+0530" or "-0500"; convert to "+05:30" / "-05:00".
            if raw.len() == 5 {
                format!("UTC{}{}", &raw[..3], &raw[3..])
            } else {
                format!("UTC{raw}")
            }
        }
        Err(_) => "UTC".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        // Native key-value store used by the kiosk device-state persistence layer.
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            wifi_scan,
            wifi_connect,
            wifi_status,
            locale_get,
            locale_set,
            timezone_get,
            timezone_set,
            screen_orientation_set,
            factory_reset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
