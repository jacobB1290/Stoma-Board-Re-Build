import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LayoutGroup, motion, AnimatePresence } from "framer-motion";
import DayCol from "./DayCol";
import MetaCol from "./MetaCol";
import { useMut } from "../context/DataContext";
import { iso, addDays, isWeekday } from "../utils/date";
import { SPRING } from "../animationEngine";
import CaseHistory from "./CaseHistory";
import {
  StageDetailsModal,
  calculateStageStatistics,
} from "../utils/stageTimeCalculations";
import {
  EfficiencyModal,
  calculateDepartmentEfficiency,
} from "../utils/efficiencyCalculations";
import { CaseManagementModal } from "./CaseManagementModal";

/* ---------------- Error Boundary ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg m-4">
          <h3 className="text-red-800 font-medium mb-2">
            Something went wrong
          </h3>
          <p className="text-red-600 text-sm">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ---------------- helpers ---------------- */
const getStageFromModifiers = (mods = []) => {
  if (mods?.includes("stage-qc")) return "qc";
  if (mods?.includes("stage-finishing")) return "finishing";
  if (mods?.includes("stage-production")) return "production";
  if (mods?.includes("stage-design")) return "design";
  return "design";
};

const rank = (r) =>
  r.priority
    ? 0
    : r.rush
    ? 1
    : r.stage2 && r.department === "Metal"
    ? 3
    : r.caseType === "bbs"
    ? 4
    : r.caseType === "flex"
    ? 5
    : 2;

const compare = (a, b) => {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const da = new Date(a.due);
  const db = new Date(b.due);
  if (da < db) return -1;
  if (da > db) return 1;
  return new Date(a.created_at) - new Date(b.created_at);
};

/* ============================================================
   LOCAL trigger + calc hooks (kept in this file)
   ============================================================ */
function useStageCalcTrigger({ rows, stage }) {
  const [shouldCalc, setShouldCalc] = useState(false);
  const prevStage = useRef(stage);
  const prevRowsRef = useRef(rows);
  const hasCalculated = useRef(false);

  const strip = (r) => ({
    id: r.id,
    completed: r.completed,
    stage: getStageFromModifiers(r.modifiers),
    dept: r.department,
  });

  useEffect(() => {
    // Stage switched
    if (stage !== prevStage.current) {
      hasCalculated.current = false;
      prevStage.current = stage;
      setShouldCalc(false);
      prevRowsRef.current = rows;
    }

    if (!stage) {
      hasCalculated.current = false;
      setShouldCalc(false);
      prevRowsRef.current = rows;
      return;
    }

    // First time seeing this stage - calculate immediately
    if (!hasCalculated.current) {
      hasCalculated.current = true;
      setShouldCalc(true);
      prevRowsRef.current = rows;
      return;
    }

    // Detect changes for recalculation
    const prev = prevRowsRef.current;
    const next = rows;

    const prevMap = new Map(prev.map((r) => [r.id, strip(r)]));
    let changed = false;

    for (const r of next) {
      const p = prevMap.get(r.id);
      if (!p) continue;
      const cur = strip(r);
      if (cur.dept === "General") {
        if (p.stage !== cur.stage || p.completed !== cur.completed) {
          changed = true;
          break;
        }
      }
    }

    if (changed) setShouldCalc(true);
    prevRowsRef.current = next;
  }, [rows, stage]);

  const acknowledge = useCallback(() => setShouldCalc(false), []);

  return { shouldCalc, acknowledge };
}

