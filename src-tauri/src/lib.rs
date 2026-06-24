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
/// Returns an empty list when `nmcli` is unavailable (e.g. during development
/// outside the kiosk), which causes the frontend to fall back to its mock list.
#[tauri::command]
async fn wifi_scan() -> Result<Vec<WifiNetwork>, String> {
    let output = Command::new("nmcli")
        .args([
            "--terse",
            "--fields", "SSID,SIGNAL,SECURITY,IN-USE",
            "dev", "wifi", "list",
            "--rescan", "yes",
        ])
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => {
            // nmcli not available — return empty so the frontend uses its mock.
            return Ok(Vec::new());
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

/// Connect to a WiFi network via `nmcli dev wifi connect`.
///
/// For open networks omit the `password` argument entirely.
/// Returns `true` on success, or an error string on failure.
#[tauri::command]
async fn wifi_connect(ssid: String, password: Option<String>) -> Result<bool, String> {
    let mut cmd = Command::new("nmcli");
    cmd.arg("dev").arg("wifi").arg("connect").arg(&ssid);

    if let Some(ref pwd) = password {
        cmd.arg("password").arg(pwd);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to invoke nmcli: {e}"))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "Could not connect to \"{ssid}\": {}",
            stderr.trim()
        ))
    }
}

/// Return the SSID of the currently active WiFi connection, if any.
///
/// Reads the active device list from `nmcli` and returns the connection name
/// for any device of type `wifi` that is in the `connected` state.
#[tauri::command]
async fn wifi_status() -> Result<Option<String>, String> {
    let output = Command::new("nmcli")
        .args([
            "--terse",
            "--fields", "DEVICE,TYPE,STATE,CONNECTION",
            "dev", "status",
        ])
        .output();

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
/// Parses the `System Locale: LANG=…` line from the output.
/// Returns a sensible default ("en_US.UTF-8") if the line is absent.
#[tauri::command]
async fn locale_get() -> Result<LocaleResult, String> {
    let output = Command::new("localectl")
        .arg("status")
        .output()
        .map_err(|e| format!("Failed to run localectl: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Look for a line like "   System Locale: LANG=en_US.UTF-8"
    let lang = stdout
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
        .unwrap_or_else(|| "en_US.UTF-8".to_string());

    Ok(LocaleResult {
        lang: lang.clone(),
        raw: lang,
    })
}

/// Set the system locale via `localectl set-locale LANG=<lang>`.
///
/// `lang` should be a POSIX locale string such as "en_US.UTF-8".
/// Requires the process to have the necessary privileges (runs as root or via
/// polkit on Ubuntu; on Raspberry Pi OS the kiosk user is typically sudoer).
#[tauri::command]
async fn locale_set(lang: String) -> Result<bool, String> {
    let status = Command::new("localectl")
        .args(["set-locale", &format!("LANG={lang}")])
        .status()
        .map_err(|e| format!("Failed to run localectl: {e}"))?;

    if status.success() {
        Ok(true)
    } else {
        Err(format!(
            "localectl set-locale exited with status {}",
            status.code().unwrap_or(-1)
        ))
    }
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
/// Parses `Timezone=` and `TimeUSec=` lines from machine-readable output.
#[tauri::command]
async fn timezone_get() -> Result<TimezoneResult, String> {
    let output = Command::new("timedatectl")
        .arg("show")
        .output()
        .map_err(|e| format!("Failed to run timedatectl: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let timezone = stdout
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("Timezone=")
                .map(|v| v.to_string())
        })
        .unwrap_or_else(|| "America/New_York".to_string());

    // Build a rough UTC offset string from the system clock.
    // On a kiosk we don't need sub-minute precision here; the OS clock handles
    // the real offset — this value is display-only in the wizard.
    let utc_offset = get_utc_offset_string(&timezone);

    Ok(TimezoneResult {
        timezone,
        utc_offset,
    })
}

/// Set the system timezone via `timedatectl set-timezone <tz>`.
///
/// `timezone` must be an IANA identifier, e.g. "Europe/Paris".
#[tauri::command]
async fn timezone_set(timezone: String) -> Result<bool, String> {
    let status = Command::new("timedatectl")
        .args(["set-timezone", &timezone])
        .status()
        .map_err(|e| format!("Failed to run timedatectl: {e}"))?;

    if status.success() {
        Ok(true)
    } else {
        Err(format!(
            "timedatectl set-timezone exited with status {}",
            status.code().unwrap_or(-1)
        ))
    }
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
            factory_reset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
