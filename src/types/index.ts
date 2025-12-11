/**
 * Type Exports
 * Central export point for all application types
 */

// Database types
export type {
  DbCase,
  DbCaseHistory,
  DbCaseHistoryWithCase,
  DbActiveDevice,
  Database,
  CaseModifier,
} from './database';

// Application types
export type {
  Case,
  CaseType,
  CaseStage,
  Department,
  CreateCaseInput,
  UpdateCaseInput,
  CaseStatus,
  CaseFilters,
} from './case';

export { STAGE_NAMES, DEPARTMENT_DISPLAY } from './case';

// Action types
export type {
  Action,
  ActionType,
  ActionPayload,
  ActionResult,
  ActionHandler,
  ActionSchema,
  ActionSchemaEntry,
} from './actions';
