// CaseTable.jsx  (auto-open on search, auto-close Overdue/etc when search clears)

import React, {
  useState,
  useCallback,
  useMemo,
  memo,
  useEffect,
  startTransition,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import RowMenu from "./RowMenu";
import ArchiveModal from "./ArchiveModal";
import DeleteCompletedModal from "./DeleteCompletedModal";
import { db, archiveCases } from "../services/caseService";

/* ---------------- Status Dot stuff ---------------- */
const StatusDot = memo(
  ({ type, pulse, ringStyle, index, expandedWidths, onHoverChange }) => {
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef(null);

    const labels = useMemo(
      () => ({
        priority: "Priority",
        rush: "Rush",
        hold: "Hold",
        stage2: "Stage 2",
      }),
      []
    );

    const bgColors = useMemo(
      () => ({
        priority: "bg-red-500",
        rush: "bg-orange-500",
        hold: "bg-amber-500",
        stage2: "bg-indigo-500",
      }),
      []
    );

    useEffect(() => {
      return () =>
        hoverTimeoutRef.current && clearTimeout(hoverTimeoutRef.current);
    }, []);

    const handleHoverStart = useCallback(() => {
      hoverTimeoutRef.current && clearTimeout(hoverTimeoutRef.current);
      setIsHovered(true);
      onHoverChange(type, true);
    }, [type, onHoverChange]);

    const handleHoverEnd = useCallback(() => {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
        onHoverChange(type, false);
      }, 100);
    }, [type, onHoverChange]);

    const handleTap = useCallback(() => {
      const newState = !isHovered;
      setIsHovered(newState);
      onHoverChange(type, newState);
    }, [isHovered, type, onHoverChange]);

    const expandedWidth = useMemo(
      () => labels[type].length * 7 + 16,
      [type, labels]
    );

    const leftPosition = useMemo(() => {
      let position = 0;
      const order = ["priority", "rush", "hold", "stage2"];
      for (let i = 0; i < order.length; i++) {
        if (order[i] === type) break;
        if (expandedWidths[order[i]] !== undefined) {
          position += expandedWidths[order[i]] + 4;
        }
      }
      return position;
    }, [expandedWidths, type]);

    return (
      <motion.div
        className="absolute"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: isHovered ? 10 : 1,
        }}
        animate={{ left: `${leftPosition}px` }}
        transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.5 }}
        onHoverStart={handleHoverStart}
        onHoverEnd={handleHoverEnd}
        onTap={handleTap}
      >
        <motion.div
          className={clsx(
            "flex items-center justify-center overflow-hidden",
            bgColors[type],
            pulse
          )}
          style={{ ...ringStyle, transformOrigin: "left center" }}
          animate={{
            width: isHovered ? `${expandedWidth}px` : "8px",
            height: isHovered ? "20px" : "8px",
            borderRadius: isHovered ? "10px" : "9999px",
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            mass: 0.5,
          }}
        >
          <AnimatePresence mode="wait">
            {isHovered ? (
              <motion.span
                key="label"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="text-white text-xs font-medium whitespace-nowrap px-2"
                style={{ lineHeight: "20px" }}
              >
                {labels[type]}
              </motion.span>
            ) : (
              <motion.div
                key="dot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-2 h-2 rounded-full"
              />
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  }
);
StatusDot.displayName = "StatusDot";

const StatusDotsContainer = memo(({ statuses, pulse, ringStyle }) => {
  const [expandedWidths, setExpandedWidths] = useState({});

  const handleHoverChange = useCallback((type, isHovered) => {
    setExpandedWidths((p) => ({
      ...p,
      [type]: isHovered ? type.length * 7 + 16 : 8,
    }));
  }, []);

  const dots = useMemo(() => {
    const arr = [];
    if (statuses.priority) {
      arr.push({ type: "priority", key: "priority" });
      if (!expandedWidths.priority)
        setExpandedWidths((p) => ({ ...p, priority: 8 }));
    }
    if (statuses.rush) {
      arr.push({ type: "rush", key: "rush" });
      if (!expandedWidths.rush) setExpandedWidths((p) => ({ ...p, rush: 8 }));
    }
    if (statuses.hold) {
      arr.push({ type: "hold", key: "hold" });
      if (!expandedWidths.hold) setExpandedWidths((p) => ({ ...p, hold: 8 }));
    }
    if (statuses.stage2 && statuses.department === "Metal") {
      arr.push({ type: "stage2", key: "stage2" });
      if (!expandedWidths.stage2)
        setExpandedWidths((p) => ({ ...p, stage2: 8 }));
    }
    return arr;
  }, [statuses, expandedWidths]);

  const containerWidth = dots.length * 12;

  return (
    <div
      className="relative inline-block ml-3 overflow-visible"
      style={{ width: `${containerWidth}px`, height: "20px", flexShrink: 0 }}
    >
      {dots.map((dot, index) => (
        <StatusDot
          key={dot.key}
          type={dot.type}
          pulse={pulse}
          ringStyle={ringStyle}
          index={index}
          expandedWidths={expandedWidths}
          onHoverChange={handleHoverChange}
        />
      ))}
    </div>
  );
});
StatusDotsContainer.displayName = "StatusDotsContainer";