function useStageMetrics(stage, stageCount, activeDept, onDone) {
  const [stats, setStats] = useState(null);
  const [efficiency, setEfficiency] = useState(null);
  const [progress, setProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showingStats, setShowingStats] = useState(false);

  const pending = useRef(false);
  const prevStage = useRef(stage);
  const calculationStartTime = useRef(null);
  const progressAnimationRef = useRef(null);

  // Smooth progress animation
  useEffect(() => {
    if (progressAnimationRef.current) {
      cancelAnimationFrame(progressAnimationRef.current);
    }

    const animateProgress = () => {
      setDisplayProgress((current) => {
        const diff = progress - current;
        if (Math.abs(diff) < 0.5) {
          return progress;
        }
        return current + diff * 0.1;
      });

      if (Math.abs(displayProgress - progress) > 0.5) {
        progressAnimationRef.current = requestAnimationFrame(animateProgress);
      }
    };

    progressAnimationRef.current = requestAnimationFrame(animateProgress);

    return () => {
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
    };
  }, [progress, displayProgress]);

  // Reset on stage change
  useEffect(() => {
    if (stage !== prevStage.current) {
      console.log(`Stage changed from ${prevStage.current} to ${stage}`);
      pending.current = false;
      setStats(null);
      setEfficiency(null);
      setProgress(0);
      setDisplayProgress(0);
      setIsCalculating(false);
      setShowingStats(false);
      prevStage.current = stage;
    }
  }, [stage]);

  const kick = useCallback(async () => {
    if (!stage) {
      console.log("No stage specified, aborting calculation");
      return;
    }

    console.log(
      `Starting calculation for ${stage} stage, activeDept: ${activeDept}`
    );
    pending.current = true;

    // For Metal department, skip the loading animation
    if (activeDept === "Metal") {
      setIsCalculating(false);
      setShowingStats(true);
      setStats({
        noData: true,
        message: "Stage statistics not available for Metal department",
      });

      // Still calculate efficiency for potential future use
      const e = await calculateDepartmentEfficiency(
        "Metal",
        stage,
        null,
        stageCount
      );

      if (pending.current) {
        setEfficiency(e);
      }

      onDone && onDone();
      return;
    }

    // Digital department - show loading animation
    setIsCalculating(true);
    setShowingStats(false);
    setProgress(0);
    setDisplayProgress(0);
    calculationStartTime.current = Date.now();

    try {
      // Digital stages with real progress tracking
      console.log(`Starting stage statistics calculation for ${stage}`);

      const s = await calculateStageStatistics(stage, (p) => {
        if (pending.current) {
          // First 70% for stage statistics
          console.log(`Stage statistics progress: ${p}%`);
          setProgress(p * 0.7);
        }
      });

      if (!pending.current) {
        console.log("Calculation cancelled (component unmounted)");
        return;
      }

      console.log("Stage statistics result:", s);

      // Check if we got valid data
      if (!s) {
        console.error("calculateStageStatistics returned null");
        setStats({ noData: true, message: "Failed to calculate statistics" });
        setEfficiency({ noData: true, message: "No statistics available" });
        setProgress(0);
        setIsCalculating(false);
        return;
      }

      setStats(s);

      if (s && !s.noData) {
        console.log("Stage statistics valid, calculating efficiency...");
        // Last 30% for efficiency calculation
        const e = await calculateDepartmentEfficiency(
          "Digital",
          stage,
          s,
          stageCount,
          (p) => {
            if (pending.current) {
              console.log(`Efficiency calculation progress: ${p}%`);
              setProgress(70 + p * 0.3);
            }
          }
        );

        if (pending.current) {
          console.log("Efficiency calculation result:", e);
          setEfficiency(e);
        }
      } else {
        console.log("Stage statistics returned noData:", s);
        setEfficiency({
          noData: true,
          message: s?.message || "No stage statistics available",
          department: "Digital",
          stage,
        });
      }

      if (pending.current) {
        setProgress(100);
      }

      onDone && onDone();
    } catch (err) {
      console.error("Stage calc error details:", err);
      console.error("Error stack:", err.stack);
      if (pending.current) {
        setStats({ error: true, message: err.message });
        setEfficiency({
          noData: true,
          message: `Error: ${err.message}`,
          department: activeDept === "Metal" ? "Metal" : "Digital",
          stage,
        });
        setProgress(0);
      }
    } finally {
      // Handle the completion animation (Digital only)
      if (pending.current && activeDept !== "Metal") {
        console.log("Finalizing calculation...");

        const elapsedTime = Date.now() - calculationStartTime.current;
        const minimumDisplayTime = 500; // Reduced from 800ms

        if (elapsedTime < minimumDisplayTime) {
          // Add optimistic delay if calculation was too fast
          const remainingTime = minimumDisplayTime - elapsedTime;
          console.log(`Adding ${remainingTime}ms delay for smooth animation`);

          await new Promise((resolve) => setTimeout(resolve, remainingTime));
        }

        // Ensure we're at 100% for a moment
        setProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 150)); // Reduced from 200ms

        // Start showing stats
        setShowingStats(true);

        // Hide progress bar after stats start showing
        setTimeout(() => {
          if (pending.current) {
            setIsCalculating(false);
            setProgress(0);
            setDisplayProgress(0);
          }
        }, 200); // Reduced from 300ms
      }
    }
  }, [stage, stageCount, activeDept, onDone]);

  return {
    stats,
    efficiency,
    isCalculating,
    progress: displayProgress,
    showingStats,
    kick,
  };
}

