'use client';

/**
 * Board Component - EXACT REPLICA of original
 * Main board view showing cases organized by due date
 */

import { useMemo, useState, useEffect } from 'react';
import { LayoutGroup, motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { DayCol } from './DayCol';
import { MetaCol } from './MetaCol';
import { toISODate, parseISODate, isWeekday, addDays, getToday } from '@/utils/dateUtils';
import type { Case } from '@/types/case';

// Animation constants from original animationEngine.js
const SPRING = { type: "spring" as const, stiffness: 500, damping: 40, mass: 2 };

// 1.5-s master clock → CSS var --pulse-clock (from original)
const CYCLE = 1500;

// Ranking function from original
const rank = (r: Case) =>
  r.priority
    ? 0
    : r.rush
    ? 1
    : r.stage2 && r.department === 'Metal'
    ? 3
    : r.caseType === 'bbs'
    ? 4
    : r.caseType === 'flex'
    ? 5
    : 2;

const compare = (a: Case, b: Case) => {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const da = new Date(a.due);
  const db = new Date(b.due);
  if (da < db) return -1;
  if (da > db) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
};

export function Board() {
  const { rows } = useData();
  const { activeDepartment } = useUI();

  // Initialize pulse clock (from original)
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as unknown as {__pulseClockInit?: boolean}).__pulseClockInit) {
      (window as unknown as {__pulseClockInit?: boolean}).__pulseClockInit = true;
      const tick = () =>
        document.documentElement.style.setProperty(
          "--pulse-clock",
          `${-(Date.now() % CYCLE) / 1000}s`
        );
      tick();
      setInterval(tick, CYCLE);
    }
  }, []);

  // Build 7-day weekday horizon (like original)
  const horizon = useMemo(() => {
    const out: Date[] = [];
    let p = getToday();
    while (out.length < 7) {
      if (isWeekday(p)) out.push(new Date(p));
      p = addDays(p, 1);
    }
    return out;
  }, []);

  const today = getToday();

  // Filter and bucket cases (exact logic from original)
  const { map, overdue, hold } = useMemo(() => {
    // Filter by department
    const filteredRows = activeDepartment 
      ? rows.filter(r => {
          if (activeDepartment === 'Digital') return r.department === 'General';
          return r.department === activeDepartment;
        })
      : rows;

    // Initialize buckets
    const m: Record<string, Case[]> = {};
    horizon.forEach(d => {
      m[toISODate(d)] = [];
    });
    
    const late: Case[] = [];
    const holdArr: Case[] = [];

    filteredRows.forEach(r => {
      if (r.completed) return;
      if (r.hold) {
        holdArr.push(r);
        return;
      }
      const key = toISODate(parseISODate(r.due));
      if (key < toISODate(today)) {
        late.push(r);
      } else if (m[key]) {
        m[key].push(r);
      }
    });

    // Sort each bucket
    late.sort(compare);
    holdArr.sort(compare);
    Object.values(m).forEach(arr => arr.sort(compare));

    return { map: m, overdue: late, hold: holdArr };
  }, [rows, horizon, today, activeDepartment]);

  // Determine if we should show stage dividers (Digital view only)
  const showStageDividers = activeDepartment === 'Digital';

  return (
    <main className="flex-1 overflow-auto p-4 pb-44">
      <LayoutGroup>
        <motion.div
          layout
          transition={{ layout: SPRING }}
          className="flex gap-4 flex-nowrap"
        >
          {/* Left side: Overdue + On Hold stacked */}
          <div className="w-60 flex-shrink-0 flex flex-col gap-4">
            <MetaCol
              title="Overdue"
              color="red"
              rows={overdue}
              today={today}
            />
            <MetaCol
              title="On Hold"
              color="amber"
              rows={hold}
              today={today}
              onHold
            />
          </div>

          {/* Day columns */}
          {horizon.map(d => (
            <DayCol
              key={toISODate(d)}
              date={d}
              rows={map[toISODate(d)] || []}
              isToday={toISODate(d) === toISODate(today)}
              showStageDividers={showStageDividers}
            />
          ))}
        </motion.div>
      </LayoutGroup>
    </main>
  );
}
