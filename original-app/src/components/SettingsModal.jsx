import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { SPRING } from "../animationEngine";
import { useUser } from "../context/UserContext";
import { useLiteMode } from "../LiteModePerformancePatch";

/* ─── fluid animation presets ─── */
const SHEET = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  shown: { opacity: 1, y: 0, scale: 1 },
};
const SHEET_T = {
  type: "spring",
  stiffness: 350,
  damping: 30,
  mass: 0.6,
};

// Smoother layout transition for container
const LAYOUT_TRANSITION = {
  type: "spring",
  stiffness: 200,
  damping: 30,
  mass: 0.8,
};

const cardVariants = {
  closed: {
    height: 0,
    transition: {
      height: {
        type: "spring",
        stiffness: 400,
        damping: 35,
        mass: 0.4,
      },
    },
  },
  open: {
    height: "auto",
    transition: {
      height: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.5,
      },
    },
  },
};

/* ─── icons ─── */
const IconUser = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const IconEye = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current fill-none">
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconRefresh = ({ spin }) => (
  <motion.svg
    viewBox="0 0 24 24"
    className="h-5 w-5 stroke-current fill-none"
    animate={spin ? { rotate: 360 } : { rotate: 0 }}
    transition={spin ? { repeat: Infinity, duration: 0.6, ease: "linear" } : {}}
  >
    <path d="M4 4v6h6" strokeWidth="2" strokeLinecap="round" />
    <path d="M20 20v-6h-6" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 17a8 8 0 0 0 13 2M19 7A8 8 0 0 0 6 5" strokeWidth="2" />
  </motion.svg>
);
const IconBolt = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8Z" />
  </svg>
);

/* ─── helpers ─── */
// Fixed button component - no opacity in base styles
const Btn = ({ children, className = "", ...p }) => (
  <motion.button
    {...p}
    whileTap={{ scale: 0.98 }}
    whileHover={{ scale: 1.02 }}
    transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
    className={`w-full rounded-lg py-2 bg-white/40 backdrop-blur-lg
      border border-white/40 hover:bg-white/50 shadow disabled:opacity-40 
      transition-colors duration-150 ${className}`}
    style={{ willChange: "transform" }}
  >
    {children}
  </motion.button>
);

