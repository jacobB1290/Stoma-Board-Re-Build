'use client';

/**
 * Header Component
 * Main navigation header with user info and department tabs
 */

import React, { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useUI } from '@/contexts/UIContext';
import { useDispatch } from '@/contexts/DispatchContext';
import { DEPARTMENTS } from '@/lib/constants';
import type { Department } from '@/types/case';

export function Header() {
  const { name } = useUser();
  const { activeDepartment, currentView } = useUI();
  const { dispatch } = useDispatch();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDepartmentChange = (dept: Department) => {
    dispatch('ui.set_department', { department: dept });
  };

  const handleNavigate = (view: 'board' | 'manage') => {
    dispatch('ui.navigate', { view });
  };

  const handleOpenSettings = () => {
    dispatch('ui.open_settings', { tab: 'user' });
  };

  return (
    <header className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--color-bg-secondary)' }}
    >
      {/* Left side - User */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleOpenSettings}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg 
            className="w-5 h-5 text-gray-400" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
            />
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
            />
          </svg>
          <span className="text-white font-medium">{mounted ? (name || 'User') : 'User'}</span>
        </button>
      </div>

      {/* Center - Department Tabs */}
      <div className="flex items-center gap-2">
        {DEPARTMENTS.map((dept) => (
          <button
            key={dept}
            onClick={() => handleDepartmentChange(dept as Department)}
            className={`
              px-4 py-1.5 rounded-lg font-medium text-sm transition-all
              ${activeDepartment === dept 
                ? 'bg-white text-gray-900 shadow-md' 
                : 'text-white hover:bg-white/10'
              }
            `}
          >
            {dept}
            {activeDepartment === dept && (
              <svg className="w-4 h-4 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        ))}
        
        {/* Manage Cases button */}
        <button
          onClick={() => handleNavigate('manage')}
          className={`
            px-4 py-1.5 rounded-lg font-medium text-sm transition-all ml-4
            ${currentView === 'manage'
              ? 'bg-teal-500 text-white shadow-md'
              : 'border border-white/30 text-white hover:bg-white/10'
            }
          `}
        >
          Manage Cases
        </button>
      </div>

      {/* Right side - placeholder for future features */}
      <div className="w-32">
        {/* Space for notifications, etc */}
      </div>
    </header>
  );
}
