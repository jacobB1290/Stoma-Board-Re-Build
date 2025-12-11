'use client';

/**
 * StageDivider - Animated divider between stage groups
 * 
 * Shows a horizontal line with stage label (e.g., "Design", "Production").
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib';
import { dividerVariants } from '@/lib/animations';

interface StageDividerProps {
  label: string;
  variant?: 'light' | 'dark'; // light = dark colors (for today), dark = white colors
  delay?: number;
}

export function StageDivider({ label, variant = 'dark', delay = 0 }: StageDividerProps) {
  const isLight = variant === 'light';
  
  return (
    <motion.div
      layout
      variants={dividerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      custom={delay}
      className="relative my-2 flex items-center"
    >
      <div className={cn('flex-1 h-px', isLight ? 'bg-black/20' : 'bg-white/20')} />
      <span className={cn(
        'px-2 text-[10px] font-medium uppercase tracking-wider',
        isLight ? 'text-black/50' : 'text-white/50'
      )}>
        {label}
      </span>
      <div className={cn('flex-1 h-px', isLight ? 'bg-black/20' : 'bg-white/20')} />
    </motion.div>
  );
}
