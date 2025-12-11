import React, {
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import {
  ColumnShell,
  ColumnHeader,
  RowShell,
  RevealButton,
  guard,
  SPRING,
  TWEEN,
} from "../animationEngine";
import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import CaseHistory from "./CaseHistory";
import clsx from "clsx";

const fmt = (d) =>
  d instanceof Date
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

const split = (s = "") => {
  const txt = s
    .replace(/[()]/g, "")
    .replace(/\s*-\s*/, " ")
    .trim();
  const [id, ...rest] = txt.split(/\s+/);
  return [id, rest.join(" ")];
};

const ROW_H = 40;
const OPEN_ADD = 14;

// Stage divider component - faster entrance to match animation completion
const StageDivider = ({ label, isToday, delay = 0 }) => (
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
    <div
      className={clsx("flex-1 h-px", isToday ? "bg-black/20" : "bg-white/20")}
    />
    <span
      className={clsx(
        "px-2 text-[10px] font-medium uppercase tracking-wider",
        isToday ? "text-black/50" : "text-white/50"
      )}
    >
      {label}
    </span>
    <div
      className={clsx("flex-1 h-px", isToday ? "bg-black/20" : "bg-white/20")}
    />
  </motion.div>
);

// Helper to get stage from modifiers
const getStageFromModifiers = (mods = []) => {
  if (mods?.includes("stage-qc")) return "qc";
  if (mods?.includes("stage-finishing")) return "finishing";
  if (mods?.includes("stage-production")) return "production";
  if (mods?.includes("stage-design")) return "design";
  return "design";
};

// Helper to group rows by stage
const groupRowsByStage = (rows) => {
  const groups = {
    design: [],
    production: [],
    finishing: [],
    qc: [],
    other: [],
  };

  rows.forEach((row) => {
    if (row.department === "General" && !row.completed) {
      const stage = getStageFromModifiers(row.modifiers);
      groups[stage].push(row);
    } else if (row.department === "Metal" && !row.completed) {
      groups.other.push(row);
    } else {
      groups.other.push(row);
    }
  });

  return groups;
};

// Helper to group metal rows by stage
const groupMetalRowsByStage = (rows) => {
  const groups = {
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

// Priority Bar Component with real-time tracking for a specific stage group
const StagePriorityBar = ({ columnRef, rowRefs, prioIds, stageKey }) => {
  const barY = useMotionValue(0);
  const barHeight = useMotionValue(0);
  const animationFrame = useRef(null);

  // Continuous tracking function
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

    // Get positions
    const columnRect = columnRef.current.getBoundingClientRect();
    const firstPrioRect = firstPrioElement.getBoundingClientRect();

    // Calculate and set position immediately
    const relativeTop = firstPrioRect.top - columnRect.top;
    barY.set(relativeTop);

    // Calculate total height
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

  // Set up continuous tracking
  useLayoutEffect(() => {
    const startTracking = () => {
      const frame = () => {
        track();
        animationFrame.current = requestAnimationFrame(frame);
      };
      animationFrame.current = requestAnimationFrame(frame);
    };

    // Start tracking immediately
    track();
    startTracking();

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [track]);

  // Track on specific changes with immediate update
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

export default function DayCol({
  date,
  rows = [],
  isToday,
  toggleComplete,
  toggleStage2,
  stage,
  stageConfig,
  updateCaseStage,
  showStageDividers = false,
}) {
  toggleComplete = guard("toggleComplete", toggleComplete);
  toggleStage2 = guard("toggleStage2", toggleStage2);

  const [active, setActive] = useState(null);
  const [showHistory, setShowHistory] = useState(null);
  const rowRefs = useRef({});
  const columnRef = useRef(null);
  const [dividersReady, setDividersReady] = useState(false);
  const contentKeyRef = useRef(0);

  // Calculate priority IDs per stage when dividers are shown
  const prioIdsByStage = useMemo(() => {
    if (!showStageDividers) {
      // Single priority list for non-stage view
      const arr = [];
      for (const r of rows) {
        if (r.priority && !r.completed) arr.push(r.id);
        else break;
      }
      return { all: arr };
    }

    // Separate priority lists per stage
    const hasDigitalCases = rows.some(
      (r) => r.department === "General" && !r.completed
    );
    const hasMetalCases = rows.some(
      (r) => r.department === "Metal" && !r.completed
    );

    const prioMap = {};

    if (hasDigitalCases) {
      const groups = groupRowsByStage(rows);

      // Get priority IDs for each stage group
      ["design", "production", "finishing", "qc"].forEach((stageKey) => {
        const stagePrios = [];
        for (const r of groups[stageKey]) {
          if (r.priority && !r.completed) stagePrios.push(r.id);
          else break; // Stop at first non-priority case
        }
        if (stagePrios.length > 0) {
          prioMap[stageKey] = stagePrios;
        }
      });
    } else if (hasMetalCases) {
      const groups = groupMetalRowsByStage(rows);

      // Get priority IDs for each metal stage group
      ["development", "finishing"].forEach((stageKey) => {
        const stagePrios = [];
        for (const r of groups[stageKey]) {
          if (r.priority && !r.completed) stagePrios.push(r.id);
          else break; // Stop at first non-priority case
        }
        if (stagePrios.length > 0) {
          prioMap[stageKey] = stagePrios;
        }
      });
    }

    // Handle "other" group if needed
    const otherPrios = [];
    const otherRows = rows.filter((r) => {
      if (hasDigitalCases && r.department === "General" && !r.completed)
        return false;
      if (hasMetalCases && r.department === "Metal" && !r.completed)
        return false;
      return true;
    });
    for (const r of otherRows) {
      if (r.priority && !r.completed) otherPrios.push(r.id);
      else break;
    }
    if (otherPrios.length > 0) {
      prioMap.other = otherPrios;
    }

    return prioMap;
  }, [rows, showStageDividers]);

  // Update content key when rows change significantly
  useLayoutEffect(() => {
    contentKeyRef.current++;
  }, [rows.length]);

  // Delay dividers to match the SPRING animation completion time
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
  }, [showStageDividers, contentKeyRef.current]);

  // Group rows by stage if dividers are enabled
  const renderContent = () => {
    if (!showStageDividers || rows.length === 0) {
      return renderRows(rows, "all");
    }

    // Check if we have any digital cases
    const hasDigitalCases = rows.some(
      (r) => r.department === "General" && !r.completed
    );
    const hasMetalCases = rows.some(
      (r) => r.department === "Metal" && !r.completed
    );

    if (hasDigitalCases) {
      // Group by digital stages
      const groups = groupRowsByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.design.length > 0 && (
            <React.Fragment key="design-group">
              {dividersReady && (
                <StageDivider
                  label="Design"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.design, "design")}
            </React.Fragment>
          )}
          {groups.production.length > 0 && (
            <React.Fragment key="production-group">
              {dividersReady && (
                <StageDivider
                  label="Production"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.production, "production")}
            </React.Fragment>
          )}
          {groups.finishing.length > 0 && (
            <React.Fragment key="finishing-group">
              {dividersReady && (
                <StageDivider
                  label="Finishing"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.finishing, "finishing")}
            </React.Fragment>
          )}
          {groups.qc.length > 0 && (
            <React.Fragment key="qc-group">
              {dividersReady && (
                <StageDivider
                  label="QC"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.qc, "qc")}
            </React.Fragment>
          )}
          {groups.other.length > 0 && renderRows(groups.other, "other")}
        </>
      );
    } else if (hasMetalCases) {
      // Group by metal stages
      const groups = groupMetalRowsByStage(rows);
      let dividerIndex = 0;

      return (
        <>
          {groups.development.length > 0 && (
            <React.Fragment key="development-group">
              {dividersReady && (
                <StageDivider
                  label="Development"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.development, "development")}
            </React.Fragment>
          )}
          {groups.finishing.length > 0 && (
            <React.Fragment key="metal-finishing-group">
              {dividersReady && (
                <StageDivider
                  label="Finishing"
                  isToday={isToday}
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.finishing, "finishing")}
            </React.Fragment>
          )}
          {groups.other.length > 0 && renderRows(groups.other, "other")}
        </>
      );
    }

    return renderRows(rows, "all");
  };

  const renderRows = (rowsToRender, stageKey) => {
    return rowsToRender.map((r) => {
      const open = r.id === active;
      const [num, desc] = split(r.caseNumber);
      const isInQC = r.modifiers?.includes("stage-qc");

      return (
        <RowShell
          key={r.id}
          row={r}
          open={open}
          dayRow
          innerRef={(el) => {
            if (el) {
              rowRefs.current[r.id] = el;
            }
          }}
          onClick={() => setActive(open ? null : r.id)}
        >
          {/* left side */}
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

          {/* buttons stack */}
          {open && (
            <div className="ml-auto flex gap-2 pr-2 items-center">
              {/* Small info button */}
              <RevealButton
                open
                label={
                  <span className="font-serif italic font-bold text-xs px-1">
                    i
                  </span>
                }
                theme="gray"
                small
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory(r);
                }}
              />

              <div className="flex flex-col gap-2">
                {/* Digital cases in stage views */}
                {stage && r.department === "General" && !isInQC && (
                  <>
                    {/* Design stage */}
                    {stage === "design" && (
                      <>
                        <RevealButton
                          open
                          label="Next →"
                          theme="blue"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "production");
                            setActive(null);
                          }}
                        />
                        <RevealButton
                          open
                          label="Repair"
                          theme="amber"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "finishing", true);
                            setActive(null);
                          }}
                        />
                      </>
                    )}

                    {/* Production stage */}
                    {stage === "production" && (
                      <>
                        <RevealButton
                          open
                          label="← Prev"
                          theme="gray"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "design");
                            setActive(null);
                          }}
                        />
                        <RevealButton
                          open
                          label="Next →"
                          theme="blue"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "finishing");
                            setActive(null);
                          }}
                        />
                      </>
                    )}

                    {/* Finishing stage */}
                    {stage === "finishing" && (
                      <>
                        <RevealButton
                          open
                          label="← Prev"
                          theme="gray"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "production");
                            setActive(null);
                          }}
                        />
                        <RevealButton
                          open
                          label="QC →"
                          theme="green"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCaseStage(r, "qc");
                            setActive(null);
                          }}
                        />
                      </>
                    )}
                  </>
                )}

                {/* QC cases in overview */}
                {!stage &&
                  r.department === "General" &&
                  isInQC &&
                  !r.completed && (
                    <>
                      <RevealButton
                        open
                        label="← Prev"
                        theme="gray"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCaseStage(r, "finishing");
                          setActive(null);
                        }}
                      />
                      <RevealButton
                        open
                        label="Done"
                        theme="green"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleComplete(r.id, r.completed);
                          setActive(null);
                        }}
                      />
                    </>
                  )}

                {/* Metal stage 2 */}
                {r.department === "Metal" && !r.stage2 && (
                  <RevealButton
                    open
                    label={"Stage\u00A02"}
                    theme="purple"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStage2(r);
                      setActive(null);
                    }}
                  />
                )}

                {/* Done button for non-digital or non-QC cases in overview */}
                {(r.department !== "General" || (!stage && !isInQC)) && (
                  <RevealButton
                    open
                    label="Done"
                    theme="green"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleComplete(r.id, r.completed);
                      setActive(null);
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </RowShell>
      );
    });
  };

  return (
    <>
      <ColumnShell isToday={isToday}>
        <div className="relative" ref={columnRef}>
          <AnimatePresence>
            {/* Render priority bars for each stage when dividers are shown */}
            {showStageDividers
              ? Object.entries(prioIdsByStage).map(
                  ([stageKey, prioIds]) =>
                    prioIds.length > 0 && (
                      <StagePriorityBar
                        key={`priority-bar-${stageKey}`}
                        columnRef={columnRef}
                        rowRefs={rowRefs}
                        prioIds={prioIds}
                        stageKey={stageKey}
                      />
                    )
                )
              : /* Single priority bar when no stage dividers */
                prioIdsByStage.all?.length > 0 && (
                  <StagePriorityBar
                    key="priority-bar-all"
                    columnRef={columnRef}
                    rowRefs={rowRefs}
                    prioIds={prioIdsByStage.all}
                    stageKey="all"
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
                className="m-2 text-center text-sm italic text-white/60"
              >
                no cases
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </ColumnShell>

      {/* Case History Modal with stage progress */}
      {showHistory && (
        <CaseHistory
          id={showHistory.id}
          caseNumber={showHistory.caseNumber}
          onClose={() => setShowHistory(null)}
        />
      )}
    </>
  );
}
