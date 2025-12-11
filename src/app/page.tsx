'use client';

/**
 * Main Application Page
 * Entry point for the Stoma Board application
 * 
 * ARCHITECTURE NOTE:
 * - Board view shows kanban-style columns
 * - Manage view shows editor + case table (matching original)
 */

import { useState } from 'react';
import { Header } from '@/components/common/Header';
import { UserSetupModal } from '@/components/common/UserSetupModal';
import { Board } from '@/components/board';
import { CaseEditor } from '@/components/editor';
import { CaseTable } from '@/components/editor/CaseTable';
import { useUI } from '@/contexts/UIContext';
import { useData } from '@/contexts/DataContext';

export default function Home() {
  const { currentView, activeDepartment, editorOpen, editingCaseId, closeEditor } = useUI();
  const { rows, loading, error, getRowById } = useData();

  // Filter state for Manage view
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  // Get the case being edited (if any)
  const editingCase = editingCaseId ? getRowById(editingCaseId) : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* User setup modal (shown if no name set) */}
      <UserSetupModal />
      
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400">Loading cases...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Failed to load cases</h3>
              <p className="text-gray-400 mb-4">{error.message}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-400 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Content based on view */}
        {!loading && !error && (
          <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            {currentView === 'board' && <Board />}
            
            {currentView === 'manage' && (
              <div className="flex-1 overflow-auto p-4">
                <div className="max-w-2xl mx-auto">
                  {/* Case Editor */}
                  <CaseEditor 
                    editCase={editingCase}
                    onClose={closeEditor}
                  />
                  
                  {/* Filters (matching original) */}
                  <div className="mx-auto my-6 grid max-w-2xl grid-cols-2 gap-4">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="filter-input"
                    >
                      <option value="All">All Departments</option>
                      <option value="Digital">Digital</option>
                      <option value="C&B">C&B</option>
                      <option value="Metal">Metal</option>
                    </select>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search cases..."
                      className="filter-input"
                    />
                  </div>
                  
                  {/* Case Table */}
                  <CaseTable 
                    searchQuery={searchQuery}
                    deptFilter={deptFilter}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
