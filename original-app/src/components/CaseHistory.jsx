import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { db } from "../services/caseService";
import { motion, AnimatePresence } from "framer-motion";

// Memoized formatters outside component to prevent recreations
const formatTimestamp = (ts) => {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Denver",
  });
};

const formatDateShort = (dateStr) => {
  const [year, month, day] = dateStr.split("T")[0].split("-");
  return `${parseInt(month)}-${parseInt(day)}`;
};

const getBusinessDays = (startDate, endDate) => {
  let count = 0;
  const start = new Date(startDate);
  const end = new Date(endDate);

  while (start <= end) {
    const dayOfWeek = start.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    start.setDate(start.getDate() + 1);
  }
  return count;
};

const splitCase = (caseNumber = "") => {
  const text = caseNumber
    .replace(/[()]/g, "")
    .replace(/\s*-\s*/, " ")
    .trim()
    .split(/\s+/);
  return [text.shift() || "", text.join(" ")];
};

// Static lookup objects for better performance
const ACTION_TYPE_MAP = {
  "marked done": "complete",
  "undo done": "undo",
  priority: "priority",
  rush: "rush",
  hold: "hold",
  "due changed": "edit",
  "due date changed": "edit",
  changed: "edit",
  deleted: "delete",
  removed: "delete",
  stage: "stage",
  bbs: "type",
  flex: "type",
  "design stage": "stage",
  "production stage": "stage",
  "finishing stage": "stage",
  "quality control": "stage",
};

const getActionType = (action) => {
  const actionLower = action.toLowerCase();
  for (const [key, value] of Object.entries(ACTION_TYPE_MAP)) {
    if (actionLower.includes(key)) return value;
  }
  return "default";
};

const processActionText = (action) => {
  const dueChangePattern =
    /Due changed from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i;
  const match = action.match(dueChangePattern);

  if (match) {
    const fromDate = formatDateShort(match[1]);
    const toDate = formatDateShort(match[2]);
    return `Due date changed from ${fromDate} to ${toDate}`;
  }

  return action;
};

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <svg
      className="animate-spin h-8 w-8 text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  </div>
);

// Memoized icon components
const ActionIcon = React.memo(({ type }) => {
  const icons = {
    complete: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    undo: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
        />
      </svg>
    ),
    priority: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    rush: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    hold: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    edit: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    ),
    delete: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
    ),
    stage: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
    type: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
        />
      </svg>
    ),
    default: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  };

  return icons[type] || icons.default;
});

ActionIcon.displayName = "ActionIcon";

const actionColors = {
  complete: "text-blue-600 bg-blue-50 border-blue-200",
  undo: "text-purple-600 bg-purple-50 border-purple-200",
  priority: "text-red-600 bg-red-50 border-red-200",
  rush: "text-orange-600 bg-orange-50 border-orange-200",
  hold: "text-amber-600 bg-amber-50 border-amber-200",
  edit: "text-purple-600 bg-purple-50 border-purple-200",
  delete: "text-gray-600 bg-gray-50 border-gray-200",
  stage: "text-indigo-600 bg-indigo-50 border-indigo-200",
  type: "text-pink-600 bg-pink-50 border-pink-200",
  default: "text-gray-600 bg-gray-50 border-gray-200",
};

// Optimized countdown timer with RAF
const CountdownTimer = React.memo(({ dueDate, isPriority, isOverdue }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const rafRef = useRef();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let lastUpdate = 0;

    const calculateTimeLeft = (timestamp) => {
      if (!mountedRef.current) return;

      // Only update once per second
      if (timestamp - lastUpdate < 1000) {
        rafRef.current = requestAnimationFrame(calculateTimeLeft);
        return;
      }
      lastUpdate = timestamp;

      const now = new Date();
      const [year, month, day] = dueDate.split("T")[0].split("-");
      const due = new Date(year, month - 1, day);

      const deadlineHour = isPriority ? 12 : 17;
      due.setHours(deadlineHour, 0, 0, 0);

      const diff = due - now;
      const absDiff = Math.abs(diff);

      const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

      let displayTime;
      if (days > 1) {
        displayTime = `${days} days`;
      } else if (days === 1) {
        displayTime = `1 day ${hours}h`;
      } else {
        displayTime = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }

      if (diff < 0) {
        displayTime = `-${displayTime}`;
      }

      if (mountedRef.current) {
        setTimeLeft(displayTime);
        rafRef.current = requestAnimationFrame(calculateTimeLeft);
      }
    };

    rafRef.current = requestAnimationFrame(calculateTimeLeft);

    return () => {
      mountedRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [dueDate, isPriority]);

  return <span className="font-mono tabular-nums">{timeLeft}</span>;
});

