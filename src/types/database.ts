/**
 * Database Types - Matches Supabase schema
 * These types represent the raw data as stored in the database
 */

// ═══════════════════════════════════════════════════════════
// CASE TABLE
// ═══════════════════════════════════════════════════════════

export interface DbCase {
  id: string;
  casenumber: string;
  department: 'General' | 'Metal' | 'C&B';
  due: string; // ISO timestamp "YYYY-MM-DDT00:00:00Z"
  priority: boolean;
  modifiers: string[];
  completed: boolean;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
}

// Known modifier values
export type CaseModifier =
  | 'rush'
  | 'hold'
  | 'bbs'
  | 'flex'
  | 'stage2'
  | 'stage-design'
  | 'stage-production'
  | 'stage-finishing'
  | 'stage-qc'
  | `stats-exclude:${string}`
  | `stats-exclude-reason:${string}`;

// ═══════════════════════════════════════════════════════════
// CASE HISTORY TABLE
// ═══════════════════════════════════════════════════════════

export interface DbCaseHistory {
  id: string;
  case_id: string;
  action: string;
  user_name: string;
  created_at: string;
}

// With joined case data
export interface DbCaseHistoryWithCase extends DbCaseHistory {
  cases: {
    casenumber: string;
  } | null;
}

// ═══════════════════════════════════════════════════════════
// ACTIVE DEVICES TABLE
// ═══════════════════════════════════════════════════════════

export interface DbActiveDevice {
  user_name: string;
  app_version: string;
  last_seen: string;
}

// ═══════════════════════════════════════════════════════════
// DATABASE TYPES (for Supabase client)
// ═══════════════════════════════════════════════════════════

export interface Database {
  public: {
    Tables: {
      cases: {
        Row: DbCase;
        Insert: Omit<DbCase, 'created_at'>;
        Update: Partial<Omit<DbCase, 'id' | 'created_at'>>;
      };
      case_history: {
        Row: DbCaseHistory;
        Insert: Omit<DbCaseHistory, 'created_at'>;
        Update: never; // History is append-only
      };
      active_devices: {
        Row: DbActiveDevice;
        Insert: DbActiveDevice;
        Update: Partial<DbActiveDevice>;
      };
    };
  };
}
