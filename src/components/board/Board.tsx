'use client';

/**
 * Board Component
 * Main board view showing cases organized by due date
 * Matches the original app's 7-day column layout
 */

import { useMemo, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { CaseCard } from './CaseCard';
import { getDateColumns, toISODate, isPast, parseISODate } from '@/utils/dateUtils';
import type { Case } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface StageStats {
  design: number;
  production: number;
  finishing: number;
  qc: number;
  completed: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export function Board() {
  const { rows } = useData();
  const { activeDepartment } = useUI();
  const [showOverdue, setShowOverdue] = useState(true);
  const [showOnHold, setShowOnHold] = useState(true);

  // Generate 7-day columns
  const columns = useMemo(() => getDateColumns(7), []);

  // Filter and group cases by date
  const { casesByDate, overdueCases, onHoldCases, stats } = useMemo(() => {
    // Filter by active department
    const filteredRows = activeDepartment 
      ? rows.filter(r => {
          if (activeDepartment === 'Digital') return r.department === 'General';
          return r.department === activeDepartment;
        })
      : rows;

    // Separate cases
    const byDate: Record<string, Case[]> = {};
    const overdue: Case[] = [];
    const onHold: Case[] = [];

    // Initialize date buckets
    columns.forEach(col => {
      byDate[col.isoDate] = [];
    });

    // Sort cases into buckets
    for (const row of filteredRows) {
      // Skip archived
      if (row.archived) continue;
      
      // Check if on hold
      if (row.hold && !row.completed) {
        onHold.push(row);
        continue;
      }

      // Parse due date
      const dueDate = parseISODate(row.due);
      const isoDate = toISODate(dueDate);

      // Check if overdue
      if (isPast(dueDate) && !row.completed) {
        overdue.push(row);
        continue;
      }

      // Check if within horizon
      if (byDate[isoDate]) {
        byDate[isoDate].push(row);
      }
    }

    // Sort each column by priority then case number
    Object.keys(byDate).forEach(date => {
      byDate[date].sort((a, b) => {
        // Priority first
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
        // Then rush
        if (a.rush && !b.rush) return -1;
        if (!a.rush && b.rush) return 1;
        // Then by case number
        return a.caseNumber.localeCompare(b.caseNumber);
      });
    });

    // Calculate stats
    const allActive = filteredRows.filter(r => !r.archived);
    const stageStats: StageStats = {
      design: allActive.filter(r => r.stage === 'design' && !r.completed).length,
      production: allActive.filter(r => r.stage === 'production' && !r.completed).length,
      finishing: allActive.filter(r => r.stage === 'finishing' && !r.completed).length,
      qc: allActive.filter(r => r.stage === 'qc' && !r.completed).length,
      completed: allActive.filter(r => r.completed).length,
      total: allActive.length,
    };

    return { 
      casesByDate: byDate, 
      overdueCases: overdue.sort((a, b) => a.due.localeCompare(b.due)),
      onHoldCases: onHold.sort((a, b) => a.caseNumber.localeCompare(b.caseNumber)),
      stats: stageStats,
    };
  }, [rows, columns, activeDepartment]);

  // Count total cases in view
  const totalInView = useMemo(() => {
    return Object.values(casesByDate).reduce((sum, cases) => sum + cases.length, 0) +
           overdueCases.length + onHoldCases.length;
  }, [casesByDate, overdueCases, onHoldCases]);

  return (
    <div className="flex flex-col h-full">
      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-2 mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            {totalInView} cases in view
          </span>
          <div className="flex items-center gap-3">
            <StageIndicator label="Design" count={stats.design} color="bg-blue-500" />
            <StageIndicator label="Prod" count={stats.production} color="bg-green-500" />
            <StageIndicator label="Finish" count={stats.finishing} color="bg-purple-500" />
            <StageIndicator label="QC" count={stats.qc} color="bg-amber-500" />
            <StageIndicator label="Done" count={stats.completed} color="bg-gray-500" />
          </div>
        </div>
        
        {/* Toggle buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverdue(!showOverdue)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              showOverdue 
                ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                : 'bg-white/5 text-gray-500 border border-white/10'
            }`}
          >
            Overdue ({overdueCases.length})
          </button>
          <button
            onClick={() => setShowOnHold(!showOnHold)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              showOnHold 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' 
                : 'bg-white/5 text-gray-500 border border-white/10'
            }`}
          >
            On Hold ({onHoldCases.length})
          </button>
        </div>
      </div>

      {/* Main Board Layout */}
      <div className="flex-1 flex gap-2 overflow-hidden px-2">
        {/* Overdue Panel */}
        <AnimatePresence>
          {showOverdue && overdueCases.length > 0 && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden"
            >
              <SidePanel 
                title="Overdue" 
                cases={overdueCases} 
                color="red"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Date Columns */}
        <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide">
          {columns.map((col) => (
            <DateColumn
              key={col.isoDate}
              column={col}
              cases={casesByDate[col.isoDate] || []}
            />
          ))}
        </div>

        {/* On Hold Panel */}
        <AnimatePresence>
          {showOnHold && onHoldCases.length > 0 && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden"
            >
              <SidePanel 
                title="On Hold" 
                cases={onHoldCases} 
                color="orange"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function StageIndicator({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-gray-400">{label}:</span>
      <span className="text-white font-medium">{count}</span>
    </div>
  );
}

interface DateColumnProps {
  column: ReturnType<typeof getDateColumns>[0];
  cases: Case[];
}

function DateColumn({ column, cases }: DateColumnProps) {
  return (
    <div 
      className={`
        flex-1 min-w-[160px] max-w-[220px] flex flex-col rounded-xl
        ${column.isToday ? 'bg-yellow-500/10 ring-2 ring-yellow-500/30' : 'bg-white/5'}
        ${column.isWeekend ? 'opacity-80' : ''}
      `}
    >
      {/* Column Header */}
      <div 
        className={`
          px-3 py-2 rounded-t-xl text-center
          ${column.isToday ? 'bg-yellow-500/20' : 'bg-white/5'}
        `}
      >
        <div className={`text-sm font-semibold ${column.isToday ? 'text-yellow-300' : 'text-gray-300'}`}>
          {column.dayName}
        </div>
        <div className={`text-xs ${column.isToday ? 'text-yellow-400/80' : 'text-gray-500'}`}>
          {column.displayDate}
        </div>
        <div className={`text-xs mt-1 ${column.isToday ? 'text-yellow-400' : 'text-gray-400'}`}>
          {cases.length} {cases.length === 1 ? 'case' : 'cases'}
        </div>
      </div>

      {/* Cases List */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {cases.map((row) => (
            <CaseCard key={row.id} row={row} />
          ))}
        </AnimatePresence>
        
        {cases.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-sm">
            No cases due
          </div>
        )}
      </div>
    </div>
  );
}

interface SidePanelProps {
  title: string;
  cases: Case[];
  color: 'red' | 'orange';
}

function SidePanel({ title, cases, color }: SidePanelProps) {
  const colorClasses = {
    red: {
      bg: 'bg-red-500/10',
      header: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/30',
    },
    orange: {
      bg: 'bg-orange-500/10',
      header: 'bg-orange-500/20',
      text: 'text-orange-400',
      border: 'border-orange-500/30',
    },
  };

  const c = colorClasses[color];

  return (
    <div className={`h-full flex flex-col rounded-xl ${c.bg} border ${c.border}`}>
      {/* Header */}
      <div className={`px-3 py-2 rounded-t-xl ${c.header}`}>
        <div className={`text-sm font-semibold ${c.text} text-center`}>
          {title}
        </div>
        <div className={`text-xs ${c.text} text-center opacity-80`}>
          {cases.length} {cases.length === 1 ? 'case' : 'cases'}
        </div>
      </div>

      {/* Cases */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {cases.map((row) => (
            <CaseCard key={row.id} row={row} compact />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
