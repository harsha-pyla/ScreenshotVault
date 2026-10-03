import { create } from 'zustand';

export interface Folder {
  path: string;
}

interface LibraryState {
  folders: Folder[];
  startMinimized: boolean;
  enableSensitiveDetection: boolean;
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
  setStartMinimized: (val: boolean) => void;
  setEnableSensitiveDetection: (val: boolean) => void;
}

const getInitialState = () => {
  const saved = localStorage.getItem('library-storage');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return { 
        folders: parsed.state.folders || [], 
        startMinimized: !!parsed.state.startMinimized,
        enableSensitiveDetection: parsed.state.enableSensitiveDetection !== false
      };
    } catch {}
  }
  return { folders: [], startMinimized: false, enableSensitiveDetection: true };
};

const initialState = getInitialState();

export const useLibraryStore = create<LibraryState>((set) => ({
  folders: initialState.folders,
  startMinimized: initialState.startMinimized,
  enableSensitiveDetection: initialState.enableSensitiveDetection,
  setStartMinimized: (val) => set((state) => {
    localStorage.setItem('library-storage', JSON.stringify({ state: { folders: state.folders, startMinimized: val, enableSensitiveDetection: state.enableSensitiveDetection } }));
    return { startMinimized: val };
  }),
  setEnableSensitiveDetection: (val) => set((state) => {
    localStorage.setItem('library-storage', JSON.stringify({ state: { folders: state.folders, startMinimized: state.startMinimized, enableSensitiveDetection: val } }));
    return { enableSensitiveDetection: val };
  }),
  addFolder: (path) => set((state) => {
    if (state.folders.find(f => f.path === path)) return state;
    const newFolders = [...state.folders, { path }];
    localStorage.setItem('library-storage', JSON.stringify({ state: { folders: newFolders, startMinimized: state.startMinimized, enableSensitiveDetection: state.enableSensitiveDetection } }));
    return { folders: newFolders };
  }),
  removeFolder: (path) => set((state) => {
    const newFolders = state.folders.filter(f => f.path !== path);
    localStorage.setItem('library-storage', JSON.stringify({ state: { folders: newFolders, startMinimized: state.startMinimized, enableSensitiveDetection: state.enableSensitiveDetection } }));
    return { folders: newFolders };
  })
}));