const Card = React.memo(({ open, toggle, icon, title, children }) => {
  return (
    <motion.div
      layout="position"
      layoutId={`card-${title}`}
      className="rounded-lg glass shadow-xl overflow-hidden"
      style={{
        boxShadow:
          "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      }}
      transition={LAYOUT_TRANSITION}
      initial={false}
    >
      <motion.button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 h-14 select-none relative z-10"
        whileTap={{ scale: 0.995 }}
        layout="position"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span>{title}</span>
        </div>
        <motion.svg
          viewBox="0 0 24 24"
          className="h-4 w-4 stroke-current fill-none"
          animate={{ rotate: open ? 90 : 0 }}
          transition={{
            type: "tween",
            duration: 0.2,
            ease: "easeOut",
          }}
        >
          <path d="M9 6l6 6-6 6" strokeWidth="2" />
        </motion.svg>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            variants={cardVariants}
            initial="closed"
            animate="open"
            exit="closed"
            style={{ overflow: "hidden" }}
          >
            <div className="p-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/* ─── modal ─── */
export default function SettingsModal({
  open,
  onClose,
  theme,
  setTheme,
  showInfoBar,
  setShowInfoBar,
}) {
  const { lite: liteUi, toggle: toggleLiteUi } = useLiteMode();
  const { name } = useUser();

  // Check if debug mode is enabled
  const isDebugMode = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("debug") === "true";
  }, []);

  /* --- update flags ---------------------------------------------------- */
  const initUpdate =
    document.documentElement.classList.contains("update-pending");
  const initPriority = localStorage.getItem("updatePriority") || "normal";
  const [updatePending, setUpdatePending] = useState(initUpdate);
  const [updateNotes, setUpdateNotes] = useState(
    localStorage.getItem("updateNotes") ?? ""
  );
  const [updatePriority, setUpdatePriority] = useState(initPriority);
  const [autoUpdate, setAutoUpdate] = useState(
    JSON.parse(localStorage.getItem("autoUpdate") ?? "false")
  );
  const [showNotes, setShowNotes] = useState(initUpdate && updateNotes);

  /* --- which card is open --------------------------------------------- */
  const [card, setCard] = useState(initUpdate ? "sys" : "");

  /* react to new update-available events */
  useEffect(() => {
    const fn = (e) => {
      const priority = e.detail?.priority ?? "normal";
      const notes = e.detail?.notes ?? "";

      localStorage.setItem("updateNotes", notes);
      localStorage.setItem("updatePriority", priority);
      setUpdateNotes(notes);
      setUpdatePriority(priority);

      // Handle different priority levels
      if (
        priority === "force" ||
        localStorage.getItem("forceUpdate") === "true"
      ) {
        localStorage.removeItem("forceUpdate");
        window.location.reload();
        return;
      }

      if (JSON.parse(localStorage.getItem("autoUpdate") ?? "false")) {
        document.documentElement.classList.remove(
          "update-pending",
          "update-critical"
        );
        window.location.reload();
      } else {
        setUpdatePending(true);
        setCard("sys");
        setShowNotes(!!notes);

        // Add appropriate class based on priority
        if (priority === "high") {
          document.documentElement.classList.add("update-critical");
        } else {
          document.documentElement.classList.remove("update-critical");
        }
        document.documentElement.classList.add("update-pending");
      }
    };
    window.addEventListener("update-available", fn);
    return () => window.removeEventListener("update-available", fn);
  }, []);

  const [spin, setSpin] = useState(false);

  // Stage dividers setting
  const [showStageDividers, setShowStageDividers] = useState(
    JSON.parse(localStorage.getItem("showStageDividers") || "false")
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* persist auto-update toggle */
  useEffect(() => {
    localStorage.setItem("autoUpdate", JSON.stringify(autoUpdate));
  }, [autoUpdate]);

  /* helper to clear flags after manual update */
  const clearUpdateFlags = useCallback(() => {
    document.documentElement.classList.remove(
      "update-pending",
      "update-critical"
    );
    localStorage.removeItem("updateNotes");
    localStorage.removeItem("updatePriority");
    setUpdatePending(false);
    setUpdateNotes("");
    setUpdatePriority("normal");
    setShowNotes(false);
  }, []);

  const toggleCard = useCallback((cardName) => {
    setCard((prev) => (prev === cardName ? "" : cardName));
  }, []);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={onClose}
      >
        <LayoutGroup>
          <motion.div
            variants={SHEET}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={SHEET_T}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 p-1 glass-nb rounded-2xl"
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              willChange: "transform, opacity",
              zIndex: 201,
            }}
            layout="position"
            layoutTransition={LAYOUT_TRANSITION}
          >
            {/* USER - Simplified version */}
            <Card
              open={card === "user"}
              toggle={() => toggleCard("user")}
              icon={<IconUser />}
              title="User"
            >
              <div className="space-y-3">
                <div
                  className="text-center py-2 px-3 bg-white/50 backdrop-blur-lg
                                border border-white/50 rounded-lg"
                >
                  <span className="font-medium">{name || "No user set"}</span>
                </div>

                <Btn
                  onClick={() => {
                    window.dispatchEvent(new Event("open-registration"));
                    onClose?.();
                  }}
                >
                  Change Name
                </Btn>
              </div>
            </Card>

            {/* DISPLAY */}
            <Card
              open={card === "display"}
              toggle={() => toggleCard("display")}
              icon={<IconEye />}
              title="Display"
            >
              <Btn
                onClick={() => {
                  const next = theme === "blue" ? "white" : "blue";
                  setTheme(next);
                  localStorage.setItem("boardTheme", next);
                }}
              >
                Switch to {theme === "blue" ? "White" : "Blue"} theme
              </Btn>
              <Btn
                onClick={() => {
                  const next = !showInfoBar;
                  setShowInfoBar(next);
                  localStorage.setItem("showInfoBar", JSON.stringify(next));
                  window.dispatchEvent(new Event("infobar-toggle"));
                }}
              >
                {showInfoBar ? "Hide" : "Show"} Info card
              </Btn>
              <Btn
                onClick={() => {
                  const next = !showStageDividers;
                  setShowStageDividers(next);
                  localStorage.setItem(
                    "showStageDividers",
                    JSON.stringify(next)
                  );
                  window.dispatchEvent(new Event("settings-changed"));
                }}
              >
                {showStageDividers ? "Hide" : "Show"} Stage Dividers
              </Btn>
              <p className="text-xs opacity-70 mt-1">
                Shows visual separators between different stages in the overview
                mode.
              </p>
            </Card>

            {/* PERFORMANCE - Only show in debug mode */}
            {isDebugMode && (
              <Card
                open={card === "performance"}
                toggle={() => toggleCard("performance")}
                icon={<IconBolt />}
                title="Performance"
              >
                <Btn onClick={toggleLiteUi}>
                  {liteUi ? "Disable" : "Enable"} Lite UI
                </Btn>
                <p className="text-xs opacity-70 mt-1">
                  Turns off animations, blurs and heavy shadows for smooth
                  operation on low-power devices.
                </p>
              </Card>
            )}

            {/* SYSTEM */}
            <Card
              open={card === "sys"}
              toggle={() => toggleCard("sys")}
              icon={<IconRefresh spin={spin} />}
              title="System"
            >
              {updatePending && !autoUpdate && (
                /* Update button with connected release notes */
                <div className="relative overflow-visible">
                  <motion.div
                    className={`relative rounded-lg overflow-hidden ${
                      showNotes && updateNotes ? "shadow-lg" : "shadow"
                    }`}
                    animate={{
                      boxShadow:
                        showNotes && updateNotes
                          ? "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 5px 10px -5px rgba(0, 0, 0, 0.04)"
                          : "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                    }}
                    transition={{ duration: 0.2 }}
                    layout="position"
                  >
                    <motion.button
                      onClick={() => {
                        if (updateNotes) {
                          setShowNotes(!showNotes);
                        } else {
                          clearUpdateFlags();
                          window.location.reload();
                        }
                      }}
                      className={`w-full py-2 px-3 bg-white/50 backdrop-blur-lg
                        border border-white/50 hover:bg-white/60 transition-all duration-150
                        flex items-center justify-between relative z-10
                        ${
                          showNotes && updateNotes
                            ? "rounded-t-lg border-b-0"
                            : "rounded-lg"
                        }
                        ${
                          updatePriority === "high"
                            ? "ring-2 ring-red-400/50"
                            : ""
                        }`}
                      whileTap={{ scale: 0.98 }}
                      whileHover={{ scale: 1.02 }}
                      transition={{
                        type: "tween",
                        duration: 0.1,
                        ease: "easeOut",
                      }}
                      layout="position"
                    >
                      {/* Pulsing indicator on the left */}
                      <div className="relative flex h-2 w-2">
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full ${
                            updatePriority === "high"
                              ? "bg-red-400"
                              : "bg-blue-400"
                          } animate-ping`}
                          style={{
                            animationDuration: "2s",
                            animationTimingFunction:
                              "cubic-bezier(0, 0, 0.2, 1)",
                          }}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            updatePriority === "high"
                              ? "bg-red-500"
                              : "bg-blue-500"
                          }`}
                        />
                      </div>

                      {/* Centered text */}
                      <span className="flex-1 text-center">
                        {updatePriority === "high"
                          ? "High-Priority Update"
                          : "Update Available"}
                      </span>

                      {/* Icon on the right */}
                      {updateNotes ? (
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${
                            showNotes ? "rotate-180" : ""
                          }`}
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
                      ) : (
                        <span className="flex items-center gap-1 text-sm opacity-60">
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 stroke-current fill-none"
                          >
                            <path
                              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                              strokeWidth="2"
                            />
                            <path d="M7 10l5 5 5-5" strokeWidth="2" />
                            <path d="M12 15V3" strokeWidth="2" />
                          </svg>
                        </span>
                      )}
                    </motion.button>

                    {/* Connected release notes */}
                    <AnimatePresence>
                      {showNotes && updateNotes && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-white/30 backdrop-blur-xl 
                            border border-t-0 border-white/30 rounded-b-lg"
                        >
                          <div className="px-4 py-3 space-y-3">
                            <div className="text-sm text-gray-600 leading-relaxed">
                              {updateNotes
                                .split("\n")
                                .map((line, index) => {
                                  const hasBullet = line.trim().startsWith("•");
                                  const content = hasBullet
                                    ? line.trim().substring(1).trim()
                                    : line.trim();

                                  if (!content) return null;

                                  return (
                                    <div
                                      key={index}
                                      className={`${hasBullet ? "flex" : ""} ${
                                        index > 0 ? "mt-1" : ""
                                      }`}
                                    >
                                      {hasBullet && (
                                        <span className="text-gray-600 mr-2 flex-shrink-0">
                                          •
                                        </span>
                                      )}
                                      <span
                                        className={hasBullet ? "flex-1" : ""}
                                      >
                                        {content}
                                      </span>
                                    </div>
                                  );
                                })
                                .filter(Boolean)}
                            </div>
                            <motion.button
                              onClick={() => {
                                clearUpdateFlags();
                                window.location.reload();
                              }}
                              whileTap={{ scale: 0.98 }}
                              whileHover={{ scale: 1.02 }}
                              transition={{
                                type: "tween",
                                duration: 0.1,
                                ease: "easeOut",
                              }}
                              className="w-full rounded-lg py-2 bg-white/40 backdrop-blur-lg
                                border border-white/40 hover:bg-white/50 shadow
                                transition-colors duration-150 flex items-center justify-center gap-2"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4 stroke-current fill-none"
                              >
                                <path
                                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                  strokeWidth="2"
                                />
                                <path d="M7 10l5 5 5-5" strokeWidth="2" />
                                <path d="M12 15V3" strokeWidth="2" />
                              </svg>
                              <span>Update Now</span>
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}

              <Btn
                onClick={() => {
                  setSpin(true);
                  setTimeout(() => window.location.reload(), 100);
                }}
              >
                Refresh Page
              </Btn>

              <Btn
                onClick={() => setAutoUpdate((v) => !v)}
                className={autoUpdate ? "ring-2 ring-green-500" : ""}
              >
                {autoUpdate ? "Auto-update ON" : "Auto-update OFF"}
              </Btn>
            </Card>
          </motion.div>
        </LayoutGroup>
      </motion.div>
    </AnimatePresence>
  );
}
