'use client';

/**
 * MetaCol Component - EXACT REPLICA of original
 * Renders Overdue (red) and On Hold (amber) columns
 */

import { useMemo, useRef, useLayoutEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import clsx from 'clsx';
import type { Case } from '@/types/case';
import { CaseRow } from './CaseRow';

// ═══════════════════════════════════════════════════════════
// ANIMATION CONSTANTS (from original)
// ═══════════════════════════════════════════════════════════

const SPRING = { type: "spring" as const, stiffness: 500, damping: 40, mass: 2 };
const layout = { layout: true as const, transition: { layout: SPRING } };

// ═══════════════════════════════════════════════════════════
// PRIORITY BAR (from original)
// ═══════════════════════════════════════════════════════════

const StagePriorityBar = ({ 
  columnRef, 
  rowRefs, 
  prioIds 
}: { 
  columnRef: React.RefObject<HTMLDivElement | null>;
  rowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  prioIds: string[];
}) => {
  const barY = useMotionValue(0);
  const barHeight = useMotionValue(0);
  const animationFrame = useRef<number | null>(null);

  const track = useCallback(() => {
    if (prioIds.length === 0 || !columnRef.current) {
      barHeight.set(0);
      return;
    }

    const firstPrioElement = rowRefs.current[prioIds[0]];
    if (!firstPrioElement) {
      barHeight.set(0);
      return;
    }

    const columnRect = columnRef.current.getBoundingClientRect();
    const firstPrioRect = firstPrioElement.getBoundingClientRect();
    const relativeTop = firstPrioRect.top - columnRect.top;
    barY.set(relativeTop);

    let totalHeight = 0;
    prioIds.forEach((id) => {
      const el = rowRefs.current[id];
      if (el) {
        const rect = el.getBoundingClientRect();
        totalHeight = rect.bottom - firstPrioRect.top;
      }
    });

    barHeight.set(totalHeight);
  }, [prioIds, columnRef, rowRefs, barY, barHeight]);

  useLayoutEffect(() => {
    const startTracking = () => {
      const frame = () => {
        track();
        animationFrame.current = requestAnimationFrame(frame);
      };
      animationFrame.current = requestAnimationFrame(frame);
    };

    track();
    startTracking();

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [track]);

  useLayoutEffect(() => {
    track();
  }, [prioIds, track]);

  if (prioIds.length === 0) return null;

  return (
    <motion.div
      className="absolute w-2 rounded bg-red-600 z-10"
      style={{
        left: -13,
        y: barY,
        height: barHeight,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { duration: 0.2 } }}
    />
  );
};

// ═══════════════════════════════════════════════════════════
// COLUMN SHELL (Meta variant - from original)
// ═══════════════════════════════════════════════════════════

function ColumnShell({ children, metaColor }: { children: React.ReactNode; metaColor: 'red' | 'amber' }) {
  const bg = metaColor === "red" ? "bg-red-700" : "bg-amber-700";
  
  return (
    <motion.div
      {...layout}
      className={clsx("flex-1 flex flex-col p-4 rounded-lg", bg)}
    >
      {children}
    </motion.div>
  );
}

function ColumnHeader({ text }: { text: string }) {
  return (
    <motion.h2
      layout="position"
      transition={SPRING}
      className="mb-3 text-center font-semibold text-white"
    >
      {text}
    </motion.h2>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

interface MetaColProps {
  title: string;
  color: 'red' | 'amber';
  rows: Case[];
  today: Date;
  onHold?: boolean;
}

export function MetaCol({ title, color, rows, today, onHold = false }: MetaColProps) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnRef = useRef<HTMLDivElement>(null);

  // Calculate priority IDs
  const prioIds = useMemo(() => {
    const arr: string[] = [];
    for (const r of rows) {
      if (r.priority && !r.completed) arr.push(r.id);
      else break;
    }
    return arr;
  }, [rows]);

  const renderRows = (rowsToRender: Case[]) => {
    return rowsToRender.map((r) => (
      <CaseRow
        key={r.id}
        row={r}
        metaColor={color}
        innerRef={(el) => {
          if (el) rowRefs.current[r.id] = el;
        }}
      />
    ));
  };

  return (
    <ColumnShell metaColor={color}>
      <div className="relative" ref={columnRef}>
        <AnimatePresence>
          {prioIds.length > 0 && (
            <StagePriorityBar
              key="priority-bar"
              columnRef={columnRef}
              rowRefs={rowRefs}
              prioIds={prioIds}
            />
          )}
        </AnimatePresence>

        <ColumnHeader text={title} />

        <AnimatePresence mode="popLayout">
          {rows.length ? (
            renderRows(rows)
          ) : (
            <motion.p
              layout
              transition={SPRING}
              className="m-2 text-center text-sm italic text-white/60"
            >
              {onHold ? "none on hold" : "all caught up!"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </ColumnShell>
  );
}
