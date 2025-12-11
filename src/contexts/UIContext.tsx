'use client';

/**
 * UI Context
 * Manages UI state like theme, active department, modals, etc.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Department } from '@/types/case';
import { STORAGE_KEYS } from '@/lib/constants';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type Theme = 'light' | 'dark' | 'system';
type View = 'board' | 'manage' | 'history' | 'archive';

interface UIContextValue {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  
  // Department filter
  activeDepartment: Department | null;
  setActiveDepartment: (dept: Department | null) => void;
  
  // Navigation
  currentView: View;
  navigate: (view: View) => void;
  
  // Editor
  editorOpen: boolean;
  editingCaseId: string | null;
  openEditor: (caseId?: string) => void;
  closeEditor: () => void;
  
  // Settings modal
  settingsOpen: boolean;
  settingsTab: 'user' | 'display' | 'system';
  openSettings: (tab?: 'user' | 'display' | 'system') => void;
  closeSettings: () => void;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

const UIContext = createContext<UIContextValue | null>(null);

// ═══════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════

interface UIProviderProps {
  children: React.ReactNode;
  defaultDepartment?: Department | null;
}

export function UIProvider({ children, defaultDepartment = 'Digital' }: UIProviderProps) {
  // Theme state
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Department state
  const [activeDepartment, setActiveDepartmentState] = useState<Department | null>(defaultDepartment);

  // Navigation state
  const [currentView, setCurrentView] = useState<View>('board');

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'user' | 'display' | 'system'>('user');

  // ─── Initialize theme from localStorage ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(STORAGE_KEYS.THEME) as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  // ─── Resolve theme (handle 'system' preference) ──────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function updateResolvedTheme() {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setResolvedTheme(prefersDark ? 'dark' : 'light');
      } else {
        setResolvedTheme(theme);
      }
    }

    updateResolvedTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateResolvedTheme);

    return () => {
      mediaQuery.removeEventListener('change', updateResolvedTheme);
    };
  }, [theme]);

  // ─── Apply theme to document ─────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  // ─── Actions ─────────────────────────────────────────────
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
    }
  }, []);

  const setActiveDepartment = useCallback((dept: Department | null) => {
    setActiveDepartmentState(dept);
  }, []);

  const navigate = useCallback((view: View) => {
    setCurrentView(view);
    // Close editor when navigating away from manage view
    if (view !== 'manage') {
      setEditorOpen(false);
      setEditingCaseId(null);
    }
  }, []);

  const openEditor = useCallback((caseId?: string) => {
    setEditingCaseId(caseId || null);
    setEditorOpen(true);
    // Switch to manage view if not already there
    if (currentView !== 'manage') {
      setCurrentView('manage');
    }
  }, [currentView]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingCaseId(null);
  }, []);

  const openSettings = useCallback((tab: 'user' | 'display' | 'system' = 'user') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  // ─── Context value ───────────────────────────────────────
  const value: UIContextValue = {
    theme,
    setTheme,
    resolvedTheme,
    activeDepartment,
    setActiveDepartment,
    currentView,
    navigate,
    editorOpen,
    editingCaseId,
    openEditor,
    closeEditor,
    settingsOpen,
    settingsTab,
    openSettings,
    closeSettings,
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════

export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export { UIContext };
