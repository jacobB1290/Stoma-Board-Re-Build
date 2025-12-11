'use client';

/**
 * ColumnShell - Shared column container component
 * 
 * Used by both DayCol and MetaCol to ensure consistent styling.
 * Uses CSS variables for colors (defined in globals.css).
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib';
import { layoutProps } from '@/lib/animations';

export type ColumnVariant = 'normal' | 'today' | 'overdue' | 'hold';

interface ColumnShellProps {
  children: React.ReactNode;
  variant: ColumnVariant;
  className?: string;
}

const variantClasses: Record<ColumnVariant, string> = {
  normal: 'bg-[var(--col-normal)]',
  today: 'bg-[var(--col-today)]',
  overdue: 'bg-[var(--col-overdue)]',
  hold: 'bg-[var(--col-hold)]',
};

export function ColumnShell({ children, variant, className }: ColumnShellProps) {
  return (
    <motion.div
      {...layoutProps}
      className={cn(
        'flex-1 min-w-[200px] flex flex-col p-4 rounded-lg',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </motion.div>
  );
}
