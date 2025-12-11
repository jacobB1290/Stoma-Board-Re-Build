/**
 * Application Constants
 */

export const APP_VERSION = '1.0.0';

export const APP_NAME = 'Stoma Board';

// Heartbeat configuration
export const HEARTBEAT_INTERVAL = 20 * 1000; // 20 seconds
export const ACTIVITY_DEBOUNCE = 3 * 1000; // 3 seconds

// Department mappings
// Note: "Digital" is stored as "General" in the database
export const DEPARTMENTS = ['Digital', 'Metal', 'C&B'] as const;
export const DB_DEPARTMENTS = ['General', 'Metal', 'C&B'] as const;

// Stage names for display
export const STAGES = ['design', 'production', 'finishing', 'qc'] as const;
export const STAGE_DISPLAY_NAMES: Record<typeof STAGES[number], string> = {
  design: 'Design',
  production: 'Production',
  finishing: 'Finishing',
  qc: 'Quality Control',
};

// Case types
export const CASE_TYPES = ['general', 'bbs', 'flex'] as const;

// Local storage keys
export const STORAGE_KEYS = {
  USER_NAME: 'userName',
  THEME: 'theme',
  UPDATE_NOTES: 'updateNotes',
  UPDATE_PRIORITY: 'updatePriority',
} as const;
