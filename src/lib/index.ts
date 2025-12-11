/**
 * Library Barrel File
 * 
 * Import shared utilities from '@/lib' instead of individual files.
 * This ensures single source of truth and makes refactoring easier.
 */

export { db, isSupabaseConfigured } from './supabase';
export * from './constants';
export * from './animations';
export { cn } from './cn';
export * from './caseHelpers';
