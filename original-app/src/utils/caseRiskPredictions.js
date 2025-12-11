// src/utils/caseRiskPredictions.js

import { calculateVelocityScore_Enhanced } from "./efficiencyCalculations";

/**
 * Helper function to get end of due day (5 PM or 11:59 PM)
 */
const endOfDueDay = (caseRow) => {
  const base = new Date(caseRow.due);
  // Set to 11:59 PM to match the rest of the system
  base.setUTCHours(23, 59, 59, 999);
  return base;
};

/**
 * Generate predictions for active cases based on velocity engine calculations
 * @param {Array} activeCases - Array of active cases in the current stage
 * @param {Object} throughputAnalysis - Throughput analysis with type statistics
 * @param {String} stage - Current stage being analyzed
 * @param {Object} stageStats - Stage statistics including completions
 * @returns {Object} Predictions and risk analysis
 */
export const generateCaseRiskPredictions = (
  activeCases,
  throughputAnalysis,
  stage = null,
  stageStats = null
) => {
  if (!activeCases || activeCases.length === 0) {
    return {
      atRisk: 0,
      predictions: [],
      urgent: [],
      summary: {
        onTrack: 0,
        atRisk: 0,
        critical: 0,
        averageCompletionConfidence: 0,
      },
    };
  }

  // Get the velocity engine data from throughput analysis
  const getVelocityBenchmark = (caseType) => {
    if (!throughputAnalysis?.byType?.[caseType]) {
      // Fallback to overall median if type-specific data not available
      return throughputAnalysis?.medianTime || 24 * 60 * 60 * 1000; // Default 24 hours
    }

    const typeStats = throughputAnalysis.byType[caseType];

    // Use the adjusted target from velocity engine if available
    if (typeStats.velocityMetrics?.adjustedTarget) {
      return typeStats.velocityMetrics.adjustedTarget;
    }

    // Otherwise use median
    return (
      typeStats.median || throughputAnalysis.medianTime || 24 * 60 * 60 * 1000
    );
  };

  // Process each active case
  const predictions = activeCases.map((activeCase) => {
    const caseType = activeCase.caseType || "general";
    const now = Date.now();

    // Get when the case entered the current stage
    const stageEnteredAt =
      activeCase.stageEnteredAt ||
      activeCase.visits?.[0]?.enteredAt ||
      activeCase.created_at;
    const timeInStageMs = now - new Date(stageEnteredAt).getTime();

    // Get the velocity benchmark for this case type
    const velocityBenchmark = getVelocityBenchmark(caseType);

    // Calculate expected completion time based on velocity engine
    const expectedRemainingTime = Math.max(
      0,
      velocityBenchmark - timeInStageMs
    );
    const expectedCompletionDate = new Date(now + expectedRemainingTime);

    // FIXED: Use endOfDueDay to get the actual deadline (11:59 PM of due date)
    const dueDate = endOfDueDay(activeCase);

    // Calculate progress percentage
    const progressPercent = Math.min(
      100,
      (timeInStageMs / velocityBenchmark) * 100
    );

    // Determine if case will be late
    const willBeLate = expectedCompletionDate > dueDate;
    const daysUntilDue = (dueDate - now) / (1000 * 60 * 60 * 24);
    const expectedDaysToComplete =
      expectedRemainingTime / (1000 * 60 * 60 * 24);

    // Calculate confidence based on historical variance
    const typeStats = throughputAnalysis?.byType?.[caseType];
    let confidence = "medium";
    let confidenceScore = 50;

    if (typeStats?.velocityScore) {
      // Higher velocity score = higher confidence
      confidenceScore = typeStats.velocityScore;
      if (typeStats.velocityScore >= 80) {
        confidence = "high";
      } else if (typeStats.velocityScore < 60) {
        confidence = "low";
      }
    }

    // Adjust confidence based on current load
    const currentLoad = activeCases.length;
    const historicalAvgLoad =
      typeStats?.velocityMetrics?.avgHistoricalActive || currentLoad;
    if (currentLoad > historicalAvgLoad * 1.5) {
      confidence = "low";
      confidenceScore *= 0.8;
    }

    // Determine risk level
    let riskLevel = "low";
    if (willBeLate) {
      if (daysUntilDue < 1) {
        riskLevel = "critical";
      } else if (daysUntilDue < 2) {
        riskLevel = "high";
      } else {
        riskLevel = "medium";
      }
    } else {
      // Even if not late, check if it's cutting close
      const bufferDays = daysUntilDue - expectedDaysToComplete;
      if (bufferDays < 0.5) {
        riskLevel = "medium";
      }
    }

    // Check if case has special modifiers that affect risk
    const isRush = activeCase.rush || activeCase.priority;
    if (isRush && riskLevel !== "low") {
      // Escalate risk for rush/priority cases
      riskLevel = riskLevel === "medium" ? "high" : "critical";
    }

    return {
      id: activeCase.id,
      caseNumber: activeCase.caseNumber || activeCase.casenumber,
      caseType,
      currentStage: stage,

      // Timing metrics
      timeInStageMs,
      expectedRemainingTime,
      velocityBenchmark,
      progressPercent,

      // Dates
      stageEnteredAt,
      expectedCompletionDate,
      dueDate,
      willBeLate,

      // Days calculations
      daysUntilDue,
      expectedDaysToComplete,
      daysLate: willBeLate ? expectedDaysToComplete - daysUntilDue : 0,

      // Risk assessment
      riskLevel,
      confidence,
      confidenceScore,

      // Additional context
      isRush,
      currentLoad,
      historicalAvgLoad,
      velocityScore: typeStats?.velocityScore || 0,

      // Recommendations
      recommendation: generateRecommendation(
        riskLevel,
        daysUntilDue,
        progressPercent,
        isRush
      ),
    };
  });

  // Sort predictions by risk level and days until due
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  predictions.sort((a, b) => {
    if (a.riskLevel !== b.riskLevel) {
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    }
    return a.daysUntilDue - b.daysUntilDue;
  });

  // Calculate summary statistics
  const summary = {
    onTrack: predictions.filter((p) => !p.willBeLate && p.riskLevel === "low")
      .length,
    atRisk: predictions.filter((p) => p.riskLevel === "medium").length,
    high: predictions.filter((p) => p.riskLevel === "high").length,
    critical: predictions.filter((p) => p.riskLevel === "critical").length,
    averageCompletionConfidence:
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.confidenceScore, 0) /
          predictions.length
        : 0,
  };

  return {
    atRisk: predictions.filter((p) => p.willBeLate).length,
    predictions,
    urgent: predictions.filter((p) => p.riskLevel === "critical"),
    high: predictions.filter((p) => p.riskLevel === "high"),
    summary,

    // Group by risk level for easy display
    byRiskLevel: {
      critical: predictions.filter((p) => p.riskLevel === "critical"),
      high: predictions.filter((p) => p.riskLevel === "high"),
      medium: predictions.filter((p) => p.riskLevel === "medium"),
      low: predictions.filter((p) => p.riskLevel === "low"),
    },
  };
};

