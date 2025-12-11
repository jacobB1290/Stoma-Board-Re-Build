'use client';

/**
 * CaseRow Component
 * 
 * A THIN UI component that renders a single case row.
 * 
 * ARCHITECTURE COMPLIANCE:
 * ✅ All interactions dispatch actions (no direct business logic)
 * ✅ Uses shared animations from lib/animations
 * ✅ Uses CSS variables for colors (via caseHelpers)
 * ✅ Uses shared helper functions from lib/caseHelpers
 * ✅ No duplicated logic - everything imported from lib
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch } from '@/contexts/DispatchContext';
import { 
  cn,
  layoutProps, 
  rowVariants, 
  revealButtonVariants, 
  SPRING,
  isInBlueWindow,
  isInRedWindow,
  getRowBackground,
  parseCaseNumber,
} from '@/lib';
import type { Case, CaseStage } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CaseRowProps {
  caseData: Case;
  isOverdue?: boolean;
  innerRef?: (el: HTMLDivElement | null) => void;
}

// ═══════════════════════════════════════════════════════════
// PURE HELPER FUNCTIONS (no side effects)
// ═══════════════════════════════════════════════════════════

/** Determine CSS class for pulse animation based on case state and time */
function getPulseClass(c: Case, isOverdue: boolean): string {
  const isPriority = c.priority;
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = c.due.slice(0, 10) === todayStr;
  
  // Red pulse for overdue cases
  if (isOverdue && !c.completed) return 'pulse-red';
  
  // Blue glow for priority cases due today (9:45 AM - 12:00 PM)
  if (isPriority && !c.completed && isToday && isInBlueWindow()) return 'glow';
  
  // Red pulse for priority cases due today (after 12:00 PM)
  if (isPriority && !c.completed && isToday && isInRedWindow()) return 'pulse-red';
  
  return '';
}

// ═══════════════════════════════════════════════════════════
// REVEAL BUTTON SUB-COMPONENT
// ═══════════════════════════════════════════════════════════

