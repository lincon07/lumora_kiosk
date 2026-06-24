// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use serde::{Deserialize, Serialize};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// A WiFi network as surfaced to the Lumora setup UI.
///
/// On a real Linux kiosk these are produced by talking to NetworkManager
/// (e.g. via `nmcli` or the D-Bus API). The implementation below is a stub so
/// the frontend service abstraction has commands to call; wire the actual
/// NetworkManager calls in here later. The shape MUST stay in sync with
/// `WifiNetwork` in `src/lib/wifi-service.ts`.
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

/// Scan for nearby WiFi networks.
///
/// TODO(networkmanager): replace with a real scan, e.g. shell out to
/// `nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE dev wifi list` and parse, or use
/// the NetworkManager D-Bus API. Returning an empty list signals "no native
/// backend yet" to the frontend, which then uses its dev fallback.
#[tauri::command]
async fn wifi_scan() -> Result<Vec<WifiNetwork>, String> {
    Ok(Vec::new())
}

/// Connect to a WiFi network with an optional password.
///
/// TODO(networkmanager): replace with e.g.
/// `nmcli dev wifi connect "<ssid>" password "<password>"`.
#[tauri::command]
async fn wifi_connect(ssid: String, _password: Option<String>) -> Result<bool, String> {
    let _ = ssid;
    Err("NetworkManager backend not implemented yet".to_string())
}

/// Return the SSID of the currently connected network, if any.
///
/// TODO(networkmanager): replace with e.g.
/// `nmcli -t -f NAME,TYPE connection show --active`.
#[tauri::command]
async fn wifi_status() -> Result<Option<String>, String> {
    Ok(None)
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
            wifi_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