/**
 * Generate recommendation based on risk assessment
 */
function generateRecommendation(
  riskLevel,
  daysUntilDue,
  progressPercent,
  isRush
) {
  if (riskLevel === "critical") {
    if (progressPercent < 50) {
      return "Immediate escalation required - case significantly behind schedule";
    } else {
      return "Urgent attention needed - due within 24 hours";
    }
  }

  if (riskLevel === "high") {
    if (isRush) {
      return "Priority case at risk - consider resource reallocation";
    }
    return "Monitor closely - may require intervention";
  }

  if (riskLevel === "medium") {
    if (progressPercent > 75) {
      return "Nearly complete but timing is tight";
    }
    return "On track but limited buffer - avoid delays";
  }

  return "On schedule - continue normal processing";
}

/**
 * Calculate risk predictions using the velocity engine directly
 * This is an alternative method that uses the velocity engine more directly
 */
export const calculateRiskWithVelocityEngine = async (
  activeCases,
  stage,
  stageStats,
  previousVelocityScore = null
) => {
  if (!activeCases || activeCases.length === 0 || !stageStats) {
    return {
      predictions: [],
      velocityImpact: null,
    };
  }

  // Group active cases by type
  const casesByType = {
    general: [],
    bbs: [],
    flex: [],
  };

  activeCases.forEach((c) => {
    const type = c.caseType || "general";
    casesByType[type].push(c);
  });

  const predictions = [];

  // Process each case type
  for (const [caseType, cases] of Object.entries(casesByType)) {
    if (cases.length === 0) continue;

    const typeStats = stageStats.typeStats?.[caseType];
    if (!typeStats || !typeStats.completions) continue;

    // Use velocity engine to calculate current performance
    const velocityResult = await calculateVelocityScore_Enhanced(
      stage,
      cases.length,
      cases,
      null,
      typeStats.completions,
      previousVelocityScore
    );

    // Apply velocity insights to each case
    cases.forEach((activeCase) => {
      const adjustedTarget = velocityResult.adjustedTarget || typeStats.median;
      const timeInStage =
        Date.now() -
        new Date(activeCase.stageEnteredAt || activeCase.created_at).getTime();
      const expectedCompletion =
        new Date(activeCase.stageEnteredAt || activeCase.created_at).getTime() +
        adjustedTarget;
      const dueDate = endOfDueDay(activeCase);

      predictions.push({
        ...activeCase,
        velocityScore: velocityResult.velocityScore,
        adjustedTarget,
        expectedCompletion: new Date(expectedCompletion),
        willBeLate: expectedCompletion > dueDate.getTime(),
        velocityMetrics: velocityResult.metrics,
      });
    });
  }

  return {
    predictions,
    velocityImpact: {
      currentLoad: activeCases.length,
      performanceImpact: predictions.map((p) => ({
        caseNumber: p.caseNumber,
        velocityScore: p.velocityScore,
        willBeLate: p.willBeLate,
      })),
    },
  };
};
