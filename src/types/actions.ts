/**
 * Action System Types
 * Type definitions for the central action dispatcher
 */

import type { Case, CreateCaseInput, UpdateCaseInput, CaseFilters, CaseStage, Department } from './case';
import type { DbCaseHistoryWithCase } from './database';

// ═══════════════════════════════════════════════════════════
// ACTION TYPES (all possible actions)
// ═══════════════════════════════════════════════════════════

export type ActionType =
  // Case mutations
  | 'case.create'
  | 'case.update'
  | 'case.delete'
  | 'case.toggle_priority'
  | 'case.toggle_rush'
  | 'case.toggle_hold'
  | 'case.toggle_complete'
  | 'case.toggle_stage2'
  | 'case.change_stage'
  | 'case.archive'
  | 'case.restore'
  | 'case.toggle_stats_exclusion'
  | 'case.batch_toggle_exclusions'
  // User actions
  | 'user.set_name'
  | 'user.switch'
  // UI actions
  | 'ui.set_department'
  | 'ui.set_theme'
  | 'ui.open_editor'
  | 'ui.close_editor'
  | 'ui.open_settings'
  | 'ui.navigate'
  // Query actions (read-only)
  | 'query.get_case'
  | 'query.search_cases'
  | 'query.get_overdue'
  | 'query.get_on_hold'
  | 'query.get_cases_by_date'
  | 'query.check_duplicates'
  | 'query.get_history'
  | 'query.get_active_users'
  // Data actions
  | 'data.refresh';

// ═══════════════════════════════════════════════════════════
// ACTION PAYLOADS (type-safe payloads per action)
// ═══════════════════════════════════════════════════════════

export interface ActionPayloads {
  // Case mutations
  'case.create': CreateCaseInput;
  'case.update': UpdateCaseInput;
  'case.delete': { id: string };
  'case.toggle_priority': { id: string };
  'case.toggle_rush': { id: string };
  'case.toggle_hold': { id: string };
  'case.toggle_complete': { id: string };
  'case.toggle_stage2': { id: string };
  'case.change_stage': { id: string; stage: CaseStage; isRepair?: boolean };
  'case.archive': { ids: string[] };
  'case.restore': { id: string };
  'case.toggle_stats_exclusion': { id: string; stage?: string; reason?: string };
  'case.batch_toggle_exclusions': { ids: string[]; exclude: boolean; stage?: string; reason?: string };
  
  // User actions
  'user.set_name': { name: string };
  'user.switch': Record<string, never>;
  
  // UI actions
  'ui.set_department': { department: Department | null };
  'ui.set_theme': { theme: 'light' | 'dark' | 'system' };
  'ui.open_editor': { id?: string };
  'ui.close_editor': Record<string, never>;
  'ui.open_settings': { tab?: 'user' | 'display' | 'system' };
  'ui.navigate': { view: 'board' | 'manage' | 'history' | 'archive' };
  
  // Query actions
  'query.get_case': { id: string };
  'query.search_cases': CaseFilters;
  'query.get_overdue': { department?: Department };
  'query.get_on_hold': { department?: Department };
  'query.get_cases_by_date': { date: string; department?: Department };
  'query.check_duplicates': { caseNumber: string; excludeId?: string };
  'query.get_history': { caseId?: string; limit?: number };
  'query.get_active_users': Record<string, never>;
  
  // Data actions
  'data.refresh': Record<string, never>;
}

// ═══════════════════════════════════════════════════════════
// ACTION RESULTS (type-safe results per action)
// ═══════════════════════════════════════════════════════════

export interface ActionResults {
  'case.create': Case;
  'case.update': Case;
  'case.delete': void;
  'case.toggle_priority': void;
  'case.toggle_rush': void;
  'case.toggle_hold': void;
  'case.toggle_complete': void;
  'case.toggle_stage2': void;
  'case.change_stage': void;
  'case.archive': void;
  'case.restore': void;
  'case.toggle_stats_exclusion': { isExcluded: boolean };
  'case.batch_toggle_exclusions': { caseId: string; success: boolean }[];
  'user.set_name': void;
  'user.switch': void;
  'ui.set_department': void;
  'ui.set_theme': void;
  'ui.open_editor': void;
  'ui.close_editor': void;
  'ui.open_settings': void;
  'ui.navigate': void;
  'query.get_case': Case | null;
  'query.search_cases': Case[];
  'query.get_overdue': Case[];
  'query.get_on_hold': Case[];
  'query.get_cases_by_date': Case[];
  'query.check_duplicates': Case[];
  'query.get_history': DbCaseHistoryWithCase[];
  'query.get_active_users': { user_name: string; last_seen: string }[];
  'data.refresh': void;
}

// ═══════════════════════════════════════════════════════════
// ACTION TYPE (the actual action object)
// ═══════════════════════════════════════════════════════════

export type Action<T extends ActionType = ActionType> = {
  type: T;
  payload: ActionPayloads[T];
};

// Helper to get payload type for an action
export type ActionPayload<T extends ActionType> = ActionPayloads[T];

// Helper to get result type for an action
export type ActionResult<T extends ActionType> = ActionResults[T];

// ═══════════════════════════════════════════════════════════
// ACTION HANDLER TYPE
// ═══════════════════════════════════════════════════════════

export type ActionHandler<T extends ActionType> = (
  payload: ActionPayloads[T],
  context: ActionContext
) => Promise<ActionResults[T]>;

// Context passed to handlers
export interface ActionContext {
  getRowById: (id: string) => Case | undefined;
  getCurrentUser: () => string;
  // Add more context as needed
}

// ═══════════════════════════════════════════════════════════
// ACTION SCHEMA (for documentation/LLM)
// ═══════════════════════════════════════════════════════════

export interface ActionSchemaEntry {
  description: string;
  payload: Record<string, {
    type: string;
    required?: boolean;
    default?: unknown;
    description?: string;
    values?: readonly string[];
  }>;
  examples?: unknown[];
  returns?: string;
}

export type ActionSchema = Record<ActionType, ActionSchemaEntry>;

// ═══════════════════════════════════════════════════════════
// DISPATCHER RESULT
// ═══════════════════════════════════════════════════════════

export type DispatchResult<T extends ActionType> = 
  | { success: true; data: ActionResults[T] }
  | { success: false; error: string };
