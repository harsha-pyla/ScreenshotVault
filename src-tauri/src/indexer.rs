use crate::db::init_db;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;
use windows::Graphics::Imaging::{SoftwareBitmap, BitmapPixelFormat};
use windows::Media::Ocr::OcrEngine;
use windows::Globalization::Language;
use windows::Storage::Streams::DataWriter;

#[derive(Clone, serde::Serialize)]
pub struct IndexerProgress {
    pub processed: u64,
    pub total: u64,
    pub status: String,
}

pub struct IndexerState {
    pub queue_tx: mpsc::Sender<PathBuf>,
    pub paused: Arc<AtomicBool>,
    pub stats: Arc<Mutex<(u64, u64)>>, // (processed, total)
    pub ocr_lang: Arc<Mutex<String>>,
}

pub fn start_indexer(app: AppHandle, db_path: PathBuf) {
    let (tx, rx) = mpsc::channel::<PathBuf>();
    let paused = Arc::new(AtomicBool::new(false));
    let stats = Arc::new(Mutex::new((0, 0)));
    
    // Get default OCR language or "en-US"
    let default_lang = get_ocr_languages_impl().into_iter().next().unwrap_or_else(|| "en-US".to_string());
    let ocr_lang = Arc::new(Mutex::new(default_lang));

    let state = IndexerState {
        queue_tx: tx,
        paused: paused.clone(),
        stats: stats.clone(),
        ocr_lang: ocr_lang.clone(),
    };
    app.manage(state);

    let rx = Arc::new(Mutex::new(rx));
    let worker_count = std::cmp::max(1, num_cpus::get() / 2);

    for _ in 0..worker_count {
        let rx = rx.clone();
        let paused = paused.clone();
        let stats = stats.clone();
        let db_path = db_path.clone();
        let app_handle = app.clone();
        let ocr_lang = ocr_lang.clone();

        thread::spawn(move || {
            let mut conn = init_db(db_path).expect("Failed to initialize DB in worker");

            loop {
                // Check pause state
                while paused.load(Ordering::SeqCst) {
                    thread::sleep(std::time::Duration::from_millis(500));
                }

                let path = {
                    let rx_lock = rx.lock().unwrap();
                    match rx_lock.recv() {
                        Ok(p) => p,
                        Err(_) => break, // Channel closed
                    }
                };

                let lang = { ocr_lang.lock().unwrap().clone() };
                process_file(&mut conn, &path, &lang);

                let (processed, total) = {
                    let mut s = stats.lock().unwrap();
                    s.0 += 1;
                    (s.0, s.1)
                };

                let _ = app_handle.emit("library-changed", ());
                let _ = app_handle.emit(
                    "indexer_progress",
                    IndexerProgress {
                        processed,
                        total,
                        status: "running".into(),
                    },
                );
            }
        });
    }
}

fn process_file(conn: &mut Connection, path: &PathBuf, lang_tag: &str) {
    let path_str = path.to_string_lossy().to_string();

    let metadata = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;

    let size = metadata.len() as i64;
    
    struct Existing {
        #[allow(dead_code)]
        id: i64,
        modified_at: i64,
        ocr_status: String,
    }
    
    let existing: Result<Existing, _> = {
        let mut stmt = conn.prepare("SELECT id, modified_at, ocr_status FROM images WHERE path = ?1").unwrap();
        stmt.query_row([&path_str], |row| {
            Ok(Existing {
                id: row.get(0)?,
                modified_at: row.get(1)?,
                ocr_status: row.get(2)?,
            })
        })
    };

    if let Ok(ex) = &existing {
        if ex.modified_at >= modified_at && ex.ocr_status == "done" {
            return;
        }
    }

    let img = match image::open(path) {
        Ok(i) => i,
        Err(_) => return,
    };

    let width = img.width() as i64;
    let height = img.height() as i64;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

    // Compute phash
    let hasher = image_hasher::HasherConfig::new().to_hasher();
    let hash = hasher.hash_image(&img);
    let phash_str = hash.to_base64();

    // Run OCR
    let (ocr_text, status) = match perform_ocr(&img, lang_tag) {
        Ok(text) => {
            if text.trim().is_empty() {
                ("".to_string(), "empty")
            } else {
                (text, "done")
            }
        },
        Err(_) => ("".to_string(), "failed"),
    };

    let sensitive = if status == "done" { check_sensitive(&ocr_text) } else { false };
    let sensitive_int = if sensitive { 1 } else { 0 };

    // Transaction
    let tx = conn.transaction().unwrap();
    
    tx.execute(
        "INSERT INTO images (path, size, modified_at, width, height, phash, indexed_at, ocr_status, is_sensitive)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(path) DO UPDATE SET
         size=excluded.size,
         modified_at=excluded.modified_at,
         width=excluded.width,
         height=excluded.height,
         phash=excluded.phash,
         indexed_at=excluded.indexed_at,
         ocr_status=excluded.ocr_status,
         is_sensitive=excluded.is_sensitive",
        (
            &path_str, size, modified_at, width, height, &phash_str, now, status, sensitive_int
        ),
    ).unwrap();

    let id: i64 = tx.query_row("SELECT id FROM images WHERE path = ?1", [&path_str], |r| r.get(0)).unwrap();

    if status == "done" {
        tx.execute("INSERT OR REPLACE INTO images_fts (id, text) VALUES (?1, ?2)", (id, &ocr_text)).unwrap();
    } else {
        tx.execute("DELETE FROM images_fts WHERE id = ?1", [id]).unwrap();
    }

    tx.commit().unwrap();
}

