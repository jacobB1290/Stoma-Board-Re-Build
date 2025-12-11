// src/utils/efficiencyCalculations.js

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { formatDuration } from "./stageTimeCalculations";
import { generateCaseRiskPredictions } from "./caseRiskPredictions";

// ==================== CONFIGURATION ====================
const CONFIG = {
  WINDOW_SIZE: 100,
  TARGET_PERCENTILE: 75,
  SMOOTHING_ALPHA: 0.2,
  ACTIVE_WEIGHT: 0.15,
  HYSTERESIS_THRESHOLD: 5,
  LOAD_FACTOR_TABLE: [
    { minActive: 0, maxActive: 0, factor: 0.9 },
    { minActive: 1, maxActive: 5, factor: 1.0 },
    { minActive: 6, maxActive: 10, factor: 1.05 },
    { minActive: 11, maxActive: 15, factor: 1.15 },
    { minActive: 16, maxActive: 20, factor: 1.3 },
    { minActive: 21, maxActive: 30, factor: 1.5 },
    { minActive: 31, maxActive: null, factor: 2.0 },
  ],
  BUFFER_PENALTY_WEIGHTS: {
    design: 0.4,
    production: 0.3,
  },
  BUFFER_REQUIREMENTS: {
    design: 2,
    production: 1,
    finishing: 0,
  },
};

// ==================== UTILITY FUNCTIONS ====================
const isCaseExcluded = (caseData, stage = null) => {
  const modifiers = caseData.modifiers || [];
  if (
    modifiers.includes("stats-exclude") ||
    modifiers.includes("stats-exclude:all")
  ) {
    return true;
  }
  if (stage && modifiers.includes(`stats-exclude:${stage}`)) {
    return true;
  }
  return false;
};

const calculateMean = (arr) => {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
};

const calculateStdDev = (arr, mean) => {
  if (arr.length < 2) return 0;
  const variance =
    arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    (arr.length - 1);
  return Math.sqrt(variance);
};

const calculatePercentile = (arr, percentile) => {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((percentile / 100) * (sorted.length - 1));
  return sorted[idx];
};

const endOfDueDay = (caseRow) => {
  const base = new Date(caseRow.due);
  base.setUTCHours(23, 59, 59, 999);
  return base;
};

const getStageAtTime = (caseData, targetTime) => {
  const history = caseData.case_history || [];
  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  let currentStage = "design";
  const targetDate = new Date(targetTime);
  const STAGE_SYSTEM_START = new Date("2025-07-14T00:00:00Z");
  const caseCreated = new Date(caseData.created_at);

  if (caseCreated < STAGE_SYSTEM_START || caseData.department !== "General") {
    return null;
  }

  for (const entry of sortedHistory) {
    const entryDate = new Date(entry.created_at);
    if (entryDate > targetDate) break;

    const action = entry.action.toLowerCase();

    if (
      action.includes("moved from design to production") ||
      (action.includes("to production stage") && currentStage === "design")
    ) {
      currentStage = "production";
    } else if (
      action.includes("moved from production to finishing") ||
      (action.includes("to finishing stage") && currentStage === "production")
    ) {
      currentStage = "finishing";
    } else if (
      action.includes("moved from production to design") ||
      (action.includes("to design stage") && currentStage === "production")
    ) {
      currentStage = "design";
    } else if (action.includes("moved from finishing to production")) {
      currentStage = "production";
    } else if (action === "marked done") {
      break;
    }
  }

  return currentStage;
};

// ==================== VELOCITY ENGINE ====================
const calculateConcurrencyScale = (currentActive, avgHistoricalActive) => {
  if (avgHistoricalActive === 0) return 1;
  if (currentActive === 0) return 0.9;
  const ratio = currentActive / avgHistoricalActive;
  return 0.5 + 0.5 * Math.tanh((ratio - 1) * 0.5) + 0.5;
};

const calculateTimeWeightedLoad = (activeCases, referenceTime = null) => {
  if (!activeCases || activeCases.length === 0) return 0;

  const now = referenceTime || Date.now();
  const weights = activeCases.map((c) => {
    const enteredStage = c.stageEnteredAt || c.created_at;
    const ageMs = now - new Date(enteredStage);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return Math.min(2, 1 + ageDays / 7);
  });

  return weights.reduce((sum, w) => sum + w, 0) / activeCases.length;
};

const calculateActiveLoadImpact = (
  currentActive,
  activeCases,
  stage,
  referenceTime = null
) => {
  if (currentActive === 0) return 100;

  const timeWeight = calculateTimeWeightedLoad(activeCases, referenceTime);
  const loadFactorRow = CONFIG.LOAD_FACTOR_TABLE.find(
    (lf) =>
      currentActive >= lf.minActive &&
      (lf.maxActive === null || currentActive <= lf.maxActive)
  );
  const loadFactor = loadFactorRow ? loadFactorRow.factor : 1.5;
  const baseImpact = 100 / (loadFactor * timeWeight);

  return Math.max(0, Math.min(100, baseImpact));
};

export async function calculateVelocityScore_Enhanced(
  stage,
  currentActive,
  activeCases = [],
  prevSmoothedTarget = null,
  recentCompletions = [],
  referenceTime = null
) {
  if (!recentCompletions.length) {
    return {
      velocityScore: 0,
      nextSmoothedTarget: null,
      noData: true,
      casesOverBenchmark: [],
      casesUnderBenchmark: [],
      caseDetails: [],
    };
  }

  const times = recentCompletions.map((c) => c.timeInStageMs || c.stageTime);
  const activeCounts = recentCompletions.map(
    (c) => c.activeCountAtStart || c.concurrentCases || 10
  );

  // NEW: Array to collect all case details
  const caseDetails = [];

  // Handle first case
  if (recentCompletions.length === 1) {
    const firstCaseTime = times[0];
    const caseNumber =
      recentCompletions[0].caseNumber || recentCompletions[0].casenumber;

    const baseDetail = {
      caseNumber,
      caseId: recentCompletions[0].id,
      benchmark: firstCaseTime,
      actual: firstCaseTime,
      percentDiff: "0.0",
      timeDiffMs: 0,
      status: "met",
    };

    caseDetails.push(baseDetail);

    if (currentActive === 0) {
      return {
        velocityScore: 100,
        nextSmoothedTarget: firstCaseTime,
        adjustedTarget: firstCaseTime,
        casesOverBenchmark: [],
        casesUnderBenchmark: [baseDetail],
        caseDetails,
        metrics: {
          rawTarget: firstCaseTime,
          smoothedTarget: firstCaseTime,
          concurrencyScale: 1,
          correlationFactor: 1,
          avgHistoricalActive: 0,
          currentActive: 0,
          timeWeightedLoad: 0,
          loadAdjustment: 1,
          completedVelocity: 100,
          activeImpact: 100,
          rawScore: 100,
          appliedHysteresis: false,
          isFirstCase: true,
        },
      };
    }

    const activeImpact = calculateActiveLoadImpact(
      currentActive,
      activeCases,
      stage,
      referenceTime
    );
    const rawScore = 90 + activeImpact / 10;

    return {
      velocityScore: Math.round(rawScore),
      nextSmoothedTarget: firstCaseTime,
      adjustedTarget: firstCaseTime,
      casesOverBenchmark: [],
      casesUnderBenchmark: [baseDetail],
      caseDetails,
      metrics: {
        rawTarget: firstCaseTime,
        smoothedTarget: firstCaseTime,
        concurrencyScale: 1,
        correlationFactor: 1,
        avgHistoricalActive: currentActive,
        currentActive: currentActive,
        timeWeightedLoad: calculateTimeWeightedLoad(activeCases, referenceTime),
        loadAdjustment: 1,
        completedVelocity: 100,
        activeImpact: activeImpact,
        rawScore: rawScore,
        appliedHysteresis: false,
        isFirstCase: true,
      },
    };
  }

  // Calculate benchmark
  const sortedTimes = [...times].sort((a, b) => a - b);
  const rawIdx = Math.floor(
    (CONFIG.TARGET_PERCENTILE / 100) * (sortedTimes.length - 1)
  );
  const rawTarget = sortedTimes[rawIdx];

  const smoothedTarget =
    prevSmoothedTarget == null
      ? rawTarget
      : CONFIG.SMOOTHING_ALPHA * rawTarget +
        (1 - CONFIG.SMOOTHING_ALPHA) * prevSmoothedTarget;

  // Calculate scaling factors
  const avgHistoricalActive = calculateMean(activeCounts);
  const effectiveHistoricalAvg =
    recentCompletions.length < 5 && avgHistoricalActive === 10
      ? Math.max(1, currentActive)
      : avgHistoricalActive;

  const concurrencyScale = calculateConcurrencyScale(
    currentActive,
    effectiveHistoricalAvg
  );
  const timeWeightedLoad = calculateTimeWeightedLoad(
    activeCases,
    referenceTime
  );
  const loadAdjustment = timeWeightedLoad > 0 ? Math.sqrt(timeWeightedLoad) : 1;

  const loadFactorRow = CONFIG.LOAD_FACTOR_TABLE.find(
    (lf) =>
      currentActive >= lf.minActive &&
      (lf.maxActive === null || currentActive <= lf.maxActive)
  );
  const correlationFactor = loadFactorRow ? loadFactorRow.factor : 1;

  const adjustedTargetMs =
    smoothedTarget * concurrencyScale * correlationFactor * loadAdjustment;

  // Identify which cases exceeded or beat the benchmark
  const casesOverBenchmark = [];
  const casesUnderBenchmark = [];

  recentCompletions.forEach((completion, index) => {
    const caseTime = times[index];
    const ratio = adjustedTargetMs / caseTime;
    const caseNumber = completion.caseNumber || completion.casenumber;

    // Build the base object that will be used everywhere
    const base = {
      caseNumber,
      caseId: completion.id,
      benchmark: adjustedTargetMs,
      actual: caseTime,
      percentDiff: ((caseTime / adjustedTargetMs - 1) * 100).toFixed(1),
      timeDiffMs: Math.abs(caseTime - adjustedTargetMs),
    };

    if (ratio < 1) {
      // Any amount slow
      const obj = { ...base, status: "missed" };
      casesOverBenchmark.push(obj);
      caseDetails.push(obj);
    } else {
      // On or faster
      const obj = { ...base, status: ratio > 1 ? "exceeded" : "met" };
      casesUnderBenchmark.push(obj);
      caseDetails.push(obj);
    }
  });

  // Calculate scores
  const ratios = times.map((t) => Math.min(1, adjustedTargetMs / t));
  const avgRatio = calculateMean(ratios);
  let completedVelocity = Math.round(avgRatio * 100);

  if (recentCompletions.length <= 3) {
    completedVelocity = Math.max(50, completedVelocity);
  }

  const activeImpact = calculateActiveLoadImpact(
    currentActive,
    activeCases,
    stage,
    referenceTime
  );
  const effectiveActiveWeight =
    recentCompletions.length <= 5
      ? CONFIG.ACTIVE_WEIGHT * 0.5
      : CONFIG.ACTIVE_WEIGHT;

  const rawScore =
    completedVelocity * (1 - effectiveActiveWeight) +
    activeImpact * effectiveActiveWeight;

  // REMOVED HYSTERESIS - Always use raw score
  const velocityScore = Math.round(rawScore);

  return {
    velocityScore,
    nextSmoothedTarget: smoothedTarget,
    adjustedTarget: adjustedTargetMs,
    casesOverBenchmark,
    casesUnderBenchmark,
    caseDetails,
    metrics: {
      rawTarget,
      smoothedTarget,
      concurrencyScale,
      correlationFactor,
      avgHistoricalActive: effectiveHistoricalAvg,
      currentActive,
      timeWeightedLoad,
      loadAdjustment,
      completedVelocity,
      activeImpact,
      rawScore,
      appliedHysteresis: false,
      sampleSize: recentCompletions.length,
    },
  };
}

