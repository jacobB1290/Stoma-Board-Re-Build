import { db } from "./caseService";
import { APP_VERSION } from "../constants";

// Simple user service
export const userService = {
  getName: () => {
    return localStorage.getItem("userName") || "";
  },

  setName: (name) => {
    if (name && name.trim()) {
      localStorage.setItem("userName", name.trim());
    }
  },

  clearUser: () => {
    localStorage.removeItem("userName");
  },

  needsName: () => {
    const name = localStorage.getItem("userName");
    return !name || name.trim() === "";
  },
};

// ============================================
// HEARTBEAT CONFIGURATION
// ============================================
const HEARTBEAT_INTERVAL = 20 * 1000; // 20 seconds
const ACTIVITY_DEBOUNCE = 3 * 1000; // 3 seconds debounce for activity
const DEBUG = true; // Set to false in production

// ============================================
// STATE
// ============================================
let heartbeatInterval = null;
let lastReportTime = 0;
let activityDebounceTimeout = null;
let isTabVisible = true;

// Debug logger
function log(...args) {
  if (DEBUG) {
    console.log(`[Heartbeat ${new Date().toLocaleTimeString()}]`, ...args);
  }
}

// ============================================
// CORE REPORT FUNCTION
// ============================================
export async function reportActive(reason = "unknown") {
  const userName = userService.getName();
  if (!userName) {
    log("No user name, skipping report");
    return;
  }

  const now = Date.now();
  lastReportTime = now;

  log(`Reporting active - reason: ${reason}`);

  try {
    const { error } = await db.from("active_devices").upsert(
      {
        user_name: userName,
        app_version: APP_VERSION,
        last_seen: new Date().toISOString(),
      },
      {
        onConflict: "user_name",
      }
    );

    if (error) {
      console.error("Failed to report active:", error);
    } else {
      log("Successfully reported active");
    }
  } catch (error) {
    console.error("Failed to report active status:", error);
  }
}

// ============================================
// HEARTBEAT MANAGEMENT
// ============================================
function startHeartbeatTimer() {
  // Clear any existing interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  log("Starting heartbeat timer");

  // Immediate report
  reportActive("heartbeat-start");

  // Set up interval
  heartbeatInterval = setInterval(() => {
    if (isTabVisible) {
      reportActive("heartbeat-interval");
    } else {
      log("Tab hidden, skipping heartbeat");
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeatTimer() {
  log("Stopping heartbeat timer");
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

// Visibility change (tab switch, minimize)
function handleVisibilityChange() {
  const wasVisible = isTabVisible;
  isTabVisible = document.visibilityState === "visible";

  log(`Visibility changed: ${wasVisible} -> ${isTabVisible}`);

  if (isTabVisible && !wasVisible) {
    // Tab became visible - report immediately and restart heartbeat
    reportActive("tab-visible");
    startHeartbeatTimer();
  } else if (!isTabVisible && wasVisible) {
    // Tab became hidden - stop heartbeat
    stopHeartbeatTimer();
  }
}

// Window focus
function handleFocus() {
  log("Window focused");
  isTabVisible = true;
  reportActive("window-focus");

  // Ensure heartbeat is running
  if (!heartbeatInterval) {
    startHeartbeatTimer();
  }
}

// Window blur
function handleBlur() {
  log("Window blurred");
  // Don't immediately stop - user might just be clicking outside briefly
}

// User activity (debounced)
function handleActivity(event) {
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

// Page unload - best effort
function handleBeforeUnload() {
  log("Page unloading");
  // Try to send a final update, but this is unreliable
  const userName = userService.getName();
  if (userName && navigator.sendBeacon) {
    // sendBeacon is more reliable for unload
    // But we can't do upsert with it, so just log
    log("Page closing - sendBeacon would go here");
  }
}

// ============================================
// PUBLIC API
// ============================================
export function startHeartbeat() {
  log("=== STARTING HEARTBEAT SYSTEM ===");

  // Set initial visibility state
  isTabVisible = document.visibilityState === "visible";
  log(`Initial visibility: ${isTabVisible}`);

  // Start the heartbeat timer
  startHeartbeatTimer();

  // Add event listeners
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);
  window.addEventListener("beforeunload", handleBeforeUnload);

  // Activity listeners (these trigger debounced reports)
  window.addEventListener("mousedown", handleActivity);
  window.addEventListener("keydown", handleActivity);
  window.addEventListener("scroll", handleActivity, { passive: true });
  window.addEventListener("touchstart", handleActivity, { passive: true });

  log("All event listeners attached");
}

export function stopHeartbeat() {
  log("=== STOPPING HEARTBEAT SYSTEM ===");

  stopHeartbeatTimer();

  // Clear debounce timeout
  if (activityDebounceTimeout) {
    clearTimeout(activityDebounceTimeout);
    activityDebounceTimeout = null;
  }

  // Remove event listeners
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("focus", handleFocus);
  window.removeEventListener("blur", handleBlur);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("mousedown", handleActivity);
  window.removeEventListener("keydown", handleActivity);
  window.removeEventListener("scroll", handleActivity);
  window.removeEventListener("touchstart", handleActivity);

  log("All event listeners removed");
}

// ============================================
// FETCH USERS (for UpdateModal)
// ============================================
export async function fetchActiveUsers() {
  try {
    const { data, error } = await db
      .from("active_devices")
      .select("*")
      .order("last_seen", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Failed to fetch active users:", error);
    return [];
  }
}