/* ---------------- Helpers / Row ---------------- */
const splitCase = (caseNumber = "") => {
  const text = caseNumber
    .replace(/[()]/g, "")
    .replace(/\s*-\s*/, " ")
    .trim()
    .split(/\s+/);
  return [text.shift() || "", text.join(" ")];
};

const TableRow = memo(
  ({
    row,
    isOverdue,
    pulse,
    ringStyle,
    caseNum,
    caseDesc,
    formatDate,
    completed,
    onEdit,
    toggleDone,
    toggleHold,
    toggleRush,
    togglePriority,
    toggleStage2,
    removeCase,
    onArchive,
    index,
  }) => (
    <motion.tr
      className="hover:bg-gray-50/50 transition-colors"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.03, 0.3),
        duration: 0.2,
        ease: "easeOut",
      }}
    >
      <td className="px-2 sm:px-5 py-2 sm:py-4">
        <div className="overflow-visible">
          <div className="flex items-center overflow-visible">
            <span className="font-mono text-xs sm:text-sm text-gray-900 flex-shrink-0">
              {caseNum}
            </span>
            <StatusDotsContainer
              statuses={row}
              pulse={pulse}
              ringStyle={ringStyle}
            />
          </div>
          {caseDesc && (
            <div className="text-xs text-gray-600 mt-0.5">{caseDesc}</div>
          )}
        </div>
      </td>
      <td className="px-2 sm:px-5 py-2 sm:py-4">
        <span className="text-xs sm:text-sm text-gray-700">
          {row.department === "General" ? "Digital" : row.department}
        </span>
      </td>
      <td className="px-2 sm:px-5 py-2 sm:py-4">
        <span
          className={clsx(
            "text-xs sm:text-sm font-mono",
            isOverdue && !row.completed && !row.hold
              ? "text-red-600 font-medium"
              : "text-gray-700",
            row.hold && "line-through decoration-gray-400"
          )}
        >
          {formatDate(row.due)}
        </span>
      </td>
      <td className="px-2 sm:px-5 py-2 sm:py-4 text-right">
        <RowMenu
          row={row}
          completed={completed}
          onEdit={onEdit}
          toggleDone={toggleDone}
          toggleHold={toggleHold}
          toggleRush={toggleRush}
          togglePriority={togglePriority}
          toggleStage2={toggleStage2}
          removeCase={removeCase}
          onArchive={onArchive}
        />
      </td>
    </motion.tr>
  ),
  (p, n) =>
    p.row.id === n.row.id &&
    p.row.priority === n.row.priority &&
    p.row.rush === n.row.rush &&
    p.row.hold === n.row.hold &&
    p.row.stage2 === n.row.stage2 &&
    p.row.completed === n.row.completed &&
    p.isOverdue === n.isOverdue
);
TableRow.displayName = "TableRow";

/* ---------------- Skeleton ---------------- */
const TableSkeleton = () => (
  <>
    {[1, 2, 3, 4, 5].map((i) => (
      <tr key={i} className="animate-pulse">
        <td className="px-2 sm:px-5 py-2 sm:py-4">
          <div className="h-4 bg-gray-200 rounded w-24" />
        </td>
        <td className="px-2 sm:px-5 py-2 sm:py-4">
          <div className="h-4 bg-gray-200 rounded w-16" />
        </td>
        <td className="px-2 sm:px-5 py-2 sm:py-4">
          <div className="h-4 bg-gray-200 rounded w-12" />
        </td>
        <td className="px-2 sm:px-5 py-2 sm:py-4">
          <div className="h-8 w-8 bg-gray-200 rounded ml-auto" />
        </td>
      </tr>
    ))}
  </>
);

