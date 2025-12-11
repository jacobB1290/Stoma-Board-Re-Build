import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useContext,
} from "react";
import { createPortal } from "react-dom";
import { DataProvider, useMut } from "./context/DataContext";
import { UserProvider, UserCtx } from "./context/UserContext";
import UserSetupModal from "./components/UserSetupModal";
import SettingsModal from "./components/SettingsModal";
import Board from "./components/Board";
import Editor from "./components/Editor";
import { FlashProvider } from "./FlashContext";
import clsx from "clsx";

import "./theme-white.css";
import "./styles/glass.css";
import "./flash.css";

/* =============================
   Settings Pill Component
   ============================= */
function SettingsPill({ onClick, className, isMobile = false }) {
  const { name } = useContext(UserCtx);
  const isWhite = document.documentElement.classList.contains("theme-white");
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Don't render if viewport doesn't match intended display
  if (isMobile && !isMobileView) return null;
  if (!isMobile && isMobileView) return null;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
        "bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20",
        "shadow-sm hover:shadow-md",
        className
      )}
      aria-label="Settings"
    >
      <span className="text-lg">⚙️</span>
      {name && (
        <span
          className={clsx(
            "text-xs font-medium max-w-[100px] truncate",
            isWhite ? "text-gray-700" : "text-white/90"
          )}
        >
          {name}
        </span>
      )}
    </button>
  );
}

/* =============================
   Digital dropdown via portal
   ============================= */
function DigitalDropdown({
  open,
  anchorRef,
  digitalView,
  stageCounts,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  menuRefExternal, // external ref from parent
}) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const menuH = menuRef.current ? menuRef.current.offsetHeight : 220;
    const below = rect.bottom + 6;
    const above = rect.top - menuH - 6;
    const placeAbove = below + menuH > vh && above > 0;

    setPos({
      top: placeAbove ? above : below,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={(el) => {
        menuRef.current = el;
        if (menuRefExternal) menuRefExternal.current = el;
      }}
      role="menu"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className="rounded-lg shadow-xl border border-gray-200 bg-white overflow-hidden text-gray-800"
    >
      <MenuItem
        active={digitalView === "overview"}
        label="Overview"
        meta="All"
        onClick={() => onSelect("overview")}
      />
      <Divider />
      <MenuItem
        active={digitalView === "design"}
        label="Design Stage"
        meta={stageCounts.design}
        onClick={() => onSelect("design")}
      />
      <MenuItem
        active={digitalView === "production"}
        label="Production Stage"
        meta={stageCounts.production}
        onClick={() => onSelect("production")}
      />
      <MenuItem
        active={digitalView === "finishing"}
        label="Finishing Stage"
        meta={stageCounts.finishing}
        onClick={() => onSelect("finishing")}
      />
    </div>,
    document.body
  );
}

/* =============================
   Metal dropdown via portal
   ============================= */
function MetalDropdown({
  open,
  anchorRef,
  metalView,
  stageCounts,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  menuRefExternal,
}) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const menuH = menuRef.current ? menuRef.current.offsetHeight : 150;
    const below = rect.bottom + 6;
    const above = rect.top - menuH - 6;
    const placeAbove = below + menuH > vh && above > 0;

    setPos({
      top: placeAbove ? above : below,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={(el) => {
        menuRef.current = el;
        if (menuRefExternal) menuRefExternal.current = el;
      }}
      role="menu"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className="rounded-lg shadow-xl border border-gray-200 bg-white overflow-hidden text-gray-800"
    >
      <MenuItem
        active={metalView === "overview"}
        label="Overview"
        meta="All"
        onClick={() => onSelect("overview")}
      />
      <Divider />
      <MenuItem
        active={metalView === "development"}
        label="Development Stage"
        meta={stageCounts.development}
        onClick={() => onSelect("development")}
      />
      <MenuItem
        active={metalView === "finishing"}
        label="Finishing Stage"
        meta={stageCounts.finishing}
        onClick={() => onSelect("finishing")}
      />
    </div>,
    document.body
  );
}

function MenuItem({ active, label, meta, onClick }) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "flex w-full items-center justify-between px-4 py-2 text-sm select-none",
        active ? "bg-gray-50 font-semibold" : "hover:bg-gray-100"
      )}
    >
      <span className="truncate">{label}</span>
      <span className="ml-3 text-xs text-gray-500">{meta}</span>
    </button>
  );
}

const Divider = () => <div className="border-t border-gray-200 my-1" />;

