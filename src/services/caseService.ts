/**
 * Case Service
 * Database operations for dental cases
 * This service handles all direct database interactions for cases
 */

import { v4 as uuid } from 'uuid';
import { db } from '@/lib/supabase';
import type { DbCase, DbCaseHistoryWithCase } from '@/types/database';
import type { 
  Case, 
  CreateCaseInput, 
  UpdateCaseInput, 
  CaseStage,
  Department,
} from '@/types/case';
import { STAGE_NAMES } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Get current user name from storage
 */
function getCurrentUserName(): string {
  if (typeof window === 'undefined') return 'System';
  
  const tmp = sessionStorage.getItem('tempUserName');
  if (tmp) return tmp;
  
  const perm = localStorage.getItem('userName');
  if (perm) return perm;
  
  if (sessionStorage.getItem('bypassUser') !== null) return '';
  
  return 'Unknown';
}

/**
 * Map department for database storage
 * "Digital" is stored as "General" in the database
 */
function mapDepartmentToDb(dept: Department): 'General' | 'Metal' | 'C&B' {
  return dept === 'Digital' ? 'General' : dept;
}

/**
 * Get stage from modifiers array
 */
export function getStageFromModifiers(modifiers: string[]): CaseStage | undefined {
  for (const mod of modifiers) {
    if (mod.startsWith('stage-')) {
      const stage = mod.replace('stage-', '') as CaseStage;
      if (['design', 'production', 'finishing', 'qc'].includes(stage)) {
        return stage;
      }
    }
  }
  return undefined;
}

/**
 * Map database record to UI Case object
 */
export function mapDbToCase(rec: DbCase): Case {
  const mods = rec.modifiers ?? [];
  return {
    ...rec,
    department: rec.department,
    rush: mods.includes('rush'),
    hold: mods.includes('hold'),
    stage2: mods.includes('stage2'),
    priority: rec.priority ?? false,
    caseNumber: rec.casenumber,
    caseType: mods.includes('bbs') 
      ? 'bbs' 
      : mods.includes('flex') 
        ? 'flex' 
        : 'general',
    stage: getStageFromModifiers(mods),
  };
}

// ═══════════════════════════════════════════════════════════
// HISTORY LOGGING
// ═══════════════════════════════════════════════════════════

/**
 * Log an action to case history
 */
