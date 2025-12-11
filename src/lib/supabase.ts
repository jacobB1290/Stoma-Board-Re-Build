/**
 * Supabase Client
 * Single instance for all database operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables with hard-coded fallbacks
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://totqejdgvgxfonaebyla.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRv' +
  'dHFlamRndmd4Zm9uYWVieWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcxNTYyNDYsImV4cC' +
  'I6MjA2MjczMjI0Nn0.bWUKvPL2trYlei-kEecLwpY12PZixZoGu1gGsLFGvrs';

/**
 * Supabase client instance
 */
export const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Check if Supabase is configured (has real credentials, not just fallbacks)
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}
