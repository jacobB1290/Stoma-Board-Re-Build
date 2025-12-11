'use client';

/**
 * CaseCard Component
 * Renders a single case card with all status indicators
 * Matches the original app's visual design
 */

import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Case } from '@/types/case';
import { useDispatch } from '@/contexts/DispatchContext';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CaseCardProps {
  row: Case;
  onClick?: (row: Case) => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const DEPT_COLORS: Record<string, string> = {
  Digital: '#2dd4bf', // teal
  General: '#2dd4bf', // same as Digital (DB stores "General")
  Metal: '#a855f7',   // purple
  'C&B': '#f97316',   // orange
};

const DEPT_BG_CLASSES: Record<string, string> = {
  Digital: 'bg-teal-500/20 border-teal-500/40',
  General: 'bg-teal-500/20 border-teal-500/40',
  Metal: 'bg-purple-500/20 border-purple-500/40',
  'C&B': 'bg-orange-500/20 border-orange-500/40',
};

const STAGE_COLORS: Record<string, string> = {
  design: '#3b82f6',     // blue
  production: '#22c55e', // green
  finishing: '#a855f7',  // purple
  qc: '#f59e0b',         // amber
};

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

function CaseCardComponent({ row, onClick, compact = false }: CaseCardProps) {
  const { dispatch } = useDispatch();

  // Determine department for styling (DB stores "General" for "Digital")
  const displayDept = row.department === 'General' ? 'Digital' : row.department;
  const deptColor = DEPT_COLORS[displayDept] || DEPT_COLORS.Digital;
  const bgClass = DEPT_BG_CLASSES[displayDept] || DEPT_BG_CLASSES.Digital;

  // Handle click to open editor
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(row);
    } else {
      dispatch('ui.open_editor', { id: row.id });
    }
  }, [dispatch, onClick, row]);

  // Handle priority toggle on right-click
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dispatch('case.toggle_priority', { id: row.id });
    },
    [dispatch, row.id]
  );

  // Handle stage advance on double-click
  const handleDoubleClick = useCallback(() => {
    // Determine next stage
    const stages = ['design', 'production', 'finishing', 'qc', 'done'];
    const currentIndex = row.stage ? stages.indexOf(row.stage) : -1;
    
    if (currentIndex >= 0 && currentIndex < stages.length - 1) {
      const nextStage = stages[currentIndex + 1];
      if (nextStage === 'done') {
        dispatch('case.toggle_complete', { id: row.id });
      } else {
        dispatch('case.change_stage', { 
          id: row.id, 
          stage: nextStage as 'design' | 'production' | 'finishing' | 'qc' 
        });
      }
    }
  }, [dispatch, row]);

  // Compact card for smaller displays
  if (compact) {
    return (
      <div
        className={`px-2 py-1 rounded text-xs cursor-pointer transition-colors ${bgClass} hover:opacity-80`}
        onClick={handleClick}
        style={{ borderLeftWidth: '3px', borderLeftColor: deptColor }}
      >
        <span className="font-mono font-semibold" style={{ color: deptColor }}>
          {row.caseNumber}
        </span>
        {row.priority && <span className="ml-1 text-yellow-400">★</span>}
        {row.rush && <span className="ml-1 text-red-400">⚡</span>}
        {row.hold && <span className="ml-1 text-orange-400">⏸</span>}
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`
        relative p-3 rounded-xl cursor-pointer
        border transition-all duration-150
        ${bgClass}
        ${row.completed ? 'opacity-60' : ''}
        ${row.hold ? 'ring-2 ring-orange-500/50' : ''}
        hover:shadow-lg
      `}
      style={{ 
        borderLeftWidth: '4px', 
        borderLeftColor: deptColor,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {/* Case Number & Priority */}
      <div className="flex items-center justify-between mb-1">
        <span 
          className="font-mono font-bold text-sm"
          style={{ color: deptColor }}
        >
          {row.caseNumber}
        </span>
        
        {/* Status indicators */}
        <div className="flex items-center gap-1">
          {row.priority && (
            <span className="text-yellow-400 text-sm" title="Priority">★</span>
          )}
          {row.rush && (
            <span className="text-red-400 text-xs" title="Rush">⚡</span>
          )}
          {row.hold && (
            <span className="text-orange-400 text-xs" title="On Hold">⏸</span>
          )}
          {row.stage2 && (
            <span className="text-purple-400 text-xs" title="Stage 2">②</span>
          )}
        </div>
      </div>

      {/* Case Type indicator */}
      {row.caseType && row.caseType !== 'general' && (
        <div className="text-xs text-gray-400 truncate uppercase">
          {row.caseType}
        </div>
      )}

      {/* Stage Progress Bar */}
      {row.stage && !row.completed && (
        <div className="mt-2 flex gap-0.5">
          {['design', 'production', 'finishing', 'qc'].map((stage) => {
            const isActive = row.stage === stage;
            const isPassed = ['design', 'production', 'finishing', 'qc'].indexOf(row.stage || '') > 
                            ['design', 'production', 'finishing', 'qc'].indexOf(stage);
            
            return (
              <div
                key={stage}
                className="flex-1 h-1 rounded-full"
                style={{
                  backgroundColor: isActive || isPassed
                    ? STAGE_COLORS[stage]
                    : 'rgba(255,255,255,0.1)',
                }}
                title={stage.charAt(0).toUpperCase() + stage.slice(1)}
              />
            );
          })}
        </div>
      )}

      {/* Completed checkmark */}
      {row.completed && (
        <div className="absolute top-2 right-2">
          <span className="text-green-400 text-lg">✓</span>
        </div>
      )}

      {/* Case type badge */}
      {row.caseType && row.caseType !== 'general' && (
        <div className="mt-2">
          <span 
            className={`
              text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold
              ${row.caseType === 'bbs' ? 'bg-blue-500/30 text-blue-300' : ''}
              ${row.caseType === 'flex' ? 'bg-green-500/30 text-green-300' : ''}
            `}
          >
            {row.caseType}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// Memoize for performance
export const CaseCard = memo(CaseCardComponent);
