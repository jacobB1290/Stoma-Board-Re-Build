'use client';

/**
 * MetaCol Component
 * 
 * Renders Overdue (red) and On Hold (amber) columns.
 * 
 * ARCHITECTURE COMPLIANCE:
 * ✅ Uses shared components from board/shared
 * ✅ Uses shared helper functions from lib/caseHelpers
 * ✅ No duplicated logic - shares PriorityBar with DayCol
 * ✅ Uses shared animations from lib/animations
 */

import { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING, getPriorityIds } from '@/lib';
import type { Case } from '@/types/case';
import { CaseRow } from './CaseRow';
import { ColumnShell, ColumnHeader, PriorityBar } from './shared';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface MetaColProps {
  title: string;
  color: 'red' | 'amber';
  rows: Case[];
  today: Date;
  onHold?: boolean;
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function MetaCol({ title, color, rows, today, onHold = false }: MetaColProps) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnRef = useRef<HTMLDivElement>(null);

  // Calculate priority IDs using shared helper
  const prioIds = useMemo(() => getPriorityIds(rows), [rows]);

  // Map color prop to ColumnShell variant
  const variant = color === 'red' ? 'overdue' : 'hold';
  const isOverdue = color === 'red';

  const renderRows = (rowsToRender: Case[]) => {
    return rowsToRender.map((r) => (
      <CaseRow
        key={r.id}
        caseData={r}
        isOverdue={isOverdue}
        innerRef={(el) => {
          if (el) rowRefs.current[r.id] = el;
        }}
      />
    ));
  };

  return (
    <ColumnShell variant={variant}>
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
        <ColumnHeader text={title} variant="dark" />

        {/* Rows */}
        <AnimatePresence mode="popLayout">
          {rows.length ? (
            renderRows(rows)
          ) : (
            <motion.p
              layout
              transition={SPRING}
              className="m-2 text-center text-sm italic text-white/60"
            >
              {onHold ? 'none on hold' : 'all caught up!'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </ColumnShell>
  );
}