/* ============================================================ */

export default function Board({
  data,
  stage = null,
  activeDept = null,
  onStatsCalculated,
}) {
  const {
    rows: ctxRows,
    toggleComplete,
    toggleHold,
    toggleStage2,
    updateCaseStage,
  } = useMut();
  const rows = Array.isArray(data) ? data : ctxRows;

  /* today / horizon */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const horizon = useMemo(() => {
    const out = [];
    let p = new Date(today);
    while (out.length < 7) {
      if (isWeekday(p)) out.push(new Date(p));
      p = addDays(p, 1);
    }
    return out;
  }, [today]);

  /* filter rows by stage */
  const filteredRows = useMemo(() => {
    if (!stage) return rows;

    // For Digital stages
    if (activeDept === "General") {
      return rows.filter((r) => {
        if (r.department !== "General") return true;
        if (r.completed) return false;
        const rowStage = getStageFromModifiers(r.modifiers);
        if (rowStage === "qc") return false;
        return rowStage === stage;
      });
    }

    // For Metal stages
    if (activeDept === "Metal") {
      return rows.filter((r) => {
        if (r.department !== "Metal") return false;
        if (r.completed) return false;

        if (stage === "development") {
          // Stage 1 - cases without stage2 modifier
          return !r.stage2;
        } else if (stage === "finishing") {
          // Stage 2 - cases with stage2 modifier
          return r.stage2;
        }
        return true;
      });
    }

    return rows;
  }, [rows, stage, activeDept]);

  /* buckets */
  const { map, overdue, hold } = useMemo(() => {
    const m = Object.fromEntries(horizon.map((d) => [iso(d), []]));
    const late = [];
    const holdArr = [];
    filteredRows.forEach((r) => {
      if (r.completed) return;
      if (r.hold) {
        holdArr.push(r);
        return;
      }
      const key = iso(new Date(r.due));
      if (key < iso(today)) late.push(r);
      else if (m[key]) m[key].push(r);
    });
    late.sort(compare);
    holdArr.sort(compare);
    Object.values(m).forEach((arr) => arr.sort(compare));
    return { map: m, overdue: late, hold: holdArr };
  }, [filteredRows, horizon, today]);

  /* stage config (colors/icons) */
  const stageConfig = {
    design: {
      title: "Design Stage",
      description: "Initial design and planning phase",
      color: "bg-blue-50 border-blue-200",
      textColor: "text-blue-800",
      accentColor: "text-blue-600",
      bgGradient: "from-blue-50 to-blue-100",
      icon: (
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    production: {
      title: "Production Stage",
      description: "Active manufacturing process",
      color: "bg-purple-50 border-purple-200",
      textColor: "text-purple-800",
      accentColor: "text-purple-600",
      bgGradient: "from-purple-50 to-purple-100",
      icon: (
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
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
      ),
    },
    finishing: {
      title: "Finishing Stage",
      description: "Quality control and final preparations",
      color: "bg-green-50 border-green-200",
      textColor: "text-green-800",
      accentColor: "text-green-600",
      bgGradient: "from-green-50 to-green-100",
      icon: (
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
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  };

  const metalStageConfig = {
    development: {
      title: "Development Stage",
      description: "Initial metal fabrication phase",
      color: "bg-blue-50 border-blue-200",
      textColor: "text-blue-800",
      accentColor: "text-blue-600",
      bgGradient: "from-blue-50 to-blue-100",
      icon: (
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
    finishing: {
      title: "Finishing Stage",
      description: "Final metal processing and quality control",
      color: "bg-purple-50 border-purple-200",
      textColor: "text-purple-800",
      accentColor: "text-purple-600",
      bgGradient: "from-purple-50 to-purple-100",
      icon: (
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
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
    },
  };

  const currentStageConfig = stage
    ? activeDept === "Metal"
      ? metalStageConfig[stage]
      : stageConfig[stage]
    : null;

  /* stage count */
  const stageCount = useMemo(() => {
    if (!stage) return 0;

    if (activeDept === "General") {
      return rows.filter((r) => {
        if (r.department !== "General") return false;
        if (r.completed) return false;
        const rowStage = getStageFromModifiers(r.modifiers);
        return rowStage === stage && rowStage !== "qc";
      }).length;
    }

    if (activeDept === "Metal") {
      return rows.filter((r) => {
        if (r.department !== "Metal") return false;
        if (r.completed) return false;
        if (stage === "development") return !r.stage2;
        if (stage === "finishing") return r.stage2;
        return false;
      }).length;
    }

    return 0;
  }, [rows, stage, activeDept]);

  /* trigger + metrics */
  const { shouldCalc, acknowledge } = useStageCalcTrigger({
    rows,
    stage,
  });

  const {
    stats: stageStats,
    efficiency: departmentEfficiency,
    isCalculating,
    progress,
    showingStats,
    kick: recalc,
  } = useStageMetrics(stage, stageCount, activeDept, onStatsCalculated);

  // kick calc when trigger fires
  useEffect(() => {
    if (shouldCalc && stage) {
      console.log(
        `Triggering calculation for stage: ${stage}, activeDept: ${activeDept}`
      );
      recalc();
      acknowledge();
    }
  }, [shouldCalc, stage, recalc, acknowledge, activeDept]);

  /* dept efficiency (non-stage) */
  const [deptEfficiency, setDeptEfficiency] = useState(null);
  const [deptLoading, setDeptLoading] = useState(false);
  useEffect(() => {
    if (stage || !activeDept) {
      setDeptEfficiency(null);
      setDeptLoading(false);
      return;
    }
    let mounted = true;
    setDeptLoading(true);
    (async () => {
      try {
        const e = await calculateDepartmentEfficiency(activeDept, null, null);
        if (mounted) setDeptEfficiency(e);
      } catch {
        if (mounted)
          setDeptEfficiency({
            noData: true,
            message: "Error calculating efficiency",
            department: activeDept,
            stage: null,
          });
      } finally {
        if (mounted) setDeptLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeDept, stage]);

  /* modals */
  const [showEfficiencyModal, setShowEfficiencyModal] = useState(false);
  const [showStageDetails, setShowStageDetails] = useState(false);
  const [selectedCaseForHistory, setSelectedCaseForHistory] = useState(null);
  const [showCaseManagement, setShowCaseManagement] = useState(false);
  const modalOpenRef = useRef(false);

  // if details modal open and rows change -> recalc silently
  useEffect(() => {
    if (modalOpenRef.current && stage) {
      recalc();
    }
  }, [rows, stage, recalc]);

  const formatDuration = (ms) => {
    if (!ms || ms === 0 || !isFinite(ms)) return "—";
    const hours = Math.floor(ms / 36e5);
    const days = Math.floor(hours / 24);
    const mins = Math.floor((ms % 36e5) / 6e4);
    return days > 0
      ? `${days}d ${hours % 24}h`
      : hours > 0
      ? `${hours}h ${mins}m`
      : `${mins}m`;
  };

  const handleShowEfficiencyModal = async () => {
    if (
      stage &&
      (!departmentEfficiency || departmentEfficiency.noData) &&
      stageStats &&
      !stageStats.noData
    ) {
      try {
        await calculateDepartmentEfficiency(
          activeDept === "Metal" ? "Metal" : "Digital",
          stage,
          stageStats,
          stageCount
        );
      } catch {}
    }
    setShowEfficiencyModal(true);
  };

  const handleShowCaseManagement = useCallback(() => {
    setShowCaseManagement(true);
  }, []);

  // Debug current state
  useEffect(() => {
    console.log("Board state:", {
      stage,
      activeDept,
      stageCount,
      hasStats: !!stageStats,
      statsNoData: stageStats?.noData,
      hasEfficiency: !!departmentEfficiency,
      efficiencyNoData: departmentEfficiency?.noData,
      isCalculating,
      progress,
      showingStats,
    });
  }, [
    stage,
    activeDept,
    stageCount,
    stageStats,
    departmentEfficiency,
    isCalculating,
    progress,
    showingStats,
  ]);

  // Get stage dividers enabled setting
  const [showStageDividers, setShowStageDividers] = useState(
    JSON.parse(localStorage.getItem("showStageDividers") || "false")
  );

  useEffect(() => {
    const handleStorageChange = () => {
      setShowStageDividers(
        JSON.parse(localStorage.getItem("showStageDividers") || "false")
      );
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("settings-changed", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("settings-changed", handleStorageChange);
    };
  }, []);

  return (
    <main className="flex-1 overflow-auto p-4 pb-44">
      {/* Compact Stage banner */}
      <ErrorBoundary>
        {stage && currentStageConfig && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-3 rounded-lg border ${currentStageConfig.color} overflow-hidden shadow-sm`}
          >
            <div
              className={`bg-gradient-to-r ${currentStageConfig.bgGradient} p-3`}
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left side - Title only, no description */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`${currentStageConfig.accentColor} p-1.5 bg-white/50 rounded flex-shrink-0`}
                  >
                    {currentStageConfig.icon}
                  </div>
                  <h2
                    className={`text-lg font-semibold ${currentStageConfig.textColor} leading-tight break-words`}
                  >
                    {currentStageConfig.title}
                  </h2>
                </div>

                {/* Right side - Stats Section */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    {/* Stats Container - Adjusted for mobile responsiveness */}
                    <div
                      className={`h-14 bg-white/30 backdrop-blur-sm rounded-lg border border-white/50 overflow-hidden ${
                        activeDept === "Metal"
                          ? "w-20"
                          : "sm:min-w-[280px] min-w-[240px]"
                      }`}
                    >
                      <AnimatePresence mode="wait">
                        {isCalculating && activeDept !== "Metal" ? (
                          <motion.div
                            key="progress"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full flex items-center px-4"
                          >
                            <div className="w-full">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`${currentStageConfig.accentColor}`}
                                  >
                                    <svg
                                      className="w-3.5 h-3.5 animate-spin"
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
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                  </div>
                                  <span
                                    className={`text-xs font-medium ${currentStageConfig.textColor}`}
                                  >
                                    {progress < 70
                                      ? "Calculating..."
                                      : "Finalizing..."}
                                  </span>
                                </div>
                                <span
                                  className={`text-xs font-semibold ${currentStageConfig.textColor}`}
                                >
                                  {Math.round(progress)}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full bg-gradient-to-r ${
                                    currentStageConfig.textColor ===
                                    "text-blue-800"
                                      ? "from-blue-400 to-blue-600"
                                      : currentStageConfig.textColor ===
                                        "text-purple-800"
                                      ? "from-purple-400 to-purple-600"
                                      : "from-green-400 to-green-600"
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 0.2, ease: "linear" }}
                                />
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="stats"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="h-full flex items-center px-3"
                          >
                            {activeDept === "Metal" ? (
                              /* Metal Department - Only Active Cases (non-clickable) */
                              <div className="w-full text-center">
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`text-xl font-bold leading-tight ${currentStageConfig.textColor}`}
                                  >
                                    {stageCount}
                                  </div>
                                  <div
                                    className={`text-[10px] font-medium ${currentStageConfig.accentColor} opacity-70 leading-tight`}
                                  >
                                    Active
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Digital Department - All Stats */
                              <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full">
                                {/* Efficiency Stat */}
                                <motion.button
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={handleShowEfficiencyModal}
                                  className="text-center group cursor-pointer"
                                  disabled={
                                    !departmentEfficiency ||
                                    departmentEfficiency.noData
                                  }
                                >
                                  <div className="flex flex-col items-center">
                                    <div
                                      className={`text-lg sm:text-xl font-bold leading-tight transition-colors ${
                                        departmentEfficiency &&
                                        !departmentEfficiency.noData
                                          ? departmentEfficiency.score >= 85
                                            ? "text-green-600 group-hover:text-green-700"
                                            : departmentEfficiency.score >= 70
                                            ? "text-blue-600 group-hover:text-blue-700"
                                            : departmentEfficiency.score >= 50
                                            ? "text-yellow-600 group-hover:text-yellow-700"
                                            : "text-red-600 group-hover:text-red-700"
                                          : "text-gray-400"
                                      }`}
                                    >
                                      {departmentEfficiency &&
                                      !departmentEfficiency.noData
                                        ? `${departmentEfficiency.score}%`
                                        : "—"}
                                    </div>
                                    <div
                                      className={`text-[10px] font-medium ${currentStageConfig.accentColor} opacity-70 leading-tight`}
                                    >
                                      Efficiency
                                    </div>
                                  </div>
                                </motion.button>

                                {/* Average Time */}
                                <motion.button
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => setShowStageDetails(true)}
                                  className="text-center group cursor-pointer"
                                  disabled={
                                    !stageStats ||
                                    stageStats.noData ||
                                    stageStats.error
                                  }
                                >
                                  <div className="flex flex-col items-center">
                                    <div
                                      className={`text-lg sm:text-xl font-bold leading-tight transition-colors ${
                                        stageStats &&
                                        !stageStats.noData &&
                                        !stageStats.error
                                          ? `${currentStageConfig.textColor} group-hover:opacity-80`
                                          : "text-gray-400"
                                      }`}
                                    >
                                      {stageStats &&
                                      !stageStats.noData &&
                                      !stageStats.error
                                        ? formatDuration(stageStats.averageTime)
                                        : "—"}
                                    </div>
                                    <div
                                      className={`text-[10px] font-medium ${currentStageConfig.accentColor} opacity-70 leading-tight`}
                                    >
                                      Avg Time
                                    </div>
                                  </div>
                                </motion.button>

                                {/* Active Cases */}
                                <motion.button
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={handleShowCaseManagement}
                                  className="text-center group cursor-pointer"
                                >
                                  <div className="flex flex-col items-center">
                                    <div
                                      className={`text-lg sm:text-xl font-bold leading-tight ${currentStageConfig.textColor} transition-opacity group-hover:opacity-80`}
                                    >
                                      {stageCount}
                                    </div>
                                    <div
                                      className={`text-[10px] font-medium ${currentStageConfig.accentColor} opacity-70 leading-tight`}
                                    >
                                      Active
                                    </div>
                                  </div>
                                </motion.button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </ErrorBoundary>

      <LayoutGroup>
        <motion.div
          layout
          transition={{ layout: SPRING }}
          className="flex gap-4 flex-nowrap"
        >
          <div className="w-60 flex-shrink-0 flex flex-col">
            <MetaCol
              title="Overdue"
              color="red"
              rows={overdue}
              today={today}
              toggleComplete={toggleComplete}
              toggleStage2={toggleStage2}
              toggleHold={toggleHold}
              stage={stage}
              stageConfig={currentStageConfig}
              updateCaseStage={updateCaseStage}
              showStageDividers={showStageDividers && !stage}
            />
            <div className="h-4" />
            <MetaCol
              title="On Hold"
              color="amber"
              rows={hold}
              today={today}
              onHold
              toggleHold={toggleHold}
              toggleStage2={toggleStage2}
              stage={stage}
              stageConfig={currentStageConfig}
              updateCaseStage={updateCaseStage}
              showStageDividers={showStageDividers && !stage}
            />
          </div>

          {horizon.map((d) => (
            <DayCol
              key={iso(d)}
              date={d}
              rows={map[iso(d)]}
              isToday={iso(d) === iso(today)}
              toggleComplete={toggleComplete}
              toggleStage2={toggleStage2}
              stage={stage}
              stageConfig={currentStageConfig}
              updateCaseStage={updateCaseStage}
              showStageDividers={showStageDividers && !stage}
            />
          ))}
        </motion.div>
      </LayoutGroup>

      {/* Modals */}
      <StageDetailsModal
        showStageDetails={showStageDetails}
        setShowStageDetails={setShowStageDetails}
        stageStats={stageStats}
        currentStageConfig={currentStageConfig}
        modalOpenRef={modalOpenRef}
        formatDuration={formatDuration}
        setSelectedCaseForHistory={setSelectedCaseForHistory}
      />

      <EfficiencyModal
        showEfficiencyModal={showEfficiencyModal}
        setShowEfficiencyModal={setShowEfficiencyModal}
        departmentEfficiency={stage ? departmentEfficiency : deptEfficiency}
        formatDuration={formatDuration}
        onShowCaseManagement={handleShowCaseManagement}
      />

      <CaseManagementModal
        show={showCaseManagement}
        onClose={(shouldRefresh) => {
          setShowCaseManagement(false);
          if (shouldRefresh && stage) recalc();
        }}
        stage={stage}
        stageStats={stageStats}
      />

      {selectedCaseForHistory && (
        <CaseHistory
          id={selectedCaseForHistory.id}
          caseNumber={selectedCaseForHistory.caseNumber}
          onClose={() => setSelectedCaseForHistory(null)}
        />
      )}
    </main>
  );
}
