import { useEffect, useState, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Lock, CloudOff } from 'lucide-react';

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

function Thumbnail({ image, size, isSelected, onClick, onDoubleClick }: { image: SearchResult; size: number; isSelected: boolean; onClick: (e: React.MouseEvent) => void; onDoubleClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    let active = true;
    invoke<string>('get_thumbnail', { path: image.path }).then(thumb => {
      if (active) setSrc(convertFileSrc(thumb));
    }).catch(err => {
      console.error(err);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [image.path]);

  return (
    <div 
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`relative cursor-pointer rounded overflow-hidden transition-all bg-panel group ${isSelected ? 'ring-2 ring-accent ring-inset shadow-md scale-[0.98]' : 'hover:ring-1 hover:ring-accent/50'}`}
      style={{ width: size, height: size * 0.75 }}
    >
      {error ? (
        <div className="w-full h-full bg-panel flex flex-col items-center justify-center gap-2 p-2 text-text-muted">
          <CloudOff size={24} className="opacity-50" />
          <span className="text-[10px] truncate w-full text-center opacity-70" title={image.path.split(/[\\/]/).pop()}>
            {image.path.split(/[\\/]/).pop()}
          </span>
        </div>
      ) : src ? (
        <img 
          src={src} 
          alt={image.path} 
          className="w-full h-full object-cover"
          loading="lazy"
          onDragStart={(e) => e.preventDefault()}
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full bg-panel animate-pulse" />
      )}
      
      {/* Sensitive Lock Badge */}
      {image.is_sensitive && (
        <div 
          className="absolute top-2 right-2 bg-panel text-text p-1 rounded-md shadow-sm border border-border z-10"
          title="Sensitive content detected (e.g. password, API key). This is a local-only label and is not guaranteed to be perfect."
        >
          <Lock size={12} />
        </div>
      )}

      {/* Hover Information Overlay */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center p-2 text-center transition-opacity text-text-muted text-[11px] gap-1 z-20 pointer-events-none">
        <span className="font-medium text-text truncate w-full">{image.path.split(/[\\/]/).pop()}</span>
        <span>{new Date(image.modified_at * 1000).toLocaleDateString()}</span>
      </div>

      {/* Search Snippet Highlight Badge (if it exists) */}
      {image.snippet && (
        <div className="absolute bottom-0 left-0 right-0 bg-background/90 text-[9px] px-1.5 py-1 text-text-muted truncate backdrop-blur-sm border-t border-border z-10">
          <span dangerouslySetInnerHTML={{ __html: image.snippet.replace(/<b>/g, '<strong class="text-accent">').replace(/<\/b>/g, '</strong>') }} />
        </div>
      )}
    </div>
  );
}

export function Gallery({ results, onSelect, onDoubleClick, selectedIds, thumbSize = 200 }: { results: SearchResult[]; onSelect: (idx: number, e: React.MouseEvent) => void; onDoubleClick: (idx: number) => void; selectedIds: Set<number>; thumbSize?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Group and flatten
  const gap = 8;
  const padding = 24;
  const availableWidth = containerWidth - padding * 2;
  const cols = Math.max(1, Math.floor((availableWidth + gap) / (thumbSize + gap)));

  // Groups
  const groups: { label: string; items: SearchResult[]; origIndices: number[] }[] = [];
  const todayStart = new Date().setHours(0,0,0,0) / 1000;
  const yesterdayStart = todayStart - 86400;
  const weekStart = todayStart - 7 * 86400;
  const monthStart = todayStart - 30 * 86400;

  results.forEach((r, idx) => {
    let label = 'Older';
    if (r.modified_at >= todayStart) label = 'Today';
    else if (r.modified_at >= yesterdayStart) label = 'Yesterday';
    else if (r.modified_at >= weekStart) label = 'This Week';
    else if (r.modified_at >= monthStart) label = 'This Month';
    
    let g = groups.find(x => x.label === label);
    if (!g) {
      g = { label, items: [], origIndices: [] };
      groups.push(g);
    }
    g.items.push(r);
    g.origIndices.push(idx);
  });

  type RowItem = { type: 'header'; label: string; count: number } | { type: 'items'; items: SearchResult[]; origIndices: number[] };
  const rows: RowItem[] = [];

  groups.forEach(g => {
    rows.push({ type: 'header', label: g.label, count: g.items.length });
    for (let i = 0; i < g.items.length; i += cols) {
      rows.push({
        type: 'items',
        items: g.items.slice(i, i + cols),
        origIndices: g.origIndices.slice(i, i + cols)
      });
    }
  });

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => rows[i].type === 'header' ? 48 : thumbSize * 0.75 + gap,
    overscan: 5,
  });

  if (results.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2">
        <p className="text-sm font-medium">No screenshots match</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overscroll-contain overflow-x-hidden bg-background">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
                padding: `0 ${padding}px`,
              }}
            >
              {row.type === 'header' ? (
                <div className="flex items-center pb-2 pt-6 border-b border-border text-[12px] font-medium text-text-muted bg-background/90 backdrop-blur-sm z-10 sticky top-0">
                  {row.label} &middot; {row.count}
                </div>
              ) : (
                <div className="flex pt-2" style={{ gap: `${gap}px` }}>
                  {row.items.map((item, idx) => (
                    <Thumbnail 
                      key={item.id} 
                      image={item} 
                      size={thumbSize} 
                      isSelected={selectedIds.has(item.id)}
                      onClick={(e) => onSelect(row.origIndices[idx], e)} 
                      onDoubleClick={() => onDoubleClick(row.origIndices[idx])}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