export async function logCase(caseId: string, action: string): Promise<void> {
  const { error } = await db.from('case_history').insert({
    id: uuid(),
    case_id: caseId,
    action,
    user_name: getCurrentUserName(),
  });
  
  if (error) {
    console.error('Failed to log case action:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// CASE CRUD
// ═══════════════════════════════════════════════════════════

/**
 * Create a new case
 */
export async function addCase(input: CreateCaseInput): Promise<{ data: Case | null; error: Error | null }> {
  const {
    caseNumber,
    department,
    due,
    priority = false,
    rush = false,
    hold = false,
    caseType = 'general',
    needsRepair = false,
  } = input;

  // Build modifiers array
  const modifiers: string[] = [];
  if (rush) modifiers.push('rush');
  if (hold) modifiers.push('hold');
  if (caseType === 'bbs') modifiers.push('bbs');
  if (caseType === 'flex') modifiers.push('flex');
  
  // Set initial stage for Digital cases
  if (department === 'Digital') {
    modifiers.push(needsRepair ? 'stage-finishing' : 'stage-design');
  }

  const id = uuid();
  
  const { data, error } = await db
    .from('cases')
    .insert({
      id,
      casenumber: caseNumber.trim(),
      department: mapDepartmentToDb(department),
      priority,
      modifiers,
      due: `${due}T00:00:00Z`,
      completed: false,
      archived: false,
      archived_at: null,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // Log creation
  if (needsRepair && department === 'Digital') {
    await logCase(id, 'Case created and sent directly to Finishing for repair');
  } else {
    await logCase(id, 'Case created');
  }

  return { data: mapDbToCase(data), error: null };
}

/**
 * Update an existing case
 */
export async function updateCase(input: UpdateCaseInput): Promise<{ data: Case | null; error: Error | null }> {
  const { id } = input;

  // Fetch current state
  const { data: prev, error: fetchError } = await db
    .from('cases')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !prev) {
    return { data: null, error: new Error('Case not found') };
  }

  // Preserve stage modifiers and stats-exclude modifiers
  const preservedModifiers = (prev.modifiers ?? []).filter(
    (m: string) => m.startsWith('stage-') || m.startsWith('stats-exclude')
  );

  // Build new modifiers
  const newModifiers: string[] = input.modifiers ?? [
    ...(input.rush ? ['rush'] : []),
    ...(input.hold ? ['hold'] : []),
    ...(input.caseType === 'bbs' ? ['bbs'] : []),
    ...(input.caseType === 'flex' ? ['flex'] : []),
    ...((prev.modifiers ?? []).includes('stage2') ? ['stage2'] : []),
    ...preservedModifiers,
  ];

  const nextRow = {
    casenumber: (input.caseNumber ?? prev.casenumber).trim(),
    department: input.department 
      ? mapDepartmentToDb(input.department)
      : prev.department,
    priority: input.priority ?? prev.priority,
    modifiers: newModifiers,
    due: `${input.due ?? prev.due.slice(0, 10)}T00:00:00Z`,
  };

  const { data, error } = await db
    .from('cases')
    .update(nextRow)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  // Log changes
  await logChanges(id, prev, nextRow, newModifiers);

  return { data: mapDbToCase(data), error: null };
}

/**
 * Log changes between old and new case state
 */
async function logChanges(
  id: string,
  prev: DbCase,
  next: { casenumber: string; department: string; priority: boolean; modifiers: string[]; due: string },
  newMods: string[]
): Promise<void> {
  const logs: string[] = [];
  const prevMods = prev.modifiers ?? [];

  const diff = (flag: string) => ({
    was: prevMods.includes(flag),
    now: newMods.includes(flag),
  });

  // Check stage2 change
  const stage2Diff = diff('stage2');
  if (stage2Diff.was !== stage2Diff.now) {
    logs.push(stage2Diff.now ? 'Moved to Stage 2' : 'Moved back to Stage 1');
  }

  // Check modifier changes
  for (const flag of ['rush', 'hold', 'bbs', 'flex']) {
    const d = diff(flag);
    if (d.was !== d.now) {
      logs.push(d.now ? `${flag} added` : `${flag} removed`);
    }
  }

  // Check priority change
  if (prev.priority !== next.priority) {
    logs.push(next.priority ? 'Priority added' : 'Priority removed');
  }

  // Check case number change
  if (prev.casenumber !== next.casenumber) {
    logs.push(`Case # changed from ${prev.casenumber} to ${next.casenumber}`);
  }

  // Check department change
  if (prev.department !== next.department) {
    logs.push(`Department changed from ${prev.department} to ${next.department}`);
  }

  // Check due date change
  if (prev.due !== next.due) {
    logs.push(`Due changed from ${prev.due.slice(0, 10)} to ${next.due.slice(0, 10)}`);
  }

  // Log all changes
  for (const log of logs) {
    await logCase(id, log);
  }
}

/**
 * Delete a case permanently
 */
export async function removeCase(id: string): Promise<{ error: Error | null }> {
  const { error } = await db.from('cases').delete().eq('id', id);
  return { error: error ? new Error(error.message) : null };
}

// ═══════════════════════════════════════════════════════════
// TOGGLE OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Toggle priority flag
 */
export async function togglePriority(caseItem: { id: string; priority: boolean }): Promise<void> {
  const newPriority = !caseItem.priority;
  await db.from('cases').update({ priority: newPriority }).eq('id', caseItem.id);
  await logCase(caseItem.id, newPriority ? 'Priority added' : 'Priority removed');
}

/**
 * Toggle rush modifier
 */
export async function toggleRush(caseItem: { id: string; modifiers: string[] }): Promise<void> {
  const mods = new Set(caseItem.modifiers);
  const wasRush = mods.has('rush');
  wasRush ? mods.delete('rush') : mods.add('rush');
  
  await db.from('cases').update({ modifiers: [...mods] }).eq('id', caseItem.id);
  await logCase(caseItem.id, wasRush ? 'rush removed' : 'rush added');
}

/**
 * Toggle hold modifier
 */
export async function toggleHold(caseItem: { id: string; modifiers: string[] }): Promise<void> {
  const mods = new Set(caseItem.modifiers);
  const wasHold = mods.has('hold');
  wasHold ? mods.delete('hold') : mods.add('hold');
  
  await db.from('cases').update({ modifiers: [...mods] }).eq('id', caseItem.id);
  await logCase(caseItem.id, wasHold ? 'hold removed' : 'hold added');
}

/**
 * Toggle completed status
 */
export async function toggleComplete(id: string, currentCompleted: boolean): Promise<void> {
  const newCompleted = !currentCompleted;
  await db.from('cases').update({ completed: newCompleted }).eq('id', id);
  await logCase(id, newCompleted ? 'Marked done' : 'Undo done');
}

/**
 * Toggle stage2 modifier
 */
export async function toggleStage2(caseItem: { id: string; modifiers: string[] }): Promise<void> {
  const mods = new Set(caseItem.modifiers);
  const wasStage2 = mods.has('stage2');
  wasStage2 ? mods.delete('stage2') : mods.add('stage2');
  
  await db.from('cases').update({ modifiers: [...mods] }).eq('id', caseItem.id);
  await logCase(caseItem.id, wasStage2 ? 'Moved back to Stage 1' : 'Moved to Stage 2');
}

// ═══════════════════════════════════════════════════════════
// STAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════

/**
 * Update case stage
 */
export async function updateCaseStage(
  caseItem: { id: string; modifiers: string[] },
  newStage: CaseStage | null,
  isRepair = false
): Promise<void> {
  const { id, modifiers } = caseItem;

  // Get current stage for logging
  const currentStage = getStageFromModifiers(modifiers);

  // Remove existing stage modifiers, keep others
  const filteredMods = modifiers.filter((m) => !m.startsWith('stage-'));

  // Add new stage if specified
  if (newStage) {
    filteredMods.push(`stage-${newStage}`);
  }

  await db.from('cases').update({ modifiers: filteredMods }).eq('id', id);

  // Log the stage change
  if (isRepair) {
    await logCase(id, 'Sent for repair - moved directly to Finishing stage');
  } else if (newStage && currentStage) {
    const fromName = STAGE_NAMES[currentStage] || currentStage;
    const toName = STAGE_NAMES[newStage];
    await logCase(id, `Moved from ${fromName} to ${toName} stage`);
  } else if (newStage) {
    await logCase(id, `Moved to ${STAGE_NAMES[newStage]} stage`);
  }
}

// ═══════════════════════════════════════════════════════════
// ARCHIVE OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Archive multiple cases
 */
export async function archiveCases(caseIds: string[]): Promise<{ error: Error | null }> {
  const { error } = await db
    .from('cases')
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
    })
    .in('id', caseIds);

  if (!error) {
    for (const id of caseIds) {
      await logCase(id, 'Case archived');
    }
  }

  return { error: error ? new Error(error.message) : null };
}

/**
 * Restore a case from archive
 */
export async function restoreCase(caseId: string): Promise<{ error: Error | null }> {
  const { error } = await db
    .from('cases')
    .update({
      archived: false,
      archived_at: null,
    })
    .eq('id', caseId);

  if (!error) {
    await logCase(caseId, 'Case restored from archive');
  }

  return { error: error ? new Error(error.message) : null };
}

// ═══════════════════════════════════════════════════════════
// STATISTICS EXCLUSION
// ═══════════════════════════════════════════════════════════

/**
 * Toggle case exclusion from statistics
 */
export async function toggleCaseExclusion(
  caseId: string,
  stage: string | null = null,
  reason: string | null = null
): Promise<{ error: Error | null; isExcluded: boolean }> {
  // Fetch current case
  const { data: currentCase, error: fetchError } = await db
    .from('cases')
    .select('modifiers')
    .eq('id', caseId)
    .single();

  if (fetchError || !currentCase) {
    return { error: new Error('Case not found'), isExcluded: false };
  }

  const currentModifiers = currentCase.modifiers ?? [];
  
  // Remove existing exclusion modifiers
  const filteredModifiers = currentModifiers.filter(
    (m: string) => !m.startsWith('stats-exclude')
  );

  // Check if currently excluded
  const isCurrentlyExcluded = currentModifiers.some(
    (m: string) =>
      m === 'stats-exclude' ||
      m === 'stats-exclude:all' ||
      (stage && m === `stats-exclude:${stage}`)
  );

  let action: string;
  
  if (isCurrentlyExcluded) {
    // Include the case
    action = stage
      ? `Included in ${stage} stage statistics`
      : 'Included in all statistics';
  } else {
    // Exclude the case
    if (stage) {
      filteredModifiers.push(`stats-exclude:${stage}`);
      action = `Excluded from ${stage} stage statistics`;
    } else {
      filteredModifiers.push('stats-exclude:all');
      action = 'Excluded from all statistics';
    }

    if (reason) {
      filteredModifiers.push(`stats-exclude-reason:${reason}`);
    }
  }

  const { error: updateError } = await db
    .from('cases')
    .update({ modifiers: filteredModifiers })
    .eq('id', caseId);

  if (!updateError) {
    await logCase(caseId, action);
  }

  return {
    error: updateError ? new Error(updateError.message) : null,
    isExcluded: !isCurrentlyExcluded,
  };
}

/**
 * Batch toggle exclusions for multiple cases
 */
export async function batchToggleExclusions(
  caseIds: string[],
  exclude: boolean,
  stage: string | null = null,
  reason: string | null = null
): Promise<{ caseId: string; success: boolean; error?: Error }[]> {
  const results: { caseId: string; success: boolean; error?: Error }[] = [];

  for (const caseId of caseIds) {
    const { data: currentCase } = await db
      .from('cases')
      .select('modifiers')
      .eq('id', caseId)
      .single();

    if (!currentCase) {
      results.push({ caseId, success: false, error: new Error('Case not found') });
      continue;
    }

    const currentModifiers = currentCase.modifiers ?? [];
    let newModifiers = currentModifiers.filter(
      (m: string) => !m.startsWith('stats-exclude')
    );

    if (exclude) {
      newModifiers.push(stage ? `stats-exclude:${stage}` : 'stats-exclude:all');
      if (reason) {
        newModifiers.push(`stats-exclude-reason:${reason}`);
      }
    }

    const { error } = await db
      .from('cases')
      .update({ modifiers: newModifiers })
      .eq('id', caseId);

    if (!error) {
      const action = exclude
        ? stage
          ? `Excluded from ${stage} stage statistics`
          : 'Excluded from all statistics'
        : stage
          ? `Included in ${stage} stage statistics`
          : 'Included in all statistics';
      await logCase(caseId, action);
    }

    results.push({ caseId, success: !error, error: error ? new Error(error.message) : undefined });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// QUERY OPERATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Check for duplicate case numbers
 */
export async function checkForDuplicates(
  caseNumber: string,
  excludeId?: string
): Promise<Case[]> {
  const searchTerm = caseNumber.trim().toLowerCase();
  const caseNumPart = searchTerm.split(' ')[0];

  let query = db
    .from('cases')
    .select('*')
    .eq('archived', false)
    .eq('completed', false);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }

  // Filter for potential duplicates
  const duplicates = (data ?? []).filter((caseItem) => {
    const itemCaseNum = caseItem.casenumber.toLowerCase().split(' ')[0];
    return itemCaseNum === caseNumPart;
  });

  return duplicates.map(mapDbToCase);
}

/**
 * Fetch all case history
 */
export async function fetchAllHistory(): Promise<{ data: DbCaseHistoryWithCase[] | null; error: Error | null }> {
  const { data, error } = await db
    .from('case_history')
    .select('action,created_at,user_name,cases:case_id(casenumber)')
    .order('created_at', { ascending: false });

  return {
    data: data as DbCaseHistoryWithCase[] | null,
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Fetch all non-archived cases
 */
export async function fetchCases(): Promise<{ data: Case[] | null; error: Error | null }> {
  const { data, error } = await db
    .from('cases')
    .select('*')
    .eq('archived', false)
    .order('due');

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return {
    data: (data ?? []).map(mapDbToCase),
    error: null,
  };
}

/**
 * Fetch archived cases
 */
export async function fetchArchivedCases(searchQuery = ''): Promise<{ data: Case[] | null; error: Error | null }> {
  let query = db
    .from('cases')
    .select('*')
    .eq('archived', true)
    .order('archived_at', { ascending: false });

  if (searchQuery) {
    query = query.ilike('casenumber', `%${searchQuery}%`);
  }

  const { data, error } = await query;

  return {
    data: data ? data.map(mapDbToCase) : null,
    error: error ? new Error(error.message) : null,
  };
}
