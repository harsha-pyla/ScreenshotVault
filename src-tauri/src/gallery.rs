use tauri::{AppHandle, Manager};
// use std::path::{Path, PathBuf};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

fn hash_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[tauri::command]
pub async fn get_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let thumb_dir = app_data_dir.join("thumbnails");
        std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
        
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let mtime = metadata.modified().map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
            .as_secs();
        
        let hash = hash_path(&format!("{}|{}", path, mtime));
        let thumb_path = thumb_dir.join(format!("{}.jpg", hash));
        
        if thumb_path.exists() {
            return Ok(thumb_path.to_string_lossy().to_string());
        }
        
        let img = image::open(&path).map_err(|e| e.to_string())?;
        let thumb = img.thumbnail(256, 256);
        thumb.save_with_format(&thumb_path, image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
        
        Ok(thumb_path.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_ocr_text(app: AppHandle, id: i64) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("library.db");
    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let text: String = conn.query_row(
        "SELECT text FROM images_fts WHERE id = ?1",
        [id],
        |row| row.get(0)
    ).unwrap_or_default();
    
    Ok(text)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    opener::open(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(parent) = Path::new(&path).parent() {
            opener::open(parent).map_err(|e| e.to_string())
        } else {
            Err("No parent dir".to_string())
        }
    }
}

#[tauri::command]
pub fn copy_image(path: String) -> Result<(), String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let data = rgba.into_raw();
    
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let img_data = arboard::ImageData {
        width: w as usize,
        height: h as usize,
        bytes: std::borrow::Cow::Owned(data),
    };
    
    clipboard.set_image(img_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_thumbnail_cache(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = app_data_dir.join("thumbnails");
    if thumb_dir.exists() {
        std::fs::remove_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_thumbnail_cache_size(app: tauri::AppHandle) -> Result<u64, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = app_data_dir.join("thumbnails");
    let mut size = 0;
    if thumb_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(thumb_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    size += metadata.len();
                }
            }
        }
    }
    Ok(size)
}
