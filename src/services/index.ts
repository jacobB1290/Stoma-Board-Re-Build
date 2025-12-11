/**
 * Services Module
 * Public exports for all services
 */

// Case service
export {
  addCase,
  updateCase,
  removeCase,
  togglePriority,
  toggleRush,
  toggleHold,
  toggleComplete,
  toggleStage2,
  updateCaseStage,
  archiveCases,
  restoreCase,
  toggleCaseExclusion,
  batchToggleExclusions,
  checkForDuplicates,
  fetchAllHistory,
  fetchCases,
  fetchArchivedCases,
  logCase,
  mapDbToCase,
  getStageFromModifiers,
} from './caseService';

// User service
export {
  userService,
  startHeartbeat,
  stopHeartbeat,
  reportActive,
  fetchActiveUsers,
} from './userService';
