use rusqlite::{Connection, Result};
use std::path::PathBuf;
use serde::Serialize;
use std::collections::HashMap;

pub fn init_db(db_path: PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            size INTEGER,
            modified_at INTEGER,
            width INTEGER,
            height INTEGER,
            phash TEXT,
            indexed_at INTEGER,
            ocr_status TEXT DEFAULT 'pending',
            is_sensitive INTEGER DEFAULT 0
        )",
        [],
    )?;
    
    // Attempt to add column for existing DBs (ignore error if it exists)
    let _ = conn.execute("ALTER TABLE images ADD COLUMN is_sensitive INTEGER DEFAULT 0", []);

    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_path ON images(path)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_status ON images(ocr_status)", [])?;

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
            id UNINDEXED,
            text,
            tokenize='unicode61'
        )",
        [],
    )?;

    Ok(conn)
}

#[tauri::command]
pub fn rebuild_index(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("library.db");
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM images", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM images_fts", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct LibraryStats {
    pub total_images: i64,
    pub indexed: i64,
    pub pending: i64,
    pub folders: HashMap<String, i64>,
}

#[tauri::command]
pub fn get_stats(app: tauri::AppHandle, folders: Vec<String>) -> Result<LibraryStats, String> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("library.db");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut total_images: i64 = 0;
    let mut indexed: i64 = 0;
    let mut pending: i64 = 0;

    conn.query_row("SELECT count(*) FROM images", [], |row| { total_images = row.get(0)?; Ok(()) }).ok();
    conn.query_row("SELECT count(*) FROM images WHERE ocr_status = 'pending'", [], |row| { pending = row.get(0)?; Ok(()) }).ok();
    conn.query_row("SELECT count(*) FROM images WHERE ocr_status IN ('done', 'empty', 'failed')", [], |row| { indexed = row.get(0)?; Ok(()) }).ok();

    let mut folder_counts = HashMap::new();
    for f in folders {
        let mut count: i64 = 0;
        let mut fixed_path = f.clone();
        if !fixed_path.ends_with(std::path::MAIN_SEPARATOR) {
            fixed_path.push(std::path::MAIN_SEPARATOR);
        }
        let pattern = format!("{}%", fixed_path);
        conn.query_row("SELECT count(*) FROM images WHERE path LIKE ?", [&pattern], |row| {
            count = row.get(0)?;
            Ok(())
        }).ok();
        folder_counts.insert(f, count);
    }

    Ok(LibraryStats {
        total_images,
        indexed,
        pending,
        folders: folder_counts,
    })
}
