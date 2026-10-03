import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useLibraryStore } from '../store/libraryStore';
import { useThemeStore } from '../store/themeStore';
import { FolderPlus, Trash2, RotateCcw, X, Folder as FolderIcon } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

export function Settings() {
  const { folders, addFolder, removeFolder, startMinimized, setStartMinimized, enableSensitiveDetection, setEnableSensitiveDetection } = useLibraryStore();
  const { theme, setTheme } = useThemeStore();
  
  const [ocrLanguages, setOcrLanguages] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [cacheSize, setCacheSize] = useState<number>(0);

  useEffect(() => {
    invoke<string[]>('get_ocr_languages').then(langs => {
      setOcrLanguages(langs);
      if (langs.length > 0) setSelectedLang(langs[0]);
    });
    
    isEnabled().then(setAutoStart).catch(console.error);
    fetchCacheSize();
  }, []);

  const fetchCacheSize = () => {
    invoke<number>('get_thumbnail_cache_size')
      .then(setCacheSize)
      .catch(console.error);
  };

  const handleAutoStartChange = async (checked: boolean) => {
    try {
      if (checked) await enable();
      else await disable();
      setAutoStart(await isEnabled());
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearCache = async () => {
    try {
      await invoke('clear_thumbnail_cache');
      fetchCacheSize();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRebuildIndex = async () => {
    try {
      await invoke('rebuild_index');
      for (const f of folders) {
        await invoke('queue_folder', { path: f.path });
      }
      alert('Index rebuilding started in the background.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      addFolder(selected);
      await invoke('add_watched_folder', { path: selected });
      invoke('queue_folder', { path: selected });
    }
  };

  return (
    <div className="flex-1 overflow-auto overscroll-contain p-8 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div>
          <h2 className="text-2xl font-bold text-text">Settings</h2>
          <p className="text-text-muted text-sm mt-1">Configure ScreenshotVault preferences.</p>
        </div>

        {/* Folders */}
        <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-text">Watched Folders</h3>
            <p className="text-xs text-text-muted mt-1">Folders monitored for new screenshots.</p>
          </div>
          <div className="flex flex-col gap-2">
            {folders.map(f => (
              <div key={f.path} className="flex items-center justify-between bg-background border border-border px-3 py-2 rounded">
                <div className="flex items-center gap-2">
                  <FolderIcon size={14} className="text-text-muted" />
                  <span className="text-sm font-medium text-text">{f.path}</span>
                </div>
                <button 
                  onClick={() => removeFolder(f.path)}
                  className="text-text-muted hover:text-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button 
              onClick={handleAddFolder}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded bg-background border border-dashed border-border hover:border-text-muted text-text-muted hover:text-text transition-colors mt-1"
            >
              <FolderPlus size={14} />
              <span className="text-sm">Add Folder...</span>
            </button>
          </div>
        </div>

        {/* General */}
        <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-text">General</h3>
          </div>
          
          <div className="flex flex-col gap-2 border-b border-border pb-4">
            <label className="font-medium text-text text-sm">Theme</label>
            <select 
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark'|'light')}
              className="bg-background border border-border rounded px-3 py-2 outline-none focus:border-accent text-sm text-text"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 border-b border-border pb-4">
            <label className="font-medium text-text text-sm">OCR Language</label>
            {ocrLanguages.length > 0 ? (
              <select 
                value={selectedLang} 
                onChange={(e) => {
                  setSelectedLang(e.target.value);
                  invoke('set_ocr_language', { lang: e.target.value });
                }}
                className="bg-background border border-border rounded px-3 py-2 outline-none focus:border-accent text-sm text-text"
              >
                {ocrLanguages.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            ) : (
              <div className="p-3 bg-panel border border-border text-accent rounded text-xs">
                No OCR languages installed on this system.
              </div>
            )}
            <p className="text-[11px] text-text-muted">Language used to extract text from images.</p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => handleAutoStartChange(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <div className="flex flex-col">
                <span className="font-medium text-text text-sm">Start with Windows</span>
                <span className="text-[11px] text-text-muted mt-0.5">Automatically launch when you log in.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={startMinimized}
                onChange={(e) => setStartMinimized(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <div className="flex flex-col">
                <span className="font-medium text-text text-sm">Start minimized to tray</span>
                <span className="text-[11px] text-text-muted mt-0.5">Keep running in background.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSensitiveDetection}
                onChange={(e) => setEnableSensitiveDetection(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <div className="flex flex-col">
                <span className="font-medium text-text text-sm">Flag sensitive content</span>
                <span className="text-[11px] text-text-muted mt-0.5">Show lock badge on screenshots containing potential passwords/keys.</span>
              </div>
            </label>
          </div>
        </div>

        {/* Advanced */}
        <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-text">Advanced</h3>
          </div>
          
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex flex-col">
              <span className="font-medium text-text text-sm">Thumbnail Cache</span>
              <span className="text-[11px] text-text-muted mt-0.5">Currently using {(cacheSize / 1024 / 1024).toFixed(1)} MB</span>
            </div>
            <button 
              onClick={handleClearCache}
              className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded hover:bg-panel hover:text-accent hover:border-accent/30 transition-colors text-sm"
            >
              <Trash2 size={14} />
              Clear Cache
            </button>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-col">
              <span className="font-medium text-text text-sm">Rebuild Index</span>
              <span className="text-[11px] text-text-muted mt-0.5">Deletes local database and re-scans all folders.</span>
            </div>
            <button 
              onClick={handleRebuildIndex}
              className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded hover:bg-panel hover:text-accent hover:border-accent/30 transition-colors text-sm"
            >
              <RotateCcw size={14} />
              Rebuild
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
