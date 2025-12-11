'use client';

/**
 * Board Component
 * 
 * Main board view showing cases organized by due date.
 * 
 * ARCHITECTURE COMPLIANCE:
 * ✅ Uses shared animations from lib/animations
 * ✅ Uses shared helper functions from lib/caseHelpers
 * ✅ No duplicated sorting logic - uses compareCases
 * ✅ Initializes pulse clock via shared function
 */

import { useMemo, useEffect } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { useData } from '@/contexts/DataContext';
import { useUI } from '@/contexts/UIContext';
import { DayCol } from './DayCol';
import { MetaCol } from './MetaCol';
import { toISODate, parseISODate, isWeekday, addDays, getToday } from '@/utils/dateUtils';
import { 
  SPRING,
  initPulseClock,
  compareCases,
} from '@/lib';
import type { Case } from '@/types/case';

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function Board() {
  const { rows } = useData();
  const { activeDepartment } = useUI();

  // Initialize pulse clock (using shared function from lib/animations)
  useEffect(() => {
    initPulseClock();
  }, []);

  // Build 7-day weekday horizon
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

  // Filter and bucket cases
  // Note: rows are already filtered by department in DataContext
  const { map, overdue, hold } = useMemo(() => {
    // Use rows directly - already filtered by DataProvider
    const filteredRows = rows;

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
      // Cases with dates beyond horizon are simply not shown
    });

    // Sort using shared compareCases function
    late.sort(compareCases);
    holdArr.sort(compareCases);
    Object.values(m).forEach(arr => arr.sort(compareCases));
    
    return { map: m, overdue: late, hold: holdArr };
  }, [rows, horizon, today]);

  // Show stage dividers only for Digital view
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
