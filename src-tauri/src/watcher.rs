use tauri::{AppHandle, Manager, Emitter};
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use crossbeam_channel::unbounded;
use std::collections::HashMap;

use crate::indexer::IndexerState;

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

#[tauri::command]
pub fn start_watching(app: AppHandle, folders: Vec<String>) -> Result<(), String> {
    let (tx, rx) = unbounded();
    
    let app_clone = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = tx.send(event);
        }
    }).map_err(|e| e.to_string())?;

    for folder in &folders {
        let _ = watcher.watch(Path::new(folder), RecursiveMode::Recursive);
    }
    
    let state: tauri::State<'_, WatcherState> = app.state();
    *state.watcher.lock().unwrap() = Some(watcher);
    
    // Background thread to handle debounce and events
    std::thread::spawn(move || {
        let indexer_state = app_clone.state::<IndexerState>();
        let mut last_modified = HashMap::new();
        
        loop {
            // Receive with timeout for debouncing
            match rx.recv_timeout(Duration::from_millis(1000)) {
                Ok(event) => {
                    for path in event.paths {
                        if !is_image(&path) { continue; }
                        
                        match event.kind {
                            EventKind::Create(_) | EventKind::Modify(_) => {
                                last_modified.insert(path, std::time::Instant::now());
                            }
                            EventKind::Remove(_) => {
                                // Handle delete immediately
                                handle_delete(&app_clone, &path);
                                last_modified.remove(&path);
                            }
                            _ => {}
                        }
                    }
                }
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    // Process stable files
                    let now = std::time::Instant::now();
                    let mut to_process = Vec::new();
                    
                    for (path, time) in last_modified.iter() {
                        if now.duration_since(*time) > Duration::from_millis(500) {
                            to_process.push(path.clone());
                        }
                    }
                    
                    for path in to_process {
                        last_modified.remove(&path);
                        
                        let path_str = path.to_string_lossy().to_string();
                        let app_data_dir = app_clone.path().app_data_dir().unwrap();
                        let db_path = app_data_dir.join("library.db");
                        if let Ok(conn) = rusqlite::Connection::open(db_path) {
                            let _ = conn.execute(
                                "INSERT OR IGNORE INTO images (path, ocr_status) VALUES (?1, 'pending')",
                                [&path_str]
                            );
                        }

                        // Send to indexer
                        if let Ok(_) = indexer_state.queue_tx.send(path.clone()) {
                            // Notify UI of new screenshot via status bar
                            let _ = app_clone.emit("new_screenshot", path.to_string_lossy().to_string());
                            let _ = app_clone.emit("library-changed", ());
                        }
                    }
                }
                Err(_) => break, // Channel closed
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn add_watched_folder(app: AppHandle, path: String) -> Result<(), String> {
    let state: tauri::State<'_, WatcherState> = app.state();
    if let Some(watcher) = state.watcher.lock().unwrap().as_mut() {
        watcher.watch(Path::new(&path), RecursiveMode::Recursive).map_err(|e| e.to_string())?;
        let _ = app.emit("library-changed", ());
    }
    Ok(())
}

#[tauri::command]
pub fn remove_watched_folder(app: AppHandle, path: String) -> Result<(), String> {
    let state: tauri::State<'_, WatcherState> = app.state();
    if let Some(watcher) = state.watcher.lock().unwrap().as_mut() {
        let _ = watcher.unwatch(Path::new(&path));
        let _ = app.emit("library-changed", ());
    }
    Ok(())
}

fn handle_delete(app: &AppHandle, path: &PathBuf) {
    let path_str = path.to_string_lossy().to_string();
    let app_data_dir = app.path().app_data_dir().unwrap();
    let db_path = app_data_dir.join("library.db");
    if let Ok(mut conn) = rusqlite::Connection::open(db_path) {
        if let Ok(tx) = conn.transaction() {
            if let Ok(id) = tx.query_row("SELECT id FROM images WHERE path = ?1", [&path_str], |r| r.get::<_, i64>(0)) {
                let _ = tx.execute("DELETE FROM images WHERE id = ?1", [id]);
                let _ = tx.execute("DELETE FROM images_fts WHERE id = ?1", [id]);
                let _ = tx.commit();
                let _ = app.emit("library-changed", ());
            }
        }
    }
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .map(|ext| matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp"))
        .unwrap_or(false)
}
