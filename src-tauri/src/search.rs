use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct SearchResult {
    pub id: i64,
    pub path: String,
    pub size: i64,
    pub modified_at: i64,
    pub width: i64,
    pub height: i64,
    pub snippet: Option<String>,
    pub is_sensitive: bool,
}

#[derive(Deserialize)]
pub struct SearchFilter {
    pub query: String,
    pub date_filter: Option<String>,
    pub folder: Option<String>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
    pub sensitive_only: Option<bool>,
}

#[tauri::command]
pub fn search_images(app: AppHandle, filter: SearchFilter) -> Result<Vec<SearchResult>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("library.db");
    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut sql = String::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

    if filter.query.trim().is_empty() {
        sql.push_str("SELECT i.id, i.path, i.size, i.modified_at, i.width, i.height, NULL as snippet, i.is_sensitive FROM images i WHERE 1=1 ");
    } else {
        let fts_query = filter.query.split_whitespace()
            .map(|word| format!("\"{}\"*", word.replace("\"", "")))
            .collect::<Vec<_>>()
            .join(" AND ");
            
        sql.push_str("SELECT i.id, i.path, i.size, i.modified_at, i.width, i.height, snippet(images_fts, -1, '<b>', '</b>', '...', 15) as snippet, i.is_sensitive 
                      FROM images_fts fts
                      JOIN images i ON i.id = fts.id
                      WHERE images_fts MATCH ? ");
        params.push(Box::new(fts_query));
    }
    
    if let Some(df) = filter.date_filter {
        let ts = match df.as_str() {
            "today" => now - 86400,
            "week" => now - 7 * 86400,
            "month" => now - 30 * 86400,
            _ => 0,
        };
        if ts > 0 {
            sql.push_str(&format!(" AND i.modified_at >= {} ", ts));
        }
    }
    
    if let Some(folder) = filter.folder {
        sql.push_str(" AND i.path LIKE ? ");
        params.push(Box::new(format!("{}%", folder)));
    }
    
    if filter.sensitive_only.unwrap_or(false) {
        sql.push_str(" AND i.is_sensitive = 1 ");
    }
    
    if let Some(min_s) = filter.min_size {
        sql.push_str(&format!(" AND i.size >= {} ", min_s));
    }
    
    if let Some(max_s) = filter.max_size {
        sql.push_str(&format!(" AND i.size <= {} ", max_s));
    }
    
    if !filter.query.trim().is_empty() {
        sql.push_str(" ORDER BY rank ");
    } else {
        sql.push_str(" ORDER BY i.modified_at DESC ");
    }
    
    let ref_params: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(&ref_params[..], |row| {
        let is_sens_int: i64 = row.get(7).unwrap_or(0);
        Ok(SearchResult {
            id: row.get(0)?,
            path: row.get(1)?,
            size: row.get(2)?,
            modified_at: row.get(3)?,
            width: row.get(4)?,
            height: row.get(5)?,
            snippet: row.get(6)?,
            is_sensitive: is_sens_int > 0,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in rows {
        if let Ok(r) = row {
            results.push(r);
        }
    }
    
    Ok(results)
}
