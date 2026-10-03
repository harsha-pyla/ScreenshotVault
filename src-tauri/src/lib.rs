mod db;
mod indexer;
mod search;
mod gallery;
mod duplicates;
mod watcher;

use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .manage(watcher::WatcherState { watcher: std::sync::Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            indexer::queue_folder,
            indexer::toggle_pause,
            indexer::get_ocr_languages,
            indexer::set_ocr_language,
            search::search_images,
            gallery::get_thumbnail,
            gallery::clear_thumbnail_cache,
            gallery::get_thumbnail_cache_size,
            gallery::get_ocr_text,
            gallery::open_file,
            gallery::show_in_folder,
            gallery::copy_image,
            duplicates::get_duplicates,
            duplicates::trash_files,
            watcher::start_watching,
            watcher::add_watched_folder,
            watcher::remove_watched_folder,
            db::rebuild_index,
            db::get_stats
        ])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join("library.db");
            
            indexer::start_indexer(app.handle().clone(), db_path);
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
