'use client';

/**
 * CaseTable Component
 * Displays cases in collapsible sections with filters
 * EXACT REPLICA of original CaseTable.jsx styling
 * 
 * ARCHITECTURE NOTE:
 * - White glass background with collapsible sections
 * - Status dots for priority/rush/hold indicators
 * - All interactions dispatch through DispatchContext
 */

import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { useDispatch } from '@/contexts/DispatchContext';
import { cn } from '@/lib/cn';
import { parseISODate, isToday, isPast } from '@/utils/dateUtils';
import type { Case } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CaseTableProps {
  searchQuery?: string;
  deptFilter?: string;
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function splitCase(caseNumber: string = ''): [string, string] {
  const text = caseNumber
    .replace(/[()]/g, '')
    .replace(/\s*-\s*/, ' ')
    .trim()
    .split(/\s+/);
  return [text.shift() || '', text.join(' ')];
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${parseInt(month)}-${parseInt(day)}`;
}

// ═══════════════════════════════════════════════════════════
// STATUS DOTS COMPONENT
// ═══════════════════════════════════════════════════════════

const StatusDot = memo(({ type, label }: { type: string; label: string }) => {
  const colors: Record<string, string> = {
    priority: 'bg-red-500',
    rush: 'bg-orange-500',
    hold: 'bg-amber-500',
    stage2: 'bg-indigo-500',
  };

  return (
    <div 
      className={cn('w-2 h-2 rounded-full', colors[type])}
      title={label}
    />
  );
});
StatusDot.displayName = 'StatusDot';

const StatusDotsContainer = memo(({ row }: { row: Case }) => {
  const dots = [];
  if (row.priority) dots.push({ type: 'priority', label: 'Priority' });
  if (row.rush) dots.push({ type: 'rush', label: 'Rush' });
  if (row.hold) dots.push({ type: 'hold', label: 'Hold' });
  if (row.stage2 && row.department === 'Metal') dots.push({ type: 'stage2', label: 'Stage 2' });

  if (dots.length === 0) return null;

  return (
    <div className="flex items-center gap-1 ml-2">
      {dots.map((dot) => (
        <StatusDot key={dot.type} type={dot.type} label={dot.label} />
      ))}
    </div>
  );
});
StatusDotsContainer.displayName = 'StatusDotsContainer';

// ═══════════════════════════════════════════════════════════
// TABLE ROW COMPONENT
// ═══════════════════════════════════════════════════════════

const TableRow = memo(({
  row,
  isOverdue,
  onEdit,
}: {
  row: Case;
  isOverdue: boolean;
  onEdit: (row: Case) => void;
}) => {
  const [caseNum, caseDesc] = splitCase(row.caseNumber);
  const { dispatch } = useDispatch();

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'edit':
        onEdit(row);
        break;
      case 'done':
        dispatch('case.toggle_complete', { id: row.id });
        break;
      case 'priority':
        dispatch('case.toggle_priority', { id: row.id });
        break;
      case 'rush':
        dispatch('case.toggle_rush', { id: row.id });
        break;
      case 'hold':
        dispatch('case.toggle_hold', { id: row.id });
        break;
    }
  }, [row, onEdit, dispatch]);

  return (
    <tr className="hover:bg-gray-50/50 transition-colors border-b border-gray-100">
      <td className="px-4 py-3">
        <div className="flex items-center">
          <span className={cn(
            'font-mono text-sm text-gray-900',
            isOverdue && !row.completed && !row.hold && 'text-red-600 font-medium'
          )}>
            {caseNum}
          </span>
          <StatusDotsContainer row={row} />
        </div>
        {caseDesc && (
          <div className="text-xs text-gray-500 mt-0.5">{caseDesc}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">
          {row.department === 'General' ? 'Digital' : row.department}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-sm font-mono',
          isOverdue && !row.completed && !row.hold
            ? 'text-red-600 font-medium'
            : 'text-gray-600',
          row.hold && 'line-through decoration-gray-400'
        )}>
          {formatDate(row.due)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <RowMenu row={row} onAction={handleMenuAction} />
      </td>
    </tr>
  );
});
TableRow.displayName = 'TableRow';

// ═══════════════════════════════════════════════════════════
// ROW MENU COMPONENT
// ═══════════════════════════════════════════════════════════

function RowMenu({ row, onAction }: { row: Case; onAction: (action: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full bg-gray-100 p-1.5 hover:bg-gray-200 transition-colors"
      >
        <span className="text-gray-600 text-sm">⋮</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-full mt-1 w-36 rounded-lg bg-white shadow-lg ring-1 ring-gray-200 py-1 z-50"
          >
            <MenuButton onClick={() => { onAction('done'); setIsOpen(false); }} className="text-blue-600 hover:bg-blue-50">
              {row.completed ? 'Undo' : 'Done'}
            </MenuButton>
            {!row.completed && (
              <>
                <MenuButton onClick={() => { onAction('edit'); setIsOpen(false); }} className="text-gray-700 hover:bg-gray-50">
                  Edit
                </MenuButton>
                <MenuButton onClick={() => { onAction('priority'); setIsOpen(false); }} className="text-red-600 hover:bg-red-50">
                  {row.priority ? 'Remove Priority' : 'Set Priority'}
                </MenuButton>
                <MenuButton onClick={() => { onAction('rush'); setIsOpen(false); }} className="text-orange-600 hover:bg-orange-50">
                  {row.rush ? 'Remove Rush' : 'Set Rush'}
                </MenuButton>
                <MenuButton onClick={() => { onAction('hold'); setIsOpen(false); }} className="text-amber-600 hover:bg-amber-50">
                  {row.hold ? 'Remove Hold' : 'Set Hold'}
                </MenuButton>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuButton({ onClick, className, children }: { onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('block w-full text-left px-3 py-2 text-sm transition-colors', className)}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// COLLAPSIBLE SECTION COMPONENT
// ═══════════════════════════════════════════════════════════

const CollapsibleSection = memo(({
  title,
  count,
  bgColor,
  textColor,
  rows,
  onEdit,
  defaultExpanded = true,
}: {
  title: string;
  count: number;
  bgColor: string;
  textColor: string;
  rows: Case[];
  onEdit: (row: Case) => void;
  defaultExpanded?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="mb-4">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full px-4 py-3 flex items-center justify-between rounded-t-xl transition-all',
          bgColor, textColor, 'hover:brightness-110'
        )}
      >
        <div className="flex items-center gap-3">
          <motion.svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </motion.svg>
          <span className="font-semibold text-sm uppercase tracking-wide">{title}</span>
        </div>
        <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-medium">{count}</span>
      </button>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/95 rounded-b-xl">
              <table className="w-full">
                <tbody>
                  {rows.map((row) => {
                    const dueDate = row.due.split('T')[0];
                    const isOverdue = dueDate < todayStr;
                    return (
                      <TableRow
                        key={row.id}
                        row={row}
                        isOverdue={isOverdue}
                        onEdit={onEdit}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
CollapsibleSection.displayName = 'CollapsibleSection';

// ═══════════════════════════════════════════════════════════
// MAIN CASE TABLE COMPONENT
// ═══════════════════════════════════════════════════════════

export function CaseTable({ searchQuery = '', deptFilter = 'All' }: CaseTableProps) {
  const { allRows } = useData();
  const { openEditor } = useUI();

  // Filter and categorize cases
  const { overdueCases, onHoldCases, activeCases, completedCases } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Filter by search and department
    let filtered = allRows.filter(row => !row.archived);
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(row => 
        row.caseNumber.toLowerCase().includes(query)
      );
    }
    
    if (deptFilter !== 'All') {
      const dbDept = deptFilter === 'Digital' ? 'General' : deptFilter;
      filtered = filtered.filter(row => row.department === dbDept);
    }

    // Separate completed
    const completed = filtered.filter(row => row.completed);
    const active = filtered.filter(row => !row.completed);

    // Categorize active cases
    const overdue: Case[] = [];
    const onHold: Case[] = [];
    const regular: Case[] = [];

    active.forEach(row => {
      if (row.hold) {
        onHold.push(row);
      } else {
        const dueDate = row.due.split('T')[0];
        if (dueDate < todayStr) {
          overdue.push(row);
        } else {
          regular.push(row);
        }
      }
    });

    // Sort by due date
    const sortByDue = (a: Case, b: Case) => a.due.localeCompare(b.due);
    overdue.sort(sortByDue);
    onHold.sort(sortByDue);
    regular.sort(sortByDue);
    completed.sort((a, b) => b.due.localeCompare(a.due));

    return {
      overdueCases: overdue,
      onHoldCases: onHold,
      activeCases: regular,
      completedCases: completed,
    };
  }, [allRows, searchQuery, deptFilter]);

  const handleEdit = useCallback((row: Case) => {
    openEditor(row.id);
  }, [openEditor]);

  const totalActive = overdueCases.length + onHoldCases.length + activeCases.length;

  return (
    <div className="glass-panel p-4 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Active Cases</h3>
        <button className="secondary-button text-sm">
          View History
        </button>
      </div>

      {/* Case Sections */}
      {overdueCases.length > 0 && (
        <CollapsibleSection
          title="Overdue Cases"
          count={overdueCases.length}
          bgColor="bg-red-600/90"
          textColor="text-white"
          rows={overdueCases}
          onEdit={handleEdit}
          defaultExpanded={false}
        />
      )}

      {onHoldCases.length > 0 && (
        <CollapsibleSection
          title="On Hold"
          count={onHoldCases.length}
          bgColor="bg-amber-500/90"
          textColor="text-white"
          rows={onHoldCases}
          onEdit={handleEdit}
          defaultExpanded={true}
        />
      )}

      {/* Regular active cases - just a table */}
      {activeCases.length > 0 && (
        <div className="bg-white rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {activeCases.map((row) => (
                <TableRow
                  key={row.id}
                  row={row}
                  isOverdue={false}
                  onEdit={handleEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {totalActive === 0 && (
        <div className="text-center py-8 text-gray-500">
          No active cases
        </div>
      )}

      {/* Completed section */}
      {completedCases.length > 0 && (
        <div className="mt-6">
          <CollapsibleSection
            title="Completed Cases"
            count={completedCases.length}
            bgColor="bg-green-600/90"
            textColor="text-white"
            rows={completedCases.slice(0, 20)}
            onEdit={handleEdit}
            defaultExpanded={false}
          />
        </div>
      )}
    </div>
  );
}
