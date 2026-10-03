import { TitleBar } from './components/TitleBar';
import { useThemeStore } from './store/themeStore';
import { useLibraryStore } from './store/libraryStore';
import { useEffect, useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FolderPlus, Folder as FolderIcon, X, Loader2, Pause, Play, Settings as SettingsIcon, Image as ImageIcon, Search as SearchIcon, Filter, ZoomIn, ZoomOut, Copy, Lock, Info } from 'lucide-react';

import { Gallery } from './components/Gallery';
import { Viewer } from './components/Viewer';
import { Duplicates } from './components/Duplicates';
import { FirstRun } from './components/FirstRun';
import { Settings } from './components/Settings';
import { About } from './components/About';
import { DetailsPanel } from './components/DetailsPanel';

interface IndexerProgress {
  processed: number;
  total: number;
  status: string;
}

interface SearchResult {
  id: number;
  path: string;
  size: number;
  modified_at: number;
  width: number;
  height: number;
  snippet: string | null;
  is_sensitive: boolean;
}

interface LibraryStats {
  total_images: number;
  indexed: number;
  pending: number;
  folders: Record<string, number>;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function App() {
  const theme = useThemeStore(state => state.theme);
  const { folders, addFolder, removeFolder, startMinimized, enableSensitiveDetection } = useLibraryStore();
  
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [libraryVersion, setLibraryVersion] = useState(0);
  
  const [isFirstRun, setIsFirstRun] = useState(() => localStorage.getItem('firstRunDone') !== 'true');
  const [progress, setProgress] = useState<IndexerProgress | null>(null);
  const [currentView, setCurrentView] = useState<'library' | 'duplicates' | 'settings' | 'about'>('library');

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 150);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [sensitiveFilter, setSensitiveFilter] = useState(false);
  
  const [thumbSize, setThumbSize] = useState(160);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [detailsWidth, setDetailsWidth] = useState(280);
  
  const [newScreenshotMsg, setNewScreenshotMsg] = useState('');

