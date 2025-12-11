'use client';

/**
 * User Setup Modal
 * Shown when the user hasn't set their name yet
 */

import React, { useState } from 'react';
import { useUser } from '@/contexts/UserContext';

export function UserSetupModal() {
  const { needsName, saveName } = useUser();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  if (!needsName) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    
    saveName(name.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div 
        className="w-full max-w-md mx-4 p-6 rounded-2xl shadow-2xl animate-slide-up"
        style={{ background: 'var(--color-bg-card)' }}
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-teal-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to Stoma Board</h2>
          <p className="text-gray-400">Enter your name to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="Your name"
              autoFocus
              className={`
                w-full px-4 py-3 rounded-xl bg-white/10 border text-white placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all
                ${error ? 'border-red-500' : 'border-white/10'}
              `}
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-teal-500 text-white font-semibold 
                     hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/25"
          >
            Continue
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Your name will be used to track your activity and case history
        </p>
      </div>
    </div>
  );
}
