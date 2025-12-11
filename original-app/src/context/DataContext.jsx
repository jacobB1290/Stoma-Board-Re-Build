import React, { createContext, useEffect, useState } from "react";

import {
  addCase,
  updateCase,
  togglePriority as svcTogglePriority,
  toggleRush as svcToggleRush,
  toggleHold as svcToggleHold,
  toggleComplete as svcToggleComplete,
  toggleStage2 as svcToggleStage2,
  db,
  logCase,
  toggleCaseExclusion as svcToggleCaseExclusion,
  batchToggleExclusions as svcBatchToggleExclusions,
} from "../services/caseService";

/* ────── flag "update" rows ────── */
function flagUpdatePending(record) {
  const modifiers = record.modifiers || [];
  const priority =
    modifiers.find((m) => ["normal", "high", "force"].includes(m)) || "normal";
  const notes =
    modifiers.find((m) => !["normal", "high", "force"].includes(m)) || "";

  // Force update - reload immediately without any UI
  if (priority === "force") {
    // Small delay to ensure the database operation completes
    setTimeout(() => {
      window.location.reload();
    }, 500);
    return; // Don't do anything else, just reload
  }

  // For normal and high priority, show the notification
  if (!document.documentElement.classList.contains("update-pending")) {
    document.documentElement.classList.add("update-pending");

    if (notes) {
      localStorage.setItem("updateNotes", notes);
    }
    localStorage.setItem("updatePriority", priority);

    if (priority === "high") {
      document.documentElement.classList.add("update-critical");
    } else {
      document.documentElement.classList.remove("update-critical");
    }

    window.dispatchEvent(
      new CustomEvent("update-available", {
        detail: {
          priority,
          notes,
          timestamp: Date.now(),
        },
      })
    );
  }
}

async function purgeUpdateRows() {
  await db.from("cases").delete().ilike("casenumber", "update");
}

export const DataCtx = createContext(null);
export const useMut = () => React.useContext(DataCtx);

/* Map DB record → UI row */
const mapRow = (rec) => {
  const mods = rec.modifiers ?? [];
  return {
    ...structuredClone(rec),
    department: rec.department ?? "General",
    rush: mods.includes("rush"),
    hold: mods.includes("hold"),
    stage2: mods.includes("stage2"),
    priority: rec.priority ?? false,
    caseNumber: rec.casenumber,
    caseType: mods.includes("bbs")
      ? "bbs"
      : mods.includes("flex")
      ? "flex"
      : "general",
  };
};