CountdownTimer.displayName = "CountdownTimer";

// Updated Stage Timeline Component that properly handles stage skips
const StageTimeline = React.memo(({ stageHistory, currentStage, caseData }) => {
  const stages = ["design", "production", "finishing"];
  const [, forceUpdate] = useState({});

  // Update every minute for live time display
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Check if case is in QC
  const isInQC = caseData.modifiers?.includes("stage-qc");

  const stageData = useMemo(() => {
    const data = {
      design: {
        entries: [],
        totalDuration: 0,
        isActive: false,
        wasVisited: false,
      },
      production: {
        entries: [],
        totalDuration: 0,
        isActive: false,
        wasVisited: false,
      },
      finishing: {
        entries: [],
        totalDuration: 0,
        isActive: false,
        wasVisited: false,
      },
    };

    // Sort history by timestamp to ensure chronological order
    const sortedHistory = [...stageHistory].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    let currentActiveStage = null;
    let lastTimestamp = null;

    // Process all history entries to track stage visits
    sortedHistory.forEach((entry) => {
      const action = entry.action.toLowerCase();

      // Check for repair case - goes directly to finishing
      if (action.includes("sent for repair")) {
        // Close any currently active stage
        if (currentActiveStage && data[currentActiveStage].entries.length > 0) {
          const lastEntry =
            data[currentActiveStage].entries[
              data[currentActiveStage].entries.length - 1
            ];
          if (!lastEntry.exited) {
            lastEntry.exited = entry.created_at;
          }
        }

        // Enter finishing stage directly
        data.finishing.entries.push({
          entered: entry.created_at,
          exited: null,
          isRepair: true,
        });
        data.finishing.wasVisited = true;
        currentActiveStage = "finishing";
        return;
      }

      // Handle case creation - only start in design if not a repair
      if (
        action.includes("case created") &&
        !sortedHistory.some((h) =>
          h.action.toLowerCase().includes("sent for repair")
        )
      ) {
        lastTimestamp = entry.created_at;
        // Check if this is a repair case by looking ahead
        const nextEntry = sortedHistory[sortedHistory.indexOf(entry) + 1];
        if (
          !nextEntry ||
          !nextEntry.action.toLowerCase().includes("sent for repair")
        ) {
          data.design.entries.push({
            entered: entry.created_at,
            exited: null,
          });
          data.design.wasVisited = true;
          currentActiveStage = "design";
        }
        return;
      }

      // Handle stage transitions including QC
      if (action.includes("moved from") && action.includes("to")) {
        // Extract from and to stages
        let fromStage = null;
        let toStage = null;

        if (action.includes("from design")) fromStage = "design";
        else if (action.includes("from production")) fromStage = "production";
        else if (action.includes("from finishing")) fromStage = "finishing";

        if (action.includes("to design")) toStage = "design";
        else if (action.includes("to production")) toStage = "production";
        else if (action.includes("to finishing")) toStage = "finishing";
        else if (action.includes("to quality control")) toStage = "qc";

        // Exit the from stage
        if (
          fromStage &&
          data[fromStage] &&
          data[fromStage].entries.length > 0
        ) {
          const lastEntry =
            data[fromStage].entries[data[fromStage].entries.length - 1];
          if (!lastEntry.exited) {
            lastEntry.exited = entry.created_at;
          }
        }

        // Enter the to stage (only if it's not QC - we don't track QC in the timeline)
        if (toStage && toStage !== "qc" && data[toStage]) {
          data[toStage].entries.push({
            entered: entry.created_at,
            exited: null,
          });
          data[toStage].wasVisited = true;
          currentActiveStage = toStage;
        } else if (toStage === "qc") {
          // Mark that we're in QC but don't add to timeline
          currentActiveStage = null;
        }
      }

      // Handle moving back from QC
      if (action.includes("moved from quality control")) {
        if (action.includes("back to finishing")) {
          data.finishing.entries.push({
            entered: entry.created_at,
            exited: null,
          });
          data.finishing.wasVisited = true;
          currentActiveStage = "finishing";
        }
      }

      // Handle case completion
      if (action === "marked done" && currentActiveStage) {
        if (data[currentActiveStage].entries.length > 0) {
          const lastEntry =
            data[currentActiveStage].entries[
              data[currentActiveStage].entries.length - 1
            ];
          if (!lastEntry.exited) {
            lastEntry.exited = entry.created_at;
          }
        }
        currentActiveStage = null;
      }
    });

    // Calculate total durations and set active status
    stages.forEach((stage) => {
      let totalMs = 0;

      data[stage].entries.forEach((entry) => {
        const startTime = new Date(entry.entered);
        const endTime = entry.exited ? new Date(entry.exited) : new Date();
        totalMs += endTime - startTime;
      });

      data[stage].totalDuration = totalMs;

      // Check if stage is currently active
      if (data[stage].entries.length > 0) {
        const lastEntry = data[stage].entries[data[stage].entries.length - 1];
        data[stage].isActive =
          !lastEntry.exited &&
          stage === currentStage &&
          !caseData.completed &&
          !isInQC;
      }
    });

    // Add QC tracking
    const qcEntry = sortedHistory.find((h) =>
      h.action.toLowerCase().includes("moved from finishing to quality control")
    );

    return {
      ...data,
      isInQC: isInQC,
      qcEnteredAt: qcEntry?.created_at,
    };
  }, [stageHistory, currentStage, caseData, isInQC]);

  const formatDuration = (ms, isActive = false) => {
    if (ms <= 0) return "—";

    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    if (days > 0) {
      return `${days}d ${remainingHours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Calculate progress percentage based on visited stages
  const getProgressPercentage = () => {
    if (caseData.completed) {
      // If completed, fill to the last visited stage
      if (stageData.finishing.wasVisited) return 100;
      if (stageData.production.wasVisited) return 50;
      if (stageData.design.wasVisited) return 0;
      return 0;
    }

    // For active cases, fill to current stage (or finishing if in QC)
    if (isInQC || currentStage === "finishing") return 100;
    if (currentStage === "production") return 50;
    if (currentStage === "design") return 0;
    return 0;
  };

  // Determine which stages to show as completed (green check)
  const getStageStatus = (stage, index) => {
    const data = stageData[stage];
    const currentStageIndex = stages.indexOf(currentStage);

    if (caseData.completed && data.wasVisited) {
      return "completed"; // Green with check
    }

    if (stage === currentStage && !caseData.completed && !isInQC) {
      return "active"; // Blue/indigo
    }

    if (data.wasVisited) {
      return "visited"; // Gray (was visited but not current)
    }

    return "unvisited"; // White/gray border
  };

  return (
    <div className="mb-4 sm:mb-6">
      <h3 className="text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2 sm:mb-3">
        Stage Progress
      </h3>

      {/* Progress Bar Container */}
      <div className="relative mb-3 sm:mb-4">
        {/* Background line */}
        <div className="absolute top-4 sm:top-5 left-0 right-0 h-1.5 sm:h-2 bg-gray-200 rounded-full" />

        {/* Animated Progress Fill - Only shows for visited stages */}
        <motion.div
          className="absolute top-4 sm:top-5 left-0 h-1.5 sm:h-2 bg-green-500 rounded-full"
          initial={{ width: "0%" }}
          animate={{
            width: `${getProgressPercentage()}%`,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />

        {/* Stage Dots - positioned at 0%, 50%, and 100% */}
        <div className="relative flex justify-between">
          {stages.map((stage, index) => {
            const data = stageData[stage];
            const status = getStageStatus(stage, index);

            return (
              <div
                key={stage}
                className={`flex flex-col items-center ${
                  index === 0
                    ? "flex-initial"
                    : index === 1
                    ? "absolute left-1/2 -translate-x-1/2"
                    : "flex-initial"
                }`}
              >
                {/* Stage dot */}
                <div className="relative">
                  <div
                    className={`
                      w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center
                      ${
                        status === "active"
                          ? "bg-indigo-600 border-indigo-600"
                          : status === "completed"
                          ? "bg-green-600 border-green-600"
                          : status === "visited"
                          ? "bg-gray-400 border-gray-400"
                          : "bg-white border-gray-300"
                      }
                      transition-all duration-200 z-10 relative
                    `}
                  >
                    {status === "completed" ? (
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <span
                        className={`text-xs font-bold ${
                          status === "active" || status === "visited"
                            ? "text-white"
                            : "text-gray-500"
                        }`}
                      >
                        {index + 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stage name and duration */}
                <div className="mt-1 sm:mt-2 text-center">
                  <p
                    className={`text-xs sm:text-sm font-medium capitalize ${
                      status === "active" ? "text-indigo-600" : "text-gray-700"
                    }`}
                  >
                    {stage}
                  </p>
                  {data.totalDuration > 0 && (
                    <p
                      className={`text-xs mt-0.5 sm:mt-1 ${
                        data.isActive
                          ? "text-indigo-600 font-semibold"
                          : "text-gray-500"
                      }`}
                    >
                      {formatDuration(data.totalDuration, data.isActive)}
                    </p>
                  )}
                  {data.isActive && (
                    <p className="text-xs text-indigo-600 mt-0.5 sm:mt-1 font-medium animate-pulse">
                      In Progress
                    </p>
                  )}
                  {/* Show visit count if stage was visited multiple times */}
                  {data.entries.length > 1 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {data.entries.length} visits
                    </p>
                  )}
                  {/* Show repair indicator */}
                  {data.entries.some((e) => e.isRepair) && (
                    <p className="text-xs text-amber-600 mt-0.5 font-medium">
                      Repair
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* QC Status Indicator */}
      {stageData.isInQC && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-green-800">
              In Quality Control
            </span>
            {stageData.qcEnteredAt && (
              <span className="text-xs text-green-600 ml-auto">
                Since {formatTimestamp(stageData.qcEnteredAt)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

StageTimeline.displayName = "StageTimeline";

// Memoized history item component
const HistoryItem = React.memo(({ item, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: 0.02 * Math.min(index, 10),
        duration: 0.1,
      }}
      className={`flex items-start space-x-2 sm:space-x-3 p-2 sm:p-3 rounded-lg border ${
        actionColors[item.actionType]
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <ActionIcon type={item.actionType} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium text-gray-900">
          {item.action}
        </p>
        <div className="mt-0.5 sm:mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span className="font-mono">{formatTimestamp(item.created_at)}</span>
          <span>•</span>
          <span>by {item.user_name}</span>
        </div>
      </div>
    </motion.div>
  );
});

HistoryItem.displayName = "HistoryItem";

export default function CaseHistory({ id, caseNumber, onClose }) {
  const [rows, setRows] = useState([]);
  const [isClosing, setIsClosing] = useState(false);
  const [caseData, setCaseData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [completionTime, setCompletionTime] = useState(null);
  const [creationInfo, setCreationInfo] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [stageHistory, setStageHistory] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const popupRef = useRef(null);
  const readyTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const clickTimerRef = useRef(null);
  const loadingTimerRef = useRef(null);
  const expandTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const loadingStartTimeRef = useRef(null);

  // Memoize split case result
  const [caseNum, caseNotes] = useMemo(
    () => splitCase(caseNumber),
    [caseNumber]
  );

  // Scroll lock
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;

    // Lock scroll
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.scrollBehavior = "auto";

    return () => {
      // Restore scroll
      body.style.position = "";
      body.style.top = "";
      body.style.width = "";
      html.style.scrollBehavior = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    };
  }, []);

  // Set ready state after a delay
  useEffect(() => {
    readyTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setIsReady(true);
      }
    }, 50);

    return () => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
      }
    };
  }, []);

  // Handle expansion when data is ready
  useEffect(() => {
    if (isDataLoaded && mountedRef.current) {
      const expandContent = () => {
        if (mountedRef.current) {
          setIsExpanded(true);
        }
      };

      // If loading was shown, ensure minimum 500ms display time
      if (showLoading && loadingStartTimeRef.current) {
        const elapsedTime = Date.now() - loadingStartTimeRef.current;
        const remainingTime = Math.max(0, 500 - elapsedTime);
        expandTimerRef.current = setTimeout(expandContent, remainingTime);
      } else {
        // If loading wasn't shown, expand immediately
        setIsExpanded(true);
      }
    }
  }, [isDataLoaded, showLoading]);

  // Optimized data fetching
  useEffect(() => {
    let cancelled = false;

    // Set loading timer - only show loading if data takes more than 200ms
    loadingTimerRef.current = setTimeout(() => {
      if (!cancelled && !isDataLoaded && mountedRef.current) {
        setShowLoading(true);
        loadingStartTimeRef.current = Date.now();
      }
    }, 200);

    const fetchData = async () => {
      try {
        const [caseResult, histResult] = await Promise.all([
          db.from("cases").select("*").eq("id", id).single(),
          db
            .from("case_history")
            .select("*")
            .eq("case_id", id)
            .order("created_at", { ascending: false }),
        ]);

        if (cancelled || !mountedRef.current) return;

        const { data: cases, error: caseError } = caseResult;
        const { data: hist = [], error: histError } = histResult;

        if (caseError) {
          console.error("Error fetching case:", caseError);
          return;
        }

        if (cases) {
          // Get current stage from modifiers
          const stageModifier = cases.modifiers?.find((m) =>
            m.startsWith("stage-")
          );
          const currentStage = stageModifier
            ? stageModifier.split("-")[1]
            : null;

          // Process case data
          const mappedCase = {
            ...cases,
            caseNumber: cases.casenumber,
            department:
              cases.department === "General" ? "Digital" : cases.department,
            rush: cases.modifiers?.includes("rush") || false,
            hold: cases.modifiers?.includes("hold") || false,
            stage2: cases.modifiers?.includes("stage2") || false,
            priority: cases.priority || false,
            caseType: cases.modifiers?.includes("bbs")
              ? "bbs"
              : cases.modifiers?.includes("flex")
              ? "flex"
              : "general",
            digitalStage: cases.department === "General" ? currentStage : null,
          };

          setCaseData(mappedCase);

          // Calculate insights
          const now = new Date();
          const created = new Date(cases.created_at);
          const [dueYear, dueMonth, dueDay] = cases.due
            .split("T")[0]
            .split("-");
          const due = new Date(dueYear, dueMonth - 1, dueDay);

          const daysActive = Math.floor(
            (now - created) / (1000 * 60 * 60 * 24)
          );
          const daysUntilDue = Math.floor((due - now) / (1000 * 60 * 60 * 24));
          const businessDaysUntilDue = getBusinessDays(now, due);

          let totalHoldTime = 0;
          if (cases.hold_started) {
            totalHoldTime = Math.floor(
              (now - new Date(cases.hold_started)) / (1000 * 60 * 60)
            );
          }

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const isOverdue = due < todayStart && !cases.completed;

          setInsights({
            daysActive,
            daysUntilDue,
            businessDaysUntilDue,
            totalHoldTime,
            isOverdue,
            isUrgent:
              (cases.priority || cases.modifiers?.includes("rush")) &&
              daysUntilDue <= 1,
          });

          // Process history
          const creationEntry = hist.find((h) =>
            h.action.toLowerCase().includes("case created")
          );
          if (creationEntry) {
            setCreationInfo({
              timestamp: creationEntry.created_at,
              user: creationEntry.user_name || "Unknown",
            });
          }

          // Extract stage-related history
          const stageEntries = hist.filter(
            (h) =>
              h.action.includes("stage") ||
              h.action === "Case created" ||
              h.action === "Marked done" ||
              h.action.includes("Assigned to") ||
              h.action.includes("Moved from") ||
              h.action.includes("repair") ||
              h.action.includes("Quality Control") ||
              h.action.includes("quality control")
          );
          setStageHistory(stageEntries);

          // Filter history
          const dueChangePattern =
            /Due changed from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i;
          const filteredHistory = hist.filter((h) => {
            if (h.action.toLowerCase().includes("case created")) return false;
            const match = h.action.match(dueChangePattern);
            return !(match && match[1] === match[2]);
          });

          // Find completion time
          const completionEntry = filteredHistory.find((h) =>
            h.action.toLowerCase().includes("marked done")
          );
          if (completionEntry) {
            const completedDate = new Date(completionEntry.created_at);
            const [dueYear, dueMonth, dueDay] = cases.due
              .split("T")[0]
              .split("-");
            const dueDate = new Date(dueYear, dueMonth - 1, dueDay);
            const dueHour = cases.priority ? 12 : 17;
            dueDate.setHours(dueHour, 0, 0, 0);

            const diff = completedDate - dueDate;
            const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hoursDiff = Math.floor(
              (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
            );
            const minutesDiff = Math.floor(
              (diff % (1000 * 60 * 60)) / (1000 * 60)
            );

            if (diff < 0) {
              const absDiff = Math.abs(diff);
              const absDays = Math.floor(absDiff / (1000 * 60 * 60 * 24));
              const absHours = Math.floor(
                (absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
              );
              const absMinutes = Math.floor(
                (absDiff % (1000 * 60 * 60)) / (1000 * 60)
              );

              let earlyText;
              if (absDays > 0) {
                earlyText = `${absDays} day${
                  absDays > 1 ? "s" : ""
                } ${absHours} hour${absHours !== 1 ? "s" : ""} early`;
              } else if (absHours > 0) {
                earlyText = `${absHours} hour${
                  absHours !== 1 ? "s" : ""
                } ${absMinutes} minute${absMinutes !== 1 ? "s" : ""} early`;
              } else {
                earlyText = `${absMinutes} minute${
                  absMinutes !== 1 ? "s" : ""
                } early`;
              }

              setCompletionTime({
                status: "early",
                text: earlyText,
                color: "text-green-600",
              });
            } else if (daysDiff === 0 && hoursDiff < 2) {
              setCompletionTime({
                status: "onTime",
                text: "On time",
                color: "text-blue-600",
              });
            } else {
              let lateText;
              if (daysDiff > 0) {
                lateText = `${daysDiff} day${
                  daysDiff > 1 ? "s" : ""
                } ${hoursDiff} hour${hoursDiff !== 1 ? "s" : ""} late`;
              } else if (hoursDiff > 0) {
                lateText = `${hoursDiff} hour${
                  hoursDiff !== 1 ? "s" : ""
                } ${minutesDiff} minute${minutesDiff !== 1 ? "s" : ""} late`;
              } else {
                lateText = `${minutesDiff} minute${
                  minutesDiff !== 1 ? "s" : ""
                } late`;
              }

              setCompletionTime({
                status: "late",
                text: lateText,
                color: "text-red-600",
              });
            }
          }

          setRows(
            filteredHistory.map((h) => ({
              ...h,
              action: processActionText(h.action),
              user_name: h.user_name?.trim() || "—",
              actionType: getActionType(h.action),
            }))
          );

          // Clear loading timer if it hasn't fired yet
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current);
          }

          // Mark data as loaded
          setIsDataLoaded(true);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        // Clear loading timer if it hasn't fired yet
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
        }
        setIsDataLoaded(true); // Still set to true to show error state
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [id]);

  // Memoized close handler
  const handleClose = useCallback(() => {
    if (!mountedRef.current) return;

    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        onClose();
      }
    }, 200);
  }, [onClose]);

  // Optimized event handlers
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleClose]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        handleClose();
      }
    };

    clickTimerRef.current = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside, true);
    }, 100);

    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      window.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [handleClose]);

  // Memoized activity stats
  const activityStats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.action.toLowerCase().includes("hold added")) acc.holdCount++;
        if (row.action.toLowerCase().includes("priority added"))
          acc.priorityCount++;
        if (row.action.toLowerCase().includes("rush added")) acc.rushCount++;
        if (row.actionType === "edit") acc.editCount++;
        if (row.actionType === "stage") acc.stageCount++;
        return acc;
      },
      {
        holdCount: 0,
        priorityCount: 0,
        rushCount: 0,
        editCount: 0,
        stageCount: 0,
      }
    );
  }, [rows]);

  // Memoized style objects
  const modalStyle = useMemo(
    () => ({
      maxHeight: "95vh",
      boxShadow: `
      0 0 0 1px rgba(0, 0, 0, 0.05),
      0 0 40px rgba(0, 0, 0, 0.15),
      0 0 80px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px rgba(255, 255, 255, 0.1)
    `,
    }),
    []
  );

  return createPortal(
    <AnimatePresence>
      {!isClosing && (
        <motion.div
          className="fixed inset-0 z-[300] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Animated blurred backdrop */}
          <motion.div
            className="absolute inset-0 pointer-events-auto"
            onClick={handleClose}
            initial={{
              backdropFilter: "blur(0px)",
              WebkitBackdropFilter: "blur(0px)",
              backgroundColor: "rgba(0, 0, 0, 0)",
            }}
            animate={{
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(8px)",
              backgroundColor: "rgba(0, 0, 0, 0.2)",
            }}
            exit={{
              backdropFilter: "blur(0px)",
              WebkitBackdropFilter: "blur(0px)",
              backgroundColor: "rgba(0, 0, 0, 0)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />

          {/* Main popup */}
          <AnimatePresence>
            {isReady && (
              <motion.div className="fixed inset-0 flex items-center justify-center pointer-events-none p-2 sm:p-4">
                <motion.div
                  ref={popupRef}
                  className="case-history-popup glass-panel max-w-2xl w-full pointer-events-auto overflow-hidden flex flex-col bg-white"
                  layout
                  initial={{
                    scale: 0,
                    opacity: 0,
                    borderRadius: "100%",
                  }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    borderRadius: "1rem",
                  }}
                  exit={{
                    scale: 0,
                    opacity: 0,
                    borderRadius: "100%",
                  }}
                  transition={{
                    scale: {
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                      duration: 0.3,
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeOut",
                    },
                    borderRadius: {
                      duration: 0.2,
                      ease: [0.16, 1, 0.3, 1],
                    },
                    layout: {
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                      duration: 0.4,
                    },
                  }}
                  style={modalStyle}
                >
                  <motion.div
                    layout="position"
                    className="flex flex-col h-full max-h-[95vh] overflow-hidden"
                  >
                    {!isExpanded ? (
                      // Show loading state or empty state
                      <motion.div
                        layout
                        className="flex flex-col items-center justify-center py-12"
                      >
                        {showLoading ? (
                          <>
                            <LoadingSpinner />
                            <p className="mt-2 text-sm text-gray-500">
                              Loading case history...
                            </p>
                          </>
                        ) : (
                          // Empty state while waiting (first 200ms)
                          <div className="h-8" />
                        )}
                      </motion.div>
                    ) : (
                      <>
                        {/* Header Section - Fixed */}
                        <motion.div
                          layout="position"
                          className="flex-shrink-0 p-4 sm:p-6 pb-0"
                        >
                          {/* Title Bar */}
                          <div className="flex items-start justify-between mb-3 sm:mb-4">
                            <div>
                              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-0.5 sm:mb-1">
                                Case {caseNum}
                              </h2>
                              {/* Case notes */}
                              {caseNotes && (
                                <p className="text-xs sm:text-sm text-gray-500 italic">
                                  "{caseNotes}"
                                </p>
                              )}
                            </div>

                            <button
                              onClick={handleClose}
                              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <svg
                                className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        </motion.div>

                        {/* Content Section - Scrollable */}
                        <motion.div
                          layout="position"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1, duration: 0.3 }}
                          className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6"
                        >
                          {/* Primary Status */}
                          {caseData && insights && (
                            <div className="mb-4 sm:mb-6">
                              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div>
                                    {caseData.completed ? (
                                      <div>
                                        <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-0.5 sm:mb-1">
                                          Complete
                                        </div>
                                        {completionTime && (
                                          <div
                                            className={`text-xs sm:text-sm ${completionTime.color} font-medium`}
                                          >
                                            Delivered {completionTime.text}
                                          </div>
                                        )}
                                      </div>
                                    ) : insights.isOverdue ? (
                                      <div>
                                        <div className="text-2xl sm:text-3xl font-bold text-red-600 mb-0.5 sm:mb-1">
                                          Late
                                        </div>
                                        <div className="text-base sm:text-lg text-red-600 font-mono tabular-nums">
                                          <CountdownTimer
                                            dueDate={caseData.due}
                                            isPriority={caseData.priority}
                                            isOverdue={true}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <div
                                          className={`text-2xl sm:text-3xl font-bold ${
                                            insights.daysUntilDue <= 1
                                              ? "text-orange-600"
                                              : "text-blue-600"
                                          } mb-0.5 sm:mb-1`}
                                        >
                                          Active
                                        </div>
                                        {insights.daysUntilDue <= 1 && (
                                          <div className="text-base sm:text-lg text-orange-600 font-mono tabular-nums">
                                            <CountdownTimer
                                              dueDate={caseData.due}
                                              isPriority={caseData.priority}
                                              isOverdue={false}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Priority Badges */}
                                  {(caseData.priority ||
                                    caseData.rush ||
                                    caseData.hold) && (
                                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                      {caseData.priority && (
                                        <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold bg-red-500 text-white shadow-sm">
                                          Priority
                                        </span>
                                      )}
                                      {caseData.rush && (
                                        <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold bg-orange-500 text-white shadow-sm">
                                          Rush
                                        </span>
                                      )}
                                      {caseData.hold && (
                                        <span className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-sm">
                                          Hold
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Stage Timeline for Digital Department */}
                          {caseData &&
                            caseData.department === "Digital" &&
                            caseData.digitalStage && (
                              <StageTimeline
                                stageHistory={stageHistory}
                                currentStage={caseData.digitalStage}
                                caseData={caseData}
                              />
                            )}

                          {/* Timeline & Creation */}
                          {caseData && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                              {/* Created */}
                              <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">
                                  Created
                                </div>
                                <div className="text-xs sm:text-sm font-semibold text-gray-900">
                                  {formatTimestamp(
                                    creationInfo?.timestamp ||
                                      caseData.created_at
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                                  by {creationInfo?.user || "Unknown"}
                                </div>
                              </div>

                              {/* Due */}
                              <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">
                                  Due
                                </div>
                                <div className="text-xs sm:text-sm font-semibold text-gray-900">
                                  {(() => {
                                    const [year, month, day] = caseData.due
                                      .split("T")[0]
                                      .split("-");
                                    const date = new Date(year, month - 1, day);
                                    return date.toLocaleDateString("en-US", {
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    });
                                  })()}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                                  {caseData.priority ? "12:00 PM" : "5:00 PM"}{" "}
                                  MST
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Case Properties */}
                          {caseData && (
                            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                              {/* Department */}
                              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                                <div className="text-xs text-gray-500 mb-0.5 sm:mb-1">
                                  Department
                                </div>
                                <div
                                  className={`text-xs sm:text-sm font-semibold ${
                                    caseData.department === "Digital"
                                      ? "text-blue-600"
                                      : caseData.department === "C&B"
                                      ? "text-purple-600"
                                      : "text-gray-700"
                                  }`}
                                >
                                  {caseData.department}
                                </div>
                              </div>

                              {/* Type */}
                              <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3">
                                <div className="text-xs text-gray-500 mb-0.5 sm:mb-1">
                                  Type
                                </div>
                                <div className="text-xs sm:text-sm font-semibold text-gray-700">
                                  {caseData.department === "Metal"
                                    ? caseData.stage2
                                      ? "Stage 2"
                                      : "Stage 1"
                                    : caseData.caseType === "bbs"
                                    ? "BBS"
                                    : caseData.caseType === "flex"
                                    ? "3D Flex"
                                    : "General"}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Divider */}
                          <div className="border-t border-gray-200 mb-4" />

                          {/* Activity Section */}
                          <div>
                            {/* Activity Header */}
                            <div className="mb-3 sm:mb-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wider">
                                  Activity History
                                </h3>
                                {rows.length > 0 && (
                                  <div className="flex items-center gap-2 sm:gap-4 text-xs text-gray-500">
                                    <span>
                                      <span className="font-semibold text-gray-700">
                                        {rows.length}
                                      </span>{" "}
                                      total
                                    </span>
                                    {activityStats.editCount > 0 && (
                                      <span className="hidden sm:inline">
                                        <span className="font-semibold text-purple-700">
                                          {activityStats.editCount}
                                        </span>{" "}
                                        edits
                                      </span>
                                    )}
                                    {activityStats.stageCount > 0 && (
                                      <span className="hidden sm:inline">
                                        <span className="font-semibold text-indigo-700">
                                          {activityStats.stageCount}
                                        </span>{" "}
                                        stage changes
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Timeline */}
                            {rows.length > 0 ? (
                              <div className="space-y-1.5 sm:space-y-2">
                                {rows.map((item, index) => (
                                  <HistoryItem
                                    key={item.id}
                                    item={item}
                                    index={index}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 sm:py-12">
                                <svg
                                  className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-300"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                  />
                                </svg>
                                <p className="mt-2 text-xs sm:text-sm text-gray-500">
                                  No activity recorded yet
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
