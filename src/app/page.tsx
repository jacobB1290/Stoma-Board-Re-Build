'use client';

/**
 * Main Application Page
 * Entry point for the Stoma Board application
 */

import { Header } from '@/components/common/Header';
import { UserSetupModal } from '@/components/common/UserSetupModal';
import { Board } from '@/components/board';
import { CaseEditor } from '@/components/editor';
import { useUI } from '@/contexts/UIContext';
import { useData } from '@/contexts/DataContext';
import { APP_VERSION } from '@/lib/constants';

export default function Home() {
  const { currentView, activeDepartment, editorOpen, editingCaseId, closeEditor } = useUI();
  const { rows, loading, error, getRowById } = useData();

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
                <div className="max-w-4xl mx-auto">
                  {/* Case Editor */}
                  <CaseEditor 
                    editCase={editingCase}
                    onClose={closeEditor}
                  />
                  
                  {/* Recent Cases Table */}
                  <div className="mt-8">
                    <RecentCasesTable />
                  </div>
                </div>
              </div>
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

// ═══════════════════════════════════════════════════════════
// RECENT CASES TABLE
// ═══════════════════════════════════════════════════════════

function RecentCasesTable() {
  const { allRows } = useData();
  const { openEditor } = useUI();
  const { dispatch } = useData() as any;

  // Get most recent 20 cases (sorted by creation or due date)
  const recentCases = allRows
    .filter(r => !r.archived)
    .sort((a, b) => b.due.localeCompare(a.due))
    .slice(0, 20);

  if (recentCases.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No cases yet. Add your first case above!
      </div>
    );
  }

  return (
    <div className="glass-card-dark rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="font-semibold text-white">Recent Cases</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-400 border-b border-white/10">
              <th className="px-4 py-3 font-medium">Case #</th>
              <th className="px-4 py-3 font-medium">Dept</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentCases.map((row) => (
              <tr 
                key={row.id} 
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="px-4 py-3">
                  <span 
                    className="font-mono font-semibold"
                    style={{ color: getDeptColor(row.department) }}
                  >
                    {row.caseNumber}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {row.department === 'General' ? 'Digital' : row.department}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {row.due}
                </td>
                <td className="px-4 py-3 text-sm">
                  {row.stage ? (
                    <span className="px-2 py-1 rounded text-xs bg-white/10 capitalize">
                      {row.stage}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {row.priority && <span className="text-yellow-400" title="Priority">★</span>}
                    {row.rush && <span className="text-red-400" title="Rush">⚡</span>}
                    {row.hold && <span className="text-orange-400" title="On Hold">⏸</span>}
                    {row.completed && <span className="text-green-400" title="Completed">✓</span>}
                    {!row.priority && !row.rush && !row.hold && !row.completed && (
                      <span className="text-gray-600">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => openEditor(row.id)}
                    className="px-3 py-1 text-xs bg-white/10 text-gray-300 
                             rounded hover:bg-white/20 transition-colors"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getDeptColor(dept: string): string {
  switch (dept) {
    case 'Digital':
    case 'General':
      return '#2dd4bf';
    case 'Metal':
      return '#a855f7';
    case 'C&B':
      return '#f97316';
    default:
      return '#94a3b8';
  }
}
