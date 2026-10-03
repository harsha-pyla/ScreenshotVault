import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

import { Logo } from './Logo';

const appWindow = getCurrentWindow();

export function TitleBar() {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <div 
      className="flex justify-between items-center h-[32px] bg-sidebar border-b border-border select-none shrink-0 relative z-[60]"
    >
      {/* Left: Logo + App Name */}
      <div className="flex items-center px-3 h-full gap-2 pointer-events-none">
        <Logo className="text-text" />
        <span className="text-text font-medium text-[13px]">ScreenshotVault</span>
      </div>

      {/* Center: Drag Region */}
      <div 
        data-tauri-drag-region 
        className="flex-1 h-full cursor-default"
      />

      {/* Right: Controls */}
      <div className="flex h-full items-center relative z-[60]">
        <button 
          onClick={toggleTheme}
          className="h-full px-3 hover:bg-border/50 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <button 
          onClick={() => appWindow.minimize()}
          className="h-full px-3 hover:bg-border/50 text-text-muted hover:text-text transition-colors flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={() => appWindow.toggleMaximize()}
          className="h-full px-3 hover:bg-border/50 text-text-muted hover:text-text transition-colors flex items-center justify-center"
        >
          <Square size={12} />
        </button>
        <button 
          onClick={() => appWindow.close()}
          className="h-full px-4 hover:bg-red-500 hover:text-white text-text-muted transition-colors flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