export default function App() {
  const [view, setView] = useState(
    localStorage.getItem("lastView") || "digital"
  );
  const [theme, setTheme] = useState(
    localStorage.getItem("boardTheme") || "blue"
  );
  const [showInfoBar, setShowInfoBar] = useState(
    JSON.parse(localStorage.getItem("showInfoBar") || "true")
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initialize digitalView from localStorage
  const [digitalView, setDigitalView] = useState(
    localStorage.getItem("lastDigitalView") || "overview"
  );

  // Initialize metalView from localStorage
  const [metalView, setMetalView] = useState(
    localStorage.getItem("lastMetalView") || "overview"
  );

  const [showDigitalDropdown, setShowDigitalDropdown] = useState(false);
  const [showMetalDropdown, setShowMetalDropdown] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-white", theme === "white");
  }, [theme]);

  useEffect(() => {
    const blue = ["bg-gradient-to-br", "from-[#103E48]", "to-[#16525F]"];
    const white = [
      "bg-gradient-to-br",
      "from-white/40",
      "via-white/60",
      "to-white/90",
    ];
    document.body.classList.remove(...blue, ...white);
    if (theme === "blue") document.body.classList.add(...blue);
    else document.body.classList.add(...white);
  }, [theme]);

  useEffect(() => scheduleMidnightRefresh(), []);

  // Save view to localStorage
  useEffect(() => localStorage.setItem("lastView", view), [view]);

  // Save digitalView to localStorage
  useEffect(
    () => localStorage.setItem("lastDigitalView", digitalView),
    [digitalView]
  );

  // Save metalView to localStorage
  useEffect(
    () => localStorage.setItem("lastMetalView", metalView),
    [metalView]
  );

  function scheduleMidnightRefresh() {
    const now = new Date();
    const ms =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    setTimeout(() => window.location.reload(), ms);
  }

  let activeDept = null;
  if (view === "digital") activeDept = "General";
  else if (view === "cb") activeDept = "C&B";
  else if (view === "metal") activeDept = "Metal";

  return (
    <UserProvider>
      <FlashProvider>
        <DataProvider activeDept={activeDept}>
          <Inner
            view={view}
            setView={setView}
            digitalView={digitalView}
            setDigitalView={setDigitalView}
            metalView={metalView}
            setMetalView={setMetalView}
            showDigitalDropdown={showDigitalDropdown}
            setShowDigitalDropdown={setShowDigitalDropdown}
            showMetalDropdown={showMetalDropdown}
            setShowMetalDropdown={setShowMetalDropdown}
            showInfoBar={showInfoBar}
            setSettingsOpen={setSettingsOpen}
          />

          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            theme={theme}
            setTheme={setTheme}
            showInfoBar={showInfoBar}
            setShowInfoBar={setShowInfoBar}
          />

          <UserSetupModal />
        </DataProvider>
      </FlashProvider>
    </UserProvider>
  );
}

