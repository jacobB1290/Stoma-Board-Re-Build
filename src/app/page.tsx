'use client';

/**
 * Main Application Page
 * Entry point for the Stoma Board application
 */

import { Header } from '@/components/common/Header';
import { UserSetupModal } from '@/components/common/UserSetupModal';
import { useUI } from '@/contexts/UIContext';
import { useData } from '@/contexts/DataContext';
import { APP_VERSION } from '@/lib/constants';

export default function Home() {
  const { currentView, activeDepartment } = useUI();
  const { rows, loading, error } = useData();

  return (
    <div className="min-h-screen flex flex-col">
      {/* User setup modal (shown if no name set) */}
      <UserSetupModal />
      
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <main className="flex-1 p-4">
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
          <div className="animate-fade-in">
            {currentView === 'board' && (
              <BoardPlaceholder 
                department={activeDepartment} 
                caseCount={rows.length} 
              />
            )}
            {currentView === 'manage' && (
              <ManagePlaceholder 
                caseCount={rows.length} 
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-2 px-4 text-center text-xs text-gray-500">
        Stoma Board v{APP_VERSION}
      </footer>
    </div>
  );
}

// Temporary placeholder components until we build the real ones
function BoardPlaceholder({ department, caseCount }: { department: string | null; caseCount: number }) {
  return (
    <div 
      className="rounded-2xl p-8 text-center"
      style={{ background: 'var(--color-bg-card)' }}
    >
      <h2 className="text-2xl font-bold text-white mb-4">
        Board View
      </h2>
      <p className="text-gray-400 mb-6">
        {department ? `${department} Department` : 'All Departments'} • {caseCount} cases
      </p>
      <div className="grid grid-cols-7 gap-4 mt-8">
        {['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'].map((day, i) => (
          <div 
            key={day}
            className={`p-4 rounded-xl ${i === 0 ? 'bg-yellow-100/20' : 'bg-white/5'}`}
          >
            <h3 className={`font-semibold mb-2 ${i === 0 ? 'text-yellow-300' : 'text-gray-300'}`}>
              {day}
            </h3>
            <div className="text-sm text-gray-500">
              Cases will appear here
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-gray-500">
        The full board component will be built in the next phase
      </p>
    </div>
  );
}

function ManagePlaceholder({ caseCount }: { caseCount: number }) {
  return (
    <div 
      className="rounded-2xl p-8"
      style={{ background: 'var(--color-bg-card)' }}
    >
      <h2 className="text-2xl font-bold text-white mb-4 text-center">
        Manage Cases
      </h2>
      <p className="text-gray-400 mb-6 text-center">
        {caseCount} total cases loaded
      </p>
      
      {/* Form placeholder */}
      <div className="max-w-2xl mx-auto">
        <div 
          className="p-6 rounded-xl mb-6"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Add New Case</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
            <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
            <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
            <div className="h-12 bg-white/10 rounded-lg animate-pulse" />
          </div>
          <div className="mt-4 h-12 bg-teal-500/50 rounded-lg animate-pulse" />
        </div>
        
        <p className="text-center text-sm text-gray-500">
          The case editor will be built in the next phase
        </p>
      </div>
    </div>
  );
}
