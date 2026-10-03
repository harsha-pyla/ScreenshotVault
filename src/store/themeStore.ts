import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('theme-storage');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return parsed.state.theme;
    } catch {}
  }
  return 'dark'; // default
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('theme-storage', JSON.stringify({ state: { theme: newTheme } }));
    return { theme: newTheme };
  }),
  setTheme: (theme) => set(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme-storage', JSON.stringify({ state: { theme } }));
    return { theme };
  })
}));

// Initialize theme on load
document.documentElement.dataset.theme = getInitialTheme();
