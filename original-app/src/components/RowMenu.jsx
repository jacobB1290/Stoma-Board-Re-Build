import React, {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import clsx from "clsx";
import CaseHistory from "./CaseHistory";
import { useMut } from "../context/DataContext";
import { archiveCases, logCase } from "../services/caseService";

export default function RowMenu({
  row,
  completed,
  onEdit,
  toggleDone,
  toggleHold,
  toggleRush,
  togglePriority,
  toggleStage2,
  onArchive, // New prop for archive callback
}) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const eventListenersRef = useRef([]);

  // Cleanup function for event listeners
  const cleanupEventListeners = useCallback(() => {
    eventListenersRef.current.forEach(({ type, handler }) => {
      window.removeEventListener(type, handler);
    });
    eventListenersRef.current = [];
  }, []);

  // close on scroll / wheel / resize / touch
  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const events = ["scroll", "wheel", "resize", "touchmove"];

    events.forEach((event) => {
      window.addEventListener(event, close, { passive: true });
      eventListenersRef.current.push({ type: event, handler: close });
    });

    return cleanupEventListeners;
  }, [open, cleanupEventListeners]);

  // close when another RowMenu opens
  useEffect(() => {
    const handleOpen = (e) => {
      if (e.detail !== btnRef.current) setOpen(false);
    };

    window.addEventListener("row-menu-open", handleOpen);

    return () => {
      window.removeEventListener("row-menu-open", handleOpen);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupEventListeners();
    };
  }, [cleanupEventListeners]);

  const toggleMenu = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      window.dispatchEvent(
        new CustomEvent("row-menu-open", { detail: btnRef.current })
      );
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleMenu}
        className="rounded-full bg-gray-200 p-1 hover:bg-gray-300"
      >
        <span className="text-gray-700">⋮</span>
      </button>

      {showHistory && (
        <CaseHistory
          id={row.id}
          caseNumber={row.caseNumber}
          onClose={() => setShowHistory(false)}
        />
      )}

      {createPortal(
        <AnimatePresence>
          {open && btnRef.current && (
            <Dropdown
              anchor={btnRef.current}
              row={row}
              completed={completed}
              onEdit={onEdit}
              toggleDone={toggleDone}
              toggleHold={toggleHold}
              toggleRush={toggleRush}
              togglePriority={togglePriority}
              toggleStage2={toggleStage2}
              close={() => setOpen(false)}
              showHistory={() => setShowHistory(true)}
              onArchive={onArchive}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// Confirmation Dialog Component
function ConfirmationDialog({ isOpen, onConfirm, onCancel, caseNumber }) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[10000]"
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10001] w-full max-w-md"
          >
            <div className="bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 p-6">
              <div className="flex items-start space-x-3">
                {/* Warning Icon */}
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-red-600"
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
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Confirm Deletion
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    This action will permanently remove case{" "}
                    <span className="font-medium text-gray-900">
                      {caseNumber}
                    </span>{" "}
                    from the system. This cannot be undone.
                  </p>

                  {/* Actions */}
                  <div className="mt-6 flex space-x-3 justify-end">
                    <button
                      onClick={onCancel}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onConfirm}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    >
                      Delete Case
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function Dropdown({
  anchor,
  row,
  completed,
  onEdit,
  toggleDone,
  toggleHold,
  toggleRush,
  togglePriority,
  toggleStage2,
  close,
  showHistory,
  onArchive,
}) {
  const menuRef = useRef(null);
  const [style, setStyle] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { removeCase } = useMut();

  // Handle delete with confirmation
  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    removeCase(row.id);
    setShowDeleteConfirm(false);
    close();
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // Handle archive action
  const handleArchive = async () => {
    try {
      const { error } = await archiveCases([row.id]);
      if (error) throw error;

      // Call parent callback to refresh data
      if (onArchive) {
        onArchive(row.id);
      }

      close();
    } catch (err) {
      console.error("Failed to archive case:", err);
      alert("Failed to archive case");
    }
  };

  // measure on mount to place below/above
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const menu = menuRef.current;
    if (!menu) return;

    const h = menu.offsetHeight;
    const margin = 8;
    const fitsBelow = window.innerHeight - r.bottom >= h + margin;
    const top = fitsBelow
      ? r.bottom + margin
      : Math.max(margin, r.top - h - margin);

    setStyle({
      position: "fixed",
      right: window.innerWidth - r.right,
      top,
      zIndex: 9999,
    });

    const onClick = (e) => {
      if (!menu.contains(e.target) && !anchor.contains(e.target)) {
        close();
      }
    };

    // Use capture phase to ensure we catch all clicks
    window.addEventListener("mousedown", onClick, true);

    return () => window.removeEventListener("mousedown", onClick, true);
  }, [anchor, close]);

  return (
    <>
      <motion.ul
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        style={style}
        className="w-44 rounded-lg bg-white shadow-lg ring-1 ring-gray-200 text-sm origin-top-right py-1 space-y-1"
      >
        {/* Done / Undo */}
        <li>
          <button
            onClick={() => {
              toggleDone(row.id, row.completed);
              close();
            }}
            className={clsx(
              "block w-full text-left px-4 py-2",
              completed
                ? "hover:bg-green-100 text-green-700"
                : "hover:bg-blue-100 text-blue-700"
            )}
          >
            {completed ? "Undo" : "Done"}
          </button>
        </li>

        {/* Info */}
        <li>
          <button
            onClick={() => {
              close();
              showHistory();
            }}
            className="block w-full text-left px-4 py-2 hover:bg-gray-200 text-gray-700"
          >
            Info
          </button>
        </li>

        {!completed && (
          <>
            {/* Edit */}
            <li>
              <button
                onClick={() => {
                  onEdit(row);
                  close();
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-200 text-gray-700"
              >
                Edit
              </button>
            </li>

            {/* Priority */}
            <li>
              <button
                onClick={() => {
                  togglePriority(row);
                  close();
                }}
                className="block w-full text-left px-4 py-2 hover:bg-red-100 text-red-600"
              >
                {row.priority ? "Remove Priority" : "Set Priority"}
              </button>
            </li>

            {/* Rush */}
            <li>
              <button
                onClick={() => {
                  toggleRush(row);
                  close();
                }}
                className="block w-full text-left px-4 py-2 hover:bg-orange-100 text-orange-600"
              >
                {row.rush ? "Remove Rush" : "Set Rush"}
              </button>
            </li>

            {/* Hold */}
            <li>
              <button
                onClick={() => {
                  toggleHold(row);
                  close();
                }}
                className="block w-full text-left px-4 py-2 hover:bg-amber-100 text-amber-600"
              >
                {row.hold ? "Remove Hold" : "Set Hold"}
              </button>
            </li>

            {/* Stage-2 (Metal only) */}
            {row.department === "Metal" && (
              <li>
                <button
                  onClick={() => {
                    toggleStage2(row);
                    close();
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-purple-100 text-purple-700"
                >
                  {row.stage2 ? "Move to Stage 1" : "Move to Stage 2"}
                </button>
              </li>
            )}
          </>
        )}

        {/* Archive (only for completed cases) */}
        {completed && (
          <li>
            <button
              onClick={handleArchive}
              className="block w-full text-left px-4 py-2 hover:bg-blue-100 text-blue-700"
            >
              Archive
            </button>
          </li>
        )}

        {/* Delete */}
        <li>
          <button
            onClick={handleDelete}
            className="block w-full text-left px-4 py-2 hover:bg-red-100 text-red-700"
          >
            Delete
          </button>
        </li>
      </motion.ul>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        caseNumber={row.caseNumber}
      />
    </>
  );
}
