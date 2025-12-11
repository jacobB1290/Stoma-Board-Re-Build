/**
 * Supabase Client
 * Single instance for all database operations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables with fallbacks for development
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Check if we have real credentials
const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

if (!hasCredentials && typeof window !== 'undefined') {
  console.warn(
    'Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
  );
}

/**
 * Supabase client instance
 * Using untyped client for flexibility with dynamic schemas
 */
export const db: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // No auth persistence needed for this app
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return hasCredentials;
}