// ==================== RUSH REDUCTION FACTOR ====================
const calculateRushReductionFactor = (cases) => {
  const standardCases = cases.filter((c) => !c.priority && !c.rush);
  const urgentCases = cases.filter((c) => c.priority || c.rush);

  if (standardCases.length < 5 || urgentCases.length < 3) {
    return 0.6;
  }

  const getAvailableDays = (c) => {
    const created = new Date(c.created_at);
    const due = endOfDueDay(c);
    return (due - created) / (1000 * 60 * 60 * 24);
  };

  const standardTimes = standardCases
    .map(getAvailableDays)
    .sort((a, b) => a - b);
  const urgentTimes = urgentCases.map(getAvailableDays).sort((a, b) => a - b);

  const getIQRMean = (times) => {
    const q1Index = Math.floor(times.length * 0.25);
    const q3Index = Math.floor(times.length * 0.75);
    const iqrTimes = times.slice(q1Index, q3Index + 1);
    return calculateMean(iqrTimes);
  };

  const standardIQRMean = getIQRMean(standardTimes);
  const urgentIQRMean = getIQRMean(urgentTimes);

  return Math.max(0.3, Math.min(1.0, urgentIQRMean / standardIQRMean));
};

// ==================== STAGE TRANSITION ANALYSIS ====================
const analyzeStageTransitions = (
  history,
  dueDate,
  currentStage = null,
  caseCreatedDate = null,
  isRushOrPriority = false,
  rushReductionFactor = 0.6
) => {
  const analysis = {
    metFinishingBuffer: true,
    metProductionBuffer: true,
    metDesignBuffer: true,
    finishingBufferHours: null,
    productionBufferHours: null,
    designBufferHours: null,
    adjustedBufferRequirement: null,
    isRushOrPriority: isRushOrPriority,
  };

  if (!history || history.length === 0) {
    return analysis;
  }

  const dueDateEndOfDay = new Date(dueDate);
  dueDateEndOfDay.setHours(23, 59, 59, 999);

  let effectiveBufferRequirements = { ...CONFIG.BUFFER_REQUIREMENTS };

  if (isRushOrPriority) {
    effectiveBufferRequirements = {
      design: Math.max(
        0.5,
        CONFIG.BUFFER_REQUIREMENTS.design * rushReductionFactor
      ),
      production: Math.max(
        0.25,
        CONFIG.BUFFER_REQUIREMENTS.production * rushReductionFactor
      ),
      finishing: 0,
    };
    analysis.adjustedBufferRequirement = effectiveBufferRequirements;
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const transitions = {
    designToProduction: null,
    productionToFinishing: null,
    finishingToComplete: null,
  };

  sortedHistory.forEach((entry) => {
    const action = entry.action.toLowerCase();

    if (
      /moved\s+from\s+design\s+to\s+production/.test(action) ||
      (/to\s+production\s+stage/.test(action) &&
        !action.includes("from finishing"))
    ) {
      transitions.designToProduction = new Date(entry.created_at);
    }

    if (
      /moved\s+from\s+production\s+to\s+finishing/.test(action) ||
      (/to\s+finishing\s+stage/.test(action) && !action.includes("from design"))
    ) {
      transitions.productionToFinishing = new Date(entry.created_at);
    }

    if (action === "marked done") {
      transitions.finishingToComplete = new Date(entry.created_at);
    }
  });

  // Check buffers
  if (transitions.designToProduction) {
    const requiredDesignCompletion = new Date(dueDateEndOfDay);
    requiredDesignCompletion.setDate(
      requiredDesignCompletion.getDate() - effectiveBufferRequirements.design
    );

    analysis.metDesignBuffer =
      transitions.designToProduction <= requiredDesignCompletion;
    analysis.designBufferHours =
      (dueDateEndOfDay - transitions.designToProduction) / (1000 * 60 * 60);
    analysis.requiredDesignBuffer = effectiveBufferRequirements.design;
  }

  if (transitions.productionToFinishing) {
    const requiredProductionCompletion = new Date(dueDateEndOfDay);
    requiredProductionCompletion.setDate(
      requiredProductionCompletion.getDate() -
        effectiveBufferRequirements.production
    );

    analysis.metProductionBuffer =
      transitions.productionToFinishing <= requiredProductionCompletion;
    analysis.productionBufferHours =
      (dueDateEndOfDay - transitions.productionToFinishing) / (1000 * 60 * 60);
    analysis.requiredProductionBuffer = effectiveBufferRequirements.production;
  }

  if (transitions.finishingToComplete) {
    const actualLateness =
      (transitions.finishingToComplete - dueDateEndOfDay) / (1000 * 60 * 60);
    analysis.metFinishingBuffer =
      transitions.finishingToComplete <= dueDateEndOfDay;
    analysis.finishingBufferHours = -actualLateness;
  }

  return analysis;
};

// ==================== ON-TIME DELIVERY ANALYSIS ====================
const calculatePenaltyUnits = (d, stage) => {
  let penaltyUnits = 0;
  const lateAtStage = d.stageAtDue;

  if (stage === "design") {
    if (!d.stageAnalysis?.metDesignBuffer) penaltyUnits += 0.5;
    if (lateAtStage === "design") penaltyUnits += 0.5;
  } else if (stage === "production") {
    if (!d.stageAnalysis?.metProductionBuffer) penaltyUnits += 0.5;
    if (lateAtStage === "production") penaltyUnits += 0.5;
  } else if (stage === "finishing") {
    if (lateAtStage === "finishing") penaltyUnits = 1.0;
  }

  return penaltyUnits;
};

const calculateOnTimeDelivery = (
  cases,
  currentStage = null,
  stageStatistics = null,
  velocityDetails = []
) => {
  if (!cases || cases.length === 0) {
    return {
      overall: {
        count: 0,
        actualOnTime: 0,
        actualRate: 0,
        effectiveOnTime: 0,
        effectiveRate: 0,
        avgScore: 0,
        bufferCompliance: {
          design: 100,
          production: 100,
          finishing: 100,
          current: 100,
        },
        avgHoursLate: 0,
        criticalViolations: 0,
        rushPriorityCount: 0,
        rushReductionFactor: 0.6,
      },
      byType: {},
      byPriority: {},
      stageBufferAnalysis: {
        designViolations: 0,
        productionViolations: 0,
        finishingViolations: 0,
        commonPatterns: [],
      },
      recommendations: [],
      standardTime: 5,
      caseInsights: null,
    };
  }

  const nonExcludedCases = cases.filter(
    (c) => !isCaseExcluded(c, currentStage)
  );
  const rushReductionFactor = calculateRushReductionFactor(nonExcludedCases);

  const deliveryData = nonExcludedCases
    .map((c) => {
      const caseDue = endOfDueDay(c);
      const caseCreated = new Date(c.created_at);

      const completionEntry = c.case_history?.find(
        (h) => h.action.toLowerCase() === "marked done"
      );
      const isCompleted = !!completionEntry;

      if (!currentStage && !isCompleted) {
        return null;
      }

      const isRushOrPriority = c.priority || c.rush;

      const stageAnalysis = analyzeStageTransitions(
        c.case_history,
        caseDue,
        currentStage,
        c.created_at,
        isRushOrPriority,
        rushReductionFactor
      );

      let actualDelivery = true;
      let hoursEarlyLate = 0;
      let completedDate = null;
      let stageAtDue = null;

      if (isCompleted) {
        const caseCompleted = new Date(completionEntry.created_at);
        completedDate = caseCompleted;
        actualDelivery = caseCompleted <= caseDue;
        hoursEarlyLate = (caseCompleted - caseDue) / (1000 * 60 * 60);

        stageAtDue = getStageAtTime(c, caseDue);

        if (currentStage && !actualDelivery) {
          if (stageAtDue !== currentStage) {
            actualDelivery = true;
            hoursEarlyLate = 0;
          }
        }
      }

      const totalAvailableTime = caseDue - caseCreated;
      const totalAvailableDays = totalAvailableTime / (1000 * 60 * 60 * 24);

      // Calculate buffer shortage details for all stages
      const bufferShortages = {};
      if (!stageAnalysis.metDesignBuffer) {
        const requiredDays =
          stageAnalysis.adjustedBufferRequirement?.design ||
          CONFIG.BUFFER_REQUIREMENTS.design;
        const actualDays = stageAnalysis.designBufferHours / 24;
        bufferShortages.design = {
          hoursShort: (requiredDays - actualDays) * 24,
          required: requiredDays,
          actual: actualDays,
        };
      }
      if (!stageAnalysis.metProductionBuffer) {
        const requiredDays =
          stageAnalysis.adjustedBufferRequirement?.production ||
          CONFIG.BUFFER_REQUIREMENTS.production;
        const actualDays = stageAnalysis.productionBufferHours / 24;
        bufferShortages.production = {
          hoursShort: (requiredDays - actualDays) * 24,
          required: requiredDays,
          actual: actualDays,
        };
      }

      let score = 100;
      const caseIsActuallyLate = isCompleted && !actualDelivery;
      const stageResponsibleForLateness = caseIsActuallyLate
        ? stageAtDue
        : null;

      if (currentStage === "design") {
        if (!stageAnalysis.metDesignBuffer) score -= 15;
        if (stageResponsibleForLateness === "design") {
          score -= Math.min(50, Math.abs(hoursEarlyLate) * 2);
        }
      } else if (currentStage === "production") {
        if (!stageAnalysis.metProductionBuffer) score -= 10;
        if (stageResponsibleForLateness === "production") {
          score -= Math.min(50, Math.abs(hoursEarlyLate) * 2);
        }
      } else if (currentStage === "finishing") {
        if (stageResponsibleForLateness === "finishing") {
          score -= Math.min(50, Math.abs(hoursEarlyLate) * 2);
        }
      }

      if (!currentStage && isCompleted) {
        if (!actualDelivery) {
          score -= Math.min(50, Math.abs(hoursEarlyLate) * 2);
        }
        if (!stageAnalysis.metDesignBuffer) score -= 15;
        if (!stageAnalysis.metProductionBuffer) score -= 10;
      }

      const effectiveDelivery = score >= 70;
      const metAllBuffers =
        stageAnalysis.metDesignBuffer &&
        stageAnalysis.metProductionBuffer &&
        stageAnalysis.metFinishingBuffer;

      const penaltyUnits = currentStage
        ? calculatePenaltyUnits(
            {
              isCompleted,
              actualDelivery,
              stageAtDue,
              stageAnalysis,
            },
            currentStage
          )
        : 0;

      return {
        id: c.id,
        caseNumber: c.caseNumber || c.casenumber,
        caseType: c.caseType || "general",
        priority: c.priority,
        rush: c.rush,
        isCompleted,
        totalAvailableDays,
        completedDate,
        dueDate: caseDue,
        actualDelivery,
        score: Math.max(0, Math.min(100, score)),
        effectiveDelivery,
        metAllBuffers,
        hoursEarlyLate,
        stageAtDue,
        penaltyUnits,
        bufferViolations: [
          !stageAnalysis.metDesignBuffer && "design",
          !stageAnalysis.metProductionBuffer && "production",
          !stageAnalysis.metFinishingBuffer && "finishing",
        ].filter(Boolean),
        stageAnalysis,
        bufferShortages,
        stageTime: c.stageTime,
        isExcluded: isCaseExcluded(c, currentStage),
      };
    })
    .filter(Boolean);

  // Create map of velocity details for easy lookup
  const velocityDetailsMap = new Map(
    velocityDetails.map((vd) => [vd.caseNumber, vd])
  );

  // Apply velocity data to delivery data
  deliveryData.forEach((d) => {
    const velocityData = velocityDetailsMap.get(d.caseNumber);

    if (velocityData) {
      d.velocityPerformance = {
        status: velocityData.status,
        performance: (velocityData.actual / velocityData.benchmark) * 100,
        benchmark: velocityData.benchmark,
        actual: velocityData.actual,
        percentDiff: velocityData.percentDiff,
        timeDiffMs: velocityData.timeDiffMs,
      };

      // Adjust score for velocity penalty if missed
      if (velocityData.status === "missed") {
        const velocityPenalty = Math.min(
          20,
          Math.floor((d.velocityPerformance.performance - 100) / 5)
        );
        d.score = Math.max(0, d.score - velocityPenalty);
      }
    }
  });

  // Get stage-specific penalties
  const getStageSpecificPenalties = (allData, stage) => {
    if (!stage) return allData;

    return allData.filter((d) => {
      // For velocity penalties - only include if case was processed in this stage
      if (d.velocityPerformance && d.velocityPerformance.status === "missed") {
        return true; // Case has velocity data for this stage
      }

      // For buffer violations - only show relevant stage buffers
      if (d.bufferViolations.length > 0) {
        if (stage === "design") return d.bufferViolations.includes("design");
        if (stage === "production")
          return d.bufferViolations.includes("production");
        if (stage === "finishing")
          return d.bufferViolations.includes("finishing");
      }

      // For on-time penalties - only if case was late in this stage
      if (d.hoursEarlyLate > 0 && d.stageAtDue === stage) {
        return true;
      }

      return false;
    });
  };

  const stageSpecificData = currentStage
    ? getStageSpecificPenalties(deliveryData, currentStage)
    : deliveryData;

  // Create comprehensive case insights using velocity details directly
  const casesWithPenalties = stageSpecificData
    .filter((d) => {
      const hasBufferPenalty =
        d.bufferViolations.length > 0 &&
        (!currentStage || d.bufferViolations.some((v) => v === currentStage));
      const hasOnTimePenalty =
        d.hoursEarlyLate > 0 &&
        (!currentStage || d.stageAtDue === currentStage);
      const hasVelocityPenalty =
        d.velocityPerformance && d.velocityPerformance.status === "missed";

      return hasBufferPenalty || hasOnTimePenalty || hasVelocityPenalty;
    })
    .map((d) => ({
      caseNumber: d.caseNumber,
      penaltyUnits: d.penaltyUnits,
      score: d.score,
      bufferViolations: d.bufferViolations,
      bufferShortages: d.bufferShortages,
      isCompleted: d.isCompleted,
      stageAtDue: d.stageAtDue,
      hoursLate: d.hoursEarlyLate > 0 ? d.hoursEarlyLate : 0,
      daysLate: d.hoursEarlyLate > 0 ? (d.hoursEarlyLate / 24).toFixed(1) : 0,
      metDesignBuffer: d.stageAnalysis?.metDesignBuffer,
      metProductionBuffer: d.stageAnalysis?.metProductionBuffer,
      rush: d.rush,
      priority: d.priority,
      velocityPerformance: d.velocityPerformance,
      velocityPenalty:
        d.velocityPerformance && d.velocityPerformance.status === "missed"
          ? {
              percentOver: d.velocityPerformance.percentDiff,
              timeOver: d.velocityPerformance.timeDiffMs,
              impact: Math.min(
                20,
                Math.floor((d.velocityPerformance.performance - 100) / 5)
              ),
            }
          : null,
    }));

  const caseInsights = {
    casesWithPenalties: casesWithPenalties,

    velocityCases: {
      exceeded: velocityDetails
        .filter((v) => v.status === "exceeded")
        .map((v) => ({
          caseNumber: v.caseNumber,
          status: v.status,
          percentDiff: v.percentDiff,
          timeDiffMs: v.timeDiffMs,
          benchmark: v.benchmark,
          actual: v.actual,
        })),
      met: velocityDetails
        .filter((v) => v.status === "met")
        .map((v) => ({
          caseNumber: v.caseNumber,
          status: v.status,
          percentDiff: v.percentDiff,
          timeDiffMs: v.timeDiffMs,
          benchmark: v.benchmark,
          actual: v.actual,
        })),
      missed: velocityDetails
        .filter((v) => v.status === "missed")
        .map((v) => ({
          caseNumber: v.caseNumber,
          status: v.status,
          percentDiff: v.percentDiff,
          timeDiffMs: v.timeDiffMs,
          benchmark: v.benchmark,
          actual: v.actual,
        })),
    },

    bufferViolations: {
      design: stageSpecificData
        .filter(
          (d) =>
            !d.stageAnalysis?.metDesignBuffer &&
            (!currentStage || currentStage === "design")
        )
        .map((d) => ({
          caseNumber: d.caseNumber,
          requiredBuffer: d.stageAnalysis?.requiredDesignBuffer,
          actualBuffer: d.stageAnalysis?.designBufferHours,
          isRush: d.rush || d.priority,
          bufferShortages: d.bufferShortages,
        })),
      production: stageSpecificData
        .filter(
          (d) =>
            !d.stageAnalysis?.metProductionBuffer &&
            (!currentStage || currentStage === "production")
        )
        .map((d) => ({
          caseNumber: d.caseNumber,
          requiredBuffer: d.stageAnalysis?.requiredProductionBuffer,
          actualBuffer: d.stageAnalysis?.productionBufferHours,
          isRush: d.rush || d.priority,
          bufferShortages: d.bufferShortages,
        })),
    },

    lateCases: stageSpecificData
      .filter((d) => {
        if (!d.isCompleted) return false;
        if (currentStage) {
          return d.stageAtDue === currentStage && !d.actualDelivery;
        }
        return !d.actualDelivery;
      })
      .map((d) => ({
        caseNumber: d.caseNumber,
        stageAtDue: d.stageAtDue,
        hoursLate: d.hoursEarlyLate,
        daysLate: (d.hoursEarlyLate / 24).toFixed(1),
        score: d.score,
      })),

    activeCases: deliveryData
      .filter((d) => !d.isCompleted)
      .map((d) => ({
        caseNumber: d.caseNumber,
        daysUntilDue: (
          (d.dueDate - Date.now()) /
          (1000 * 60 * 60 * 24)
        ).toFixed(1),
        currentStage: currentStage,
        bufferStatus: {
          design: d.stageAnalysis?.metDesignBuffer,
          production: d.stageAnalysis?.metProductionBuffer,
        },
      })),

    summary: {
      totalCases: deliveryData.length,
      completedCases: deliveryData.filter((d) => d.isCompleted).length,
      activeCases: deliveryData.filter((d) => !d.isCompleted).length,
      casesWithPenalties: casesWithPenalties.length,
      bufferViolations: {
        design: stageSpecificData.filter(
          (d) =>
            !d.stageAnalysis?.metDesignBuffer &&
            (!currentStage || currentStage === "design")
        ).length,
        production: stageSpecificData.filter(
          (d) =>
            !d.stageAnalysis?.metProductionBuffer &&
            (!currentStage || currentStage === "production")
        ).length,
      },
      lateCases: stageSpecificData.filter((d) => {
        if (!d.isCompleted) return false;
        if (currentStage) {
          return d.stageAtDue === currentStage && !d.actualDelivery;
        }
        return !d.actualDelivery;
      }).length,
      excludedCases: cases.filter((c) => isCaseExcluded(c, currentStage))
        .length,
    },
  };

  const calculateOverallMetrics = () => {
    const rushPriorityCount = deliveryData.filter(
      (d) => d.stageAnalysis?.isRushOrPriority
    ).length;

    let currentStageCompliance = 100;
    if (deliveryData.length > 0) {
      if (currentStage === "design") {
        currentStageCompliance =
          (deliveryData.filter((d) => d.stageAnalysis?.metDesignBuffer).length /
            deliveryData.length) *
          100;
      } else if (currentStage === "production") {
        currentStageCompliance =
          (deliveryData.filter((d) => d.stageAnalysis?.metProductionBuffer)
            .length /
            deliveryData.length) *
          100;
      } else if (currentStage === "finishing") {
        currentStageCompliance =
          (deliveryData.filter((d) => d.stageAnalysis?.metFinishingBuffer)
            .length /
            deliveryData.length) *
          100;
      }
    }

    const completedCases = deliveryData.filter((d) => d.isCompleted);

    let actualOnTimeCount = 0;
    if (currentStage) {
      actualOnTimeCount = deliveryData.filter((d) => {
        if (!d.isCompleted) return true;
        return !(d.stageAtDue === currentStage && !d.actualDelivery);
      }).length;
    } else {
      actualOnTimeCount = deliveryData.filter((d) => {
        if (!d.isCompleted) return true;
        return d.actualDelivery;
      }).length;
    }

    const actualRate =
      deliveryData.length > 0
        ? (actualOnTimeCount / deliveryData.length) * 100
        : 0;

    return {
      count: deliveryData.length,
      actualOnTime: actualOnTimeCount,
      actualRate: actualRate,
      effectiveOnTime: completedCases.filter((d) => d.effectiveDelivery).length,
      effectiveRate:
        completedCases.length > 0
          ? (completedCases.filter((d) => d.effectiveDelivery).length /
              completedCases.length) *
            100
          : 0,
      avgScore: calculateMean(deliveryData.map((d) => d.score)),
      bufferCompliance: {
        design:
          (!currentStage || currentStage === "design") &&
          deliveryData.length > 0
            ? (deliveryData.filter((d) => d.stageAnalysis?.metDesignBuffer)
                .length /
                deliveryData.length) *
              100
            : 100,
        production:
          (!currentStage || currentStage === "production") &&
          deliveryData.length > 0
            ? (deliveryData.filter((d) => d.stageAnalysis?.metProductionBuffer)
                .length /
                deliveryData.length) *
              100
            : 100,
        finishing:
          (!currentStage || currentStage === "finishing") &&
          deliveryData.length > 0
            ? (deliveryData.filter((d) => d.stageAnalysis?.metFinishingBuffer)
                .length /
                deliveryData.length) *
              100
            : 100,
        current: currentStageCompliance,
      },
      avgHoursLate:
        completedCases.filter((d) => !d.actualDelivery).length > 0
          ? calculateMean(
              completedCases
                .filter((d) => !d.actualDelivery)
                .map((d) => d.hoursEarlyLate)
            )
          : 0,
      criticalViolations: completedCases.filter(
        (d) =>
          d.stageAnalysis &&
          !d.stageAnalysis.metProductionBuffer &&
          d.hoursEarlyLate > 0
      ).length,
      rushPriorityCount: rushPriorityCount,
      rushReductionFactor: rushReductionFactor,
    };
  };

  const generateRecommendations = () => {
    const recommendations = [];

    if (!deliveryData || deliveryData.length === 0) return recommendations;

    if (currentStage === "design" && deliveryData.length > 0) {
      const designCompliance =
        deliveryData.filter((d) => d.stageAnalysis?.metDesignBuffer).length /
        deliveryData.length;

      if (designCompliance < 0.8) {
        const rushCount = deliveryData.filter(
          (d) => d.stageAnalysis?.isRushOrPriority
        ).length;
        recommendations.push({
          priority: "high",
          type: "process",
          message: `Only ${(designCompliance * 100).toFixed(
            0
          )}% of cases meet buffer requirements. ${
            rushCount > 0
              ? `Rush/priority cases use ${(rushReductionFactor * 100).toFixed(
                  0
                )}% buffer time.`
              : ""
          } Consider faster design processes.`,
          impact:
            "Missing buffers increases risk of delays in downstream stages.",
        });
      }
    } else if (currentStage === "production" && deliveryData.length > 0) {
      const productionCompliance =
        deliveryData.filter((d) => d.stageAnalysis?.metProductionBuffer)
          .length / deliveryData.length;

      if (productionCompliance < 0.8) {
        recommendations.push({
          priority: "high",
          type: "process",
          message: `Only ${(productionCompliance * 100).toFixed(
            0
          )}% of cases meet buffer requirements. Consider optimizing production workflow.`,
          impact:
            "Missing buffers leaves no time for finishing quality checks.",
        });
      }
    } else if (currentStage === "finishing" && deliveryData.length > 0) {
      const lateCases = deliveryData.filter(
        (d) =>
          d.isCompleted && d.stageAtDue === "finishing" && !d.actualDelivery
      );
      if (lateCases.length > deliveryData.length * 0.2) {
        recommendations.push({
          priority: "high",
          type: "workflow",
          message: `${lateCases.length} cases (${(
            (lateCases.length / deliveryData.length) *
            100
          ).toFixed(0)}%) went late during finishing stage.`,
          impact:
            "Late deliveries in finishing impact customer satisfaction directly.",
        });
      }
    }

    const rushCases = deliveryData.filter((d) => d.totalAvailableDays < 3);
    if (rushCases.length > deliveryData.length * 0.2) {
      recommendations.push({
        priority: "medium",
        type: "planning",
        message: `${((rushCases.length / deliveryData.length) * 100).toFixed(
          0
        )}% of cases have less than 3 days total time. Consider better advance planning.`,
        impact:
          "High proportion of rush cases reduces efficiency across all stages.",
      });
    }

    const completedCases = deliveryData.filter((d) => d.isCompleted);
    const lateCases = completedCases.filter((d) => !d.actualDelivery);
    if (
      completedCases.length > 0 &&
      lateCases.length > completedCases.length * 0.3
    ) {
      const avgDaysLate = calculateMean(
        lateCases.map((d) => d.hoursEarlyLate / 24)
      );
      recommendations.push({
        priority: "high",
        type: "performance",
        message: `${((lateCases.length / completedCases.length) * 100).toFixed(
          0
        )}% of completed cases are delivered late, averaging ${avgDaysLate.toFixed(
          1
        )} days past due.`,
        impact:
          "Consistent late deliveries impact customer satisfaction and team morale.",
      });
    }

    return recommendations;
  };

  const analysis = {
    overall: calculateOverallMetrics(),
    byType: {},
    byPriority: {},
    stageBufferAnalysis: {
      designViolations: deliveryData.filter(
        (d) => !d.stageAnalysis?.metDesignBuffer
      ).length,
      productionViolations: deliveryData.filter(
        (d) => !d.stageAnalysis?.metProductionBuffer
      ).length,
      finishingViolations: deliveryData.filter(
        (d) => !d.stageAnalysis?.metFinishingBuffer
      ).length,
      commonPatterns: [],
    },
    recommendations: generateRecommendations(),
    standardTime: 5,
    caseInsights: caseInsights,
  };

  ["general", "bbs", "flex"].forEach((type) => {
    const typeData = deliveryData.filter((d) => d.caseType === type);
    if (typeData.length >= 3) {
      const completedTypeData = typeData.filter((d) => d.isCompleted);

      analysis.byType[type] = {
        count: typeData.length,
        actualOnTime: completedTypeData.filter((d) => d.actualDelivery).length,
        actualRate:
          completedTypeData.length > 0
            ? (completedTypeData.filter((d) => d.actualDelivery).length /
                completedTypeData.length) *
              100
            : 0,
        effectiveOnTime: completedTypeData.filter((d) => d.effectiveDelivery)
          .length,
        effectiveRate:
          completedTypeData.length > 0
            ? (completedTypeData.filter((d) => d.effectiveDelivery).length /
                completedTypeData.length) *
              100
            : 0,
        avgScore: calculateMean(typeData.map((d) => d.score)),
        bufferCompliance:
          typeData.length > 0
            ? (typeData.filter((d) => d.metAllBuffers).length /
                typeData.length) *
              100
            : 100,
      };
    }
  });

  const priorityData = deliveryData.filter(
    (d) => d.isCompleted && (d.priority || d.rush)
  );
  if (priorityData.length > 0) {
    analysis.byPriority = {
      count: priorityData.length,
      actualOnTime: priorityData.filter((d) => d.actualDelivery).length,
      actualRate:
        (priorityData.filter((d) => d.actualDelivery).length /
          priorityData.length) *
        100,
      effectiveRate:
        (priorityData.filter((d) => d.effectiveDelivery).length /
          priorityData.length) *
        100,
      avgScore: calculateMean(priorityData.map((d) => d.score)),
    };
  }

  return analysis;
};

// ==================== THROUGHPUT ANALYSIS ====================
const calculateOverallThroughputScore = (typeStats) => {
  if (!typeStats) return 0;

  const weights = {
    general: 0.5,
    bbs: 0.3,
    flex: 0.2,
  };

  let weightedScore = 0;
  let totalWeight = 0;

  Object.entries(typeStats).forEach(([type, stats]) => {
    if (stats && stats.velocityScore !== undefined && stats.count > 0) {
      // Only include in calculation if has minimum cases
      if (!stats.excludedFromScoring) {
        weightedScore += stats.velocityScore * weights[type];
        totalWeight += weights[type];
      }
    }
  });

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
};

const generateThroughputInsights = (typeStats) => {
  const insights = [];

  if (!typeStats) return insights;

  Object.entries(typeStats).forEach(([type, stats]) => {
    if (stats && stats.velocityScore !== undefined) {
      if (stats.velocityScore < 50) {
        insights.push({
          type: "warning",
          message: `${type} cases are taking longer than expected. Median time: ${formatDuration(
            stats.median
          )}`,
        });
      } else if (stats.velocityScore > 90) {
        insights.push({
          type: "success",
          message: `${type} cases are performing excellently with ${stats.velocityScore}% velocity score.`,
        });
      }
    }
  });

  return insights;
};

// ==================== SCORE CALCULATIONS ====================
const calculateCombinedScore = (throughput, onTime, currentStage = null) => {
  const throughputScore = throughput?.overall || 0;
  const onTimeScore = onTime?.overall?.actualRate || 0;

  if (!onTime || onTime.overall.count === 0) {
    return throughputScore;
  }

  let baseScore = onTimeScore * 0.6 + throughputScore * 0.4;

  if (
    currentStage &&
    currentStage !== "finishing" &&
    onTime.overall.bufferCompliance
  ) {
    const bufferCompliance = onTime.overall.bufferCompliance.current;

    if (bufferCompliance < 100) {
      const penaltyWeight = CONFIG.BUFFER_PENALTY_WEIGHTS[currentStage] || 0.2;
      const complianceGap = (100 - bufferCompliance) / 100;
      const penalty = 1 - complianceGap * penaltyWeight;
      baseScore *= penalty;
    }
  }

  if (onTime.overall.avgHoursLate > 48) {
    baseScore *= 0.95;
  }

  if (onTime.byPriority && onTime.byPriority.actualRate > 90) {
    baseScore = Math.min(100, baseScore * 1.02);
  }

  if (onTime.overall.criticalViolations > onTime.overall.count * 0.1) {
    baseScore *= 0.9;
  }

  return Math.round(Math.max(0, Math.min(100, baseScore)) * 10) / 10;
};

const calculateConfidenceInterval = (sampleSize) => {
  if (sampleSize < 10) return "Low";
  if (sampleSize < 30) return "Medium";
  if (sampleSize < 100) return "High";
  return "Very High";
};

const generateDetailedExplanation = (
  throughput,
  onTime,
  score,
  sampleSize,
  currentStage
) => {
  const explanation = {
    overall: [],
    throughput: [],
    onTime: [],
    factors: [],
  };

  explanation.overall.push({
    text: `The ${score}% efficiency score is calculated from ${sampleSize} cases${
      currentStage ? ` in the ${currentStage} stage` : ""
    }.`,
    type: "info",
  });

  explanation.overall.push({
    text: `This combines on-time delivery (60% weight) and throughput velocity (40% weight).`,
    type: "info",
  });

  if (onTime && onTime.overall) {
    const onTimeRate = onTime.overall.actualRate;
    const completedCount =
      onTime.overall.actualOnTime +
      (onTime.overall.count - onTime.overall.actualOnTime);

    if (completedCount > 0) {
      explanation.onTime.push({
        text: `${
          onTime.overall.actualOnTime
        } out of ${completedCount} cases (${onTimeRate.toFixed(
          1
        )}%) were delivered on time.`,
        type:
          onTimeRate >= 80 ? "success" : onTimeRate >= 60 ? "warning" : "error",
      });
    }

    if (onTime.overall.avgHoursLate > 0) {
      explanation.onTime.push({
        text: `Late cases averaged ${(onTime.overall.avgHoursLate / 24).toFixed(
          1
        )} days past due.`,
        type: "warning",
      });
    }

    if (
      currentStage &&
      currentStage !== "finishing" &&
      onTime.overall.bufferCompliance
    ) {
      const bufferCompliance = onTime.overall.bufferCompliance.current;

      explanation.onTime.push({
        text: `${bufferCompliance.toFixed(
          0
        )}% of cases met buffer requirements. Rush/priority cases use ${(
          onTime.overall.rushReductionFactor * 100
        ).toFixed(0)}% of standard buffer time.`,
        type:
          bufferCompliance >= 80
            ? "success"
            : bufferCompliance >= 60
            ? "warning"
            : "error",
      });
    }
  }

  if (throughput && throughput.byType) {
    Object.entries(throughput.byType).forEach(([type, stats]) => {
      if (stats) {
        const typeName =
          type === "bbs" ? "BBS" : type === "flex" ? "3D Flex" : "General";
        explanation.throughput.push({
          text: `${typeName} cases: ${
            stats.count
          } completed with ${formatDuration(stats.median)} median time (${(
            stats.velocityScore || 0
          ).toFixed(0)}% velocity score).`,
          type:
            stats.velocityScore >= 70
              ? "success"
              : stats.velocityScore >= 50
              ? "warning"
              : "error",
        });
      }
    });
  }

  if (score < 50) {
    explanation.factors.push({
      text: `Low efficiency is primarily due to ${
        onTime?.overall?.actualRate < 50
          ? "poor on-time delivery"
          : "slow throughput velocity"
      }.`,
      type: "error",
    });
  } else if (score > 80) {
    explanation.factors.push({
      text: `High efficiency indicates good balance between speed and reliability.`,
      type: "success",
    });
  }

  if (
    currentStage &&
    currentStage !== "finishing" &&
    onTime?.overall?.bufferCompliance?.current < 100
  ) {
    const penaltyWeight = CONFIG.BUFFER_PENALTY_WEIGHTS[currentStage];
    const complianceGap = (100 - onTime.overall.bufferCompliance.current) / 100;
    const actualPenalty = complianceGap * penaltyWeight * 100;

    explanation.factors.push({
      text: `Buffer compliance (${onTime.overall.bufferCompliance.current.toFixed(
        1
      )}%) is reducing the efficiency score by ${actualPenalty.toFixed(1)}%.`,
      type: "warning",
    });
  }

  return explanation;
};

// ==================== MAIN CALCULATION FUNCTION ====================
export const calculateDepartmentEfficiency = async (
  department,
  currentStage = null,
  stageStatistics = null,
  stageCount = 0,
  onProgress = null
) => {
  try {
    // Use a fixed reference time for all calculations in this run
    const referenceTime = Date.now();

    if (currentStage && (!stageStatistics || stageStatistics.noData)) {
      return {
        score: 0,
        noData: true,
        message: "No stage statistics available",
        activeCases: 0,
        completedCases: 0,
        department: "Digital",
        stage: currentStage,
      };
    }

    if (currentStage && stageStatistics) {
      // Report progress at key milestones
      const reportProgress = (percent) => {
        if (onProgress) onProgress(percent);
      };

      reportProgress(10);

      const allValidCases = stageStatistics.validCases;
      const completedCases = allValidCases.filter((c) => !c.isActive);
      const activeCases = allValidCases.filter((c) => c.isActive);

      reportProgress(20);

      // Calculate velocity scores
      const enhancedTypeStats = {};
      const allVelocityDetails = [];

      const types = ["general", "bbs", "flex"];
      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const stats = stageStatistics.typeStats?.[type];

        if (stats && stats.completions && stats.completions.length > 0) {
          const velocityResult = await calculateVelocityScore_Enhanced(
            currentStage,
            activeCases.filter((c) => c.caseType === type).length ||
              stats.count,
            activeCases.filter((c) => c.caseType === type),
            null,
            stats.completions,
            referenceTime // Pass reference time
          );

          if (velocityResult.caseDetails) {
            allVelocityDetails.push(...velocityResult.caseDetails);
          }

          const hasMinimumCases = stats.completions.length >= 10;

          enhancedTypeStats[type] = {
            ...stats,
            velocityScore: velocityResult.velocityScore,
            velocityMetrics: velocityResult.metrics,
            casesOverBenchmark: velocityResult.casesOverBenchmark,
            casesUnderBenchmark: velocityResult.casesUnderBenchmark,
            hasMinimumCases: hasMinimumCases,
            actualCaseCount: stats.completions.length,
            excludedFromScoring: !hasMinimumCases,
          };
        }

        reportProgress(20 + (i + 1) * 20); // 40, 60, 80
      }

      const throughputAnalysis = {
        byType: enhancedTypeStats,
        overall: calculateOverallThroughputScore(enhancedTypeStats),
        insights: generateThroughputInsights(enhancedTypeStats),
        averageTime: stageStatistics.averageTime,
        medianTime: stageStatistics.medianTime,
        overallStats: stageStatistics.overallStats,
      };

      reportProgress(90);

      const onTimeAnalysis = calculateOnTimeDelivery(
        allValidCases,
        currentStage,
        stageStatistics,
        allVelocityDetails
      );

      const efficiencyScore = calculateCombinedScore(
        throughputAnalysis,
        onTimeAnalysis,
        currentStage
      );

      const predictions = generateCaseRiskPredictions(
        activeCases,
        throughputAnalysis,
        currentStage,
        stageStatistics
      );

      const explanation = generateDetailedExplanation(
        throughputAnalysis,
        onTimeAnalysis,
        efficiencyScore,
        allValidCases.length,
        currentStage
      );

      reportProgress(100);

      return {
        score: efficiencyScore,
        throughput: throughputAnalysis,
        onTimeDelivery: onTimeAnalysis,
        predictions,
        sampleSize: allValidCases.length,
        confidence: calculateConfidenceInterval(allValidCases.length),
        activeCases: activeCases.length,
        completedCases: completedCases.length,
        department: "Digital",
        stage: currentStage,
        explanation,
        noData: false,
        velocityEngine: {
          enabled: true,
          config: CONFIG,
          metrics: {
            appliedHysteresis: false,
            previousScore: null,
            rawScore: efficiencyScore,
          },
        },
        caseInsights: onTimeAnalysis.caseInsights,
        velocityDetails: allVelocityDetails,
        calculatedAt: referenceTime,
      };
    }

    return {
      score: 0,
      noData: true,
      message: "Department view requires database access",
      activeCases: 0,
      completedCases: 0,
      department: department,
      stage: null,
    };
  } catch (error) {
    console.error("Error calculating department efficiency:", error);
    return {
      score: 0,
      noData: true,
      message: "Error calculating efficiency",
      error: error.message,
      activeCases: 0,
      completedCases: 0,
      department: currentStage ? "Digital" : department,
      stage: currentStage,
    };
  }
};

