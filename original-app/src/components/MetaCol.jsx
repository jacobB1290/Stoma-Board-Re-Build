import React, { useState, useLayoutEffect, useRef } from "react";
import {
  ColumnShell,
  ColumnHeader,
  RowShell,
  RevealButton,
  SPRING,
} from "../animationEngine";
import { AnimatePresence, motion } from "framer-motion";
import CaseHistory from "./CaseHistory";
import clsx from "clsx";

const split = (s = "") => {
  const txt = s
    .replace(/[()]/g, "")
    .replace(/\s*-\s*/, " ")
    .trim();
  const [id, ...rest] = txt.split(/\s+/);
  return [id, rest.join(" ")];
};

// Stage divider component - faster entrance
const StageDivider = ({ label, delay = 0 }) => (
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
    <div className="flex-1 h-px bg-white/20" />
    <span className="px-2 text-[10px] font-medium text-white/50 uppercase tracking-wider">
      {label}
    </span>
    <div className="flex-1 h-px bg-white/20" />
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
      // Metal cases go to "other" group
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

export default function MetaCol({
  title,
  color,
  rows = [],
  today,
  onHold = false,
  toggleComplete,
  toggleHold,
  toggleStage2,
  stage,
  stageConfig,
  updateCaseStage,
  showStageDividers = false,
}) {
  const [active, setActive] = useState(null);
  const [showHistory, setShowHistory] = useState(null);
  const [dividersReady, setDividersReady] = useState(false);
  const contentKeyRef = useRef(0);

  // Update content key when rows change significantly
  useLayoutEffect(() => {
    contentKeyRef.current++;
  }, [rows.length]);

  // Delay dividers to match animation completion
  useLayoutEffect(() => {
    if (showStageDividers) {
      setDividersReady(false);
      const timer = setTimeout(() => {
        setDividersReady(true);
      }, 450); // Match the bounce animation completion
      return () => clearTimeout(timer);
    } else {
      setDividersReady(false);
    }
  }, [showStageDividers, contentKeyRef.current]);

  // Group rows by stage if dividers are enabled
  const renderContent = () => {
    if (!showStageDividers || rows.length === 0) {
      return renderRows(rows);
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

      // Always show stage headers, even for single stage
      return (
        <>
          {groups.design.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider label="Design" delay={dividerIndex++ * 0.03} />
              )}
              {renderRows(groups.design)}
            </>
          )}
          {groups.production.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider
                  label="Production"
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.production)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider label="Finishing" delay={dividerIndex++ * 0.03} />
              )}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.qc.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider label="QC" delay={dividerIndex++ * 0.03} />
              )}
              {renderRows(groups.qc)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    } else if (hasMetalCases) {
      // Group by metal stages
      const groups = groupMetalRowsByStage(rows);
      let dividerIndex = 0;

      // Always show stage headers, even for single stage
      return (
        <>
          {groups.development.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider
                  label="Development"
                  delay={dividerIndex++ * 0.03}
                />
              )}
              {renderRows(groups.development)}
            </>
          )}
          {groups.finishing.length > 0 && (
            <>
              {dividersReady && (
                <StageDivider label="Finishing" delay={dividerIndex++ * 0.03} />
              )}
              {renderRows(groups.finishing)}
            </>
          )}
          {groups.other.length > 0 && renderRows(groups.other)}
        </>
      );
    }

    return renderRows(rows);
  };

  const renderRows = (rowsToRender) => {
    return rowsToRender.map((r) => {
      const open = r.id === active;
      const [num, desc] = split(r.caseNumber);
      const isStage2 = r.modifiers?.includes("stage2");
      const isBBS = r.modifiers?.includes("bbs");
      const isFlex = r.modifiers?.includes("flex");
      const isInQC = r.modifiers?.includes("stage-qc");

      return (
        <RowShell
          key={r.id}
          row={r}
          open={open}
          metaColor={color}
          onClick={() => setActive(open ? null : r.id)}
        >
          {/* id / desc */}
          <div className="flex flex-col">
            <span className="font-mono leading-none">{num}</span>
            {desc && (
              <span className="mt-0.5 text-xs leading-none text-white/80">
                {desc}
              </span>
            )}
          </div>

          {/* counter + buttons */}
          <motion.div
            layout
            transition={SPRING}
            className="ml-auto flex items-center gap-2 pr-2"
          >
            <motion.span
              layout
              transition={SPRING}
              className="whitespace-nowrap text-sm leading-none text-white/70"
            >
              {countDays(r, onHold, today)}d
            </motion.span>

            {open && (
              <div className="flex gap-2">
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

                <div className="flex flex-col-reverse gap-2">
                  {/* Digital cases in stage views */}
                  {stage &&
                    r.department === "General" &&
                    !onHold &&
                    !isInQC && (
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
                              label="Next →"
                              theme="blue"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateCaseStage(r, "finishing");
                                setActive(null);
                              }}
                            />
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
                          </>
                        )}

                        {/* Finishing stage */}
                        {stage === "finishing" && (
                          <>
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
                          </>
                        )}
                      </>
                    )}

                  {/* QC cases in overview */}
                  {!stage &&
                    r.department === "General" &&
                    isInQC &&
                    !onHold && (
                      <>
                        <RevealButton
                          open
                          label="Done"
                          theme="green"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleComplete?.(r.id, r.completed);
                            setActive(null);
                          }}
                        />
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
                      </>
                    )}

                  {/* Regular buttons for non-digital or on hold */}
                  {(r.department !== "General" ||
                    onHold ||
                    (!stage && !isInQC)) && (
                    <RevealButton
                      open
                      label={onHold ? "Release" : "Done"}
                      theme={
                        onHold ? "amber" : color === "red" ? "red" : "green"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onHold
                          ? toggleHold?.(r)
                          : toggleComplete?.(r.id, r.completed);
                        setActive(null);
                      }}
                    />
                  )}

                  {/* Metal stage 2 */}
                  {r.department === "Metal" && !onHold && !isStage2 && (
                    <RevealButton
                      open
                      label="Stage 2"
                      theme="purple"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStage2?.(r);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </RowShell>
      );
    });
  };

  return (
    <>
      <ColumnShell metaColor={color}>
        <ColumnHeader meta text={title} />

        <AnimatePresence mode="popLayout">
          {rows.length ? (
            renderContent()
          ) : (
            <motion.p
              layout
              transition={SPRING}
              className="m-2 text-center text-sm italic text-white/60"
            >
              none
            </motion.p>
          )}
        </AnimatePresence>
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

/* helpers */
function countDays(r, onHold, today) {
  if (!today) return 0;
  const base = onHold
    ? new Date(r.created_at).setHours(0, 0, 0, 0)
    : new Date(r.due).getTime();
  return Math.floor((today - base) / 86_400_000) + (onHold ? 1 : 0);
}
