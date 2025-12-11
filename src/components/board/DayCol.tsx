'use client';

/**
 * DayCol Component - EXACT REPLICA of original
 * Renders a column for a specific date with case rows
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
// HELPER FUNCTIONS (from original)
// ═══════════════════════════════════════════════════════════

const fmt = (d: Date) =>
  d instanceof Date
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

// Helper to get stage from case
const getStageFromCase = (row: Case) => {
  return row.stage || 'design';
};

// Helper to group rows by stage (for Digital)
const groupRowsByStage = (rows: Case[]) => {
  const groups: Record<string, Case[]> = {
    design: [],
    production: [],
    finishing: [],
    qc: [],
    other: [],
  };

  rows.forEach((row) => {
    if (row.department === "General" && !row.completed) {
      const stage = getStageFromCase(row);
      if (groups[stage]) {
        groups[stage].push(row);
      } else {
        groups.other.push(row);
      }
    } else if (row.department === "Metal" && !row.completed) {
      groups.other.push(row);
    } else {
      groups.other.push(row);
    }
  });

  return groups;
};

// Helper to group metal rows by stage
const groupMetalRowsByStage = (rows: Case[]) => {
  const groups: Record<string, Case[]> = {
    development: [],
    finishing: [],
    other: [],
  };

  rows.forEach((row) => {
    if (row.department === "Metal" && !row.completed) {
      if (!row.stage2) {
        groups.development.push(row);
      } else {
        groups.finishing.push(row);
      }
    } else {
      groups.other.push(row);
    }
  });

  return groups;
};

// ═══════════════════════════════════════════════════════════
// STAGE DIVIDER (from original)
// ═══════════════════════════════════════════════════════════

const StageDivider = ({ label, isToday, delay = 0 }: { label: string; isToday: boolean; delay?: number }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scaleX: 0 }}
    animate={{
      opacity: 1,
      scaleX: 1,
      transition: {
        opacity: { duration: 0.2, delay },
        scaleX: { duration: 0.25, delay, ease: "easeOut" },
      },
    }}
    exit={{
      opacity: 0,
      scaleX: 0,
      transition: {
        opacity: { duration: 0.1 },
        scaleX: { duration: 0.15 },
      },
    }}
    className="relative my-2 flex items-center"
  >
    <div className={clsx("flex-1 h-px", isToday ? "bg-black/20" : "bg-white/20")} />
    <span className={clsx(
      "px-2 text-[10px] font-medium uppercase tracking-wider",
      isToday ? "text-black/50" : "text-white/50"
    )}>
      {label}
    </span>
    <div className={clsx("flex-1 h-px", isToday ? "bg-black/20" : "bg-white/20")} />
  </motion.div>
);

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
// COLUMN SHELL (from original)
// ═══════════════════════════════════════════════════════════

function ColumnShell({ children, isToday }: { children: React.ReactNode; isToday: boolean }) {
  const bg = isToday ? "bg-yellow-100" : "bg-[#16525F]";
  
  return (
    <motion.div
      {...layout}
      className={clsx("flex-1 min-w-[200px] flex flex-col p-4 rounded-lg", bg)}
    >
      {children}
    </motion.div>
  );
}

function ColumnHeader({ text, isToday }: { text: string; isToday: boolean }) {
  return (
    <motion.h2
      layout="position"
      transition={SPRING}
      className={clsx(
        "mb-3 text-center font-semibold",
        isToday ? "text-black" : "text-white"
      )}
    >
      {text}
    </motion.h2>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

interface DayColProps {
  date: Date;
  rows: Case[];
  isToday: boolean;
  showStageDividers?: boolean;
}

export function DayCol({ date, rows, isToday, showStageDividers = false }: DayColProps) {
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const columnRef = useRef<HTMLDivElement>(null);
  const [dividersReady, setDividersReady] = useState(false);

  // Calculate priority IDs
  const prioIds = useMemo(() => {
    const arr: string[] = [];
    for (const r of rows) {
      if (r.priority && !r.completed) arr.push(r.id);
      else break;
    }
    return arr;
  }, [rows]);

  // Delay dividers to match animation
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

  // Render rows grouped by stage if dividers enabled
  const renderContent = () => {
    if (!showStageDividers || rows.length === 0) {
      return renderRows(rows);
    }

    const hasDigitalCases = rows.some(r => r.department === "General" && !r.completed);
    const hasMetalCases = rows.some(r => r.department === "Metal" && !r.completed);

    if (hasDigitalCases) {
      const groups = groupRowsByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.design.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Design" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.design)}
            </>
          )}
          {groups.production.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Production" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.production)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Finishing" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.qc.length > 0 && (
            <>
              {dividersReady && <StageDivider label="QC" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.qc)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    } else if (hasMetalCases) {
      const groups = groupMetalRowsByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.development.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Development" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.development)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && <StageDivider label="Finishing" isToday={isToday} delay={dividerIndex++ * 0.03} />}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    }

    return renderRows(rows);
  };

  const renderRows = (rowsToRender: Case[]) => {
    return rowsToRender.map((r) => (
      <CaseRow
        key={r.id}
        row={r}
        dayRow
        innerRef={(el) => {
          if (el) rowRefs.current[r.id] = el;
        }}
      />
    ));
  };

  return (
    <ColumnShell isToday={isToday}>
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

        <ColumnHeader text={fmt(date)} isToday={isToday} />

        <AnimatePresence mode="popLayout">
          {rows.length ? (
            renderContent()
          ) : (
            <motion.p
              layout
              transition={SPRING}
              className={clsx(
                "m-2 text-center text-sm italic",
                isToday ? "text-black/60" : "text-white/60"
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