function Inner({
  view,
  setView,
  digitalView,
  setDigitalView,
  metalView,
  setMetalView,
  showDigitalDropdown,
  setShowDigitalDropdown,
  showMetalDropdown,
  setShowMetalDropdown,
  showInfoBar, // unused here but kept for consistency
  setSettingsOpen,
}) {
  const { rows } = useMut();
  const isWhite = document.documentElement.classList.contains("theme-white");
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const metalButtonRef = useRef(null);
  const metalDropdownRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const hasBeenOnDigital = useRef(view === "digital");
  const hasBeenOnMetal = useRef(view === "metal");
  const isDropdownPinned = useRef(false);
  const isMetalDropdownPinned = useRef(false);
  const [isCalculatingStats, setIsCalculatingStats] = useState(false);
  const statsCalculationTimeout = useRef(null);

  // Calculate activeDept based on view
  let activeDept = null;
  if (view === "digital") activeDept = "General";
  else if (view === "cb") activeDept = "C&B";
  else if (view === "metal") activeDept = "Metal";

  useEffect(() => {
    if (view === "digital") hasBeenOnDigital.current = true;
    if (view === "metal") hasBeenOnMetal.current = true;
  }, [view]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (statsCalculationTimeout.current)
        clearTimeout(statsCalculationTimeout.current);
    },
    []
  );

  const handleClickOutside = useCallback(
    (e) => {
      if (!isDropdownPinned.current && showDigitalDropdown) {
        const btn = buttonRef.current;
        const menu = dropdownRef.current;
        if (
          btn &&
          !btn.contains(e.target) &&
          menu &&
          !menu.contains(e.target)
        ) {
          setShowDigitalDropdown(false);
        }
      }
      if (!isMetalDropdownPinned.current && showMetalDropdown) {
        const btn = metalButtonRef.current;
        const menu = metalDropdownRef.current;
        if (
          btn &&
          !btn.contains(e.target) &&
          menu &&
          !menu.contains(e.target)
        ) {
          setShowMetalDropdown(false);
        }
      }
    },
    [
      showDigitalDropdown,
      showMetalDropdown,
      setShowDigitalDropdown,
      setShowMetalDropdown,
    ]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // UPDATED logic: click when on Digital only opens (won't close)
  const handleDigitalClick = () => {
    if (view === "digital") {
      if (!showDigitalDropdown) {
        setShowDigitalDropdown(true);
        isDropdownPinned.current = true;
      }
    } else {
      setView("digital");
      setDigitalView("overview");
      setShowDigitalDropdown(false);
      hasBeenOnDigital.current = true;
      isDropdownPinned.current = false;
    }
  };

  // Metal click handler
  const handleMetalClick = () => {
    if (view === "metal") {
      if (!showMetalDropdown) {
        setShowMetalDropdown(true);
        isMetalDropdownPinned.current = true;
      }
    } else {
      setView("metal");
      setMetalView("overview");
      setShowMetalDropdown(false);
      hasBeenOnMetal.current = true;
      isMetalDropdownPinned.current = false;
    }
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    // Close Metal dropdown when hovering Digital
    if (showMetalDropdown && !isMetalDropdownPinned.current) {
      setShowMetalDropdown(false);
    }
    if (
      !isDropdownPinned.current &&
      (view === "digital" || hasBeenOnDigital.current)
    ) {
      setShowDigitalDropdown(true);
    }
  };

  const handleMouseLeave = () => {
    if (isDropdownPinned.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isDropdownPinned.current) setShowDigitalDropdown(false);
    }, 200);
  };

  const handleMetalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    // Close Digital dropdown when hovering Metal
    if (showDigitalDropdown && !isDropdownPinned.current) {
      setShowDigitalDropdown(false);
    }
    if (
      !isMetalDropdownPinned.current &&
      (view === "metal" || hasBeenOnMetal.current)
    ) {
      setShowMetalDropdown(true);
    }
  };

  const handleMetalMouseLeave = () => {
    if (isMetalDropdownPinned.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isMetalDropdownPinned.current) setShowMetalDropdown(false);
    }, 200);
  };

  const selectDigitalView = useCallback(
    (subView) => {
      setView("digital");
      if (subView !== "overview" && subView !== digitalView) {
        setIsCalculatingStats(true);
      }
      setDigitalView(subView);
      setShowDigitalDropdown(false);
      isDropdownPinned.current = false;

      if (statsCalculationTimeout.current)
        clearTimeout(statsCalculationTimeout.current);
      if (subView !== "overview") {
        statsCalculationTimeout.current = setTimeout(
          () => setIsCalculatingStats(false),
          3000
        );
      } else {
        setIsCalculatingStats(false);
      }
    },
    [digitalView, setView, setDigitalView, setShowDigitalDropdown]
  );

  const selectMetalView = useCallback(
    (subView) => {
      setView("metal");
      if (subView !== "overview" && subView !== metalView) {
        setIsCalculatingStats(true);
      }
      setMetalView(subView);
      setShowMetalDropdown(false);
      isMetalDropdownPinned.current = false;

      if (statsCalculationTimeout.current)
        clearTimeout(statsCalculationTimeout.current);
      if (subView !== "overview") {
        statsCalculationTimeout.current = setTimeout(
          () => setIsCalculatingStats(false),
          3000
        );
      } else {
        setIsCalculatingStats(false);
      }
    },
    [metalView, setView, setMetalView, setShowMetalDropdown]
  );

  const getStageFromModifiers = (mods = []) => {
    if (mods.includes("stage-qc")) return "qc";
    if (mods.includes("stage-finishing")) return "finishing";
    if (mods.includes("stage-production")) return "production";
    if (mods.includes("stage-design")) return "design";
    return "design";
  };

  const stageCounts = React.useMemo(() => {
    const c = { design: 0, production: 0, finishing: 0 };
    rows.forEach((r) => {
      if (r.department === "General" && !r.completed && !r.archived) {
        const stage = getStageFromModifiers(r.modifiers);
        // Don't count QC cases in stage counts
        if (stage !== "qc") {
          c[stage]++;
        }
      }
    });
    return c;
  }, [rows]);

  const metalStageCounts = React.useMemo(() => {
    const c = { development: 0, finishing: 0 };
    rows.forEach((r) => {
      if (r.department === "Metal" && !r.completed && !r.archived) {
        if (!r.stage2) {
          c.development++;
        } else {
          c.finishing++;
        }
      }
    });
    return c;
  }, [rows]);

  const tabs = [
    ["cb", "C&B"],
    ["manage", "Manage Cases"],
  ];

  return (
    <div
      className={clsx(
        "flex flex-col h-[100dvh] w-screen transition-colors",
        isWhite ? "text-gray-900" : "text-white"
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-center gap-4 p-4 bg-[#103E48]/30 shadow backdrop-blur-md rounded-b-xl relative z-40">
        <SettingsPill
          onClick={() => setSettingsOpen(true)}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          isMobile={false}
        />

        {/* Digital button */}
        <div className="relative" style={{ zIndex: 60 }}>
          <button
            ref={buttonRef}
            onClick={handleDigitalClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={clsx(
              "px-4 py-2 rounded-xl font-semibold transition text-center flex items-center gap-1",
              "flex-1 md:flex-none",
              view === "digital"
                ? isWhite
                  ? "bg-white/70 backdrop-blur-md text-gray-900 shadow"
                  : "bg-white text-[#103E48] shadow"
                : "bg-white/10 hover:bg-white/20 backdrop-blur"
            )}
          >
            Digital
            {(view === "digital" || hasBeenOnDigital.current) && (
              <svg
                className={clsx(
                  "w-4 h-4 transition-transform duration-200",
                  showDigitalDropdown ? "rotate-180" : ""
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            )}
          </button>

          <DigitalDropdown
            open={showDigitalDropdown}
            anchorRef={buttonRef}
            digitalView={digitalView}
            stageCounts={stageCounts}
            onSelect={selectDigitalView}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            menuRefExternal={dropdownRef}
          />
        </div>

        {/* Metal button */}
        <div className="relative" style={{ zIndex: 60 }}>
          <button
            ref={metalButtonRef}
            onClick={handleMetalClick}
            onMouseEnter={handleMetalMouseEnter}
            onMouseLeave={handleMetalMouseLeave}
            className={clsx(
              "px-4 py-2 rounded-xl font-semibold transition text-center flex items-center gap-1",
              "flex-1 md:flex-none",
              view === "metal"
                ? isWhite
                  ? "bg-white/70 backdrop-blur-md text-gray-900 shadow"
                  : "bg-white text-[#103E48] shadow"
                : "bg-white/10 hover:bg-white/20 backdrop-blur"
            )}
          >
            Metal
            {(view === "metal" || hasBeenOnMetal.current) && (
              <svg
                className={clsx(
                  "w-4 h-4 transition-transform duration-200",
                  showMetalDropdown ? "rotate-180" : ""
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            )}
          </button>

          <MetalDropdown
            open={showMetalDropdown}
            anchorRef={metalButtonRef}
            metalView={metalView}
            stageCounts={metalStageCounts}
            onSelect={selectMetalView}
            onMouseEnter={handleMetalMouseEnter}
            onMouseLeave={handleMetalMouseLeave}
            menuRefExternal={metalDropdownRef}
          />
        </div>

        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setView(key);
              setShowDigitalDropdown(false);
              setShowMetalDropdown(false);
              isDropdownPinned.current = false;
              isMetalDropdownPinned.current = false;
            }}
            className={clsx(
              "px-4 py-2 rounded-xl font-semibold transition text-center",
              "flex-1 md:flex-none",
              key === "manage" && "whitespace-nowrap",
              view === key
                ? isWhite
                  ? "bg-white/70 backdrop-blur-md text-gray-900 shadow"
                  : "bg-white text-[#103E48] shadow"
                : "bg-white/10 hover:bg-white/20 backdrop-blur"
            )}
          >
            {label}
          </button>
        ))}
      </header>

      {/* Mobile settings fab */}
      <SettingsPill
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-4 left-4 z-40 shadow-lg"
        isMobile={true}
      />

      {/* Main content */}
      {view === "manage" ? (
        <Editor data={rows} deptDefault="Digital" showInfoBar={showInfoBar} />
      ) : (
        <Board
          data={rows}
          stage={
            view === "digital" && digitalView !== "overview"
              ? digitalView
              : view === "metal" && metalView !== "overview"
              ? metalView
              : null
          }
          activeDept={activeDept}
          isCalculatingStats={isCalculatingStats}
          onStatsCalculated={() => setIsCalculatingStats(false)}
        />
      )}
    </div>
  );
}
