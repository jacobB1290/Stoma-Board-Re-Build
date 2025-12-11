'use client';

/**
 * Dispatch Context
 * Connects the action dispatcher to React contexts
 * This is the bridge between the action system and React state
 */

import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { dispatcher, createLoggingMiddleware } from '@/actions/dispatcher';
import { useData } from './DataContext';
import { useUser } from './UserContext';
import { useUI } from './UIContext';
import type { ActionType, ActionPayloads, DispatchResult, Action, ActionContext } from '@/types/actions';

// Import services for registering handlers
import * as caseService from '@/services/caseService';
import { fetchActiveUsers } from '@/services/userService';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface DispatchContextValue {
  /** Dispatch a single action */
  dispatch: <T extends ActionType>(type: T, payload: ActionPayloads[T]) => Promise<DispatchResult<T>>;
  /** Dispatch multiple actions in sequence */
  dispatchBatch: (actions: Action[]) => Promise<DispatchResult<ActionType>[]>;
  /** Check if dispatcher is ready */
  isReady: boolean;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

const DispatchContext = createContext<DispatchContextValue | null>(null);

// ═══════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const data = useData();
  const user = useUser();
  const ui = useUI();
  const isReadyRef = useRef(false);

  // ─── Register handlers on mount ──────────────────────────
  useEffect(() => {
    // Add logging middleware in development
    if (process.env.NODE_ENV === 'development') {
      dispatcher.use(createLoggingMiddleware(true));
    }

    // Create action context
    const context: ActionContext = {
      getRowById: (id: string) => data.getRowById(id),
      getCurrentUser: () => user.name,
    };
    dispatcher.setContext(context);

    // ═══════════════════════════════════════════════════════
    // REGISTER CASE HANDLERS
    // ═══════════════════════════════════════════════════════

    dispatcher.register('case.create', async (payload) => {
      const result = await caseService.addCase(payload);
      if (result.error) throw result.error;
      return result.data!;
    });

    dispatcher.register('case.update', async (payload) => {
      const result = await caseService.updateCase(payload);
      if (result.error) throw result.error;
      return result.data!;
    });

    dispatcher.register('case.delete', async ({ id }) => {
      const result = await caseService.removeCase(id);
      if (result.error) throw result.error;
    });

    dispatcher.register('case.toggle_priority', async ({ id }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.togglePriority({ id: row.id, priority: row.priority });
    });

    dispatcher.register('case.toggle_rush', async ({ id }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.toggleRush({ id: row.id, modifiers: row.modifiers });
    });

    dispatcher.register('case.toggle_hold', async ({ id }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.toggleHold({ id: row.id, modifiers: row.modifiers });
    });

    dispatcher.register('case.toggle_complete', async ({ id }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.toggleComplete(id, row.completed);
    });

    dispatcher.register('case.toggle_stage2', async ({ id }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.toggleStage2({ id: row.id, modifiers: row.modifiers });
    });

    dispatcher.register('case.change_stage', async ({ id, stage, isRepair }) => {
      const row = data.getRowById(id);
      if (!row) throw new Error('Case not found');
      await caseService.updateCaseStage({ id: row.id, modifiers: row.modifiers }, stage, isRepair);
    });

    dispatcher.register('case.archive', async ({ ids }) => {
      const result = await caseService.archiveCases(ids);
      if (result.error) throw result.error;
    });

    dispatcher.register('case.restore', async ({ id }) => {
      const result = await caseService.restoreCase(id);
      if (result.error) throw result.error;
    });

    dispatcher.register('case.toggle_stats_exclusion', async ({ id, stage, reason }) => {
      const result = await caseService.toggleCaseExclusion(id, stage ?? null, reason ?? null);
      if (result.error) throw result.error;
      return { isExcluded: result.isExcluded };
    });

    dispatcher.register('case.batch_toggle_exclusions', async ({ ids, exclude, stage, reason }) => {
      return await caseService.batchToggleExclusions(ids, exclude, stage ?? null, reason ?? null);
    });

    // ═══════════════════════════════════════════════════════
    // REGISTER USER HANDLERS
    // ═══════════════════════════════════════════════════════

    dispatcher.register('user.set_name', async ({ name }) => {
      user.saveName(name);
    });

    dispatcher.register('user.switch', async () => {
      user.switchUser();
    });

    // ═══════════════════════════════════════════════════════
    // REGISTER UI HANDLERS
    // ═══════════════════════════════════════════════════════

    dispatcher.register('ui.set_department', async ({ department }) => {
      ui.setActiveDepartment(department);
    });

    dispatcher.register('ui.set_theme', async ({ theme }) => {
      ui.setTheme(theme);
    });

    dispatcher.register('ui.open_editor', async ({ id }) => {
      ui.openEditor(id);
    });

    dispatcher.register('ui.close_editor', async () => {
      ui.closeEditor();
    });

    dispatcher.register('ui.open_settings', async ({ tab }) => {
      ui.openSettings(tab);
    });

    dispatcher.register('ui.navigate', async ({ view }) => {
      ui.navigate(view);
    });

    // ═══════════════════════════════════════════════════════
    // REGISTER QUERY HANDLERS
    // ═══════════════════════════════════════════════════════

    dispatcher.register('query.get_case', async ({ id }) => {
      return data.getRowById(id) ?? null;
    });

    dispatcher.register('query.search_cases', async (filters) => {
      let results = data.allRows;
      
      if (filters.caseNumber) {
        const search = filters.caseNumber.toLowerCase();
        results = results.filter(r => r.caseNumber.toLowerCase().includes(search));
      }
      
      if (filters.department) {
        const dept = filters.department === 'Digital' ? 'General' : filters.department;
        results = results.filter(r => r.department === dept);
      }
      
      if (filters.status === 'completed') {
        results = results.filter(r => r.completed);
      } else if (filters.status === 'overdue') {
        const today = new Date().toISOString().slice(0, 10);
        results = results.filter(r => !r.completed && r.due.slice(0, 10) < today);
      } else if (filters.status === 'on_hold') {
        results = results.filter(r => r.hold);
      }
      
      return results;
    });

    dispatcher.register('query.get_overdue', async ({ department }) => {
      const today = new Date().toISOString().slice(0, 10);
      let results = data.allRows.filter(r => !r.completed && r.due.slice(0, 10) < today);
      
      if (department) {
        const dept = department === 'Digital' ? 'General' : department;
        results = results.filter(r => r.department === dept);
      }
      
      return results;
    });

    dispatcher.register('query.get_on_hold', async ({ department }) => {
      let results = data.allRows.filter(r => r.hold);
      
      if (department) {
        const dept = department === 'Digital' ? 'General' : department;
        results = results.filter(r => r.department === dept);
      }
      
      return results;
    });

    dispatcher.register('query.get_cases_by_date', async ({ date, department }) => {
      let results = data.allRows.filter(r => r.due.slice(0, 10) === date);
      
      if (department) {
        const dept = department === 'Digital' ? 'General' : department;
        results = results.filter(r => r.department === dept);
      }
      
      return results;
    });

    dispatcher.register('query.check_duplicates', async ({ caseNumber, excludeId }) => {
      return await caseService.checkForDuplicates(caseNumber, excludeId);
    });

    dispatcher.register('query.get_history', async ({ caseId, limit }) => {
      const result = await caseService.fetchAllHistory();
      if (result.error) throw result.error;
      
      let history = result.data ?? [];
      
      if (caseId) {
        history = history.filter(h => h.case_id === caseId);
      }
      
      if (limit) {
        history = history.slice(0, limit);
      }
      
      return history;
    });

    dispatcher.register('query.get_active_users', async () => {
      return await fetchActiveUsers();
    });

    // ═══════════════════════════════════════════════════════
    // REGISTER DATA HANDLERS
    // ═══════════════════════════════════════════════════════

    dispatcher.register('data.refresh', async () => {
      await data.refreshCases();
    });

    isReadyRef.current = true;
  }, [data, user, ui]);

  // ─── Dispatch function ───────────────────────────────────
  const dispatch = useCallback(<T extends ActionType>(
    type: T,
    payload: ActionPayloads[T]
  ): Promise<DispatchResult<T>> => {
    return dispatcher.dispatch({ type, payload });
  }, []);

  const dispatchBatch = useCallback((actions: Action[]): Promise<DispatchResult<ActionType>[]> => {
    return dispatcher.dispatchBatch(actions);
  }, []);

  // ─── Context value ───────────────────────────────────────
  const value: DispatchContextValue = {
    dispatch,
    dispatchBatch,
    isReady: isReadyRef.current,
  };

  return (
    <DispatchContext.Provider value={value}>
      {children}
    </DispatchContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════

export function useDispatch(): DispatchContextValue {
  const context = useContext(DispatchContext);
  if (!context) {
    throw new Error('useDispatch must be used within a DispatchProvider');
  }
  return context;
}

/**
 * Convenience hook for dispatching a single action
 */
export function useAction<T extends ActionType>(type: T) {
  const { dispatch } = useDispatch();
  return useCallback(
    (payload: ActionPayloads[T]) => dispatch(type, payload),
    [dispatch, type]
  );
}

export { DispatchContext };
