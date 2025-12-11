import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../context/UserContext";

const SHEET = {
  hidden: { opacity: 0, y: 48, scale: 0.92 },
  shown: { opacity: 1, y: 0, scale: 1 },
};

const SHEET_T = {
  type: "spring",
  stiffness: 240,
  damping: 34,
};

export default function UserSetupModal() {
  const { needsName, saveName } = useUser();
  const [open, setOpen] = useState(needsName);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setOpen(needsName);
  }, [needsName]);

  // Allow Settings panel to open this
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-registration", handleOpen);
    return () => window.removeEventListener("open-registration", handleOpen);
  }, []);

  const handleSave = () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    saveName(name.trim());
    setOpen(false);
    setName("");
    setError("");
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center
                   bg-black/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          variants={SHEET}
          initial="hidden"
          animate="shown"
          exit="hidden"
          transition={SHEET_T}
          className="w-full max-w-xs p-5 bg-white rounded-2xl shadow-xl
                     space-y-4 select-none"
        >
          <h2 className="text-center text-lg font-semibold">
            What's your name?
          </h2>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full rounded border p-2 outline-none"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />

          <button
            onClick={handleSave}
            className="w-full rounded-lg py-2 bg-[#16525F] hover:bg-[#1F6F7C]
                       text-white shadow"
          >
            Save
          </button>

          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
