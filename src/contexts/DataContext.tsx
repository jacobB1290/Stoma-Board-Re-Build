'use client';

/**
 * Data Context
 * Manages case data with realtime updates from Supabase
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { db } from '@/lib/supabase';
import {
  fetchCases,
  mapDbToCase,
  togglePriority as svcTogglePriority,
  toggleRush as svcToggleRush,
  toggleHold as svcToggleHold,
  toggleComplete as svcToggleComplete,
  toggleStage2 as svcToggleStage2,
  updateCaseStage as svcUpdateCaseStage,
  addCase,
  updateCase,
  removeCase as svcRemoveCase,
  toggleCaseExclusion as svcToggleCaseExclusion,
  batchToggleExclusions as svcBatchToggleExclusions,
} from '@/services/caseService';
import type { Case, CreateCaseInput, UpdateCaseInput, CaseStage, Department } from '@/types/case';
import type { DbCase } from '@/types/database';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════
// UPDATE ROW HANDLING (special "update" case numbers)
// ═══════════════════════════════════════════════════════════

function flagUpdatePending(record: DbCase): void {
  if (typeof window === 'undefined') return;

  const modifiers = record.modifiers || [];
  const priority =
    modifiers.find((m) => ['normal', 'high', 'force'].includes(m)) || 'normal';
  const notes =
    modifiers.find((m) => !['normal', 'high', 'force'].includes(m)) || '';

  // Force update - reload immediately without any UI
  if (priority === 'force') {
    setTimeout(() => {
      window.location.reload();
    }, 500);
    return;
  }

  // For normal and high priority, show the notification
  if (!document.documentElement.classList.contains('update-pending')) {
    document.documentElement.classList.add('update-pending');

    if (notes) {
      localStorage.setItem('updateNotes', notes);
    }
    localStorage.setItem('updatePriority', priority);

    if (priority === 'high') {
      document.documentElement.classList.add('update-critical');
    } else {
      document.documentElement.classList.remove('update-critical');
    }

    window.dispatchEvent(
      new CustomEvent('update-available', {
        detail: {
          priority,
          notes,
          timestamp: Date.now(),
        },
      })
    );
  }
}

async function purgeUpdateRows(): Promise<void> {
  await db.from('cases').delete().ilike('casenumber', 'update');
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface DataContextValue {
  /** All non-archived cases (filtered by activeDept if set) */
  rows: Case[];
  /** All cases regardless of department filter */
  allRows: Case[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  
  // Actions
  togglePriority: (row: Case) => Promise<void>;
  toggleRush: (row: Case) => Promise<void>;
  toggleHold: (row: Case) => Promise<void>;
  toggleComplete: (id: string, currentCompleted: boolean) => Promise<void>;
  toggleStage2: (row: Case) => Promise<void>;
  updateCaseStage: (row: Case, newStage: CaseStage | null, isRepair?: boolean) => Promise<void>;
  addOrUpdate: (payload: CreateCaseInput | UpdateCaseInput, editId?: string) => Promise<{ error: Error | null }>;
  removeCase: (id: string) => Promise<void>;
  refreshCases: () => Promise<void>;
  toggleCaseExclusion: (caseId: string, stage?: string | null, reason?: string | null) => Promise<{ isExcluded: boolean }>;
  batchToggleExclusions: (caseIds: string[], exclude: boolean, stage?: string | null, reason?: string | null) => Promise<{ caseId: string; success: boolean }[]>;
  
  // Helpers
  getRowById: (id: string) => Case | undefined;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

const DataContext = createContext<DataContextValue | null>(null);

// ═══════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════

interface DataProviderProps {
  children: React.ReactNode;
  activeDept?: Department | null;
}

export function DataProvider({ children, activeDept }: DataProviderProps) {
  const [allRows, setAllRows] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isInitialLoadRef = useRef(true);

  // ─── Initial fetch ───────────────────────────────────────
  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      const { data, error: fetchError } = await fetchCases();
      
      if (fetchError) {
        setError(fetchError);
        setLoading(false);
        return;
      }

      // Filter out "update" rows and handle them
      const filtered: Case[] = [];
      let hasUpdateRows = false;

      for (const row of data ?? []) {
        if (row.caseNumber?.trim().toLowerCase() === 'update') {
          // Need to access the original db record for update handling
          // The mapped Case has caseNumber, but we need casenumber
          flagUpdatePending(row as unknown as DbCase);
          hasUpdateRows = true;
        } else {
          filtered.push(row);
        }
      }

      if (hasUpdateRows) {
        purgeUpdateRows();
      }

      setAllRows(filtered);
      setLoading(false);
      isInitialLoadRef.current = false;
    }

    loadCases();
  }, []);

  // ─── Realtime subscription ───────────────────────────────
  useEffect(() => {
    const channel = db
      .channel('cases-realtime')
      .on<DbCase>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cases' },
        (payload: RealtimePostgresChangesPayload<DbCase>) => {
          setAllRows((current) => {
            const newRecord = payload.new as DbCase | undefined;
            const oldRecord = payload.old as DbCase | undefined;

            // Handle archived cases - remove from list
            if (newRecord && newRecord.archived) {
              return current.filter((r) => r.id !== newRecord.id);
            }

            // Handle "update" rows
            if (newRecord && newRecord.casenumber?.trim().toLowerCase() === 'update') {
              flagUpdatePending(newRecord);
              purgeUpdateRows();
              return current;
            }

            // Handle DELETE
            if (payload.eventType === 'DELETE' && oldRecord) {
              return current.filter((r) => r.id !== oldRecord.id);
            }

            // Handle INSERT/UPDATE
            if (newRecord && newRecord.id) {
              const newRow = mapDbToCase(newRecord);
              const existingIndex = current.findIndex((r) => r.id === newRow.id);
              
              if (existingIndex === -1) {
                // New row - add to list
                return [...current, newRow];
              } else {
                // Updated row - replace in list
                const updated = [...current];
                updated[existingIndex] = newRow;
                return updated;
              }
            }

            return current;
          });
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, []);

  // ─── Actions ─────────────────────────────────────────────
  const togglePriority = useCallback(async (row: Case) => {
    await svcTogglePriority({ id: row.id, priority: row.priority });
  }, []);

  const toggleRush = useCallback(async (row: Case) => {
    await svcToggleRush({ id: row.id, modifiers: row.modifiers });
  }, []);

  const toggleHold = useCallback(async (row: Case) => {
    await svcToggleHold({ id: row.id, modifiers: row.modifiers });
  }, []);

  const toggleComplete = useCallback(async (id: string, currentCompleted: boolean) => {
    await svcToggleComplete(id, currentCompleted);
  }, []);

  const toggleStage2 = useCallback(async (row: Case) => {
    await svcToggleStage2({ id: row.id, modifiers: row.modifiers });
  }, []);

  const updateCaseStage = useCallback(async (row: Case, newStage: CaseStage | null, isRepair = false) => {
    await svcUpdateCaseStage({ id: row.id, modifiers: row.modifiers }, newStage, isRepair);
  }, []);

  const addOrUpdate = useCallback(async (
    payload: CreateCaseInput | UpdateCaseInput,
    editId?: string
  ): Promise<{ error: Error | null }> => {
    if (editId) {
      const result = await updateCase({ id: editId, ...payload } as UpdateCaseInput);
      return { error: result.error };
    } else {
      const result = await addCase(payload as CreateCaseInput);
      return { error: result.error };
    }
  }, []);

  const removeCase = useCallback(async (id: string) => {
    const { error: removeError } = await svcRemoveCase(id);
    if (!removeError) {
      setAllRows((current) => current.filter((r) => r.id !== id));
    }
  }, []);

  const refreshCases = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await fetchCases();
    
    if (fetchError) {
      setError(fetchError);
    } else {
      const filtered = (data ?? []).filter(
        (row) => row.caseNumber?.trim().toLowerCase() !== 'update'
      );
      setAllRows(filtered);
    }
    setLoading(false);
  }, []);

  const toggleCaseExclusion = useCallback(async (
    caseId: string,
    stage: string | null = null,
    reason: string | null = null
  ): Promise<{ isExcluded: boolean }> => {
    const result = await svcToggleCaseExclusion(caseId, stage, reason);
    if (!result.error) {
      await refreshCases();
    }
    return { isExcluded: result.isExcluded };
  }, [refreshCases]);

  const batchToggleExclusions = useCallback(async (
    caseIds: string[],
    exclude: boolean,
    stage: string | null = null,
    reason: string | null = null
  ): Promise<{ caseId: string; success: boolean }[]> => {
    const results = await svcBatchToggleExclusions(caseIds, exclude, stage, reason);
    await refreshCases();
    return results;
  }, [refreshCases]);

  const getRowById = useCallback((id: string): Case | undefined => {
    return allRows.find((r) => r.id === id);
  }, [allRows]);

  // ─── Filter by department ────────────────────────────────
  const rows = activeDept
    ? allRows.filter((r) => {
        // "Digital" is stored as "General" in the database
        if (activeDept === 'Digital') {
          return r.department === 'General';
        }
        return r.department === activeDept;
      })
    : allRows;

  // ─── Context value ───────────────────────────────────────
  const value: DataContextValue = {
    rows,
    allRows,
    loading,
    error,
    togglePriority,
    toggleRush,
    toggleHold,
    toggleComplete,
    toggleStage2,
    updateCaseStage,
    addOrUpdate,
    removeCase,
    refreshCases,
    toggleCaseExclusion,
    batchToggleExclusions,
    getRowById,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

/** Alias for backwards compatibility */
export const useMut = useData;

export { DataContext };
