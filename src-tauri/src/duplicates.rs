use serde::Serialize;
use tauri::{AppHandle, Manager, Emitter};
use image_hasher::ImageHash;

#[derive(Serialize)]
pub struct DuplicateImage {
    pub id: i64,
    pub path: String,
    pub size: i64,
    pub modified_at: i64,
    pub width: i64,
    pub height: i64,
    pub phash: String,
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub images: Vec<DuplicateImage>,
}

#[tauri::command]
pub async fn get_duplicates(app: AppHandle, max_distance: u32) -> Result<Vec<DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let db_path = app_data_dir.join("library.db");
        let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
        
        let mut stmt = conn.prepare("SELECT id, path, size, modified_at, width, height, phash FROM images WHERE phash IS NOT NULL").map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
            Ok(DuplicateImage {
                id: row.get(0)?,
                path: row.get(1)?,
                size: row.get(2)?,
                modified_at: row.get(3)?,
                width: row.get(4)?,
                height: row.get(5)?,
                phash: row.get(6)?,
            })
        }).map_err(|e| e.to_string())?;
        
        let all_images: Vec<DuplicateImage> = rows.filter_map(Result::ok).collect();
        let mut parsed_hashes = Vec::with_capacity(all_images.len());
        
        for img in &all_images {
            let hash = match ImageHash::<Box<[u8]>>::from_base64(&img.phash) {
                Ok(h) => h,
                Err(e) => return Err(format!("Parse err: {:?}", e)),
            };
            parsed_hashes.push(hash);
        }
        
        let mut groups = Vec::new();
        let mut visited = vec![false; all_images.len()];
        
        for i in 0..all_images.len() {
            if visited[i] { continue; }
            
            let mut group = Vec::new();
            group.push(i);
            visited[i] = true;
            
            for j in (i + 1)..all_images.len() {
                if visited[j] { continue; }
                
                let dist = parsed_hashes[i].dist(&parsed_hashes[j]);
                if dist <= max_distance {
                    group.push(j);
                    visited[j] = true;
                }
            }
            
            if group.len() > 1 {
                let images = group.into_iter().map(|idx| {
                    DuplicateImage {
                        id: all_images[idx].id,
                        path: all_images[idx].path.clone(),
                        size: all_images[idx].size,
                        modified_at: all_images[idx].modified_at,
                        width: all_images[idx].width,
                        height: all_images[idx].height,
                        phash: all_images[idx].phash.clone(),
                    }
                }).collect();
                groups.push(DuplicateGroup { images });
            }
        }
        
        groups.sort_by(|a, b| {
            let a_savings = a.images.iter().map(|i| i.size).sum::<i64>() - a.images.iter().map(|i| i.size).max().unwrap_or(0);
            let b_savings = b.images.iter().map(|i| i.size).sum::<i64>() - b.images.iter().map(|i| i.size).max().unwrap_or(0);
            b_savings.cmp(&a_savings)
        });
        
        Ok(groups)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn trash_files(app: AppHandle, ids: Vec<i64>) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("library.db");
    let mut conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut paths = Vec::new();
    for id in &ids {
        let path: Result<String, _> = conn.query_row("SELECT path FROM images WHERE id = ?1", [id], |r| r.get(0));
        if let Ok(p) = path {
            paths.push(p);
        }
    }
    
    if !paths.is_empty() {
        trash::delete_all(&paths).map_err(|e| e.to_string())?;
    }
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in ids {
        tx.execute("DELETE FROM images WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM images_fts WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    
    let _ = app.emit("library-changed", ());
    
    Ok(())
}
