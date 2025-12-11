'use client';

/**
 * CaseRow Component - EXACT REPLICA of original RowShell
 * Renders a single case row matching the original app exactly
 */

import { memo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { Case } from '@/types/case';
import { useDispatch } from '@/contexts/DispatchContext';
import { parseISODate, toISODate, getToday } from '@/utils/dateUtils';

// ═══════════════════════════════════════════════════════════
// ANIMATION CONSTANTS (from original animationEngine.js)
// ═══════════════════════════════════════════════════════════

const SPRING = { type: "spring" as const, stiffness: 500, damping: 40, mass: 2 };
const FAST_EXIT = { type: "spring" as const, stiffness: 1800, damping: 40, mass: 0.1 };
const BUBBLE_SPRING = { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.8 };

const layout = { layout: true, transition: { layout: SPRING } };

// ═══════════════════════════════════════════════════════════
// HELPERS (from original)
// ═══════════════════════════════════════════════════════════

const split = (s = "") => {
  const txt = s.replace(/[()]/g, "").replace(/\s*-\s*/, " ").trim();
  const [id, ...rest] = txt.split(/\s+/);
  return [id, rest.join(" ")];
};

function inBlueWindow(iso: string | null) {
  if (!iso) return false;
  const now = new Date();
  const due = parseISODate(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due.getTime() !== today.getTime()) return false;
  const h = now.getHours(), m = now.getMinutes();
  return (h === 9 && m >= 45) || (h > 9 && h < 12);
}

function inRedWindow(iso: string | null) {
  if (!iso) return false;
  const now = new Date();
  const due = parseISODate(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() === today.getTime() && now.getHours() >= 12;
}

// ═══════════════════════════════════════════════════════════
// REVEAL BUTTON (from original)
// ═══════════════════════════════════════════════════════════

const BTN_W = 76;
const BTN_W_SMALL = 32;

const revealVar = {
  closed: { opacity: 0, scale: 0, width: 0, marginLeft: 0, transition: BUBBLE_SPRING },
  open: { opacity: 1, scale: 1, width: BTN_W, marginLeft: 8, transition: BUBBLE_SPRING },
  openSmall: { opacity: 1, scale: 1, width: BTN_W_SMALL, marginLeft: 8, transition: BUBBLE_SPRING },
};

function RevealButton({
  open,
  label,
  onClick,
  small = false,
}: {
  open: boolean;
  label: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  small?: boolean;
}) {
  const frosted = "backdrop-blur-md bg-white/35 ring-1 ring-white/30 text-white shadow hover:bg-white/40 transition-colors";

  return (
    <motion.button
      variants={revealVar}
      animate={open ? (small ? "openSmall" : "open") : "closed"}
      className={clsx(
        "overflow-hidden rounded px-3 py-1 text-sm font-semibold inline-block",
        frosted,
        small && "px-1 py-0.5"
      )}
      style={{ originX: 0, originY: 0.5 }}
      onClick={onClick}
    >
      {label}
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface CaseRowProps {
  row: Case;
  dayRow?: boolean;
  metaColor?: 'red' | 'amber';
  innerRef?: (el: HTMLDivElement | null) => void;
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

function CaseRowComponent({ row, dayRow = false, metaColor, innerRef }: CaseRowProps) {
  const { dispatch } = useDispatch();
  const [open, setOpen] = useState(false);

  const isPriority = row?.priority;
  const isRush = row?.rush;
  const isBBS = row?.caseType === 'bbs';
  const isFlex = row?.caseType === 'flex';
  const isStage2 = row?.stage2;

  // Flashing rules (from original)
  const flashBlue = isPriority && !row.completed && inBlueWindow(row.due);
  const flashRed = (!row.completed && metaColor === "red") || (isPriority && !row.completed && inRedWindow(row.due));

  // Base tint (EXACT from original)
  let bg = "bg-[#4D8490]"; // Default teal
  if (isStage2) bg = "bg-[#6F5BA8]"; // Purple for stage2
  else if (isBBS) bg = "bg-[#55679B]"; // Blue for BBS
  else if (isFlex) bg = "bg-[#C75A9E]"; // Pink for Flex

  // Overlay pulse
  const flashClass = flashBlue ? "glow" : flashRed ? "pulse-red" : "";
  const style: React.CSSProperties | undefined = flashClass
    ? {
        animationDelay: "var(--pulse-clock)",
        ...(flashRed && { "--pulse-color": "#ff1e1e" } as React.CSSProperties),
      }
    : undefined;

  // Rings (EXACT from original)
  const ringClass = isPriority
    ? "ring-[3px] ring-red-500"
    : isRush
    ? "ring-[3px] ring-orange-400"
    : "";

  const collapsed = !open && dayRow ? "justify-center" : "items-center";

  const [num, desc] = split(row.caseNumber);

  // Get stage from modifiers for QC check
  const isInQC = row.stage === 'qc';

  // Handlers
  const handleClick = useCallback(() => {
    setOpen(prev => !prev);
  }, []);

  const handleToggleComplete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.toggle_complete', { id: row.id });
    setOpen(false);
  }, [dispatch, row.id]);

  const handleToggleStage2 = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.toggle_stage2', { id: row.id });
    setOpen(false);
  }, [dispatch, row.id]);

  const handleChangeStage = useCallback((stage: 'design' | 'production' | 'finishing' | 'qc') => (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch('case.change_stage', { id: row.id, stage });
    setOpen(false);
  }, [dispatch, row.id]);

  const handleOpenHistory = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Open history modal
    dispatch('ui.open_editor', { id: row.id });
  }, [dispatch, row.id]);

  return (
    <motion.div
      {...layout}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: FAST_EXIT }}
      ref={innerRef}
      className={clsx(
        "relative mb-2 w-full flex px-4 py-2 pr-3 font-mono text-lg rounded",
        collapsed,
        bg,
        ringClass,
        flashClass,
        open ? "cursor-default" : "cursor-pointer hover:brightness-110",
        "overflow-visible text-white"
      )}
      style={style}
      onClick={handleClick}
    >
      {/* Left side - case number */}
      <motion.div
        layout
        transition={SPRING}
        className={clsx(
          "flex flex-col justify-center",
          open ? "flex-auto pl-3" : "mx-auto text-center"
        )}
      >
        <span className="leading-none">{num}</span>
        {desc && (
          <span className="mt-0.5 text-xs leading-none text-white/80">
            {desc}
          </span>
        )}
      </motion.div>

      {/* Buttons stack (when open) */}
      {open && (
        <div className="ml-auto flex gap-2 pr-2 items-center">
          {/* Small info button */}
          <RevealButton
            open={open}
            label={<span className="font-serif italic font-bold text-xs px-1">i</span>}
            small
            onClick={handleOpenHistory}
          />

          <div className="flex flex-col gap-2">
            {/* Digital cases - stage progression */}
            {row.department === "General" && !isInQC && !row.completed && (
              <>
                {row.stage === "design" && (
                  <>
                    <RevealButton open={open} label="Next →" onClick={handleChangeStage("production")} />
                    <RevealButton open={open} label="Repair" onClick={handleChangeStage("finishing")} />
                  </>
                )}
                {row.stage === "production" && (
                  <>
                    <RevealButton open={open} label="← Prev" onClick={handleChangeStage("design")} />
                    <RevealButton open={open} label="Next →" onClick={handleChangeStage("finishing")} />
                  </>
                )}
                {row.stage === "finishing" && (
                  <>
                    <RevealButton open={open} label="← Prev" onClick={handleChangeStage("production")} />
                    <RevealButton open={open} label="QC →" onClick={handleChangeStage("qc")} />
                  </>
                )}
              </>
            )}

            {/* QC cases */}
            {row.department === "General" && isInQC && !row.completed && (
              <>
                <RevealButton open={open} label="← Prev" onClick={handleChangeStage("finishing")} />
                <RevealButton open={open} label="Done" onClick={handleToggleComplete} />
              </>
            )}

            {/* Metal stage 2 */}
            {row.department === "Metal" && !row.stage2 && (
              <RevealButton open={open} label="Stage 2" onClick={handleToggleStage2} />
            )}

            {/* Done button for non-digital or non-QC cases */}
            {(row.department !== "General" || (!row.stage && !isInQC)) && !row.completed && (
              <RevealButton open={open} label="Done" onClick={handleToggleComplete} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export const CaseRow = memo(CaseRowComponent);