function RevealButton({
  isOpen,
  label,
  onClick,
  small = false,
}: {
  isOpen: boolean;
  label: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  small?: boolean;
}) {
  return (
    <motion.button
      variants={revealButtonVariants}
      animate={isOpen ? (small ? 'openSmall' : 'open') : 'closed'}
      className={cn(
        'overflow-hidden rounded px-3 py-1 text-sm font-semibold',
        'frosted-button', // Uses CSS class from globals.css
        small && 'px-1 py-0.5'
      )}
      style={{ originX: 0, originY: 0.5 }}
      onClick={onClick}
    >
      {label}
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

function CaseRowComponent({ caseData, isOverdue = false, innerRef }: CaseRowProps) {
  const { dispatch } = useDispatch();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Use shared helper functions
  const [caseId, caseDesc] = parseCaseNumber(caseData.caseNumber);
  const pulseClass = getPulseClass(caseData, isOverdue);
  const isQC = caseData.stage === 'qc';
  const isDigital = caseData.department === 'General';
  const isMetal = caseData.department === 'Metal';
  
  // ─── Event Handlers (ALL dispatch actions - no direct logic) ────
  
  const handleRowClick = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);
  
  const handleOpenEditor = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('ui.open_editor', { id: caseData.id });
  }, [dispatch, caseData.id]);
  
  const handleToggleComplete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.toggle_complete', { id: caseData.id });
    setIsExpanded(false);
  }, [dispatch, caseData.id]);
  
  const handleToggleStage2 = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.toggle_stage2', { id: caseData.id });
    setIsExpanded(false);
  }, [dispatch, caseData.id]);
  
  const handleChangeStage = useCallback((stage: CaseStage, isRepair = false) => (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.change_stage', { id: caseData.id, stage, isRepair });
    setIsExpanded(false);
  }, [dispatch, caseData.id]);
  
  const handleTogglePriority = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch('case.toggle_priority', { id: caseData.id });
  }, [dispatch, caseData.id]);
  
  // ─── Render ────────────────────────────────────────────────
  
  return (
    <motion.div
      {...layoutProps}
      variants={rowVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      ref={innerRef}
      onClick={handleRowClick}
      onContextMenu={handleTogglePriority}
      className={cn(
        // Base styles
        'relative mb-2 w-full flex px-4 py-2 pr-3',
        'font-mono text-lg rounded text-white',
        'overflow-visible',
        // Layout based on expansion
        !isExpanded && 'justify-center',
        isExpanded && 'items-center',
        // Cursor
        isExpanded ? 'cursor-default' : 'cursor-pointer hover:brightness-110',
        // Priority ring (red, 3px)
        caseData.priority && 'ring-[3px] ring-red-500',
        // Rush ring (orange, only if not priority)
        !caseData.priority && caseData.rush && 'ring-[3px] ring-orange-400',
        // Pulse animation class
        pulseClass,
      )}
      style={{ 
        backgroundColor: getRowBackground(caseData),
        animationDelay: pulseClass ? 'var(--pulse-clock)' : undefined,
      }}
    >
      {/* Case number display */}
      <motion.div
        layout
        transition={SPRING}
        className={cn(
          'flex flex-col justify-center',
          isExpanded ? 'flex-auto pl-3' : 'mx-auto text-center'
        )}
      >
        <span className="leading-none">{caseId}</span>
        {caseDesc && (
          <span className="mt-0.5 text-xs leading-none text-white/80">
            {caseDesc}
          </span>
        )}
      </motion.div>

      {/* Action buttons (when expanded) */}
      <AnimatePresence>
        {isExpanded && (
          <div className="ml-auto flex gap-2 pr-2 items-center">
            {/* Info button */}
            <RevealButton
              isOpen={isExpanded}
              label={<span className="font-serif italic font-bold text-xs px-1">i</span>}
              small
              onClick={handleOpenEditor}
            />

            <div className="flex flex-col gap-2">
              {/* Digital stage progression */}
              {isDigital && !isQC && !caseData.completed && (
                <>
                  {caseData.stage === 'design' && (
                    <>
                      <RevealButton isOpen={isExpanded} label="Next →" onClick={handleChangeStage('production')} />
                      <RevealButton isOpen={isExpanded} label="Repair" onClick={handleChangeStage('finishing', true)} />
                    </>
                  )}
                  {caseData.stage === 'production' && (
                    <>
                      <RevealButton isOpen={isExpanded} label="← Prev" onClick={handleChangeStage('design')} />
                      <RevealButton isOpen={isExpanded} label="Next →" onClick={handleChangeStage('finishing')} />
                    </>
                  )}
                  {caseData.stage === 'finishing' && (
                    <>
                      <RevealButton isOpen={isExpanded} label="← Prev" onClick={handleChangeStage('production')} />
                      <RevealButton isOpen={isExpanded} label="QC →" onClick={handleChangeStage('qc')} />
                    </>
                  )}
                </>
              )}

              {/* QC stage */}
              {isDigital && isQC && !caseData.completed && (
                <>
                  <RevealButton isOpen={isExpanded} label="← Prev" onClick={handleChangeStage('finishing')} />
                  <RevealButton isOpen={isExpanded} label="Done" onClick={handleToggleComplete} />
                </>
              )}

              {/* Metal stage 2 toggle */}
              {isMetal && !caseData.stage2 && !caseData.completed && (
                <RevealButton isOpen={isExpanded} label="Stage 2" onClick={handleToggleStage2} />
              )}

              {/* Done button for non-Digital or non-QC cases */}
              {(!isDigital || (!caseData.stage && !isQC)) && !caseData.completed && (
                <RevealButton isOpen={isExpanded} label="Done" onClick={handleToggleComplete} />
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Memoize to prevent unnecessary re-renders
export const CaseRow = memo(CaseRowComponent);
