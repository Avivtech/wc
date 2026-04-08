export const DEFAULT_SCORING_CONFIG = Object.freeze({
  caps: {
    match: {
      maxTotalPoints: 75,
      minTotalPoints: -20
    },
    tournament: {
      maxTotalPoints: 40,
      minTotalPoints: -10
    }
  },
  timing: {
    beforeTournamentStart: 12,
    beforeMatchStart: 7,
    beforeHalfTime: 3,
    afterHalfTime: 0,
    halfTimeMinutes: 45
  },
  difficulty: {
    rankingUpset: {
      basePoints: 2,
      perGapStep: 1,
      rankingGapStep: 10,
      maxPoints: 8
    },
    drawUpset: {
      basePoints: 2,
      perGapStep: 1,
      rankingGapStep: 15,
      minRankingGap: 20,
      maxPoints: 6
    },
    historicalStrength: {
      basePoints: 2,
      perGapStep: 1,
      strengthGapStep: 12,
      minStrengthGap: 12,
      maxPoints: 6,
      weights: {
        worldCupTitles: 10,
        worldCupGoals: 0.1,
        appearances: 2,
        winRate: 35
      }
    },
    hostAdvantageFade: {
      points: 4
    },
    recentFormUpset: {
      basePoints: 2,
      perGapStep: 1,
      formGapStep: 4,
      minFormGap: 4,
      maxPoints: 6,
      weights: {
        W: 3,
        D: 1,
        L: 0
      }
    }
  },
  accuracy: {
    correctOutcome: 10,
    exactScore: 15,
    correctGoalDifference: 6,
    correctTotalGoals: 4,
    correctBothTeamsToScore: 4,
    correctFirstScorer: 6,
    correctCleanSheet: 5
  },
  bonus: {
    combo: {
      minCorrectChecks: 3,
      basePoints: 5,
      extraPerCorrectCheck: 1,
      maxPoints: 8
    },
    jackpot: {
      points: 10,
      minimumDifficultyPoints: 8,
      requiresExactScore: true
    },
    tournament: {
      champion: 30,
      finalist: 18,
      semifinalist: 12,
      groupWinner: 8
    }
  },
  penalties: {
    maxPredictionsPerMatch: 1,
    extraPredictionOnSameMatch: {
      pointsPerExtraPrediction: -2,
      minTotalPoints: -8
    },
    editedAfterPosting: -3,
    afterLockTime: -10,
    antiCopying: -5
  },
  lock: {
    minutesBeforeKickoff: 0
  }
});

export function createScoringConfig(overrides = {}) {
  return deepMerge(DEFAULT_SCORING_CONFIG, overrides);
}

function deepMerge(base, overrides) {
  if (!isPlainObject(base)) {
    return cloneValue(overrides === undefined ? base : overrides);
  }

  const result = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(isPlainObject(overrides) ? overrides : {})
  ]);

  for (const key of keys) {
    const baseValue = base[key];
    const overrideValue = isPlainObject(overrides) ? overrides[key] : undefined;

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
      continue;
    }

    result[key] = cloneValue(overrideValue === undefined ? baseValue : overrideValue);
  }

  return result;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return deepMerge({}, value);
  }

  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
