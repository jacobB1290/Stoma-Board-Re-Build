// src/animationEngine.js
import React from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { parseLocalDate } from "./utils/date";

/* ───────── springs & layout ───────── */
export const SPRING = { type: "spring", stiffness: 500, damping: 40, mass: 2 };
export const FAST_EXIT = {
  type: "spring",
  stiffness: 1800,
  damping: 40,
  mass: 0.1,
};
export const TWEEN = { type: "tween", ease: "easeOut", duration: 0.25 };
export const layout = { layout: true, transition: { layout: SPRING } };

/* 1.5-s master clock → CSS var --pulse-clock */
const CYCLE = 1500;
if (typeof window !== "undefined" && !window.__pulseClockInit) {
  window.__pulseClockInit = true;
  const tick = () =>
    document.documentElement.style.setProperty(
      "--pulse-clock",
      `${-(Date.now() % CYCLE) / 1000}s`
    );
  tick();
  setInterval(tick, CYCLE);
}

/* helper */
export const guard = (k, fn) =>
  fn || (() => console.warn(`[animationEngine] missing: ${k}`));

/* ───────── Column shell ───────── */
export function ColumnShell({ children, isToday, metaColor }) {
  const bg =
    metaColor === "red"
      ? "bg-red-700"
      : metaColor === "amber"
      ? "bg-amber-700"
      : isToday
      ? "bg-yellow-100"
      : "bg-[#16525F]";
  return (
    <motion.div
      {...layout}
      className={clsx("flex-1 flex flex-col p-4 rounded-lg", bg)}
    >
      {children}
    </motion.div>
  );
}

export const ColumnHeader = ({ text, meta, isToday }) => (
  <motion.h2
    layout="position"
    transition={SPRING}
    className={clsx(
      "mb-3 text-center font-semibold",
      meta ? "text-white" : isToday ? "text-black" : "text-white"
    )}
  >
    {text}
  </motion.h2>
);

/* ───────── Row shell ───────── */
export function RowShell({
  row,
  open,
  metaColor,
  dayRow,
  className,
  innerRef,
  onClick,
  children,
}) {
  const isPriority = row?.priority;
  const isRush = row?.rush;
  const isBBS = row?.modifiers?.includes("bbs");
  const isFlex = row?.modifiers?.includes("flex");
  const isStage2 = row?.modifiers?.includes("stage2");

  /* flashing rules */
  const flashBlue = isPriority && !row.completed && inBlueWindow(row.due);
  const flashRed =
    (!row.completed && metaColor === "red") ||
    (isPriority && !row.completed && inRedWindow(row.due));

  /* base tint */
  let bg = "bg-[#4D8490]";
  if (isStage2) bg = "bg-[#6F5BA8]";
  else if (isBBS) bg = "bg-[#55679B]";
  else if (isFlex) bg = "bg-[#C75A9E]";

  /* overlay pulse */
  const flashClass = flashBlue ? "glow" : flashRed ? "pulse-red" : "";
  const style = flashClass
    ? {
        animationDelay: "var(--pulse-clock)",
        ...(flashRed && { "--pulse-color": "#ff1e1e" }),
      }
    : undefined;

  /* rings */
  const ringClass = isPriority
    ? "ring-[3px] ring-red-500"
    : isRush
    ? "ring-[3px] ring-orange-400"
    : "";

  const collapsed = !open && dayRow ? "justify-center" : "items-center";

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
        open ? "cursor-default" : "cursor-pointer hover:bg-opacity-90",
        "overflow-visible",
        className
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

/* ───────── Reveal button ───────── */
const BTN_W = 76;
const BTN_W_SMALL = 32;

// Bubbly spring animation
const BUBBLE_SPRING = {
  type: "spring",
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

const revealVar = {
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
    width: BTN_W,
    marginLeft: 8,
    transition: BUBBLE_SPRING,
  },
  openSmall: {
    opacity: 1,
    scale: 1,
    width: BTN_W_SMALL,
    marginLeft: 8,
    transition: BUBBLE_SPRING,
  },
};

export function RevealButton({
  open,
  label,
  theme = "teal", // theme prop is now ignored - all buttons look the same
  onClick,
  small = false,
}) {
  // All buttons now use the same frosted appearance
  const frosted =
    "backdrop-blur-md bg-white/35 ring-1 ring-white/30 text-white shadow hover:bg-white/40 transition-colors";

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

/* ───────── NEW • round header settings button ───────── */
export function SettingsCog({ onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2
                 bg-white/40 backdrop-blur-lg border border-white/40 shadow
                 hover:bg-white/60 transition"
      whileTap={{ scale: 0.85, rotate: -30 }}
      whileHover={{ scale: 1.08 }}
      aria-label="Settings"
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="h-5 w-5 fill-current text-gray-800"
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a7.4 7.4 0 0 0 .15-1.5 7.4 7.4 0 0 0-.15-1.5l2.12-1.65a.5.5 0 0 0 .12-.63l-2-3.46a.5.5 0 0 0-.6-.23l-2.49 1a7.66 7.66 0 0 0-2.6-1.5l-.38-2.65A.5.5 0 0 0 13 2h-2a.5.5 0 0 0-.5.42l-.38 2.65a7.66 7.66 0 0 0-2.6 1.5l-2.49-1a.5.5 0 0 0-.6.23l-2 3.46a.5.5 0 0 0 .12.63L4.6 12a7.4 7.4 0 0 0-.15 1.5c0 .5.05 1 .15 1.5l-2.12 1.65a.5.5 0 0 0-.12.63l2 3.46a.5.5 0 0 0 .6.23l2.49-1a7.66 7.66 0 0 0 2.6 1.5l.38 2.65A.5.5 0 0 0 11 22h2a.5.5 0 0 0 .5-.42l.38-2.65a7.66 7.66 0 0 0 2.6-1.5l2.49 1a.5.5 0 0 0 .6-.23l2-3.46a.5.5 0 0 0-.12-.63Z" />
      </motion.svg>
    </motion.button>
  );
}

/* ───────── timing helpers ───────── */
function inBlueWindow(iso) {
  if (!iso) return false;
  const now = new Date();
  const due = parseLocalDate(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due.getTime() !== today.getTime()) return false;
  const h = now.getHours(),
    m = now.getMinutes();
  return (h === 9 && m >= 45) || (h > 9 && h < 12);
}

function inRedWindow(iso) {
  if (!iso) return false;
  const now = new Date();
  const due = parseLocalDate(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() === today.getTime() && now.getHours() >= 12;
}
