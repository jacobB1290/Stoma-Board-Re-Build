/**
 * Case Types - UI/Application layer types
 * These types represent how cases are used in the application
 */

import type { DbCase } from './database';

// ═══════════════════════════════════════════════════════════
// CASE TYPE (UI representation)
// ═══════════════════════════════════════════════════════════

export type CaseType = 'general' | 'bbs' | 'flex';

export type CaseStage = 'design' | 'production' | 'finishing' | 'qc';

export type Department = 'Digital' | 'Metal' | 'C&B' | 'General';

/**
 * Case as used in the UI - derived from DbCase
 * Includes computed/derived fields for easy access
 */
export interface Case extends DbCase {
  // Derived fields (computed from modifiers)
  rush: boolean;
  hold: boolean;
  stage2: boolean;
  caseType: CaseType;
  
  // Aliased field (casenumber → caseNumber for consistency)
  caseNumber: string;
  
  // Current stage (derived from stage-* modifiers)
  stage?: CaseStage;
}

// ═══════════════════════════════════════════════════════════
// CASE INPUT TYPES (for creating/updating)
// ═══════════════════════════════════════════════════════════

export interface CreateCaseInput {
  caseNumber: string;
  department: Department;
  due: string; // "YYYY-MM-DD"
  priority?: boolean;
  rush?: boolean;
  hold?: boolean;
  caseType?: CaseType;
  needsRepair?: boolean; // Digital cases - start in finishing if true
}

export interface UpdateCaseInput {
  id: string;
  caseNumber?: string;
  department?: Department;
  due?: string;
  priority?: boolean;
  rush?: boolean;
  hold?: boolean;
  caseType?: CaseType;
  modifiers?: string[]; // Direct modifier override
}

// ═══════════════════════════════════════════════════════════
// CASE FILTERS
// ═══════════════════════════════════════════════════════════

export type CaseStatus = 'active' | 'completed' | 'archived' | 'overdue' | 'on_hold';

export interface CaseFilters {
  department?: Department;
  status?: CaseStatus;
  caseNumber?: string;
  dueDate?: string;
  stage?: CaseStage;
}

// ═══════════════════════════════════════════════════════════
// STAGE NAMES (for display)
// ═══════════════════════════════════════════════════════════

export const STAGE_NAMES: Record<CaseStage, string> = {
  design: 'Design',
  production: 'Production',
  finishing: 'Finishing',
  qc: 'Quality Control',
};

export const DEPARTMENT_DISPLAY: Record<string, Department> = {
  General: 'Digital', // DB stores "General" for Digital department
  Metal: 'Metal',
  'C&B': 'C&B',
};
