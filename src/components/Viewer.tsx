import { useEffect, useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { ExternalLink, Copy, FolderOpen, Image as ImageIcon, Check, ArrowLeft } from 'lucide-react';

interface SearchResult {
  id: number;
  path: string;
  size: number;
  modified_at: number;
  width: number;
  height: number;
  snippet: string | null;
}

export function Viewer({ image, onClose, onNext, onPrev }: { image: SearchResult; onClose: () => void; onNext: () => void; onPrev: () => void }) {
  const [ocrText, setOcrText] = useState<string>('');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);

  useEffect(() => {
    invoke<string>('get_ocr_text', { id: image.id }).then(setOcrText).catch(console.error);
  }, [image.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);

  const handleCopyText = async () => {
    if (!ocrText) return;
    await navigator.clipboard.writeText(ocrText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleCopyImage = async () => {
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

  return (
    <div className="absolute top-[32px] inset-x-0 bottom-0 bg-panel z-50 flex flex-col overflow-hidden animate-in fade-in duration-200">
      <div className="flex items-center p-3 border-b border-border bg-sidebar gap-3 shrink-0">
        <button onClick={onClose} className="flex items-center gap-2 h-[28px] px-3 bg-background border border-border hover:border-accent text-text-muted hover:text-text rounded transition-colors text-[12px] font-medium shadow-sm">
          <ArrowLeft size={14} />
          Back to library
        </button>
        <div className="w-[1px] h-4 bg-border" />
        <h3 className="font-medium text-text text-sm truncate" title={image.path}>
          {image.path.split(/[\\/]/).pop()}
        </h3>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 gap-6">
        {/* Full Image */}
        <div 
          className="flex-1 bg-background border border-border rounded-lg overflow-hidden flex items-center justify-center relative min-h-[300px] cursor-zoom-out"
          onClick={onClose}
        >
          <img 
            src={convertFileSrc(image.path)} 
            alt="Full size" 
            className="w-full h-auto object-contain max-h-[100%] cursor-default"
            onDragStart={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Right Info Sidebar inside Viewer */}
        <div className="w-80 flex flex-col gap-6 overflow-y-auto overscroll-contain shrink-0">
          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => invoke('open_file', { path: image.path })} className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-accent text-accent-foreground text-xs font-medium rounded hover:opacity-90 transition-opacity">
              <ExternalLink size={14} /> Open
          </button>
          <button onClick={() => invoke('show_in_folder', { path: image.path })} className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-panel border border-border text-text text-xs font-medium rounded hover:bg-background transition-colors">
            <FolderOpen size={14} /> Show
          </button>
          <button onClick={handleCopyImage} className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-panel border border-border text-text text-xs font-medium rounded hover:bg-background transition-colors">
            {copiedImg ? <Check size={14} className="text-text" /> : <ImageIcon size={14} />} Copy
          </button>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-2 text-xs text-text-muted">
          <div className="flex justify-between border-b border-border/50 pb-1">
            <span>Dimensions</span>
            <span className="text-text font-medium">{image.width} × {image.height}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 pb-1">
            <span>Size</span>
            <span className="text-text font-medium">{formatBytes(image.size)}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 pb-1">
            <span>Modified</span>
            <span className="text-text font-medium">{new Date(image.modified_at * 1000).toLocaleString()}</span>
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <span>Path</span>
            <span className="text-text break-all select-all">{image.path}</span>
          </div>
        </div>

        {/* OCR Text */}
        <div className="flex flex-col gap-2 mt-2 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Detected Text</span>
            <button 
              onClick={handleCopyText}
              disabled={!ocrText}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text disabled:opacity-50"
            >
              {copiedText ? <Check size={12} className="text-text" /> : <Copy size={12} />}
              {copiedText ? 'Copied' : 'Copy Text'}
            </button>
          </div>
          <div className="flex-1 bg-background border border-border rounded p-3 text-xs text-text-muted whitespace-pre-wrap select-text overflow-y-auto overscroll-contain">
            {ocrText || <span className="italic opacity-50">No text detected in this image.</span>}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
