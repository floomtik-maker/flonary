import { createContext, useContext } from 'react';
import type { Backend } from './backend';
import { httpBackend } from './http';
import { demoBackend } from '../demo/demoBackend';

const MODE_KEY = 'flonary-mode';

/** Build-time demo (VITE_DEMO=1) or runtime demo chosen from the login page. */
export function isDemo(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  try {
    return localStorage.getItem(MODE_KEY) === 'demo';
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(MODE_KEY, 'demo');
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

export const forcedDemo = import.meta.env.VITE_DEMO === '1';

export function getBackend(): Backend {
  return isDemo() ? demoBackend : httpBackend;
}

export const BackendContext = createContext<Backend>(httpBackend);
export const useBackend = () => useContext(BackendContext);
