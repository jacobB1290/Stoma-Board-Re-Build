'use client';

/**
 * DayCol Component
 * 
 * Renders a column for a specific date with case rows.
 * 
 * ARCHITECTURE COMPLIANCE:
 * ✅ Uses shared components from board/shared
 * ✅ Uses shared helper functions from lib/caseHelpers
 * ✅ No duplicated logic - PriorityBar, StageDivider are shared
 * ✅ Uses shared animations from lib/animations
 */

import { useMemo, useRef, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  cn,
  SPRING,
  groupDigitalCasesByStage,
  groupMetalCasesByStage,
  getPriorityIds,
} from '@/lib';
import type { Case } from '@/types/case';
import { CaseRow } from './CaseRow';
import { ColumnShell, ColumnHeader, PriorityBar, StageDivider } from './shared';

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/** Format date for display */
const formatDate = (d: Date): string =>
  d instanceof Date
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface DayColProps {
  date: Date;
  rows: Case[];
  isToday: boolean;
  showStageDividers?: boolean;
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function DayCol({ date, rows, isToday, showStageDividers = false }: DayColProps) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnRef = useRef<HTMLDivElement>(null);
  const [dividersReady, setDividersReady] = useState(false);

  // Calculate priority IDs using shared helper
  const prioIds = useMemo(() => getPriorityIds(rows), [rows]);

  // Delay dividers to match row entrance animation
  useLayoutEffect(() => {
    if (showStageDividers) {
      setDividersReady(false);
      const timer = setTimeout(() => {
        setDividersReady(true);
      }, 450);
      return () => clearTimeout(timer);
    } else {
      setDividersReady(false);
    }
  }, [showStageDividers, rows.length]);

  // Determine variant for text colors
  const textVariant = isToday ? 'light' : 'dark';

  // Render rows helper
  const renderRows = (rowsToRender: Case[]) => {
    return rowsToRender.map((r) => (
      <CaseRow
        key={r.id}
        caseData={r}
        innerRef={(el) => {
          if (el) rowRefs.current[r.id] = el;
        }}
      />
    ));
  };

  // Render content with stage dividers if enabled
  const renderContent = () => {
    if (!showStageDividers || rows.length === 0) {
      return renderRows(rows);
    }

    const hasDigitalCases = rows.some(r => r.department === 'General' && !r.completed);
    const hasMetalCases = rows.some(r => r.department === 'Metal' && !r.completed);

    // Digital view with stage dividers
    if (hasDigitalCases) {
      const groups = groupDigitalCasesByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.design.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Design" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.design)}
            </>
          )}
          {groups.production.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Production" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.production)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Finishing" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.qc.length > 0 && (
            <>
              {dividersReady && <StageDivider label="QC" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.qc)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    }

    // Metal view with stage dividers
    if (hasMetalCases) {
      const groups = groupMetalCasesByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.development.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Development" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.development)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Finishing" variant={textVariant} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    }

    // Fallback - no special grouping
    return renderRows(rows);
  };

  return (
    <ColumnShell variant={isToday ? 'today' : 'normal'}>
      <div className="relative" ref={columnRef}>
        {/* Priority bar indicator */}
        <AnimatePresence>
          {prioIds.length > 0 && (
            <PriorityBar
              key="priority-bar"
              columnRef={columnRef}
              rowRefs={rowRefs}
              prioIds={prioIds}
            />
          )}
        </AnimatePresence>

        {/* Column header */}
        <ColumnHeader text={formatDate(date)} variant={textVariant} />

        {/* Rows */}
        <AnimatePresence mode="popLayout">
          {rows.length ? (
            renderContent()
          ) : (
            <motion.p
              layout
              transition={SPRING}
              className={cn(
                'm-2 text-center text-sm italic',
                isToday ? 'text-black/60' : 'text-white/60'
              )}
            >
              no cases
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </ColumnShell>
  );
}
