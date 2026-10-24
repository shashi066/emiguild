export type HomeEntryNavigation = {
  initialPath: string | null;
  currentPath: string | null;
  leftInitialHome: boolean;
};

export function createHomeEntryNavigation(path: string | null): HomeEntryNavigation {
  return { initialPath: path, currentPath: path, leftInitialHome: path !== '/' };
}

export function advanceHomeEntryNavigation(state: HomeEntryNavigation, path: string | null): HomeEntryNavigation {
  if (path === state.currentPath) return state;
  return { ...state, currentPath: path, leftInitialHome: state.leftInitialHome || path !== '/' };
}

export function shouldShowHomeEntry(state: HomeEntryNavigation) {
  return state.initialPath === '/' && state.currentPath === '/' && !state.leftInitialHome;
}