fn perform_ocr(img: &image::DynamicImage, lang_tag: &str) -> Result<String, String> {
    let mut img = img.clone();
    let max_dim = OcrEngine::MaxImageDimension().unwrap_or(4000) as u32;
    if img.width() > max_dim || img.height() > max_dim {
        img = img.resize(max_dim, max_dim, image::imageops::FilterType::Triangle);
    }
    
    let rgba = img.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();
    let data = rgba.into_raw();

    let writer = DataWriter::new().map_err(|e| e.to_string())?;
    writer.WriteBytes(&data).map_err(|e| e.to_string())?;
    let buffer = writer.DetachBuffer().map_err(|e| e.to_string())?;
    
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Rgba8, width as i32, height as i32).map_err(|e| e.to_string())?;

    let lang = Language::CreateLanguage(&windows::core::HSTRING::from(lang_tag)).map_err(|e| e.to_string())?;
    let engine = OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| e.to_string())?;
    
    let result = engine.RecognizeAsync(&bitmap).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
    let text = result.Text().map_err(|e| e.to_string())?.to_string();
    
    Ok(text)
}

fn get_ocr_languages_impl() -> Vec<String> {
    let mut langs = Vec::new();
    if let Ok(languages) = OcrEngine::AvailableRecognizerLanguages() {
        if let Ok(iter) = languages.First() {
            while let Ok(true) = iter.HasCurrent() {
                if let Ok(lang) = iter.Current() {
                    if let Ok(tag) = lang.LanguageTag() {
                        langs.push(tag.to_string_lossy());
                    }
                }
                let _ = iter.MoveNext();
            }
        }
    }
    langs
}

#[tauri::command]
pub fn get_ocr_languages() -> Vec<String> {
    get_ocr_languages_impl()
}

#[tauri::command]
pub fn set_ocr_language(app: AppHandle, lang: String) {
    let state: tauri::State<'_, IndexerState> = app.state();
    let mut l = state.ocr_lang.lock().unwrap();
    *l = lang;
}

#[tauri::command]
pub async fn queue_folder(app: AppHandle, path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, IndexerState> = app.state();
        
        let walker = WalkDir::new(&path).into_iter().filter_entry(|e| {
            let is_hidden = e.file_name().to_str().map(|s| s.starts_with('.')).unwrap_or(false);
            !is_hidden
        });

        let app_data_dir = app.path().app_data_dir().unwrap();
        let db_path = app_data_dir.join("library.db");
        let conn = rusqlite::Connection::open(db_path).unwrap();

        let mut queued = 0;
        let mut batch_count = 0;
        
        for entry in walker.flatten() {
            if entry.file_type().is_file() {
                let p = entry.path();
                if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                    let ext = ext.to_lowercase();
                    if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp") {
                        let path_str = p.to_string_lossy().to_string();
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO images (path, ocr_status) VALUES (?1, 'pending')",
                            [&path_str]
                        );

                        if state.queue_tx.send(p.to_path_buf()).is_ok() {
                            queued += 1;
                            batch_count += 1;
                        }

                        if batch_count >= 50 {
                            let mut s = state.stats.lock().unwrap();
                            s.1 += batch_count;
                            let _ = app.emit("indexer_progress", IndexerProgress { processed: s.0, total: s.1, status: "running".into() });
                            let _ = app.emit("library-changed", ());
                            batch_count = 0;
                        }
                    }
                }
            }
        }

        if batch_count > 0 {
            let mut s = state.stats.lock().unwrap();
            s.1 += batch_count;
            let _ = app.emit("indexer_progress", IndexerProgress { processed: s.0, total: s.1, status: if state.paused.load(Ordering::SeqCst) { "paused".into() } else { "running".into() } });
            let _ = app.emit("library-changed", ());
        }
        Ok(queued)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn toggle_pause(app: AppHandle) -> bool {
    let state: tauri::State<'_, IndexerState> = app.state();
    let current = state.paused.load(Ordering::SeqCst);
    state.paused.store(!current, Ordering::SeqCst);
    let s = state.stats.lock().unwrap();
    let status = if !current { "paused" } else { "running" };
    let _ = app.emit("indexer_progress", IndexerProgress { processed: s.0, total: s.1, status: status.into() });
    !current
}

fn check_sensitive(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.contains("password:") || lower.contains("pwd:") {
        return true;
    }
    
    if let Ok(re) = regex::Regex::new(r"sk-[a-zA-Z0-9]{30,}") {
        if re.is_match(text) { return true; }
    }
    
    if let Ok(re) = regex::Regex::new(r"AKIA[0-9A-Z]{16}") {
        if re.is_match(text) { return true; }
    }
    
    if let Ok(re) = regex::Regex::new(r"\b(?:\d[ -]*?){13,16}\b") {
        for mat in re.find_iter(text) {
            let digits: String = mat.as_str().chars().filter(|c| c.is_digit(10)).collect();
            if digits.len() >= 13 && digits.len() <= 16 {
                if luhn_check(&digits) {
                    return true;
                }
            }
        }
    }
    
    false
}

fn luhn_check(digits: &str) -> bool {
    let mut sum = 0;
    let mut alt = false;
    for c in digits.chars().rev() {
        if let Some(mut d) = c.to_digit(10) {
            if alt {
                d *= 2;
                if d > 9 { d -= 9; }
            }
            sum += d;
            alt = !alt;
        }
    }
    sum % 10 == 0
}
