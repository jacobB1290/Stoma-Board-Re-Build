/**
 * Shared Animation Configuration
 * 
 * SINGLE SOURCE OF TRUTH for all animations in the app.
 * Import these instead of defining inline animations.
 */

import type { Transition, Variants } from 'framer-motion';

// ═══════════════════════════════════════════════════════════
// SPRING CONFIGURATIONS
// ═══════════════════════════════════════════════════════════

/** Standard spring for layout animations */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 40,
  mass: 2,
};

/** Fast spring for exits/quick transitions */
export const FAST_SPRING: Transition = {
  type: "spring",
  stiffness: 1800,
  damping: 40,
  mass: 0.1,
};

/** Bouncy spring for button reveals */
export const BUBBLE_SPRING: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

// ═══════════════════════════════════════════════════════════
// LAYOUT PROPS
// ═══════════════════════════════════════════════════════════

/** Standard layout animation props - spread onto motion components */
export const layoutProps = {
  layout: true as const,
  transition: { layout: SPRING },
};

// ═══════════════════════════════════════════════════════════
// ENTRANCE/EXIT VARIANTS
// ═══════════════════════════════════════════════════════════

/** Standard row entrance/exit */
export const rowVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8, transition: FAST_SPRING },
};

/** Scale entrance for cards/modals */
export const scaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/** Slide up entrance */
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

// ═══════════════════════════════════════════════════════════
// BUTTON REVEAL VARIANTS
// ═══════════════════════════════════════════════════════════

const BTN_WIDTH = 76;
const BTN_WIDTH_SMALL = 32;

export const revealButtonVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0,
    width: 0,
    marginLeft: 0,
    transition: BUBBLE_SPRING,
  },
  open: {
    opacity: 1,
    scale: 1,
    width: BTN_WIDTH,
    marginLeft: 8,
    transition: BUBBLE_SPRING,
  },
  openSmall: {
    opacity: 1,
    scale: 1,
    width: BTN_WIDTH_SMALL,
    marginLeft: 8,
    transition: BUBBLE_SPRING,
  },
};

// ═══════════════════════════════════════════════════════════
// DIVIDER ANIMATION
// ═══════════════════════════════════════════════════════════

export const dividerVariants: Variants = {
  initial: { opacity: 0, scaleX: 0 },
  animate: {
    opacity: 1,
    scaleX: 1,
    transition: {
      opacity: { duration: 0.2 },
      scaleX: { duration: 0.25, ease: "easeOut" },
    },
  },
  exit: {
    opacity: 0,
    scaleX: 0,
    transition: {
      opacity: { duration: 0.1 },
      scaleX: { duration: 0.15 },
    },
  },
};

// ═══════════════════════════════════════════════════════════
// PULSE CLOCK INITIALIZATION
// ═══════════════════════════════════════════════════════════

const PULSE_CYCLE_MS = 1500;

/**
 * Initialize the pulse clock CSS variable.
 * Call this once at app startup.
 */
export function initPulseClock(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __pulseClockInit?: boolean }).__pulseClockInit) return;
  
  (window as unknown as { __pulseClockInit?: boolean }).__pulseClockInit = true;
  
  const tick = () => {
    document.documentElement.style.setProperty(
      "--pulse-clock",
      `${-(Date.now() % PULSE_CYCLE_MS) / 1000}s`
    );
  };
  
  tick();
  setInterval(tick, PULSE_CYCLE_MS);
}

// ═══════════════════════════════════════════════════════════
// PULSE WINDOW HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Check if we're in the "blue glow" window (9:45 AM - 12:00 PM)
 * Used for priority cases due today
 */
export function isInBlueWindow(): boolean {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  return (h === 9 && m >= 45) || (h > 9 && h < 12);
}

/**
 * Check if we're in the "red pulse" window (after 12:00 PM)
 * Used for urgent priority cases
 */
export function isInRedWindow(): boolean {
  const now = new Date();
  return now.getHours() >= 12;
}