/* ---------------- CollapsibleSection ---------------- */
const CollapsibleSection = memo(
  ({
    title,
    count,
    bgColor,
    textColor,
    shadowColor,
    rows,
    formatDate,
    completed,
    onEdit,
    toggleDone,
    toggleHold,
    toggleRush,
    togglePriority,
    toggleStage2,
    removeCase,
    onArchive,
    defaultExpanded = true,
    forceOpen = false,
  }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const prevForceOpen = useRef(forceOpen);

    // Auto open while searching; if search clears and the section started closed, close again.
    useEffect(() => {
      if (forceOpen) {
        setIsExpanded(true);
      } else if (prevForceOpen.current && !forceOpen && !defaultExpanded) {
        setIsExpanded(false);
      }
      prevForceOpen.current = forceOpen;
    }, [forceOpen, defaultExpanded]);

    return (
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className={clsx("absolute inset-0 rounded-xl blur-xl", shadowColor)}
          animate={{ y: 8, opacity: 0.25 }}
          transition={{ duration: 0.3 }}
        />
        <div
          className={clsx(
            "relative rounded-xl overflow-hidden backdrop-blur-md border shadow-lg",
            bgColor,
            "border-white/30"
          )}
        >
          <button
            onClick={() => setIsExpanded((v) => (forceOpen ? true : !v))}
            className={clsx(
              "w-full px-4 py-3.5 flex items-center justify-between transition-all duration-200",
              textColor,
              "hover:brightness-110"
            )}
          >
            <div className="flex items-center gap-3">
              <motion.svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </motion.svg>
              <span className="font-semibold text-sm uppercase tracking-wide">
                {title}
              </span>
            </div>
            <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-medium">
              {count}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-white/90 backdrop-blur-sm">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-200/50">
                      {rows.map((row, index) => (
                        <TableRow
                          key={row.id}
                          row={row}
                          isOverdue={row.isOverdue}
                          pulse={row.pulse}
                          ringStyle={row.ringStyle}
                          caseNum={row.caseNum}
                          caseDesc={row.caseDesc}
                          formatDate={formatDate}
                          completed={completed}
                          onEdit={onEdit}
                          toggleDone={toggleDone}
                          toggleHold={toggleHold}
                          toggleRush={toggleRush}
                          togglePriority={togglePriority}
                          toggleStage2={toggleStage2}
                          removeCase={removeCase}
                          onArchive={onArchive}
                          index={index}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);
CollapsibleSection.displayName = "CollapsibleSection";

/* ---------------- CaseTable ---------------- */
export default memo(function CaseTable({
  title,
  rows,
  empty,
  onEdit,
  toggleDone,
  toggleHold,
  toggleRush,
  togglePriority,
  toggleStage2,
  removeCase,
  completed = false,
  deleteAll,
  allHistory,
  allHistoryHover,
  todayISO,
  searchQuery = "",
  fetchCases,
  dates,
  forceOpen = false,
}) {
  const [showArchive, setShowArchive] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [regularCasesLoaded, setRegularCasesLoaded] = useState(false);
  const loadTimerRef = useRef(null);

  const syncDelay = useMemo(() => `-${(Date.now() % 1500) / 1000}s`, []);

  const formatDate = useCallback((dateStr) => {
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return `${parseInt(month)}-${parseInt(day)}`;
  }, []);

  const processedRows = useMemo(
    () =>
      rows.map((row) => {
        const isOverdue = !row.completed && row.due.slice(0, 10) < todayISO;
        const pulse = !row.completed ? "pulse-indicator" : undefined;
        const ringStyle = !row.completed
          ? { animationDelay: syncDelay }
          : { opacity: 0.5 };
        const [caseNum, caseDesc] = splitCase(row.caseNumber);
        return { ...row, isOverdue, pulse, ringStyle, caseNum, caseDesc };
      }),
    [rows, todayISO, syncDelay]
  );

  const categorizedRows = useMemo(() => {
    const c = { overdue: [], priority: [], rush: [], hold: [], regular: [] };
    processedRows.forEach((row) => {
      if (row.hold) c.hold.push(row);
      else if (row.isOverdue) c.overdue.push(row);
      else if (row.priority && !row.completed) c.priority.push(row);
      else if (row.rush && !row.completed) c.rush.push(row);
      else c.regular.push(row);
    });
    return c;
  }, [processedRows]);

  useEffect(() => {
    return () => loadTimerRef.current && clearTimeout(loadTimerRef.current);
  }, []);

  useEffect(() => {
    if (processedRows.length === 0) {
      setHasInitialLoad(false);
      setRegularCasesLoaded(false);
      return;
    }
    setHasInitialLoad(true);
    loadTimerRef.current && clearTimeout(loadTimerRef.current);
    if (categorizedRows.regular.length > 0) {
      loadTimerRef.current = setTimeout(() => {
        startTransition(() => setRegularCasesLoaded(true));
      }, 300);
    } else {
      setRegularCasesLoaded(true);
    }
  }, [processedRows, categorizedRows.regular.length]);

  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      if (!completed) return;
      try {
        let query = db
          .from("cases")
          .select("*", { count: "exact", head: true })
          .eq("archived", true);
        if (searchQuery) query = query.ilike("casenumber", `%${searchQuery}%`);
        const { count } = await query;
        mounted && setArchiveCount(count || 0);
      } catch (err) {
        console.error("Error fetching archive count:", err);
      }
    };
    fetchCount();
    return () => {
      mounted = false;
    };
  }, [searchQuery, completed]);

  const handleArchive = useCallback(
    async (caseIds) => {
      try {
        const { error } = await archiveCases(caseIds);
        if (error) throw error;
        if (fetchCases) await fetchCases();

        if (completed) {
          let query = db
            .from("cases")
            .select("*", { count: "exact", head: true })
            .eq("archived", true);
          if (searchQuery)
            query = query.ilike("casenumber", `%${searchQuery}%`);
          const { count } = await query;
          setArchiveCount(count || 0);
        }
      } catch (err) {
        console.error("Error archiving cases:", err);
        alert(`Failed to archive cases: ${err.message || err}`);
      }
    },
    [fetchCases, completed, searchQuery]
  );

  const handleArchiveFromMenu = useCallback(
    async (caseId) => {
      await handleArchive([caseId]);
    },
    [handleArchive]
  );

  return (
    <>
      <section
        className={clsx(
          "mx-auto mt-6 max-w-3xl glass-panel rounded-2xl overflow-hidden",
          completed && "opacity-95"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">
            {title}
          </h3>

          <div className="flex items-center space-x-2">
            {allHistory && (
              <button
                onClick={allHistory}
                onMouseEnter={allHistoryHover}
                className="secondary-button text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2"
              >
                <span className="hidden sm:inline">View History</span>
                <span className="sm:hidden">History</span>
              </button>
            )}
            {deleteAll && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="danger-button text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2"
              >
                <span className="hidden sm:inline">Clean Up</span>
                <span className="sm:hidden">Clean</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {!hasInitialLoad && processedRows.length > 0 ? (
            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
              <TableSkeleton />
            </div>
          ) : processedRows.length > 0 ? (
            <>
              {categorizedRows.overdue.length > 0 && (
                <CollapsibleSection
                  title="Overdue Cases"
                  count={categorizedRows.overdue.length}
                  bgColor="bg-gray-300/70"
                  textColor="text-gray-800"
                  shadowColor="bg-gray-400/40"
                  rows={categorizedRows.overdue}
                  formatDate={formatDate}
                  completed={completed}
                  onEdit={onEdit}
                  toggleDone={toggleDone}
                  toggleHold={toggleHold}
                  toggleRush={toggleRush}
                  togglePriority={togglePriority}
                  toggleStage2={toggleStage2}
                  removeCase={removeCase}
                  onArchive={handleArchiveFromMenu}
                  defaultExpanded={false}
                  forceOpen={forceOpen}
                />
              )}

              {categorizedRows.priority.length > 0 && (
                <CollapsibleSection
                  title="Priority Cases"
                  count={categorizedRows.priority.length}
                  bgColor="bg-red-200/70"
                  textColor="text-red-900"
                  shadowColor="bg-red-400/40"
                  rows={categorizedRows.priority}
                  formatDate={formatDate}
                  completed={completed}
                  onEdit={onEdit}
                  toggleDone={toggleDone}
                  toggleHold={toggleHold}
                  toggleRush={toggleRush}
                  togglePriority={togglePriority}
                  toggleStage2={toggleStage2}
                  removeCase={removeCase}
                  onArchive={handleArchiveFromMenu}
                  defaultExpanded={true}
                  forceOpen={forceOpen}
                />
              )}

              {categorizedRows.rush.length > 0 && (
                <CollapsibleSection
                  title="Rush Cases"
                  count={categorizedRows.rush.length}
                  bgColor="bg-orange-200/70"
                  textColor="text-orange-900"
                  shadowColor="bg-orange-400/40"
                  rows={categorizedRows.rush}
                  formatDate={formatDate}
                  completed={completed}
                  onEdit={onEdit}
                  toggleDone={toggleDone}
                  toggleHold={toggleHold}
                  toggleRush={toggleRush}
                  togglePriority={togglePriority}
                  toggleStage2={toggleStage2}
                  removeCase={removeCase}
                  onArchive={handleArchiveFromMenu}
                  defaultExpanded={true}
                  forceOpen={forceOpen}
                />
              )}

              {categorizedRows.hold.length > 0 && (
                <CollapsibleSection
                  title="On Hold"
                  count={categorizedRows.hold.length}
                  bgColor="bg-amber-200/70"
                  textColor="text-amber-900"
                  shadowColor="bg-amber-400/40"
                  rows={categorizedRows.hold}
                  formatDate={formatDate}
                  completed={completed}
                  onEdit={onEdit}
                  toggleDone={toggleDone}
                  toggleHold={toggleHold}
                  toggleRush={toggleRush}
                  togglePriority={togglePriority}
                  toggleStage2={toggleStage2}
                  removeCase={removeCase}
                  onArchive={handleArchiveFromMenu}
                  defaultExpanded={true}
                  forceOpen={forceOpen}
                />
              )}

              {categorizedRows.regular.length > 0 && (
                <>
                  {!regularCasesLoaded ? (
                    <div className="flex justify-center items-center gap-2 py-8">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full"
                      />
                      <span className="text-sm text-gray-500">
                        Loading regular cases...
                      </span>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white/70 backdrop-blur-sm rounded-xl shadow-sm border border-white/50 overflow-hidden"
                    >
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200/30">
                            <th className="px-2 sm:px-5 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Case
                            </th>
                            <th className="px-2 sm:px-5 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                              <span className="hidden sm:inline">
                                Department
                              </span>
                              <span className="sm:hidden">Dept</span>
                            </th>
                            <th className="px-2 sm:px-5 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                              Due
                            </th>
                            <th className="px-2 sm:px-5 py-2 sm:py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider w-10">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/30">
                          {categorizedRows.regular.map((row, index) => (
                            <TableRow
                              key={row.id}
                              row={row}
                              isOverdue={row.isOverdue}
                              pulse={row.pulse}
                              ringStyle={row.ringStyle}
                              caseNum={row.caseNum}
                              caseDesc={row.caseDesc}
                              formatDate={formatDate}
                              completed={completed}
                              onEdit={onEdit}
                              toggleDone={toggleDone}
                              toggleHold={toggleHold}
                              toggleRush={toggleRush}
                              togglePriority={togglePriority}
                              toggleStage2={toggleStage2}
                              removeCase={removeCase}
                              onArchive={handleArchiveFromMenu}
                              index={index}
                            />
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-8 text-center border border-white/50">
              <p className="text-sm text-gray-500">{empty}</p>
            </div>
          )}
        </div>

        {/* Footer for completed */}
        {completed && rows.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {rows.length} completed case
                {rows.length !== 1 ? "s" : ""}
              </div>

              <button
                onClick={() => setShowArchive(true)}
                className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors group text-xs sm:text-sm"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 group-hover:text-gray-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                <span className="font-medium">View Archive</span>
                {archiveCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-gray-300 text-gray-700 rounded-full">
                    {searchQuery && archiveCount > 0
                      ? `${archiveCount} match`
                      : archiveCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      <ArchiveModal
        isOpen={showArchive}
        onClose={() => setShowArchive(false)}
        searchQuery={searchQuery}
      />

      {showDeleteModal && (
        <DeleteCompletedModal
          dates={dates}
          onDelete={deleteAll}
          onArchive={handleArchive}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
});