// ==================== UI COMPONENTS ====================
// Icon Components
const Icons = {
  Speed: () => (
    <svg
      className="w-5 h-5"
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
  Clock: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Shield: () => (
    <svg
      className="w-5 h-5"
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
  Average: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  Median: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 12l5-5 5 5M7 12l5 5 5-5"
      />
    </svg>
  ),
  Active: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
      />
    </svg>
  ),
  Priority: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
      />
    </svg>
  ),
  Rush: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Cases: () => (
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
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  ),
  Confidence: () => (
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
  ChevronDown: () => (
    <svg
      className="w-5 h-5"
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
  ),
  Alert: () => (
    <svg
      className="w-5 h-5"
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
};

// Info Tooltip Component
const InfoTooltip = ({ title, content, position = "right" }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const positionClasses = {
    right: "left-6 top-1/2 -translate-y-1/2",
    left: "right-6 top-1/2 -translate-y-1/2",
    top: "bottom-6 left-1/2 -translate-x-1/2",
    bottom: "top-6 left-1/2 -translate-x-1/2",
  };

  const arrowClasses = {
    right:
      "absolute top-1/2 -left-2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-gray-900",
    left: "absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8 border-l-gray-900",
    top: "absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-900",
    bottom:
      "absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-b-8 border-b-gray-900",
  };

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors"
      >
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
      </button>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute z-50 w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg ${positionClasses[position]}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold mb-1">{title}</div>
            <div className="text-gray-300">{content}</div>
            <div className={arrowClasses[position]}></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Metric Bar Component
const MetricBar = ({ label, value, icon, color = "blue", tooltip }) => {
  const colorClasses = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    indigo: "bg-indigo-500",
  };

  const bgColorClasses = {
    green: "bg-green-50",
    blue: "bg-blue-50",
    amber: "bg-amber-50",
    red: "bg-red-50",
    indigo: "bg-indigo-50",
  };

  const textColorClasses = {
    green: "text-green-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
    indigo: "text-indigo-700",
  };

  return (
    <div className={`${bgColorClasses[color]} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`${textColorClasses[color]}`}>{icon}</div>
          <span className="font-medium text-gray-900">{label}</span>
          {tooltip && (
            <InfoTooltip title={label} content={tooltip} position="right" />
          )}
        </div>
        <span className="text-2xl font-bold text-gray-900">
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="w-full h-3 bg-white rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full ${colorClasses[color]}`}
        />
      </div>
    </div>
  );
};

// Velocity Metric Bar with Dropdown
const VelocityMetricBar = ({ departmentEfficiency }) => {
  const [showDetails, setShowDetails] = useState(false);

  const overallVelocity = departmentEfficiency.throughput?.overall || 0;
  const typeStats = departmentEfficiency.throughput?.byType || {};

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="text-blue-700">
              <Icons.Speed />
            </div>
            <span className="font-medium text-gray-900">Velocity</span>
            <InfoTooltip
              title="Velocity Score"
              content="Measures case processing speed against benchmarks"
              position="right"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {overallVelocity.toFixed(0)}%
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1 hover:bg-blue-100 rounded transition-colors"
            >
              <motion.div
                animate={{ rotate: showDetails ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <Icons.ChevronDown />
              </motion.div>
            </button>
          </div>
        </div>
        <div className="w-full h-3 bg-white rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, overallVelocity)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-blue-500"
          />
        </div>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pl-8">
              {["general", "bbs", "flex"].map((type) => (
                <div key={type} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {type === "bbs"
                        ? "BBS"
                        : type === "flex"
                        ? "3D Flex"
                        : "General"}{" "}
                      Cases
                    </span>
                    {typeStats[type] ? (
                      <span className="text-sm text-gray-600">
                        {typeStats[type].excludedFromScoring ? (
                          <>
                            {typeStats[type].actualCaseCount} of 10 - score not
                            included
                          </>
                        ) : (
                          <>
                            {typeStats[type].velocityScore?.toFixed(0) || 0}% •{" "}
                            {formatDuration(typeStats[type].median)} median
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">No data</span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    {typeStats[type] ? (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(
                            100,
                            typeStats[type].velocityScore || 0
                          )}%`,
                        }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className={`h-full ${
                          typeStats[type].excludedFromScoring
                            ? "bg-gray-400" // Gray color for excluded scores
                            : (typeStats[type].velocityScore || 0) >= 70
                            ? "bg-green-500"
                            : (typeStats[type].velocityScore || 0) >= 50
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                      />
                    ) : (
                      <div className="h-full bg-gray-300 opacity-50" />
                    )}
                  </div>
                  {typeStats[type]?.velocityMetrics?.sampleSize && (
                    <p className="text-xs text-gray-500 mt-1">
                      {typeStats[type].velocityMetrics.sampleSize} cases
                      {typeStats[type].velocityMetrics.isFirstCase &&
                        " (first case)"}
                      {typeStats[type].excludedFromScoring &&
                        " - minimum 10 cases required"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Statistics Card Component
const StatCard = ({ label, value, trend, icon, badge, subtext }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2">
      <div className="text-gray-500">{icon}</div>
      {badge && (
        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
          {badge}
        </span>
      )}
    </div>
    <div className="text-sm text-gray-600 mb-1">{label}</div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
  </div>
);

// Filter Chip Component
const FilterChip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
      active
        ? "bg-blue-100 text-blue-700 border-2 border-blue-300"
        : "bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200"
    }`}
  >
    {children}
  </button>
);

// Case Insight Row Component - UPDATED
const CaseInsightRow = ({ caseData, stage, onClick }) => {
  const getPenaltyColor = (type) => {
    switch (type) {
      case "velocity":
        return "text-blue-600 bg-blue-50";
      case "ontime":
        return "text-red-600 bg-red-50";
      case "buffer":
        return "text-amber-600 bg-amber-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const penalties = [];
  let rightSideDisplay = null;

  // Buffer violations - just show the stage name in the tag
  if (caseData.bufferViolations?.length > 0 && caseData.bufferShortages) {
    const relevantBuffers = caseData.bufferViolations.filter((buffer) => {
      if (!stage) return true;
      return buffer === stage;
    });

    relevantBuffers.forEach((stageBuffer) => {
      penalties.push({
        type: "buffer",
        label: `${stageBuffer} buffer`,
      });
    });

    // Calculate total time short for display
    // Calculate total time short for display on right
    const totalShortage = relevantBuffers.reduce((sum, buffer) => {
      return sum + (caseData.bufferShortages[buffer]?.hoursShort || 0);
    }, 0);

    if (totalShortage > 0) {
      rightSideDisplay =
        formatDuration(totalShortage * 60 * 60 * 1000) + " short";
    }
  }

  // On-time violations
  if (caseData.hoursLate > 0) {
    penalties.push({
      type: "ontime",
      label: "late delivery",
    });
    rightSideDisplay = `${caseData.daysLate} days late`;
  }

  // Velocity violations - now using the direct data from velocity engine
  if (caseData.velocityPenalty) {
    penalties.push({
      type: "velocity",
      label: `${caseData.velocityPenalty.percentOver}% slower`,
    });
    rightSideDisplay =
      formatDuration(caseData.velocityPenalty.timeOver) + " over";
  }

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-gray-900">
          {caseData.caseNumber}
        </span>
        <div className="flex gap-2 flex-wrap">
          {penalties.map((penalty, idx) => (
            <span
              key={idx}
              className={`px-2 py-1 rounded text-xs font-medium ${getPenaltyColor(
                penalty.type
              )}`}
            >
              {penalty.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">
          {rightSideDisplay}
        </span>
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );
};

// Case Inspector Modal Component
const CaseInspector = ({ caseData, onClose }) => {
  if (!caseData) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Case Inspector - {caseData.caseNumber}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
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

        <div className="p-6 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">
                Performance Details
              </h4>
              <div className="space-y-2">
                {caseData.bufferViolations?.map((stage, idx) => {
                  const shortage = caseData.bufferShortages?.[stage];
                  return (
                    <div
                      key={`buffer-${idx}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {stage.charAt(0).toUpperCase() + stage.slice(1)}{" "}
                          Buffer Violation
                        </div>
                        <div className="text-sm text-gray-600">
                          Required: {shortage?.required?.toFixed(1) || "—"} days
                          before deadline
                          <br />
                          Actual: {shortage?.actual?.toFixed(1) || "—"} days
                          <br />
                          <span className="text-amber-700 font-medium">
                            {formatDuration(
                              (shortage?.hoursShort || 0) * 60 * 60 * 1000
                            )}{" "}
                            short of requirement
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {caseData.hoursLate > 0 && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">
                        Late Delivery
                      </div>
                      <div className="text-sm text-gray-600">
                        {caseData.daysLate} days past deadline
                      </div>
                    </div>
                  </div>
                )}

                {caseData.velocityPenalty && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">
                        Velocity Performance
                      </div>
                      <div className="text-sm text-gray-600">
                        {caseData.velocityPenalty.percentOver}% over target time
                        ({formatDuration(caseData.velocityPenalty.timeOver)}{" "}
                        excess)
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-3">
                Recommendations
              </h4>
              <div className="space-y-2">
                {caseData.bufferViolations?.length > 0 && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-900">
                      Consider starting this stage earlier to meet buffer
                      requirements
                    </p>
                  </div>
                )}
                {caseData.velocityPenalty && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-900">
                      Review process efficiency - case took longer than typical
                      for this type
                    </p>
                  </div>
                )}
                {caseData.priority && (
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <p className="text-sm text-orange-900">
                      Priority case - ensure adequate resources are allocated
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

// ==================== MAIN MODAL COMPONENT ====================
export const EfficiencyModal = ({
  showEfficiencyModal,
  setShowEfficiencyModal,
  departmentEfficiency,
  formatDuration,
  onShowCaseManagement,
}) => {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedCase, setSelectedCase] = useState(null);
  const [showConfiguration, setShowConfiguration] = useState(false);

  if (!showEfficiencyModal || !departmentEfficiency) return null;

  const getScoreColor = (score) => {
    if (score >= 90) return "text-emerald-600";
    if (score >= 75) return "text-blue-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score) => {
    if (score >= 90) return "from-emerald-50 to-emerald-100";
    if (score >= 75) return "from-blue-50 to-blue-100";
    if (score >= 60) return "from-amber-50 to-amber-100";
    return "from-red-50 to-red-100";
  };

  const getScoreLabel = (score) => {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 60) return "Fair";
    return "Needs Improvement";
  };

  const stats = {
    avgCompletionTime: departmentEfficiency.throughput?.averageTime || 0,
    medianCompletionTime: departmentEfficiency.throughput?.medianTime || 0,
    activeCasesCount: departmentEfficiency.activeCases || 0,
    atRiskCount: departmentEfficiency.predictions?.atRisk || 0,
  };

  // UPDATED: Priority and Rush stats extraction
  let priorityPercentFaster = null;
  let rushPercentFaster = null;
  let priorityCount = 0;
  let rushCount = 0;
  let standardCount = 0;

  if (departmentEfficiency.throughput?.byType) {
    // Aggregate stats across all case types
    let totalPriorityTime = 0;
    let totalPriorityCount = 0;
    let totalRushTime = 0;
    let totalRushCount = 0;
    let totalStandardTime = 0;
    let totalStandardCount = 0;

    Object.values(departmentEfficiency.throughput.byType).forEach(
      (typeStats) => {
        if (typeStats?.priorityStats) {
          totalPriorityTime +=
            typeStats.priorityStats.mean * typeStats.priorityStats.count;
          totalPriorityCount += typeStats.priorityStats.count;

          // Add standard cases from this type
          if (typeStats.priorityStats.standardComparison) {
            totalStandardTime +=
              typeStats.priorityStats.standardComparison.standardMean *
              typeStats.priorityStats.standardComparison.standardCount;
            totalStandardCount +=
              typeStats.priorityStats.standardComparison.standardCount;
          }
        }

        if (typeStats?.rushStats) {
          totalRushTime += typeStats.rushStats.mean * typeStats.rushStats.count;
          totalRushCount += typeStats.rushStats.count;
        }
      }
    );

    // Calculate overall percentages
    if (totalPriorityCount > 0 && totalStandardCount > 0) {
      const avgPriorityTime = totalPriorityTime / totalPriorityCount;
      const avgStandardTime = totalStandardTime / totalStandardCount;
      priorityPercentFaster =
        ((avgStandardTime - avgPriorityTime) / avgStandardTime) * 100;
      priorityCount = totalPriorityCount;
    }

    if (totalRushCount > 0 && totalStandardCount > 0) {
      const avgRushTime = totalRushTime / totalRushCount;
      const avgStandardTime = totalStandardTime / totalStandardCount;
      rushPercentFaster =
        ((avgStandardTime - avgRushTime) / avgStandardTime) * 100;
      rushCount = totalRushCount;
    }

    standardCount = totalStandardCount;
  }

  const caseInsights = departmentEfficiency.onTimeDelivery?.caseInsights ||
    departmentEfficiency.caseInsights || {
      casesWithPenalties: [],
      velocityCases: { exceeded: [], met: [], missed: [] },
      bufferViolations: { design: [], production: [] },
      lateCases: [],
      activeCases: [],
      summary: {
        totalCases: 0,
        casesWithPenalties: 0,
        bufferViolations: { design: 0, production: 0 },
        lateCases: 0,
        activeCases: 0,
        excludedCases: 0,
      },
    };

  const penaltyCases = caseInsights.casesWithPenalties || [];
  const velocityCases = caseInsights.velocityCases || {
    exceeded: [],
    met: [],
    missed: [],
  };

  const velocityPenalties = penaltyCases.filter((c) => c.velocityPenalty);
  const onTimePenalties = penaltyCases.filter((c) => c.hoursLate > 0);
  const bufferPenalties = penaltyCases.filter(
    (c) => c.bufferViolations.length > 0
  );

  const stageBufferPenalties = bufferPenalties.filter((c) => {
    if (departmentEfficiency.stage === "design")
      return c.bufferViolations.includes("design");
    if (departmentEfficiency.stage === "production")
      return c.bufferViolations.includes("production");
    if (departmentEfficiency.stage === "finishing")
      return c.bufferViolations.includes("finishing");
    return true;
  });

  const filteredCases =
    activeFilter === "all"
      ? penaltyCases
      : activeFilter === "velocity"
      ? velocityPenalties
      : activeFilter === "ontime"
      ? onTimePenalties
      : activeFilter === "buffer"
      ? stageBufferPenalties
      : penaltyCases;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
        onClick={() => setShowEfficiencyModal(false)}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-white flex-shrink-0">
            <button
              onClick={() => setShowEfficiencyModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg
                className="w-6 h-6"
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

            <h2 className="text-2xl font-bold">
              {departmentEfficiency.department} Department
              {departmentEfficiency.stage &&
                ` - ${
                  departmentEfficiency.stage.charAt(0).toUpperCase() +
                  departmentEfficiency.stage.slice(1)
                } Stage`}
            </h2>
            <p className="text-white/80 mt-1">
              Performance Analysis
              {departmentEfficiency.velocityEngine?.enabled && (
                <span className="ml-3 text-xs bg-white/20 px-2 py-1 rounded">
                  Velocity Engine v2.1
                </span>
              )}
            </p>
          </div>

          {departmentEfficiency.noData ? (
            <div className="flex-1 flex items-center justify-center p-16">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                  <svg
                    className="w-10 h-10 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v1a3 3 0 003 3h0a3 3 0 003-3v-1m3-3.87a3 3 0 01-1.8 5.6h-8.4a3 3 0 01-1.8-5.6 5 5 0 1110 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No Data Available
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {departmentEfficiency.message ||
                    "Efficiency metrics will appear once cases are completed."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="px-8 py-6">
                <div
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${getScoreBgColor(
                    departmentEfficiency.score
                  )} p-8`}
                >
                  <div className="relative z-10">
                    <h3 className="text-lg font-medium text-gray-700 mb-2">
                      Overall Efficiency
                    </h3>
                    <div className="flex items-baseline gap-4">
                      <span
                        className={`text-6xl font-bold ${getScoreColor(
                          departmentEfficiency.score
                        )}`}
                      >
                        {departmentEfficiency.score}%
                      </span>
                      <span
                        className={`text-2xl font-medium ${getScoreColor(
                          departmentEfficiency.score
                        )}`}
                      >
                        {getScoreLabel(departmentEfficiency.score)}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-6 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Icons.Cases />
                        {departmentEfficiency.sampleSize} cases analyzed
                        {caseInsights.summary.excludedCases > 0 && (
                          <span className="text-gray-400">
                            ({caseInsights.summary.excludedCases} excluded)
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icons.Confidence />
                        {departmentEfficiency.confidence} confidence
                      </span>
                    </div>
                  </div>
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
                </div>
              </div>

              <div className="px-8 pb-6">
                <div className="space-y-4">
                  <VelocityMetricBar
                    departmentEfficiency={departmentEfficiency}
                  />
                  <MetricBar
                    label="On-Time Performance"
                    value={
                      departmentEfficiency.onTimeDelivery?.overall
                        ?.actualRate || 0
                    }
                    icon={<Icons.Clock />}
                    color="green"
                    tooltip="Percentage of cases delivered by deadline"
                  />
                  {departmentEfficiency.stage &&
                    departmentEfficiency.stage !== "finishing" && (
                      <MetricBar
                        label="Buffer Compliance"
                        value={
                          departmentEfficiency.onTimeDelivery?.overall
                            ?.bufferCompliance?.current || 0
                        }
                        icon={<Icons.Shield />}
                        color="indigo"
                        tooltip="Cases meeting stage buffer requirements"
                      />
                    )}
                </div>
              </div>

              <div className="px-8 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Key Statistics
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard
                    label="Avg Completion"
                    value={formatDuration(stats.avgCompletionTime)}
                    icon={<Icons.Average />}
                  />
                  <StatCard
                    label="Median Time"
                    value={formatDuration(stats.medianCompletionTime)}
                    icon={<Icons.Median />}
                  />
                  <button
                    onClick={() => {
                      setShowEfficiencyModal(false);
                      if (onShowCaseManagement) {
                        onShowCaseManagement();
                      }
                    }}
                    className="hover:shadow-lg transition-shadow"
                  >
                    <StatCard
                      label="Active Cases"
                      value={stats.activeCasesCount}
                      badge={
                        stats.atRiskCount > 0
                          ? `${stats.atRiskCount} at risk`
                          : null
                      }
                      icon={<Icons.Active />}
                    />
                  </button>
                  <StatCard
                    label="Priority Completion"
                    value={
                      priorityPercentFaster !== null
                        ? `${Math.round(priorityPercentFaster)}% faster`
                        : "N/A"
                    }
                    subtext={
                      priorityCount > 0
                        ? `${priorityCount} cases vs ${standardCount} standard`
                        : "Insufficient data"
                    }
                    icon={<Icons.Priority />}
                  />
                  <StatCard
                    label="Rush Completion"
                    value={
                      rushPercentFaster !== null
                        ? `${Math.round(rushPercentFaster)}% faster`
                        : "N/A"
                    }
                    subtext={
                      rushCount > 0
                        ? `${rushCount} cases vs ${standardCount} standard`
                        : "Insufficient data"
                    }
                    icon={<Icons.Rush />}
                  />
                </div>
              </div>

              {/* UPDATED PREDICTIONS SECTION */}
              {departmentEfficiency.predictions?.predictions?.length > 0 && (
                <div className="px-8 pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Active Case Risk Analysis
                  </h3>

                  {/* Critical cases alert */}
                  {departmentEfficiency.predictions.byRiskLevel?.critical
                    ?.length > 0 && (
                    <div className="mb-4 p-4 bg-red-100 border border-red-200 rounded-lg">
                      <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                        <Icons.Alert />
                        Critical Risk Cases - Immediate Attention Required
                      </h4>
                      <div className="space-y-2">
                        {departmentEfficiency.predictions.byRiskLevel.critical.map(
                          (pred) => (
                            <div
                              key={pred.id}
                              className="flex justify-between items-center bg-white p-2 rounded"
                            >
                              <span className="font-mono text-sm font-medium">
                                {pred.caseNumber}
                              </span>
                              <div className="text-right">
                                <span className="text-sm text-red-700 font-medium">
                                  Due in {pred.daysUntilDue.toFixed(1)} days
                                </span>
                                <span className="text-xs text-gray-600 ml-2">
                                  {pred.progressPercent.toFixed(0)}% complete
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Risk summary cards */}
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="text-2xl font-bold text-green-700">
                        {departmentEfficiency.predictions.summary.onTrack}
                      </div>
                      <div className="text-sm text-green-600">On Track</div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <div className="text-2xl font-bold text-amber-700">
                        {departmentEfficiency.predictions.summary.atRisk}
                      </div>
                      <div className="text-sm text-amber-600">At Risk</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <div className="text-2xl font-bold text-orange-700">
                        {departmentEfficiency.predictions.summary.high}
                      </div>
                      <div className="text-sm text-orange-600">High Risk</div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                      <div className="text-2xl font-bold text-red-700">
                        {departmentEfficiency.predictions.summary.critical}
                      </div>
                      <div className="text-sm text-red-600">Critical</div>
                    </div>
                  </div>

                  {/* Confidence indicator */}
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-900">
                        Prediction Confidence
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-500"
                            style={{
                              width: `${departmentEfficiency.predictions.summary.averageCompletionConfidence}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-blue-700 font-medium">
                          {departmentEfficiency.predictions.summary.averageCompletionConfidence.toFixed(
                            0
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detailed predictions list */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <h4 className="font-medium text-gray-900">
                        All Active Cases - Risk Assessment
                      </h4>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {departmentEfficiency.predictions.predictions.map(
                        (pred) => (
                          <div
                            key={pred.id}
                            className={`flex justify-between items-center p-3 border-b last:border-b-0 ${
                              pred.riskLevel === "critical"
                                ? "bg-red-50"
                                : pred.riskLevel === "high"
                                ? "bg-orange-50"
                                : pred.riskLevel === "medium"
                                ? "bg-amber-50"
                                : "bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  pred.riskLevel === "critical"
                                    ? "bg-red-600"
                                    : pred.riskLevel === "high"
                                    ? "bg-orange-600"
                                    : pred.riskLevel === "medium"
                                    ? "bg-amber-600"
                                    : "bg-green-600"
                                }`}
                              />
                              <span className="font-mono text-sm font-medium">
                                {pred.caseNumber}
                              </span>
                              {pred.isRush && (
                                <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                  Rush/Priority
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {pred.willBeLate ? (
                                  <span className="text-red-700">
                                    {pred.daysLate.toFixed(1)} days late
                                  </span>
                                ) : (
                                  <span className="text-green-700">
                                    {pred.daysUntilDue.toFixed(1)}d buffer
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600">
                                {pred.progressPercent.toFixed(0)}% •{" "}
                                {pred.confidence} conf
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="px-8 pb-6">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="border-b border-gray-200 p-4">
                    <h3 className="text-lg font-semibold">Case Insights</h3>
                    <div className="mt-3 flex gap-2">
                      <FilterChip
                        active={activeFilter === "all"}
                        onClick={() => setActiveFilter("all")}
                      >
                        All Penalties ({penaltyCases.length})
                      </FilterChip>
                      <FilterChip
                        active={activeFilter === "velocity"}
                        onClick={() => setActiveFilter("velocity")}
                      >
                        Velocity ({velocityPenalties.length})
                      </FilterChip>
                      <FilterChip
                        active={activeFilter === "ontime"}
                        onClick={() => setActiveFilter("ontime")}
                      >
                        On-Time ({onTimePenalties.length})
                      </FilterChip>
                      <FilterChip
                        active={activeFilter === "buffer"}
                        onClick={() => setActiveFilter("buffer")}
                      >
                        Buffer ({stageBufferPenalties.length})
                      </FilterChip>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {activeFilter === "velocity" &&
                    (velocityCases.exceeded.length > 0 ||
                      velocityCases.missed.length > 0) ? (
                      <>
                        {velocityCases.exceeded.length > 0 && (
                          <div className="bg-green-50 p-3">
                            <h4 className="text-sm font-medium text-green-800 mb-2">
                              Exceeded Benchmark (
                              {velocityCases.exceeded.length} cases)
                            </h4>
                            <div className="space-y-1">
                              {velocityCases.exceeded
                                .slice(0, 3)
                                .map((c, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="font-mono">
                                      {c.caseNumber}
                                    </span>
                                    <span className="text-green-700">
                                      {Math.abs(parseFloat(c.percentDiff))}%
                                      faster • {formatDuration(c.actual)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                        {velocityCases.missed.length > 0 && (
                          <div className="bg-red-50 p-3">
                            <h4 className="text-sm font-medium text-red-800 mb-2">
                              Missed Benchmark ({velocityCases.missed.length}{" "}
                              cases)
                            </h4>
                            <div className="space-y-2">
                              {velocityCases.missed
                                .slice(0, 5)
                                .map((c, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-2 bg-white rounded"
                                  >
                                    <span className="font-mono text-sm">
                                      {c.caseNumber}
                                    </span>
                                    <div className="text-right">
                                      <div className="text-red-700 text-sm">
                                        {c.percentDiff}% slower •{" "}
                                        {formatDuration(c.actual)}
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        {formatDuration(c.timeDiffMs)} over
                                        target
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {filteredCases.map((caseItem, idx) => (
                          <CaseInsightRow
                            key={idx}
                            caseData={caseItem}
                            stage={departmentEfficiency.stage}
                            onClick={() => setSelectedCase(caseItem)}
                          />
                        ))}
                        {filteredCases.length === 0 && (
                          <div className="p-8 text-center text-gray-500">
                            No cases with penalties in this category
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-8 pb-8">
                <button
                  onClick={() => setShowConfiguration(!showConfiguration)}
                  className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      System Configuration
                    </h3>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${
                        showConfiguration ? "rotate-180" : ""
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
                  </div>
                </button>

                <AnimatePresence>
                  {showConfiguration && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-6 p-6 bg-gray-50 rounded-xl">
                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            How Efficiency Score is Calculated
                          </h4>
                          <div className="space-y-2 text-sm text-gray-600">
                            <p>
                              The efficiency score combines two key metrics:
                            </p>
                            <ul className="ml-6 space-y-1 list-disc">
                              <li>
                                On-Time Delivery (60% weight): Measures how many
                                cases meet their deadlines
                              </li>
                              <li>
                                Throughput Velocity (40% weight): Measures
                                processing speed against benchmarks
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            Buffer Requirements
                          </h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-white p-3 rounded-lg">
                              <div className="font-medium text-gray-700">
                                Design Stage
                              </div>
                              <div className="text-2xl font-bold text-gray-900">
                                {CONFIG.BUFFER_REQUIREMENTS.design} days
                              </div>
                              <div className="text-xs text-gray-500">
                                before deadline
                              </div>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                              <div className="font-medium text-gray-700">
                                Production Stage
                              </div>
                              <div className="text-2xl font-bold text-gray-900">
                                {CONFIG.BUFFER_REQUIREMENTS.production} day
                              </div>
                              <div className="text-xs text-gray-500">
                                before deadline
                              </div>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                              <div className="font-medium text-gray-700">
                                Finishing Stage
                              </div>
                              <div className="text-2xl font-bold text-gray-900">
                                {CONFIG.BUFFER_REQUIREMENTS.finishing} days
                              </div>
                              <div className="text-xs text-gray-500">
                                completes on deadline
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            Velocity Score Requirements
                          </h4>
                          <div className="space-y-2 text-sm text-gray-600">
                            <p>
                              Velocity scores require minimum case counts to be
                              included in efficiency calculations:
                            </p>
                            <ul className="ml-6 space-y-1 list-disc">
                              <li>General cases: Minimum 10 cases required</li>
                              <li>BBS cases: Minimum 10 cases required</li>
                              <li>3D Flex cases: Minimum 10 cases required</li>
                              <li>
                                Case types with fewer than 10 cases show their
                                velocity score but are excluded from the overall
                                efficiency calculation
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            Risk Prediction System
                          </h4>
                          <div className="space-y-2 text-sm text-gray-600">
                            <p>
                              Active case predictions use the velocity engine
                              to:
                            </p>
                            <ul className="ml-6 space-y-1 list-disc">
                              <li>
                                Calculate expected completion based on
                                historical performance
                              </li>
                              <li>
                                Adjust for current workload vs historical
                                averages
                              </li>
                              <li>
                                Factor in case type (General/BBS/3D Flex)
                                specific benchmarks
                              </li>
                              <li>
                                Provide confidence scores based on data
                                consistency
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            Penalty System
                          </h4>
                          <div className="space-y-2 text-sm text-gray-600">
                            <p>
                              Each stage is only penalized for issues within its
                              control:
                            </p>
                            <ul className="ml-6 space-y-1 list-disc">
                              <li>
                                Design: Buffer violations (up to{" "}
                                {(
                                  CONFIG.BUFFER_PENALTY_WEIGHTS.design * 100
                                ).toFixed(0)}
                                % penalty) + late deliveries in design stage
                              </li>
                              <li>
                                Production: Buffer violations (up to{" "}
                                {(
                                  CONFIG.BUFFER_PENALTY_WEIGHTS.production * 100
                                ).toFixed(0)}
                                % penalty) + late deliveries in production stage
                              </li>
                              <li>
                                Finishing: Only penalized if case goes late
                                during finishing (no buffer penalty)
                              </li>
                              <li>
                                Velocity: Cases exceeding benchmark time by more
                                than 5% receive penalties
                              </li>
                            </ul>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-medium text-gray-900 mb-3">
                            Priority & Rush Performance
                          </h4>
                          <div className="space-y-2 text-sm text-gray-600">
                            <p>
                              Special handling performance is measured by
                              comparing:
                            </p>
                            <ul className="ml-6 space-y-1 list-disc">
                              <li>
                                Priority cases (including priority+rush) vs
                                standard cases
                              </li>
                              <li>Rush-only cases vs standard cases</li>
                              <li>
                                Standard cases are those without priority or
                                rush flags
                              </li>
                              <li>
                                Percentages show how much faster special
                                handling cases complete
                              </li>
                              <li>
                                Minimum 3 cases of each type required for
                                statistics
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export { CaseInspector };
