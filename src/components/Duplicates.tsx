import { useEffect, useState, useMemo } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Trash2, Loader2, Image as ImageIcon, CloudOff } from 'lucide-react';

interface DuplicateImage {
  id: number;
  path: string;
  size: number;
  modified_at: number;
  width: number;
  height: number;
  phash: string;
}

interface DuplicateGroup {
  images: DuplicateImage[];
}

function DuplicateThumbnail({ img }: { img: DuplicateImage }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    let active = true;
    invoke<string>('get_thumbnail', { path: img.path }).then(thumb => {
      if (active) setSrc(convertFileSrc(thumb));
    }).catch(err => {
      console.error(err);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [img.path]);

  if (error) {
    return (
      <div className="w-full h-full bg-panel flex flex-col items-center justify-center gap-2 p-2 text-text-muted">
        <CloudOff size={24} className="opacity-50" />
      </div>
    );
  }

  if (src) {
    return (
      <img 
        src={src} 
        alt="Thumbnail" 
        className="w-full h-full object-cover"
        loading="lazy"
        onDragStart={(e) => e.preventDefault()}
        onError={() => setError(true)}
      />
    );
  }

  return <div className="w-full h-full bg-panel animate-pulse" />;
}

export function Duplicates() {
  const [distance, setDistance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  
  // Set of image IDs marked for deletion
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<number>>(new Set());
  
  // Dialog state
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDuplicates = async (dist: number) => {
    setLoading(true);
    try {
      const res: DuplicateGroup[] = await invoke('get_duplicates', { maxDistance: dist });
      
      const toDelete = new Set<number>();
      res.forEach(g => {
        // Find best to keep: largest resolution, then oldest
        g.images.sort((a, b) => {
          const resA = a.width * a.height;
          const resB = b.width * b.height;
          if (resA !== resB) return resB - resA;
          return a.modified_at - b.modified_at;
        });
        
        // Keep the first one, mark rest for deletion
        for (let i = 1; i < g.images.length; i++) {
          toDelete.add(g.images[i].id);
        }
      });
      setGroups(res);
      setSelectedForDeletion(toDelete);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchDuplicates(distance);
    }, 300);
    return () => clearTimeout(handler);
  }, [distance]);

  const handleTrash = async () => {
    setIsDeleting(true);
    try {
      await invoke('trash_files', { ids: Array.from(selectedForDeletion) });
      setShowConfirm(false);
      fetchDuplicates(distance); // Refresh
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Stats
  const { totalGroups, totalSavings } = useMemo(() => {
    let totalGroups = groups.length;
    let savings = 0;
    
    groups.forEach(g => {
      g.images.forEach(img => {
        if (selectedForDeletion.has(img.id)) {
          savings += img.size;
        }
      });
    });
    
    return { totalGroups, totalSavings: savings };
  }, [groups, selectedForDeletion]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative font-sans text-text">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-sidebar/50">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-text">
            Duplicates
          </h2>
          <div className="w-[1px] h-4 bg-border"></div>
          <p className="text-text-muted text-xs">
            {totalGroups} groups &middot; <span className="font-medium text-text">{formatBytes(totalSavings)}</span> can be freed
          </p>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-text-muted">Exact</span>
            <input 
              type="range" 
              min="0" 
              max="10" 
              value={distance} 
              onChange={(e) => setDistance(Number(e.target.value))}
              className="w-24 accent-accent" 
            />
            <span className="text-[11px] font-medium text-text-muted">Similar</span>
          </div>
          
          <button 
            onClick={() => setShowConfirm(true)}
            disabled={selectedForDeletion.size === 0}
            className="bg-accent text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded font-medium text-xs transition-opacity shadow-sm hover:opacity-90"
          >
            Review {selectedForDeletion.size} files...
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto overscroll-contain p-6 flex flex-col gap-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted text-sm">
            Scanning for duplicates...
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted text-sm">
            No duplicates found at distance {distance}.
          </div>
        ) : (
          groups.map((group, gIdx) => {
            const savings = group.images.filter(i => selectedForDeletion.has(i.id)).reduce((acc, i) => acc + i.size, 0);
            const count = group.images.length;
            const isExact = distance === 0;

            return (
              <div key={gIdx} className="flex flex-col mb-4 gap-3">
                <div className="text-[12px] font-medium text-text-muted flex items-center gap-2 pb-1 border-b border-border">
                  {count} {isExact ? 'identical' : 'similar'} &middot; {formatBytes(savings)} can be freed
                </div>
                
                <div className="flex flex-wrap gap-6 pt-1">
                  {group.images.map((img, idx) => {
                    const isSelectedToRemove = selectedForDeletion.has(img.id);
                    const isSuggested = idx === 0;
                    
                    return (
                      <div key={img.id} className="flex flex-col w-[120px] shrink-0">
                        <div className="w-[120px] h-[90px] bg-sidebar rounded overflow-hidden flex items-center justify-center border border-border relative mb-1.5">
                          <DuplicateThumbnail img={img} />
                        </div>
                        
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-medium text-text truncate" title={img.path}>
                            {img.path.split(/[\\/]/).pop()}
                          </span>
                          {isSuggested && (
                            <span className="text-[9px] text-text-muted bg-panel border border-border px-1 rounded uppercase tracking-wider">
                              Suggested
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-col text-[10px] text-text-muted gap-[1px]">
                          <span>{formatBytes(img.size)} &middot; {img.width}×{img.height}</span>
                          <span>{new Date(img.modified_at * 1000).toLocaleDateString()}</span>
                        </div>
                        
                        {/* Two-option control */}
                        <div className="flex bg-panel border border-border rounded text-[11px] font-medium mt-2 overflow-hidden w-full h-6">
                          <button 
                            onClick={() => {
                              const next = new Set(selectedForDeletion);
                              next.delete(img.id);
                              setSelectedForDeletion(next);
                            }}
                            className={`flex-1 flex items-center justify-center transition-colors ${!isSelectedToRemove ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:bg-background'}`}
                          >
                            Keep
                          </button>
                          <button 
                            onClick={() => {
                              const next = new Set(selectedForDeletion);
                              next.add(img.id);
                              setSelectedForDeletion(next);
                            }}
                            className={`flex-1 flex items-center justify-center transition-colors ${isSelectedToRemove ? 'bg-accent text-accent-foreground' : 'text-text-muted hover:bg-background'}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border shadow-2xl rounded-lg p-5 max-w-lg w-full flex flex-col gap-4 max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold text-text">
              Review Deletion
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              These {selectedForDeletion.size} files will be moved to the Recycle Bin. You will free up <strong className="text-text">{formatBytes(totalSavings)}</strong>.
            </p>
            
            <div className="flex-1 overflow-y-auto border border-border rounded bg-background p-2 text-xs text-text-muted flex flex-col gap-1 max-h-64">
              {Array.from(selectedForDeletion).map(id => {
                const img = groups.flatMap(g => g.images).find(i => i.id === id);
                return img ? <span key={id} className="truncate" title={img.path}>{img.path}</span> : null;
              })}
            </div>
            
            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-border">
              <button 
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded text-xs font-medium hover:bg-background border border-transparent text-text transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleTrash}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-danger hover:bg-danger text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Move {selectedForDeletion.size} files to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