export function DataProvider({ activeDept, children }) {
  const [rows, setRows] = useState([]);

  /* ── initial fetch (excluding archived) ── */
  useEffect(() => {
    (async () => {
      const { data, error } = await db
        .from("cases")
        .select("*")
        .eq("archived", false)
        .order("due");

      if (error) {
        console.error("Error fetching cases:", error);
      }

      const filtered = [];
      (data ?? []).forEach((r) => {
        if (r.casenumber?.trim().toLowerCase() === "update") {
          flagUpdatePending(r);
        } else {
          filtered.push(mapRow(r));
        }
      });

      if (filtered.length !== (data ?? []).length) purgeUpdateRows();
      setRows(filtered);
    })();
  }, []);

  /* ── realtime channel ── */
  useEffect(() => {
    const ch = db
      .channel("live")
      .on(
        "postgres_changes",
        { schema: "public", table: "cases", event: "*" },
        (ev) =>
          setRows((cur) => {
            if (ev.new?.archived) return cur;

            if (ev.new?.casenumber?.trim().toLowerCase() === "update") {
              flagUpdatePending(ev.new);
              purgeUpdateRows();
              return cur;
            }
            if (ev.eventType === "DELETE") {
              return cur.filter((r) => r.id !== ev.old.id);
            }
            const row = mapRow(ev.new);

            const i = cur.findIndex((r) => r.id === row.id);
            if (i === -1) return [...cur, row];
            const next = [...cur];
            next[i] = row;
            return next;
          })
      )
      .subscribe();
    return () => db.removeChannel(ch);
  }, []);

  /* ── CRUD helpers ── */
  const togglePriority = (r) => svcTogglePriority(r).catch(console.error);
  const toggleRush = (r) => svcToggleRush(r).catch(console.error);
  const toggleHold = (r) => svcToggleHold(r).catch(console.error);
  const toggleComplete = (id, cur) =>
    svcToggleComplete(id, cur).catch(console.error);
  const toggleStage2 = (r) => svcToggleStage2(r).catch(console.error);

  const addOrUpdate = async (payload, editId) => {
    return editId ? updateCase({ id: editId, ...payload }) : addCase(payload);
  };

  /* ── DELETE single case ── */
  const removeCase = async (id) => {
    const { error } = await db.from("cases").delete().eq("id", id);
    if (!error) {
      setRows((cur) => cur.filter((r) => r.id !== id));
    }
  };

  /* ── UPDATE case stage (WITH QC HANDLING) ── */
  const updateCaseStage = async (caseItem, newStage, isRepair = false) => {
    const { id, modifiers = [] } = caseItem;

    // Remove existing stage modifiers
    const filteredMods = modifiers.filter((m) => !m.startsWith("stage-"));

    // Add new stage modifier
    if (newStage) {
      filteredMods.push(`stage-${newStage}`);
    }

    const { error } = await db
      .from("cases")
      .update({ modifiers: filteredMods })
      .eq("id", id);

    if (!error) {
      // Log the action
      if (isRepair) {
        await logCase(
          id,
          "Sent for repair - moved directly to Finishing stage"
        );
      } else if (newStage === "qc") {
        // Special handling for QC transition
        await logCase(id, "Moved from Finishing to Quality Control");
      } else if (modifiers.includes("stage-qc") && newStage === "finishing") {
        // Moving back from QC to finishing
        await logCase(id, "Moved from Quality Control back to Finishing stage");
      } else {
        // Normal stage transition logging
        const stageNames = {
          design: "Design",
          production: "Production",
          finishing: "Finishing",
          qc: "Quality Control",
        };

        const currentStage = modifiers
          .find((m) => m.startsWith("stage-"))
          ?.replace("stage-", "");
        const fromStage = currentStage ? stageNames[currentStage] : "Unknown";
        const toStage = newStage ? stageNames[newStage] : "Unknown";

        await logCase(id, `Moved from ${fromStage} to ${toStage} stage`);
      }

      // Update local state
      setRows((cur) =>
        cur.map((r) => (r.id === id ? { ...r, modifiers: filteredMods } : r))
      );
    }
  };

  /* ── REFRESH cases ── */
  const refreshCases = async () => {
    const { data, error } = await db
      .from("cases")
      .select("*")
      .eq("archived", false)
      .order("due");

    if (error) {
      console.error("Error refreshing cases:", error);
      return;
    }

    const filtered = [];
    (data ?? []).forEach((r) => {
      if (r.casenumber?.trim().toLowerCase() === "update") {
        flagUpdatePending(r);
      } else {
        filtered.push(mapRow(r));
      }
    });

    setRows(filtered);
  };

  const toggleCaseExclusion = async (caseId, stage = null, reason = null) => {
    const result = await svcToggleCaseExclusion(caseId, stage, reason);
    if (!result.error) {
      // Refresh the local data
      await refreshCases();
    }
    return result;
  };

  const batchToggleExclusions = async (
    caseIds,
    exclude = true,
    stage = null,
    reason = null
  ) => {
    const results = await svcBatchToggleExclusions(
      caseIds,
      exclude,
      stage,
      reason
    );
    // Refresh the local data
    await refreshCases();
    return results;
  };

  /* ── apply department filter ── */
  const visible =
    activeDept == null ? rows : rows.filter((r) => r.department === activeDept);

  return (
    <DataCtx.Provider
      value={{
        rows: visible,
        togglePriority,
        toggleRush,
        toggleHold,
        toggleComplete,
        toggleStage2,
        addOrUpdate,
        removeCase,
        refreshCases,
        updateCaseStage,
        toggleCaseExclusion,
        batchToggleExclusions,
      }}
    >
      {children}
    </DataCtx.Provider>
  );
}
