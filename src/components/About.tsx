import { Shield } from 'lucide-react';
import { Logo } from './Logo';

export function About() {
  return (
    <div className="flex-1 overflow-auto overscroll-contain p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-panel border border-border rounded-lg p-8 flex flex-col items-center gap-6 shadow-sm text-center">
        <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center text-text mb-2 shadow-sm border border-accent/20">
          <Logo size={32} />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-text">ScreenshotVault</h2>
          <p className="text-sm text-text-muted mt-1">v0.1.0-alpha</p>
        </div>

        <div className="bg-background border border-border p-4 rounded text-sm text-text-muted leading-relaxed">
          <p className="font-medium text-text mb-2 flex items-center justify-center gap-2">
            <Shield size={14} className="text-text-muted" />
            100% Offline & Private
          </p>
          <p>
            ScreenshotVault never uses the network. All indexing, OCR text extraction, perceptual hashing, and storage happen locally on your machine. Your data never leaves your computer.
          </p>
        </div>

        <div className="text-xs text-text-muted space-y-2 mt-4">
          <p>Licensed under the MIT License.</p>
          <p>Built with Tauri, Rust, and React.</p>
        </div>
      </div>
    </div>
  );
}
