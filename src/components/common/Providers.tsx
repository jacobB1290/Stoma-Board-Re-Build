'use client';

/**
 * Application Providers
 * Wraps all context providers in the correct order
 */

import React from 'react';
import { UserProvider } from '@/contexts/UserContext';
import { UIProvider } from '@/contexts/UIContext';
import { DataProvider } from '@/contexts/DataContext';
import { DispatchProvider } from '@/contexts/DispatchContext';
import { useUI } from '@/contexts/UIContext';

// Inner component that uses UI context for department
function DataProviderWithDepartment({ children }: { children: React.ReactNode }) {
  const { activeDepartment } = useUI();
  
  return (
    <DataProvider activeDept={activeDepartment}>
      <DispatchProvider>
        {children}
      </DispatchProvider>
    </DataProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <UIProvider defaultDepartment="Digital">
        <DataProviderWithDepartment>
          {children}
        </DataProviderWithDepartment>
      </UIProvider>
    </UserProvider>
  );
}
