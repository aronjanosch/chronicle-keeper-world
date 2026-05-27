use std::net::SocketAddr;

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Launch the embedded ck-core API on an ephemeral loopback port, then open the
/// webview with the chosen base URL + a per-launch auth token injected before
/// the page scripts run. The server is an in-process tokio task (no sidecar).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ck_core=info,info".into()),
        )
        .init();

    let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let (listener, mut state) = rt.block_on(ck_core::bind(addr)).expect("bind ck-core");
    let bound = listener.local_addr().expect("local addr");

    let token = random_token();
    state.auth_token = Some(token.clone());
    let base = format!("http://{bound}");
    tracing::info!("embedded ck-core on {base}");

    // Serve forever on the runtime in a background thread.
    std::thread::spawn(move || {
        rt.block_on(async move {
            if let Err(e) = ck_core::serve(listener, state).await {
                tracing::error!("ck-core server stopped: {e:#}");
            }
        });
    });

    let init_script =
        format!("window.__CK_API_BASE__ = {base:?}; window.__CK_TOKEN__ = {token:?};");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Chronicle Keeper")
                .inner_size(1200.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .initialization_script(&init_script)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn random_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("rng");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
