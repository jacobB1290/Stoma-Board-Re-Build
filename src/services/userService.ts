/**
 * User Service
 * Handles user identity and presence/heartbeat system
 */

import { db } from '@/lib/supabase';
import { APP_VERSION, HEARTBEAT_INTERVAL, ACTIVITY_DEBOUNCE, STORAGE_KEYS } from '@/lib/constants';

// ═══════════════════════════════════════════════════════════
// USER IDENTITY
// ═══════════════════════════════════════════════════════════

export const userService = {
  /**
   * Get the current user's name from localStorage
   */
  getName(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEYS.USER_NAME) || '';
  },

  /**
   * Set the user's name in localStorage
   */
  setName(name: string): void {
    if (typeof window === 'undefined') return;
    if (name && name.trim()) {
      localStorage.setItem(STORAGE_KEYS.USER_NAME, name.trim());
    }
  },

  /**
   * Clear the user's name from localStorage
   */
  clearUser(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.USER_NAME);
  },

  /**
   * Check if the user needs to set their name
   */
  needsName(): boolean {
    const name = this.getName();
    return !name || name.trim() === '';
  },
};

// ═══════════════════════════════════════════════════════════
// HEARTBEAT SYSTEM
// ═══════════════════════════════════════════════════════════

// Module-level state
let heartbeatInterval: NodeJS.Timeout | null = null;
let activityDebounceTimeout: NodeJS.Timeout | null = null;
let isTabVisible = true;
let isInitialized = false;

// Debug mode (disable in production)
const DEBUG = process.env.NODE_ENV === 'development';

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[Heartbeat ${new Date().toLocaleTimeString()}]`, ...args);
  }
}

/**
 * Report user as active to the database
 */
export async function reportActive(reason = 'unknown'): Promise<void> {
  const userName = userService.getName();
  if (!userName) {
    log('No user name, skipping report');
    return;
  }

  log(`Reporting active - reason: ${reason}`);

  try {
    const { error } = await db.from('active_devices').upsert(
      {
        user_name: userName,
        app_version: APP_VERSION,
        last_seen: new Date().toISOString(),
      },
      {
        onConflict: 'user_name',
      }
    );

    if (error) {
      console.error('Failed to report active:', error);
    } else {
      log('Successfully reported active');
    }
  } catch (error) {
    console.error('Failed to report active status:', error);
  }
}

/**
 * Start the heartbeat timer
 */
function startHeartbeatTimer(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  log('Starting heartbeat timer');
  
  // Immediate report
  reportActive('heartbeat-start');

  // Set up interval
  heartbeatInterval = setInterval(() => {
    if (isTabVisible) {
      reportActive('heartbeat-interval');
    } else {
      log('Tab hidden, skipping heartbeat');
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * Stop the heartbeat timer
 */
function stopHeartbeatTimer(): void {
  log('Stopping heartbeat timer');
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

function handleVisibilityChange(): void {
  const wasVisible = isTabVisible;
  isTabVisible = document.visibilityState === 'visible';

  log(`Visibility changed: ${wasVisible} -> ${isTabVisible}`);

  if (isTabVisible && !wasVisible) {
    // Tab became visible - report immediately and restart heartbeat
    reportActive('tab-visible');
    startHeartbeatTimer();
  } else if (!isTabVisible && wasVisible) {
    // Tab became hidden - stop heartbeat
    stopHeartbeatTimer();
  }
}

function handleFocus(): void {
  log('Window focused');
  isTabVisible = true;
  reportActive('window-focus');

  // Ensure heartbeat is running
  if (!heartbeatInterval) {
    startHeartbeatTimer();
  }
}

function handleBlur(): void {
  log('Window blurred');
  // Don't immediately stop - user might just be clicking outside briefly
}

function handleActivity(event: Event): void {
  // Clear existing debounce
  if (activityDebounceTimeout) {
    clearTimeout(activityDebounceTimeout);
  }

  // Debounce activity reports
  activityDebounceTimeout = setTimeout(() => {
    if (isTabVisible) {
      reportActive(`activity-${event.type}`);
    }
  }, ACTIVITY_DEBOUNCE);
}

function handleBeforeUnload(): void {
  log('Page unloading');
  // Best effort cleanup - sendBeacon could be used here for more reliability
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Start the heartbeat system
 */
export function startHeartbeat(): void {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;

  log('=== STARTING HEARTBEAT SYSTEM ===');
  isInitialized = true;

  // Set initial visibility state
  isTabVisible = document.visibilityState === 'visible';
  log(`Initial visibility: ${isTabVisible}`);

  // Start the heartbeat timer
  startHeartbeatTimer();

  // Add event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Activity listeners (these trigger debounced reports)
  window.addEventListener('mousedown', handleActivity);
  window.addEventListener('keydown', handleActivity);
  window.addEventListener('scroll', handleActivity, { passive: true });
  window.addEventListener('touchstart', handleActivity, { passive: true });

  log('All event listeners attached');
}

/**
 * Stop the heartbeat system
 */
export function stopHeartbeat(): void {
  if (typeof window === 'undefined') return;
  if (!isInitialized) return;

  log('=== STOPPING HEARTBEAT SYSTEM ===');
  isInitialized = false;

  stopHeartbeatTimer();

  // Clear debounce timeout
  if (activityDebounceTimeout) {
    clearTimeout(activityDebounceTimeout);
    activityDebounceTimeout = null;
  }

  // Remove event listeners
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('mousedown', handleActivity);
  window.removeEventListener('keydown', handleActivity);
  window.removeEventListener('scroll', handleActivity);
  window.removeEventListener('touchstart', handleActivity);

  log('All event listeners removed');
}

/**
 * Fetch all active users
 */
export async function fetchActiveUsers(): Promise<{ user_name: string; last_seen: string }[]> {
  try {
    const { data, error } = await db
      .from('active_devices')
      .select('user_name, last_seen')
      .order('last_seen', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to fetch active users:', error);
    return [];
  }
}
