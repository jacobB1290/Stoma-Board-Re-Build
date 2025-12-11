/**
 * Case Helper Functions
 * 
 * SINGLE SOURCE OF TRUTH for case-related UI calculations.
 * Import these instead of defining inline in components.
 */

import type { Case, CaseStage } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// ROW BACKGROUND COLORS
// ═══════════════════════════════════════════════════════════

/**
 * Get row background color based on case type/modifiers
 * Uses CSS variables defined in globals.css
 */
export function getRowBackground(c: Case): string {
  if (c.stage2) return 'var(--row-stage2)';
  if (c.caseType === 'bbs') return 'var(--row-bbs)';
  if (c.caseType === 'flex') return 'var(--row-flex)';
  return 'var(--row-default)';
}

// ═══════════════════════════════════════════════════════════
// CASE NUMBER PARSING
// ═══════════════════════════════════════════════════════════

/**
 * Parse case number into ID and description parts
 * @returns [id, description]
 */
export function parseCaseNumber(caseNumber: string): [string, string] {
  const txt = caseNumber.replace(/[()]/g, '').replace(/\s*-\s*/, ' ').trim();
  const [id, ...rest] = txt.split(/\s+/);
  return [id, rest.join(' ')];
}

// ═══════════════════════════════════════════════════════════
// CASE RANKING (for sorting)
// ═══════════════════════════════════════════════════════════

/**
 * Get sort rank for a case (lower = higher priority)
 * Priority order: priority > rush > general > stage2(metal) > bbs > flex
 */
export function getCaseRank(r: Case): number {
  if (r.priority) return 0;
  if (r.rush) return 1;
  if (r.stage2 && r.department === 'Metal') return 3;
  if (r.caseType === 'bbs') return 4;
  if (r.caseType === 'flex') return 5;
  return 2;
}

/**
 * Compare function for sorting cases
 * Sorts by: rank → due date → created date
 */
export function compareCases(a: Case, b: Case): number {
  const ra = getCaseRank(a);
  const rb = getCaseRank(b);
  if (ra !== rb) return ra - rb;
  
  const da = new Date(a.due);
  const db = new Date(b.due);
  if (da < db) return -1;
  if (da > db) return 1;
  
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

// ═══════════════════════════════════════════════════════════
// STAGE HELPERS
// ═══════════════════════════════════════════════════════════

/** Get current stage from case (defaults to 'design') */
export function getCaseStage(c: Case): CaseStage {
  return c.stage || 'design';
}

/** Check if case is in QC stage */
export function isInQCStage(c: Case): boolean {
  return c.stage === 'qc';
}

/** Get next stage for Digital cases */
export function getNextStage(current: CaseStage): CaseStage | null {
  const order: CaseStage[] = ['design', 'production', 'finishing', 'qc'];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

/** Get previous stage for Digital cases */
export function getPreviousStage(current: CaseStage): CaseStage | null {
  const order: CaseStage[] = ['design', 'production', 'finishing', 'qc'];
  const idx = order.indexOf(current);
  return idx > 0 ? order[idx - 1] : null;
}

// ═══════════════════════════════════════════════════════════
// GROUPING HELPERS
// ═══════════════════════════════════════════════════════════

export interface StageGroups {
  design: Case[];
  production: Case[];
  finishing: Case[];
  qc: Case[];
  other: Case[];
}

export interface MetalStageGroups {
  development: Case[];
  finishing: Case[];
  other: Case[];
}

/**
 * Group Digital cases by stage
 */
export function groupDigitalCasesByStage(rows: Case[]): StageGroups {
  const groups: StageGroups = {
    design: [],
    production: [],
    finishing: [],
    qc: [],
    other: [],
  };

  rows.forEach((row) => {
    if (row.department === 'General' && !row.completed) {
      const stage = getCaseStage(row);
      if (stage in groups) {
        (groups[stage as keyof typeof groups] as Case[]).push(row);
      } else {
        groups.other.push(row);
      }
    } else {
      groups.other.push(row);
    }
  });

  return groups;
}

/**
 * Group Metal cases by stage (development = not stage2, finishing = stage2)
 */
export function groupMetalCasesByStage(rows: Case[]): MetalStageGroups {
  const groups: MetalStageGroups = {
    development: [],
    finishing: [],
    other: [],
  };

  rows.forEach((row) => {
    if (row.department === 'Metal' && !row.completed) {
      if (!row.stage2) {
        groups.development.push(row);
      } else {
        groups.finishing.push(row);
      }
    } else {
      groups.other.push(row);
    }
  });

  return groups;
}

// ═══════════════════════════════════════════════════════════
// PRIORITY IDS HELPER
// ═══════════════════════════════════════════════════════════

/**
 * Get array of priority case IDs from sorted rows
 * Returns consecutive priority cases from the start of the sorted list
 */
export function getPriorityIds(rows: Case[]): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (r.priority && !r.completed) {
      ids.push(r.id);
    } else {
      break; // Stop at first non-priority case
    }
  }
  return ids;
}
