import { useEffect, useState, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { ExternalLink, Copy, FolderOpen, Image as ImageIcon, Check } from 'lucide-react';

interface SearchResult {
  id: number;
  path: string;
  size: number;
  modified_at: number;
  width: number;
  height: number;
  snippet: string | null;
}

export function DetailsPanel({ image, query, width, setWidth }: { image: SearchResult | null; query: string; width: number; setWidth: (w: number) => void }) {
  const [ocrText, setOcrText] = useState<string>('');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    if (image) {
      invoke<string>('get_ocr_text', { id: image.id }).then(setOcrText).catch(console.error);
    } else {
      setOcrText('');
    }
  }, [image?.id]);

  const handleCopyText = async () => {
    if (!ocrText) return;
    await navigator.clipboard.writeText(ocrText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleCopyImage = async () => {
    if (!image) return;
    try {
      await invoke('copy_image', { path: image.path });
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === search.toLowerCase() ? (
            <strong key={i} className="text-accent bg-accent/10">{part}</strong>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const handleMouseDown = (_e: React.MouseEvent) => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = document.body.clientWidth - e.clientX;
      setWidth(Math.max(200, Math.min(600, newWidth)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setWidth]);

  return (
    <div className="relative flex flex-col bg-sidebar border-l border-border shrink-0 z-10" style={{ width }}>
      {/* Resize Handle */}
      <div 
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent/50 z-20"
        onMouseDown={handleMouseDown}
      />

      {image ? (
        <div className="flex flex-col h-full overflow-y-auto overscroll-contain overflow-x-hidden">
          <div className="flex-1 flex flex-col p-4 gap-5">
            {/* Full Image Preview */}
            <div className="w-full bg-background border border-border rounded-lg overflow-hidden flex items-center justify-center min-h-[150px] relative">
              <img 
                src={convertFileSrc(image.path)} 
                alt="Preview" 
                className="w-full h-auto object-contain max-h-[250px]"
                onDragStart={(e) => e.preventDefault()}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => invoke('open_file', { path: image.path })} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-accent text-accent-foreground text-xs font-medium rounded hover:opacity-90 transition-opacity">
                <ExternalLink size={14} /> Open
              </button>
              <button onClick={() => invoke('show_in_folder', { path: image.path })} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-panel border border-border text-text text-xs font-medium rounded hover:bg-background transition-colors">
                <FolderOpen size={14} /> Show
              </button>
              <button onClick={handleCopyImage} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-panel border border-border text-text text-xs font-medium rounded hover:bg-background transition-colors">
                {copiedImg ? <Check size={14} className="text-text" /> : <ImageIcon size={14} />} Copy
              </button>
            </div>

            {/* Info */}
            <div className="flex flex-col gap-2 text-xs text-text-muted">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-text text-sm truncate" title={image.path}>
                  {image.path.split(/[\\/]/).pop()}
                </span>
                <span className="text-[10px] break-all select-all opacity-70 leading-tight mb-2">
                  {image.path}
                </span>
              </div>

              <div className="flex justify-between border-b border-border/50 pb-1">
                <span>Dimensions</span>
                <span className="text-text font-medium">{image.width} × {image.height}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-1">
                <span>Size</span>
                <span className="text-text font-medium">{formatBytes(image.size)}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-1">
                <span>Date</span>
                <span className="text-text font-medium">{new Date(image.modified_at * 1000).toLocaleString()}</span>
              </div>
            </div>

            {/* OCR Text */}
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">OCR Text</span>
                <button 
                  onClick={handleCopyText}
                  disabled={!ocrText}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text disabled:opacity-50"
                >
                  {copiedText ? <Check size={12} className="text-text" /> : <Copy size={12} />}
                  {copiedText ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex-1 bg-background border border-border rounded p-3 text-[11px] text-text-muted whitespace-pre-wrap select-text overflow-y-auto overscroll-contain min-h-[100px]">
                {ocrText ? highlightText(ocrText, query) : <span className="italic opacity-50">No text detected.</span>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2 opacity-70">
          <ImageIcon size={32} />
          <p className="text-sm font-medium">Select a screenshot</p>
        </div>
      )}
    </div>
  );
}
