'use client';

/**
 * Header Component - EXACT REPLICA of original App.jsx header
 * Main navigation header with user info and department tabs with dropdowns
 */

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useUser } from '@/contexts/UserContext';
import { useUI } from '@/contexts/UIContext';
import { useData } from '@/contexts/DataContext';
import { useDispatch } from '@/contexts/DispatchContext';

// ═══════════════════════════════════════════════════════════
// SETTINGS PILL (from original)
// ═══════════════════════════════════════════════════════════

function SettingsPill({ onClick, className, isMobile = false }: {
  onClick: () => void;
  className?: string;
  isMobile?: boolean;
}) {
  const { name } = useUser();
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    setIsMobileView(window.innerWidth < 768);
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
        <span className="text-xs font-medium max-w-[100px] truncate text-white/90">
          {name}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// DROPDOWN COMPONENTS (from original)
// ═══════════════════════════════════════════════════════════

function MenuItem({ active, label, meta, onClick }: {
  active: boolean;
  label: string;
  meta: string | number;
  onClick: () => void;
}) {
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

function DigitalDropdown({
  open,
  anchorRef,
  digitalView,
  stageCounts,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  menuRefExternal,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  digitalView: string;
  stageCounts: { design: number; production: number; finishing: number };
  onSelect: (view: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  menuRefExternal?: React.RefObject<HTMLDivElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={(el) => {
        (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (menuRefExternal) (menuRefExternal as React.MutableRefObject<HTMLDivElement | null>).current = el;
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

function MetalDropdown({
  open,
  anchorRef,
  metalView,
  stageCounts,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  menuRefExternal,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  metalView: string;
  stageCounts: { development: number; finishing: number };
  onSelect: (view: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  menuRefExternal?: React.RefObject<HTMLDivElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={(el) => {
        (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (menuRefExternal) (menuRefExternal as React.MutableRefObject<HTMLDivElement | null>).current = el;
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

// ═══════════════════════════════════════════════════════════
// MAIN HEADER COMPONENT
// ═══════════════════════════════════════════════════════════

export function Header() {
  const { name } = useUser();
  const { activeDepartment, currentView } = useUI();
  const { allRows } = useData();
  const { dispatch } = useDispatch();
  
  const [digitalView, setDigitalView] = useState('overview');
  const [metalView, setMetalView] = useState('overview');
  const [showDigitalDropdown, setShowDigitalDropdown] = useState(false);
  const [showMetalDropdown, setShowMetalDropdown] = useState(false);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const metalButtonRef = useRef<HTMLButtonElement>(null);
  const metalDropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBeenOnDigital = useRef(activeDepartment === 'Digital');
  const hasBeenOnMetal = useRef(activeDepartment === 'Metal');
  const isDropdownPinned = useRef(false);
  const isMetalDropdownPinned = useRef(false);

  // Calculate stage counts
  const stageCounts = React.useMemo(() => {
    const c = { design: 0, production: 0, finishing: 0 };
    allRows.forEach((r) => {
      if (r.department === "General" && !r.completed) {
        const stage = r.stage || 'design';
        if (stage !== "qc" && c[stage as keyof typeof c] !== undefined) {
          c[stage as keyof typeof c]++;
        }
      }
    });
    return c;
  }, [allRows]);

  const metalStageCounts = React.useMemo(() => {
    const c = { development: 0, finishing: 0 };
    allRows.forEach((r) => {
      if (r.department === "Metal" && !r.completed) {
        if (!r.stage2) {
          c.development++;
        } else {
          c.finishing++;
        }
      }
    });
    return c;
  }, [allRows]);

  // Track visited departments
  useEffect(() => {
    if (activeDepartment === 'Digital') hasBeenOnDigital.current = true;
    if (activeDepartment === 'Metal') hasBeenOnMetal.current = true;
  }, [activeDepartment]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Click outside handler
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (!isDropdownPinned.current && showDigitalDropdown) {
      const btn = buttonRef.current;
      const menu = dropdownRef.current;
      if (btn && !btn.contains(e.target as Node) && menu && !menu.contains(e.target as Node)) {
        setShowDigitalDropdown(false);
      }
    }
    if (!isMetalDropdownPinned.current && showMetalDropdown) {
      const btn = metalButtonRef.current;
      const menu = metalDropdownRef.current;
      if (btn && !btn.contains(e.target as Node) && menu && !menu.contains(e.target as Node)) {
        setShowMetalDropdown(false);
      }
    }
  }, [showDigitalDropdown, showMetalDropdown]);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // Digital button handlers
  const handleDigitalClick = () => {
    if (activeDepartment === 'Digital') {
      if (!showDigitalDropdown) {
        setShowDigitalDropdown(true);
        isDropdownPinned.current = true;
      }
    } else {
      dispatch('ui.set_department', { department: 'Digital' });
      setDigitalView("overview");
      setShowDigitalDropdown(false);
      hasBeenOnDigital.current = true;
      isDropdownPinned.current = false;
    }
  };

  const handleDigitalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (showMetalDropdown && !isMetalDropdownPinned.current) {
      setShowMetalDropdown(false);
    }
    if (!isDropdownPinned.current && (activeDepartment === 'Digital' || hasBeenOnDigital.current)) {
      setShowDigitalDropdown(true);
    }
  };

  const handleDigitalMouseLeave = () => {
    if (isDropdownPinned.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isDropdownPinned.current) setShowDigitalDropdown(false);
    }, 200);
  };

  // Metal button handlers
  const handleMetalClick = () => {
    if (activeDepartment === 'Metal') {
      if (!showMetalDropdown) {
        setShowMetalDropdown(true);
        isMetalDropdownPinned.current = true;
      }
    } else {
      dispatch('ui.set_department', { department: 'Metal' });
      setMetalView("overview");
      setShowMetalDropdown(false);
      hasBeenOnMetal.current = true;
      isMetalDropdownPinned.current = false;
    }
  };

  const handleMetalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (showDigitalDropdown && !isDropdownPinned.current) {
      setShowDigitalDropdown(false);
    }
    if (!isMetalDropdownPinned.current && (activeDepartment === 'Metal' || hasBeenOnMetal.current)) {
      setShowMetalDropdown(true);
    }
  };

  const handleMetalMouseLeave = () => {
    if (isMetalDropdownPinned.current) return;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isMetalDropdownPinned.current) setShowMetalDropdown(false);
    }, 200);
  };

  // Select handlers
  const selectDigitalView = useCallback((subView: string) => {
    dispatch('ui.set_department', { department: 'Digital' });
    setDigitalView(subView);
    setShowDigitalDropdown(false);
    isDropdownPinned.current = false;
  }, [dispatch]);

  const selectMetalView = useCallback((subView: string) => {
    dispatch('ui.set_department', { department: 'Metal' });
    setMetalView(subView);
    setShowMetalDropdown(false);
    isMetalDropdownPinned.current = false;
  }, [dispatch]);

  const handleOpenSettings = () => {
    dispatch('ui.open_settings', { tab: 'user' });
  };

  const handleCBClick = () => {
    dispatch('ui.set_department', { department: 'C&B' });
    setShowDigitalDropdown(false);
    setShowMetalDropdown(false);
    isDropdownPinned.current = false;
    isMetalDropdownPinned.current = false;
  };

  const handleManageClick = () => {
    dispatch('ui.navigate', { view: 'manage' });
    setShowDigitalDropdown(false);
    setShowMetalDropdown(false);
    isDropdownPinned.current = false;
    isMetalDropdownPinned.current = false;
  };

  return (
    <>
      <header className="flex items-center justify-center gap-4 p-4 bg-[#103E48]/30 shadow backdrop-blur-md rounded-b-xl relative z-40">
        {/* Settings pill - desktop */}
        <SettingsPill
          onClick={handleOpenSettings}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          isMobile={false}
        />

        {/* Digital button */}
        <div className="relative" style={{ zIndex: 60 }}>
          <button
            ref={buttonRef}
            onClick={handleDigitalClick}
            onMouseEnter={handleDigitalMouseEnter}
            onMouseLeave={handleDigitalMouseLeave}
            className={clsx(
              "px-4 py-2 rounded-xl font-semibold transition text-center flex items-center gap-1",
              "flex-1 md:flex-none",
              activeDepartment === 'Digital' && currentView === 'board'
                ? "bg-white text-[#103E48] shadow"
                : "bg-white/10 hover:bg-white/20 backdrop-blur text-white"
            )}
          >
            Digital
            {(activeDepartment === 'Digital' || hasBeenOnDigital.current) && (
              <svg
                className={clsx(
                  "w-4 h-4 transition-transform duration-200",
                  showDigitalDropdown ? "rotate-180" : ""
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          <DigitalDropdown
            open={showDigitalDropdown}
            anchorRef={buttonRef}
            digitalView={digitalView}
            stageCounts={stageCounts}
            onSelect={selectDigitalView}
            onMouseEnter={handleDigitalMouseEnter}
            onMouseLeave={handleDigitalMouseLeave}
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
              activeDepartment === 'Metal' && currentView === 'board'
                ? "bg-white text-[#103E48] shadow"
                : "bg-white/10 hover:bg-white/20 backdrop-blur text-white"
            )}
          >
            Metal
            {(activeDepartment === 'Metal' || hasBeenOnMetal.current) && (
              <svg
                className={clsx(
                  "w-4 h-4 transition-transform duration-200",
                  showMetalDropdown ? "rotate-180" : ""
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

        {/* C&B button */}
        <button
          onClick={handleCBClick}
          className={clsx(
            "px-4 py-2 rounded-xl font-semibold transition text-center",
            "flex-1 md:flex-none",
            activeDepartment === 'C&B' && currentView === 'board'
              ? "bg-white text-[#103E48] shadow"
              : "bg-white/10 hover:bg-white/20 backdrop-blur text-white"
          )}
        >
          C&B
        </button>

        {/* Manage Cases button */}
        <button
          onClick={handleManageClick}
          className={clsx(
            "px-4 py-2 rounded-xl font-semibold transition text-center whitespace-nowrap",
            "flex-1 md:flex-none",
            currentView === 'manage'
              ? "bg-white text-[#103E48] shadow"
              : "bg-white/10 hover:bg-white/20 backdrop-blur text-white"
          )}
        >
          Manage Cases
        </button>
      </header>

      {/* Mobile settings fab */}
      <SettingsPill
        onClick={handleOpenSettings}
        className="fixed bottom-4 left-4 z-40 shadow-lg"
        isMobile={true}
      />
    </>
  );
}
