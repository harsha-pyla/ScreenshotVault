import { Shield, FolderPlus, Search, CheckCircle2 } from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Logo } from './Logo';

export function FirstRun({ onComplete }: { onComplete: () => void }) {
  const { addFolder } = useLibraryStore();

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      addFolder(selected);
      await invoke('add_watched_folder', { path: selected });
      invoke('queue_folder', { path: selected });
      onComplete();
    }
  };

  return (
    <div className="flex-1 overflow-auto overscroll-contain bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl flex flex-col items-center">
        <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center text-text mb-6 shadow-sm border border-accent/20">
          <Logo size={32} />
        </div>
        
        <h1 className="text-3xl font-bold text-text mb-2 text-center">Welcome to ScreenshotVault</h1>
        <p className="text-text-muted mb-12 text-center max-w-md">
          Your private, offline, intelligent screenshot library. No data ever leaves your computer.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-12">
          {/* Step 1 */}
          <div className="bg-panel border border-border rounded-xl p-6 flex flex-col items-center text-center shadow-sm relative">
            <div className="w-8 h-8 bg-accent text-background rounded-full flex items-center justify-center font-bold absolute -top-4 shadow-md">
              1
            </div>
            <FolderPlus size={32} className="text-text-muted mt-4 mb-4" />
            <h3 className="font-semibold text-text mb-2">Choose Folders</h3>
            <p className="text-xs text-text-muted">Select where your screenshots are saved (e.g. Pictures/Screenshots).</p>
          </div>

          {/* Step 2 */}
          <div className="bg-panel border border-border rounded-xl p-6 flex flex-col items-center text-center shadow-sm relative opacity-50">
            <div className="w-8 h-8 bg-border text-text-muted rounded-full flex items-center justify-center font-bold absolute -top-4 shadow-sm">
              2
            </div>
            <CheckCircle2 size={32} className="text-text-muted mt-4 mb-4" />
            <h3 className="font-semibold text-text mb-2">Wait for Indexing</h3>
            <p className="text-xs text-text-muted">We'll scan the text in your images locally in the background.</p>
          </div>

          {/* Step 3 */}
          <div className="bg-panel border border-border rounded-xl p-6 flex flex-col items-center text-center shadow-sm relative opacity-50">
            <div className="w-8 h-8 bg-border text-text-muted rounded-full flex items-center justify-center font-bold absolute -top-4 shadow-sm">
              3
            </div>
            <Search size={32} className="text-text-muted mt-4 mb-4" />
            <h3 className="font-semibold text-text mb-2">Search</h3>
            <p className="text-xs text-text-muted">Find exactly what you need instantly.</p>
          </div>
        </div>

        <button 
          onClick={handleAddFolder}
          className="bg-accent hover:bg-accent/90 text-background font-medium px-8 py-3 rounded-full transition-all shadow-md hover:shadow-lg flex items-center gap-2"
        >
          <FolderPlus size={18} />
          Select Screenshot Folder
        </button>
      </div>
    </div>
  );
}
