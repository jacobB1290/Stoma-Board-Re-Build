'use client';

/**
 * ColumnHeader - Shared column header component
 * 
 * Used by both DayCol and MetaCol for consistent header styling.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib';
import { SPRING } from '@/lib/animations';

interface ColumnHeaderProps {
  text: string;
  variant?: 'light' | 'dark'; // light = dark text (for today column), dark = white text
}

export function ColumnHeader({ text, variant = 'dark' }: ColumnHeaderProps) {
  return (
    <motion.h2
      layout="position"
      transition={SPRING}
      className={cn(
        'mb-3 text-center font-semibold',
        variant === 'light' ? 'text-black' : 'text-white'
      )}
    >
      {text}
    </motion.h2>
  );
}