  // Initial startup logic
  const startupDone = useRef(false);
  useEffect(() => {
    if (startupDone.current) return;
    startupDone.current = true;
    
    if (startMinimized) {
      getCurrentWebviewWindow().hide().catch(console.error);
    }
    
    // Start watcher
    invoke('start_watching', { folders: folders.map(f => f.path) }).catch(console.error);
  }, [startMinimized, folders]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setCurrentView('library');
        searchInputRef.current?.focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowDetails(prev => !prev);
      }
    };
    const preventScroll = () => window.scrollTo(0, 0);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', preventScroll, { passive: false });
    document.body.addEventListener('scroll', preventScroll, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', preventScroll);
      document.body.removeEventListener('scroll', preventScroll);
    };
  }, []);

  useEffect(() => {
    const unlistenProgress = listen<IndexerProgress>('indexer_progress', (event) => {
      setProgress(event.payload);
    });
    
    const unlistenScreenshot = listen<string>('new_screenshot', () => {
      setNewScreenshotMsg('Indexed 1 new screenshot');
      setTimeout(() => setNewScreenshotMsg(''), 3000);
      // If we are currently viewing all, refresh
      if (currentView === 'library' && !query) {
        setQuery(' '); // Hack to trigger refresh
        setTimeout(() => setQuery(''), 10);
      }
    });
    
    

    return () => {
      unlistenProgress.then(f => f());
      unlistenScreenshot.then(f => f());
    };
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unlistenChanged = listen('library-changed', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setLibraryVersion(v => v + 1);
      }, 300);
    });

    const handleFocus = () => setLibraryVersion(v => v + 1);
    window.addEventListener('focus', handleFocus);

    return () => {
      unlistenChanged.then(f => f());
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    const doFetch = async () => {
      try {
        const s = await invoke<LibraryStats>('get_stats', { folders: folders.map(f => f.path) });
        setStats(s);
      } catch (e) {
        console.error(e);
      }
    };
    doFetch();
  }, [libraryVersion, folders]);

  useEffect(() => {
    if (currentView !== 'library') return;

    const doSearch = async () => {
      setIsSearching(true);
      try {
        const res: SearchResult[] = await invoke('search_images', {
          filter: {
            query: debouncedQuery,
            date_filter: dateFilter || null,
            folder: folderFilter || null,
            min_size: null,
            max_size: null,
            sensitive_only: enableSensitiveDetection && sensitiveFilter ? true : null,
          }
        });
        setResults(res);
        setSelectedIds(new Set());
        setLastSelectedIdx(null);
        setViewerIdx(null);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    };
    doSearch();
  }, [debouncedQuery, dateFilter, folderFilter, sensitiveFilter, currentView, enableSensitiveDetection, libraryVersion]);
  const handleSelect = (idx: number, e: React.MouseEvent) => {
    const id = results[idx].id;
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
      setLastSelectedIdx(idx);
    } else if (e.shiftKey && lastSelectedIdx !== null) {
      const next = new Set(selectedIds);
      const start = Math.min(lastSelectedIdx, idx);
      const end = Math.max(lastSelectedIdx, idx);
      for (let i = start; i <= end; i++) {
        next.add(results[i].id);
      }
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([id]));
      setLastSelectedIdx(idx);
    }
  };

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    
    if (selected && typeof selected === 'string') {
      addFolder(selected);
      await invoke('add_watched_folder', { path: selected }).catch(console.error);
      runScan(selected);
    }
  };
  
  const handleRemoveFolder = async (path: string) => {
    removeFolder(path);
    if (folderFilter === path) setFolderFilter('');
    await invoke('remove_watched_folder', { path }).catch(console.error);
  };

  const runScan = async (path: string) => {
    try {
      await invoke('queue_folder', { path });
    } catch (e) {
      console.error(e);
    }
  };

  const togglePause = async () => {
    await invoke('toggle_pause');
  };


  return (
    <div className="flex flex-col h-screen bg-background text-text overflow-hidden rounded-[4px] border border-border font-sans relative">
      <TitleBar />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-56 bg-sidebar border-r border-border flex flex-col p-2 gap-1 shrink-0 z-10">
          <div className="text-xs font-semibold text-text-muted px-2 pt-2 pb-1 uppercase tracking-wider">Library</div>
          
          <button 
            onClick={() => setCurrentView('library')}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${currentView === 'library' ? 'bg-panel border border-border text-text shadow-sm' : 'hover:bg-panel text-text-muted hover:text-text'}`}
          >
            <ImageIcon size={14} />
            <span className="text-xs font-medium">All Images</span>
          </button>

          <button 
            onClick={() => setCurrentView('duplicates')}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${currentView === 'duplicates' ? 'bg-panel border border-border text-text shadow-sm' : 'hover:bg-panel text-text-muted hover:text-text'}`}
          >
            <Copy size={14} />
            <span className="text-xs font-medium">Duplicates</span>
          </button>

          <div className="text-xs font-semibold text-text-muted px-2 pt-4 pb-1 uppercase tracking-wider">Folders</div>

          {folders.map((f) => (
            <div 
              key={f.path} 
              onClick={() => {
                if (folderFilter === f.path) setFolderFilter('');
                else setFolderFilter(f.path);
                setCurrentView('library');
              }}
              className={`group flex items-center justify-between px-2 py-1.5 rounded hover:bg-panel cursor-pointer transition-colors ${folderFilter === f.path ? 'bg-panel/50 text-text ring-1 ring-border' : 'text-text-muted hover:text-text'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden" title={f.path}>
                <FolderIcon size={14} className="shrink-0" />
                <span className="truncate text-xs">{f.path.split(/[\\/]/).pop()}</span>
                <span className="text-[10px] bg-border px-1.5 py-0.5 rounded-full">{stats?.folders[f.path] || 0}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleRemoveFolder(f.path); }}
                className="opacity-0 group-hover:opacity-100 hover:text-text transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          <button 
            onClick={handleAddFolder}
            className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded hover:bg-panel cursor-pointer text-text-muted hover:text-text transition-colors border border-dashed border-border hover:border-text-muted"
          >
            <FolderPlus size={14} />
            <span className="text-xs font-medium">Add Folder...</span>
          </button>

          <div className="mt-auto flex flex-col gap-1">
            <button 
              onClick={() => setCurrentView('settings')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${currentView === 'settings' ? 'bg-panel border border-border text-text shadow-sm' : 'hover:bg-panel text-text-muted hover:text-text'}`}
            >
              <SettingsIcon size={14} />
              <span className="text-xs font-medium">Settings</span>
            </button>
            <button 
              onClick={() => setCurrentView('about')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${currentView === 'about' ? 'bg-panel border border-border text-text shadow-sm' : 'hover:bg-panel text-text-muted hover:text-text'}`}
            >
              <Info size={14} />
              <span className="text-xs font-medium">About</span>
            </button>
          </div>
        </div>
        
        {/* Main Area */}
        <div className="flex-1 bg-background flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {isFirstRun ? (
              <FirstRun onComplete={() => {
                localStorage.setItem('firstRunDone', 'true');
                setIsFirstRun(false);
              }} />
            ) : currentView === 'settings' ? (
              <Settings />
            ) : currentView === 'about' ? (
              <About />
            ) : currentView === 'duplicates' ? (
              <Duplicates />
            ) : (
              <>
                {/* Search Header */}
                <div className="shrink-0 p-4 border-b border-border bg-background/80 backdrop-blur-md z-10 flex flex-col gap-3">
                  <div className="relative flex items-center">
                    <SearchIcon size={16} className="absolute left-3 text-text-muted" />
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="Search words inside screenshots... (Ctrl+F)"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full bg-panel border border-border focus:border-accent focus:ring-1 focus:ring-accent rounded-md py-2 pl-9 pr-4 text-sm outline-none transition-all placeholder:text-text-muted/50 shadow-sm"
                    />
                    {isSearching && (
                      <Loader2 size={14} className="absolute right-3 animate-spin text-text-muted" />
                    )}
                  </div>
                  
                  {/* Filters & Zoom */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Filter size={12} className="text-text-muted" />
                      <span className="text-text-muted font-medium mr-1">Date:</span>
                      <select 
                        value={dateFilter} 
                        onChange={e => setDateFilter(e.target.value)}
                        className="bg-panel border border-border rounded px-2 py-1 outline-none focus:border-accent text-text-muted cursor-pointer hover:bg-border/50 transition-colors"
                      >
                        <option value="">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Past Week</option>
                        <option value="month">Past Month</option>
                      </select>

                      {folderFilter && (
                        <div className="flex items-center gap-1 bg-accent/10 border border-accent/20 text-accent px-2 py-1 rounded">
                          <FolderIcon size={10} />
                          <span className="truncate max-w-[100px]">{folderFilter.split(/[\\/]/).pop()}</span>
                          <X size={12} className="cursor-pointer hover:text-text ml-1" onClick={() => setFolderFilter('')} />
                        </div>
                      )}
                      
                      {enableSensitiveDetection && (
                        <button
                          onClick={() => setSensitiveFilter(!sensitiveFilter)}
                          title="Show only sensitive screenshots"
                          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors border ${sensitiveFilter ? 'bg-panel text-text border-border shadow-sm' : 'bg-panel border-transparent text-text-muted hover:text-text'}`}
                        >
                          <Lock size={12} />
                          <span>Sensitive</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Zoom slider */}
                    <div className="flex items-center gap-2 text-text-muted bg-panel border border-border px-2 py-1 rounded">
                      <ZoomOut size={14} />
                      <input 
                        type="range" 
                        min="80" 
                        max="400" 
                        value={thumbSize} 
                        onChange={(e) => setThumbSize(Number(e.target.value))}
                        className="w-24 accent-accent" 
                      />
                      <ZoomIn size={14} />
                    </div>
                  </div>
                </div>

                {/* Gallery */}
                <div className="flex-1 overflow-hidden relative">
                  {isSearching && (
                    <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm z-20 bg-background">
                      Searching...
                    </div>
                  )}
                  <Gallery 
                    results={results} 
                    onSelect={handleSelect} 
                    onDoubleClick={(idx) => setViewerIdx(idx)}
                    selectedIds={selectedIds}
                    thumbSize={thumbSize} 
                  />
                </div>
              </>
            )}
          </div>

          {/* Right Details Panel */}
          {showDetails && (
            <DetailsPanel 
              image={selectedIds.size === 1 ? results.find(r => r.id === Array.from(selectedIds)[0]) || null : null}
              query={debouncedQuery}
              width={detailsWidth}
              setWidth={setDetailsWidth}
            />
          )}

          {/* Full Screen Viewer Panel Overlay */}
          {currentView === 'library' && viewerIdx !== null && results[viewerIdx] && (
            <Viewer 
              image={results[viewerIdx]}
              onClose={() => setViewerIdx(null)}
              onNext={() => setViewerIdx(i => i !== null && i < results.length - 1 ? i + 1 : i)}
              onPrev={() => setViewerIdx(i => i !== null && i > 0 ? i - 1 : i)}
            />
          )}
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="h-[22px] shrink-0 bg-sidebar border-t border-border flex items-center justify-between px-2 text-[11px] text-text-muted z-20 relative">
        <div className="flex items-center gap-2">
          {newScreenshotMsg ? (
            <span className="text-accent font-medium animate-pulse">
              {newScreenshotMsg}
            </span>
          ) : stats && stats.pending > 0 ? (
            <>
              <span className="capitalize">{progress?.status || 'running'}...</span>
              <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, (stats.indexed / Math.max(1, stats.total_images)) * 100))}%` }}
                />
              </div>
              <span>Indexing {stats.indexed} of {stats.total_images}</span>
            </>
          ) : stats && stats.total_images > 0 ? (
            <span>{stats.total_images} screenshots indexed</span>
          ) : (
            <span>No screenshots yet</span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {progress && progress.processed < progress.total && (
            <button 
              onClick={togglePause}
              className="hover:text-text transition-colors bg-panel rounded p-0.5 border border-border"
              title={progress.status === 'running' ? "Pause" : "Resume"}
            >
              {progress.status === 'running' ? <Pause size={10} /> : <Play size={10} />}
            </button>
          )}
          {currentView === 'library' && (
            <span>{results.length} results</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
