'use client';

/**
 * PriorityBar - Animated priority indicator bar
 * 
 * Shows a red bar on the left side spanning all priority cases.
 * Shared by both DayCol and MetaCol.
 */

import { useRef, useCallback, useLayoutEffect } from 'react';
import { motion, useMotionValue } from 'framer-motion';

interface PriorityBarProps {
  columnRef: React.RefObject<HTMLDivElement | null>;
  rowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  prioIds: string[];
}

export function PriorityBar({ columnRef, rowRefs, prioIds }: PriorityBarProps) {
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

  // Continuous tracking during animations
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

  // Update when priority IDs change
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
}
