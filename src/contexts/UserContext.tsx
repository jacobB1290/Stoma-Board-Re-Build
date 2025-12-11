'use client';

/**
 * User Context
 * Manages user identity and heartbeat system
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { userService, startHeartbeat, stopHeartbeat, reportActive } from '@/services/userService';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface UserContextValue {
  /** Current user's name */
  name: string;
  /** Whether the user needs to set their name */
  needsName: boolean;
  /** Save a new user name */
  saveName: (name: string) => void;
  /** Switch to a different user (clear current and reload) */
  switchUser: () => void;
}

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

const UserContext = createContext<UserContextValue | null>(null);

// ═══════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string>('');
  const [needsName, setNeedsName] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage on mount (client-side only)
  useEffect(() => {
    const storedName = userService.getName();
    setName(storedName);
    setNeedsName(userService.needsName());
    setIsInitialized(true);
  }, []);

  // Start heartbeat when user has a name
  useEffect(() => {
    if (!isInitialized) return;
    
    if (name) {
      console.log('[UserContext] User has name, starting heartbeat:', name);
      startHeartbeat();

      return () => {
        console.log('[UserContext] Cleanup, stopping heartbeat');
        stopHeartbeat();
      };
    }
  }, [name, isInitialized]);

  const saveName = useCallback((newName: string) => {
    if (!newName || !newName.trim()) return;

    console.log('[UserContext] Saving new name:', newName);
    userService.setName(newName);
    setName(newName.trim());
    setNeedsName(false);

    // Report active with new name immediately
    reportActive('name-saved');
  }, []);

  const switchUser = useCallback(() => {
    console.log('[UserContext] Switching user');
    stopHeartbeat();
    userService.clearUser();
    window.location.reload();
  }, []);

  const value: UserContextValue = {
    name,
    needsName,
    saveName,
    switchUser,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export { UserContext };
