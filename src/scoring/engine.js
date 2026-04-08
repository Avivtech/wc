import { DEFAULT_SCORING_CONFIG, createScoringConfig } from "./config.js";

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const MATCH_OUTCOMES = {
  HOME: "home",
  AWAY: "away",
  DRAW: "draw"
};

export function calculatePredictionScore({
  prediction,
  match = null,
  result = null,
  config = DEFAULT_SCORING_CONFIG,
  context = {}
} = {}) {
  if (!prediction || typeof prediction !== "object") {
    throw new Error("A prediction object is required.");
  }

  const resolvedConfig = createScoringConfig(config);

  if (isTournamentPrediction(prediction)) {
    return calculateTournamentPredictionScore({
      prediction,
      result,
      config: resolvedConfig,
      context
    });
  }

  return calculateMatchPredictionScore({
    prediction,
    match,
    result,
    config: resolvedConfig,
    context
  });
}

export function calculateMatchPredictionScore({
  prediction,
  match,
  result = null,
  config = DEFAULT_SCORING_CONFIG,
  context = {}
} = {}) {
  if (!prediction || typeof prediction !== "object") {
    throw new Error("A prediction object is required.");
  }

  if (!match || typeof match !== "object") {
    throw new Error("A match object is required for match prediction scoring.");
  }

  const resolvedConfig = createScoringConfig(config);
  const normalizedMatch = normalizeMatch(match, context);
  const normalizedPrediction = normalizePrediction(prediction, normalizedMatch);
  const normalizedResult = normalizeResult(result ?? match, normalizedMatch);
  const totals = createScoreAccumulator();
  const accuracyState = {
    correctChecks: 0,
    exactScore: false
  };

  applyTimingPoints(totals, normalizedPrediction, normalizedMatch, resolvedConfig, context);
  applyAccuracyPoints(totals, accuracyState, normalizedPrediction, normalizedResult, resolvedConfig);
  applyDifficultyPoints(
    totals,
    normalizedPrediction,
    normalizedMatch,
    normalizedResult,
    resolvedConfig
  );
  applyBonusPoints(totals, accuracyState, resolvedConfig);
  applyPenaltyPoints(totals, normalizedPrediction, normalizedMatch, resolvedConfig);

  return finalizeScore({
    totals,
    maxTotalPoints: resolvedConfig.caps.match.maxTotalPoints,
    minTotalPoints: resolvedConfig.caps.match.minTotalPoints,
    predictionId: getPredictionIdentifier(prediction),
    predictionType: "match",
    matchId: normalizedMatch.id
  });
}

export function calculateTournamentPredictionScore({
  prediction,
  result,
  config = DEFAULT_SCORING_CONFIG,
  context = {}
} = {}) {
  if (!prediction || typeof prediction !== "object") {
    throw new Error("A prediction object is required.");
  }

  const resolvedConfig = createScoringConfig(config);
  const normalizedPrediction = normalizeTournamentPrediction(prediction);
  const normalizedResult = normalizeTournamentResult(result);
  const totals = createScoreAccumulator();
  const createdAt = toDate(
    prediction.createdAt ??
      prediction.submittedAt ??
      prediction.postedAt ??
      prediction.timestamp ??
      null
  );
  const tournamentStartAt = resolveTournamentStartAt(null, context);

  if (createdAt && tournamentStartAt && createdAt < tournamentStartAt) {
    addBreakdownItem(
      totals,
      "timingPoints",
      "Timing bonus",
      resolvedConfig.timing.beforeTournamentStart,
      "Prediction was submitted before the tournament started."
    );
  }

  const reward = getTournamentPickReward(
    normalizedPrediction,
    normalizedResult,
    resolvedConfig
  );

  if (reward) {
    addBreakdownItem(
      totals,
      "bonusPoints",
      reward.label,
      reward.points,
      reward.reason
    );
  }

  applyPenaltyPoints(totals, normalizePredictionAudit(prediction), null, resolvedConfig);

  return finalizeScore({
    totals,
    maxTotalPoints: resolvedConfig.caps.tournament.maxTotalPoints,
    minTotalPoints: resolvedConfig.caps.tournament.minTotalPoints,
    predictionId: getPredictionIdentifier(prediction),
    predictionType: "tournament",
    matchId: normalizedPrediction.matchId ?? null
  });
}

export function settlePredictions({
  predictions = [],
  matchesById = {},
  resultsByMatchId = {},
  tournamentResults = {},
  config = DEFAULT_SCORING_CONFIG,
  context = {}
} = {}) {
  const resolvedConfig = createScoringConfig(config);
  const scorecards = [];
  const aggregate = createScoreAccumulator();
  const matchLookup = toLookupMap(matchesById);
  const resultLookup = toLookupMap(resultsByMatchId);

  for (const prediction of Array.isArray(predictions) ? predictions : []) {
    try {
      const scorecard = isTournamentPrediction(prediction)
        ? calculateTournamentPredictionScore({
            prediction,
            result: tournamentResults,
            config: resolvedConfig,
            context
          })
        : calculateMatchPredictionScore({
            prediction,
            match: matchLookup.get(String(prediction?.matchId ?? prediction?.fixtureId ?? "")),
            result: resultLookup.get(String(prediction?.matchId ?? prediction?.fixtureId ?? "")),
            config: resolvedConfig,
            context
          });

      scorecards.push(scorecard);
      mergeAggregateScore(aggregate, scorecard);
    } catch (error) {
      scorecards.push({
        totalPoints: 0,
        timingPoints: 0,
        difficultyPoints: 0,
        accuracyPoints: 0,
        bonusPoints: 0,
        penaltyPoints: 0,
        capAdjustmentPoints: 0,
        breakdown: [
          {
            category: "penaltyPoints",
            label: "Settlement skipped",
            value: 0,
            reason: error instanceof Error ? error.message : "Prediction could not be scored."
          }
        ],
        predictionId: getPredictionIdentifier(prediction),
        predictionType: isTournamentPrediction(prediction) ? "tournament" : "match",
        matchId: prediction?.matchId ?? prediction?.fixtureId ?? null
      });
    }
  }

  return finalizeScore({
    totals: aggregate,
    maxTotalPoints: Number.POSITIVE_INFINITY,
    minTotalPoints: Number.NEGATIVE_INFINITY,
    predictionType: "batch",
    matchId: null,
    scorecards
  });
}

export function buildScoringMatchFromFixture(fixture, options = {}) {
  return normalizeMatch(fixture, options);
}

export function buildScoringResultFromFixture(fixture) {
  return normalizeResult(fixture, normalizeMatch(fixture));
}

function applyTimingPoints(totals, prediction, match, config, context) {
  const createdAt = prediction.createdAt;
  const matchStartAt = match.startAt;
  const tournamentStartAt = resolveTournamentStartAt(match, context);

  if (!createdAt) {
    return;
  }

  if (tournamentStartAt && createdAt < tournamentStartAt) {
    addBreakdownItem(
      totals,
      "timingPoints",
      "Timing bonus",
      config.timing.beforeTournamentStart,
      "Prediction was submitted before the tournament started."
    );
    return;
  }

  if (!matchStartAt) {
    return;
  }

  if (createdAt < matchStartAt) {
    addBreakdownItem(
      totals,
      "timingPoints",
      "Timing bonus",
      config.timing.beforeMatchStart,
      "Prediction was submitted before kickoff."
    );
    return;
  }

  const halfTimeCutoff = new Date(
    matchStartAt.getTime() + config.timing.halfTimeMinutes * 60 * 1000
  );

  if (createdAt < halfTimeCutoff) {
    addBreakdownItem(
      totals,
      "timingPoints",
      "Timing bonus",
      config.timing.beforeHalfTime,
      "Prediction was submitted after kickoff but before halftime."
    );
  }
}

function applyAccuracyPoints(totals, accuracyState, prediction, result, config) {
  if (!hasSettledScore(result)) {
    return;
  }

  if (prediction.outcome && prediction.outcome === result.outcome) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Correct result",
      config.accuracy.correctOutcome,
      `Predicted ${formatOutcomeLabel(prediction.outcome)} correctly.`
    );
  }

  if (
    Number.isFinite(prediction.homeGoals) &&
    Number.isFinite(prediction.awayGoals) &&
    prediction.homeGoals === result.homeGoals &&
    prediction.awayGoals === result.awayGoals
  ) {
    accuracyState.correctChecks += 1;
    accuracyState.exactScore = true;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Exact score",
      config.accuracy.exactScore,
      `Predicted the exact scoreline ${result.homeGoals}-${result.awayGoals}.`
    );
  }

  if (
    Number.isFinite(prediction.goalDifference) &&
    prediction.goalDifference === result.goalDifference
  ) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Goal difference",
      config.accuracy.correctGoalDifference,
      `Predicted the correct goal difference of ${result.goalDifference}.`
    );
  }

  if (Number.isFinite(prediction.totalGoals) && prediction.totalGoals === result.totalGoals) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Total goals",
      config.accuracy.correctTotalGoals,
      `Predicted the correct total goals tally of ${result.totalGoals}.`
    );
  }

  if (
    typeof prediction.bothTeamsToScore === "boolean" &&
    typeof result.bothTeamsToScore === "boolean" &&
    prediction.bothTeamsToScore === result.bothTeamsToScore
  ) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Both teams to score",
      config.accuracy.correctBothTeamsToScore,
      prediction.bothTeamsToScore
        ? "Correctly predicted that both teams would score."
        : "Correctly predicted that at least one team would fail to score."
    );
  }

  if (
    prediction.firstScorer &&
    result.firstScorer &&
    areScorerPredictionsEqual(prediction.firstScorer, result.firstScorer)
  ) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "First scorer",
      config.accuracy.correctFirstScorer,
      "Predicted the first scorer correctly."
    );
  }

  if (prediction.cleanSheet && isCleanSheetPredictionCorrect(prediction.cleanSheet, result.cleanSheet)) {
    accuracyState.correctChecks += 1;
    addBreakdownItem(
      totals,
      "accuracyPoints",
      "Clean sheet",
      config.accuracy.correctCleanSheet,
      "Predicted the clean sheet outcome correctly."
    );
  }
}

function applyDifficultyPoints(totals, prediction, match, result, config) {
  if (!hasSettledScore(result) || prediction.outcome !== result.outcome) {
    return;
  }

  const predictedWinner = getPredictedWinnerTeam(match, prediction.outcome);
  const predictedLoser = getOpposingTeam(match, prediction.outcome);

  if (predictedWinner && predictedLoser) {
    const rankingBonus = calculateRankingUpsetBonus(
      predictedWinner,
      predictedLoser,
      config
    );

    if (rankingBonus > 0) {
      addBreakdownItem(
        totals,
        "difficultyPoints",
        "Ranking upset",
        rankingBonus,
        `Predicted ${predictedWinner.name} to beat a higher-ranked opponent.`
      );
    }

    const historicalBonus = calculateHistoricalStrengthBonus(
      predictedWinner,
      predictedLoser,
      config
    );

    if (historicalBonus > 0) {
      addBreakdownItem(
        totals,
        "difficultyPoints",
        "Historical strength bonus",
        historicalBonus,
        `Predicted against the team with the stronger World Cup record.`
      );
    }

    const hostBonus = calculateHostFadeBonus(predictedWinner, predictedLoser, match, config);

    if (hostBonus > 0) {
      addBreakdownItem(
        totals,
        "difficultyPoints",
        "Host fade bonus",
        hostBonus,
        `Predicted against host nation ${predictedLoser.name}.`
      );
    }

    const formBonus = calculateRecentFormUpsetBonus(
      predictedWinner,
      predictedLoser,
      config
    );

    if (formBonus > 0) {
      addBreakdownItem(
        totals,
        "difficultyPoints",
        "Recent form upset",
        formBonus,
        `Predicted the team with weaker recent form to win.`
      );
    }
  }

  if (prediction.outcome === MATCH_OUTCOMES.DRAW) {
    const drawBonus = calculateDrawUpsetBonus(match, config);

    if (drawBonus > 0) {
      addBreakdownItem(
        totals,
        "difficultyPoints",
        "Draw upset",
        drawBonus,
        "Predicted a draw between unevenly matched teams."
      );
    }
  }
}

function applyBonusPoints(totals, accuracyState, config) {
  if (accuracyState.correctChecks >= config.bonus.combo.minCorrectChecks) {
    const extraCorrectChecks = accuracyState.correctChecks - config.bonus.combo.minCorrectChecks;
    const comboPoints = Math.min(
      config.bonus.combo.maxPoints,
      config.bonus.combo.basePoints + extraCorrectChecks * config.bonus.combo.extraPerCorrectCheck
    );

    addBreakdownItem(
      totals,
      "bonusPoints",
      "Combo bonus",
      comboPoints,
      `Hit ${accuracyState.correctChecks} related checks on the same prediction.`
    );
  }

  if (
    accuracyState.exactScore &&
    totals.difficultyPoints >= config.bonus.jackpot.minimumDifficultyPoints
  ) {
    addBreakdownItem(
      totals,
      "bonusPoints",
      "Jackpot bonus",
      config.bonus.jackpot.points,
      "Combined an exact score with a major upset prediction."
    );
  }
}

function applyPenaltyPoints(totals, prediction, match, config) {
  const audit = normalizePredictionAudit(prediction);
  const attemptsOnMatch = audit.predictionsOnMatchCount;

  if (attemptsOnMatch > config.penalties.maxPredictionsPerMatch) {
    const extraPredictions = attemptsOnMatch - config.penalties.maxPredictionsPerMatch;
    const penalty = Math.max(
      config.penalties.extraPredictionOnSameMatch.minTotalPoints,
      extraPredictions * config.penalties.extraPredictionOnSameMatch.pointsPerExtraPrediction
    );

    addBreakdownItem(
      totals,
      "penaltyPoints",
      "Repeat prediction penalty",
      penalty,
      `Submitted ${attemptsOnMatch} predictions on the same match.`
    );
  }

  if (audit.editedAfterPosting) {
    addBreakdownItem(
      totals,
      "penaltyPoints",
      "Edit penalty",
      config.penalties.editedAfterPosting,
      "Prediction was edited after it was first posted."
    );
  }

  if (isPredictionAfterLockTime(audit, prediction, match, config)) {
    addBreakdownItem(
      totals,
      "penaltyPoints",
      "Late prediction penalty",
      config.penalties.afterLockTime,
      "Prediction was submitted after the lock time."
    );
  }

  if (audit.isCopiedPrediction) {
    addBreakdownItem(
      totals,
      "penaltyPoints",
      "Anti-copying penalty",
      config.penalties.antiCopying,
      "Prediction was flagged as a duplicate or copied entry."
    );
  }
}

function getTournamentPickReward(prediction, result, config) {
  if (!prediction.pickType || !prediction.teamIds.length || !result) {
    return null;
  }

  if (prediction.pickType === "groupWinner") {
    const actualWinnerId = result.groupWinners?.[prediction.group] ?? null;

    if (actualWinnerId && prediction.teamIds.includes(String(actualWinnerId))) {
      return {
        label: "Tournament pick",
        points: config.bonus.tournament.groupWinner,
        reason: `Correctly predicted the winner of Group ${prediction.group}.`
      };
    }

    return null;
  }

  const actualTeamIds =
    prediction.pickType === "champion"
      ? [result.championTeamId]
      : prediction.pickType === "finalist"
        ? result.finalistTeamIds
        : result.semifinalistTeamIds;

  if (!Array.isArray(actualTeamIds) || !actualTeamIds.length) {
    return null;
  }

  const matchedTeams = prediction.teamIds.filter((teamId) => actualTeamIds.includes(teamId));

  if (!matchedTeams.length) {
    return null;
  }

  const rewardTable = config.bonus.tournament;
  const rewardValue =
    prediction.pickType === "champion"
      ? rewardTable.champion
      : prediction.pickType === "finalist"
        ? rewardTable.finalist
        : rewardTable.semifinalist;

  return {
    label: "Tournament pick",
    points: rewardValue * matchedTeams.length,
    reason: `Correct ${prediction.pickType} pick${matchedTeams.length > 1 ? "s" : ""}.`
  };
}

function calculateRankingUpsetBonus(predictedWinner, predictedLoser, config) {
  const winnerRank = toFiniteNumber(predictedWinner.fifaGlobalRanking);
  const loserRank = toFiniteNumber(predictedLoser.fifaGlobalRanking);

  if (!Number.isFinite(winnerRank) || !Number.isFinite(loserRank) || winnerRank <= loserRank) {
    return 0;
  }

  const gap = winnerRank - loserRank;
  const rule = config.difficulty.rankingUpset;
  return scaleGapPoints(gap, rule.rankingGapStep, rule.basePoints, rule.perGapStep, rule.maxPoints);
}

function calculateDrawUpsetBonus(match, config) {
  const homeRank = toFiniteNumber(match.teams.home.fifaGlobalRanking);
  const awayRank = toFiniteNumber(match.teams.away.fifaGlobalRanking);

  if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) {
    return 0;
  }

  const gap = Math.abs(homeRank - awayRank);
  const rule = config.difficulty.drawUpset;

  if (gap < rule.minRankingGap) {
    return 0;
  }

  return scaleGapPoints(gap, rule.rankingGapStep, rule.basePoints, rule.perGapStep, rule.maxPoints);
}

function calculateHistoricalStrengthBonus(predictedWinner, predictedLoser, config) {
  const winnerStrength = getHistoricalStrength(predictedWinner, config);
  const loserStrength = getHistoricalStrength(predictedLoser, config);
  const rule = config.difficulty.historicalStrength;

  if (!Number.isFinite(winnerStrength) || !Number.isFinite(loserStrength)) {
    return 0;
  }

  const gap = loserStrength - winnerStrength;

  if (gap < rule.minStrengthGap) {
    return 0;
  }

  return scaleGapPoints(gap, rule.strengthGapStep, rule.basePoints, rule.perGapStep, rule.maxPoints);
}

function calculateHostFadeBonus(predictedWinner, predictedLoser, match, config) {
  if (!predictedWinner || !predictedLoser) {
    return 0;
  }

  const hostCountries = new Set((match.hostCountries || []).map(normalizeLookupKey));
  const loserIsHost = predictedLoser.isHost || hostCountries.has(normalizeLookupKey(predictedLoser.country ?? predictedLoser.name));
  const winnerIsHost = predictedWinner.isHost || hostCountries.has(normalizeLookupKey(predictedWinner.country ?? predictedWinner.name));

  if (loserIsHost && !winnerIsHost) {
    return config.difficulty.hostAdvantageFade.points;
  }

  return 0;
}

function calculateRecentFormUpsetBonus(predictedWinner, predictedLoser, config) {
  const winnerFormScore = getRecentFormScore(predictedWinner, config);
  const loserFormScore = getRecentFormScore(predictedLoser, config);
  const rule = config.difficulty.recentFormUpset;

  if (!Number.isFinite(winnerFormScore) || !Number.isFinite(loserFormScore)) {
    return 0;
  }

  const gap = loserFormScore - winnerFormScore;

  if (gap < rule.minFormGap) {
    return 0;
  }

  return scaleGapPoints(gap, rule.formGapStep, rule.basePoints, rule.perGapStep, rule.maxPoints);
}

function scaleGapPoints(gap, stepSize, basePoints, perGapStep, maxPoints) {
  if (!Number.isFinite(gap) || gap <= 0) {
    return 0;
  }

  const extraSteps = Math.max(0, Math.floor(gap / Math.max(1, stepSize)) - 1);
  return Math.min(maxPoints, basePoints + extraSteps * perGapStep);
}

function finalizeScore({
  totals,
  maxTotalPoints,
  minTotalPoints,
  predictionId = null,
  predictionType = "match",
  matchId = null,
  scorecards = undefined
}) {
  const unclampedTotal =
    totals.timingPoints +
    totals.difficultyPoints +
    totals.accuracyPoints +
    totals.bonusPoints +
    totals.penaltyPoints;
  const cappedTotal = clampNumber(unclampedTotal, minTotalPoints, maxTotalPoints);
  const capAdjustmentPoints = cappedTotal - unclampedTotal;

  if (capAdjustmentPoints !== 0) {
    totals.breakdown.push({
      category: "capAdjustmentPoints",
      label: "Score cap",
      value: capAdjustmentPoints,
      reason:
        capAdjustmentPoints < 0
          ? `Score was capped at ${maxTotalPoints} points for this prediction type.`
          : `Score floor was applied at ${minTotalPoints} points for this prediction type.`
    });
  }

  const response = {
    totalPoints: cappedTotal,
    timingPoints: totals.timingPoints,
    difficultyPoints: totals.difficultyPoints,
    accuracyPoints: totals.accuracyPoints,
    bonusPoints: totals.bonusPoints,
    penaltyPoints: totals.penaltyPoints,
    capAdjustmentPoints,
    breakdown: totals.breakdown,
    predictionId,
    predictionType,
    matchId
  };

  if (scorecards) {
    response.scorecards = scorecards;
  }

  return response;
}

function addBreakdownItem(totals, category, label, value, reason) {
  if (!Number.isFinite(value) || value === 0) {
    return;
  }

  totals[category] += value;
  totals.breakdown.push({
    category,
    label,
    value,
    reason
  });
}

function createScoreAccumulator() {
  return {
    timingPoints: 0,
    difficultyPoints: 0,
    accuracyPoints: 0,
    bonusPoints: 0,
    penaltyPoints: 0,
    breakdown: []
  };
}

function mergeAggregateScore(aggregate, scorecard) {
  aggregate.timingPoints += scorecard.timingPoints;
  aggregate.difficultyPoints += scorecard.difficultyPoints;
  aggregate.accuracyPoints += scorecard.accuracyPoints;
  aggregate.bonusPoints += scorecard.bonusPoints;
  aggregate.penaltyPoints += scorecard.penaltyPoints;
  aggregate.breakdown.push({
    category: "scorecard",
    label: "Prediction settled",
    value: scorecard.totalPoints,
    reason: `Settled ${scorecard.predictionType} prediction ${scorecard.predictionId ?? ""}`.trim()
  });
}

function normalizeMatch(match, context = {}) {
  const homeTeam = normalizeTeam(match?.teams?.home ?? match?.homeTeam ?? match?.home ?? null, "home", context);
  const awayTeam = normalizeTeam(match?.teams?.away ?? match?.awayTeam ?? match?.away ?? null, "away", context);
  const hostCountries = Array.isArray(context.hostCountries)
    ? context.hostCountries
    : Array.isArray(match?.hostCountries)
      ? match.hostCountries
      : [];

  return {
    id: String(match?.id ?? match?.matchId ?? match?.fixtureId ?? "").trim() || null,
    startAt: toDate(match?.date ?? match?.startAt ?? match?.kickoffAt ?? match?.scheduledAt ?? null),
    tournamentStartAt: resolveTournamentStartAt(match, context),
    status: normalizeStatus(match?.status),
    hostCountries,
    teams: {
      home: homeTeam,
      away: awayTeam
    }
  };
}

function normalizeTeam(team, side, context = {}) {
  const entity = team?.team && typeof team.team === "object" ? team.team : team;
  const history = entity?.history ?? entity?.worldCupHistory ?? entity?.tournamentHistory ?? null;

  return {
    side,
    id: entity?.id != null ? String(entity.id) : null,
    name: entity?.name ?? entity?.teamName ?? entity?.country ?? side,
    code: entity?.code ?? entity?.fifaCode ?? null,
    country: entity?.country ?? entity?.name ?? null,
    fifaGlobalRanking: toFiniteNumber(
      entity?.fifaGlobalRanking ??
        entity?.ranking?.global ??
        entity?.ranking ??
        entity?.rank
    ),
    fifaGlobalRankingPoints: toFiniteNumber(
      entity?.fifaGlobalRankingPoints ?? entity?.rankingPoints ?? null
    ),
    teamScores: {
      overallStrength: toFiniteNumber(
        entity?.teamScores?.overallStrength ?? entity?.strength?.overall ?? null
      ),
      attack: toFiniteNumber(entity?.teamScores?.attack ?? entity?.strength?.attack ?? null),
      defense: toFiniteNumber(entity?.teamScores?.defense ?? entity?.strength?.defense ?? null),
      penalties: toFiniteNumber(
        entity?.teamScores?.penalties ?? entity?.strength?.penalties ?? null
      )
    },
    standing: {
      form: entity?.standing?.form ?? entity?.form ?? entity?.recentForm ?? null
    },
    history,
    isHost: Boolean(
      entity?.isHost ||
        context.hostCountries?.some(
          (country) => normalizeLookupKey(country) === normalizeLookupKey(entity?.country ?? entity?.name)
        )
    )
  };
}

function normalizeResult(result, normalizedMatch = null) {
  const homeGoals = toFiniteNumber(
    result?.homeGoals ??
      result?.goals?.home ??
      result?.score?.fulltime?.home ??
      result?.score?.extratime?.home ??
      result?.score?.penalty?.home ??
      null
  );
  const awayGoals = toFiniteNumber(
    result?.awayGoals ??
      result?.goals?.away ??
      result?.score?.fulltime?.away ??
      result?.score?.extratime?.away ??
      result?.score?.penalty?.away ??
      null
  );
  const settled = Number.isFinite(homeGoals) && Number.isFinite(awayGoals);
  const cleanSheet = settled
    ? {
        home: awayGoals === 0,
        away: homeGoals === 0
      }
    : null;
  const firstScorer = normalizeScorer(
    result?.firstScorer ??
      result?.events?.find?.((event) => normalizeLookupKey(event?.type) === "goal") ??
      null
  );

  return {
    homeGoals,
    awayGoals,
    totalGoals: settled ? homeGoals + awayGoals : null,
    goalDifference: settled ? homeGoals - awayGoals : null,
    outcome: settled ? getOutcomeFromScore(homeGoals, awayGoals) : null,
    bothTeamsToScore:
      settled ? homeGoals > 0 && awayGoals > 0 : toBoolean(result?.bothTeamsToScore),
    cleanSheet,
    firstScorer,
    status: normalizeStatus(result?.status ?? normalizedMatch?.status ?? null),
    settled:
      settled &&
      (toBoolean(result?.settled) ||
        FINISHED_STATUSES.has(normalizeLookupKey(result?.status?.short ?? result?.status ?? "")) ||
        FINISHED_STATUSES.has(normalizeLookupKey(normalizedMatch?.status?.short ?? normalizedMatch?.status ?? "")) ||
        toBoolean(result?.isFinal))
  };
}

function normalizePrediction(prediction, match = null) {
  const homeGoals = toFiniteNumber(
    prediction?.homeGoals ?? prediction?.score?.home ?? prediction?.prediction?.homeGoals ?? null
  );
  const awayGoals = toFiniteNumber(
    prediction?.awayGoals ?? prediction?.score?.away ?? prediction?.prediction?.awayGoals ?? null
  );
  const cleanSheet = normalizeCleanSheetPrediction(prediction?.cleanSheet ?? prediction?.cleanSheetTeamId ?? null, match);

  return {
    ...normalizePredictionAudit(prediction),
    predictionId: getPredictionIdentifier(prediction),
    matchId: String(prediction?.matchId ?? prediction?.fixtureId ?? match?.id ?? "").trim() || null,
    createdAt: toDate(
      prediction?.createdAt ??
        prediction?.submittedAt ??
        prediction?.postedAt ??
        prediction?.timestamp ??
        null
    ),
    updatedAt: toDate(prediction?.updatedAt ?? prediction?.editedAt ?? null),
    lockAt: toDate(prediction?.lockAt ?? prediction?.lockedAt ?? null),
    homeGoals,
    awayGoals,
    totalGoals: toFiniteNumber(
      prediction?.totalGoals ?? (Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? homeGoals + awayGoals : null)
    ),
    goalDifference: toFiniteNumber(
      prediction?.goalDifference ??
        (Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? homeGoals - awayGoals : null)
    ),
    bothTeamsToScore:
      typeof prediction?.bothTeamsToScore === "boolean"
        ? prediction.bothTeamsToScore
        : Number.isFinite(homeGoals) && Number.isFinite(awayGoals)
          ? homeGoals > 0 && awayGoals > 0
          : null,
    cleanSheet,
    firstScorer: normalizeScorer(
      prediction?.firstScorer ?? {
        playerId: prediction?.firstScorerPlayerId ?? null,
        teamId: prediction?.firstScorerTeamId ?? null,
        playerName: prediction?.firstScorerName ?? null
      }
    ),
    outcome: normalizePredictionOutcome(prediction, homeGoals, awayGoals, match)
  };
}

function normalizeTournamentPrediction(prediction) {
  const tournamentPick =
    prediction?.tournamentPick && typeof prediction.tournamentPick === "object"
      ? prediction.tournamentPick
      : prediction;

  const teamIds = normalizeArray(
    tournamentPick.teamIds ??
      tournamentPick.teamId ??
      tournamentPick.predictedTeamIds ??
      tournamentPick.predictedTeamId ??
      null
  ).map((teamId) => String(teamId));

  return {
    matchId: prediction?.matchId ?? null,
    pickType: String(
      tournamentPick.pickType ??
        tournamentPick.type ??
        tournamentPick.market ??
        ""
    ).trim(),
    group: tournamentPick.group ? String(tournamentPick.group).trim().toUpperCase() : null,
    teamIds
  };
}

function normalizeTournamentResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const groupWinners = {};
  const rawGroupWinners = result.groupWinners ?? result.groupWinnerTeamIds ?? {};

  if (rawGroupWinners && typeof rawGroupWinners === "object") {
    for (const [group, teamId] of Object.entries(rawGroupWinners)) {
      groupWinners[String(group).trim().toUpperCase()] = String(teamId);
    }
  }

  return {
    championTeamId: result.championTeamId ? String(result.championTeamId) : null,
    finalistTeamIds: normalizeArray(result.finalistTeamIds ?? result.finalists ?? []).map(String),
    semifinalistTeamIds: normalizeArray(result.semifinalistTeamIds ?? result.semifinalists ?? []).map(String),
    groupWinners
  };
}

function normalizePredictionAudit(prediction) {
  const createdAt = toDate(
    prediction?.createdAt ??
      prediction?.submittedAt ??
      prediction?.postedAt ??
      prediction?.timestamp ??
      null
  );
  const updatedAt = toDate(prediction?.updatedAt ?? prediction?.editedAt ?? null);
  const postedAt = toDate(prediction?.postedAt ?? prediction?.createdAt ?? prediction?.submittedAt ?? null);
  const audit = prediction?.audit && typeof prediction.audit === "object" ? prediction.audit : {};

  return {
    ...prediction,
    createdAt,
    updatedAt,
    postedAt,
    predictionsOnMatchCount:
      toFiniteNumber(
        audit.predictionsOnMatchCount ??
          audit.attemptsOnMatch ??
          prediction?.predictionsOnMatchCount ??
          prediction?.attemptsOnMatch ??
          1
      ) || 1,
    editedAfterPosting:
      toBoolean(audit.editedAfterPosting) ||
      toBoolean(prediction?.editedAfterPosting) ||
      Boolean(updatedAt && postedAt && updatedAt.getTime() > postedAt.getTime()),
    submittedAfterLock:
      toBoolean(audit.submittedAfterLock) || toBoolean(prediction?.submittedAfterLock),
    isCopiedPrediction:
      toBoolean(audit.isCopiedPrediction) ||
      toBoolean(prediction?.isCopiedPrediction) ||
      Boolean(audit.copiedFromPredictionId ?? prediction?.copiedFromPredictionId)
  };
}

function normalizeCleanSheetPrediction(value, match) {
  if (value == null) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if ("home" in value || "away" in value) {
      return {
        home: toBoolean(value.home),
        away: toBoolean(value.away)
      };
    }

    if ("teamId" in value || "side" in value) {
      const teamId = value.teamId != null ? String(value.teamId) : null;
      const side = value.side ? String(value.side) : resolveSideByTeamId(match, teamId);
      return {
        home: side === "home",
        away: side === "away"
      };
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const side = resolveSideByTeamId(match, String(value));
    if (side) {
      return {
        home: side === "home",
        away: side === "away"
      };
    }
  }

  return null;
}

function normalizePredictionOutcome(prediction, homeGoals, awayGoals, match) {
  if (Number.isFinite(homeGoals) && Number.isFinite(awayGoals)) {
    return getOutcomeFromScore(homeGoals, awayGoals);
  }

  const outcome = normalizeLookupKey(
    prediction?.outcome ?? prediction?.result ?? prediction?.pick ?? ""
  );

  if (outcome === MATCH_OUTCOMES.HOME || outcome === MATCH_OUTCOMES.AWAY || outcome === MATCH_OUTCOMES.DRAW) {
    return outcome;
  }

  const winnerTeamId = prediction?.winnerTeamId != null ? String(prediction.winnerTeamId) : null;
  const winnerSide = resolveSideByTeamId(match, winnerTeamId);
  return winnerSide || null;
}

function normalizeScorer(scorer) {
  if (!scorer || typeof scorer !== "object") {
    return null;
  }

  return {
    playerId:
      scorer.playerId != null
        ? String(scorer.playerId)
        : scorer.player?.id != null
          ? String(scorer.player.id)
          : null,
    teamId:
      scorer.teamId != null
        ? String(scorer.teamId)
        : scorer.team?.id != null
          ? String(scorer.team.id)
          : null,
    playerName:
      scorer.playerName ??
      scorer.player?.name ??
      scorer.name ??
      null
  };
}

function normalizeStatus(status) {
  if (!status) {
    return { short: null, long: null };
  }

  if (typeof status === "string") {
    return {
      short: status,
      long: status
    };
  }

  return {
    short: status.short ?? null,
    long: status.long ?? null
  };
}

function getPredictedWinnerTeam(match, outcome) {
  if (outcome === MATCH_OUTCOMES.HOME) {
    return match.teams.home;
  }

  if (outcome === MATCH_OUTCOMES.AWAY) {
    return match.teams.away;
  }

  return null;
}

function getOpposingTeam(match, outcome) {
  if (outcome === MATCH_OUTCOMES.HOME) {
    return match.teams.away;
  }

  if (outcome === MATCH_OUTCOMES.AWAY) {
    return match.teams.home;
  }

  return null;
}

function getHistoricalStrength(team, config) {
  const history = team?.history ?? {};
  const weights = config.difficulty.historicalStrength.weights;
  const titles = toFiniteNumber(
    history.worldCupTitles ??
      history.worldCupWins ??
      history.titles ??
      history.wins ??
      null
  );
  const goals = toFiniteNumber(
    history.worldCupGoals ??
      history.goals ??
      history.totalGoals ??
      null
  );
  const appearances = toFiniteNumber(
    history.appearances ??
      history.worldCupAppearances ??
      history.tournamentAppearances ??
      null
  );
  const winRate = toFiniteNumber(
    history.winRate ??
      history.worldCupWinRate ??
      history.tournamentWinRate ??
      null
  );

  const weighted = [
    Number.isFinite(titles) ? titles * weights.worldCupTitles : null,
    Number.isFinite(goals) ? goals * weights.worldCupGoals : null,
    Number.isFinite(appearances) ? appearances * weights.appearances : null,
    Number.isFinite(winRate) ? winRate * weights.winRate : null
  ].filter(Number.isFinite);

  if (!weighted.length) {
    return null;
  }

  return weighted.reduce((sum, value) => sum + value, 0);
}

function getRecentFormScore(team, config) {
  const form = String(team?.standing?.form ?? "").trim().toUpperCase();

  if (!form) {
    return null;
  }

  const weights = config.difficulty.recentFormUpset.weights;
  const score = form
    .split("")
    .map((entry) => weights[entry] ?? null)
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);

  return Number.isFinite(score) ? score : null;
}

function isPredictionAfterLockTime(audit, prediction, match, config) {
  if (audit.submittedAfterLock) {
    return true;
  }

  const createdAt = prediction?.createdAt ?? audit.createdAt ?? null;

  if (!createdAt || !match?.startAt) {
    return false;
  }

  const lockAt =
    prediction?.lockAt ??
    new Date(match.startAt.getTime() - config.lock.minutesBeforeKickoff * 60 * 1000);

  return createdAt.getTime() > lockAt.getTime();
}

function hasSettledScore(result) {
  return Boolean(result?.settled && Number.isFinite(result.homeGoals) && Number.isFinite(result.awayGoals));
}

function isTournamentPrediction(prediction) {
  const type = normalizeLookupKey(
    prediction?.type ?? prediction?.kind ?? prediction?.pickType ?? prediction?.tournamentPick?.pickType ?? ""
  );

  return type === "tournament" || type === "champion" || type === "finalist" || type === "semifinalist" || type === "groupwinner";
}

function areScorerPredictionsEqual(predicted, actual) {
  if (!predicted || !actual) {
    return false;
  }

  if (predicted.playerId && actual.playerId) {
    return predicted.playerId === actual.playerId;
  }

  if (predicted.teamId && actual.teamId) {
    return predicted.teamId === actual.teamId;
  }

  return normalizeLookupKey(predicted.playerName) === normalizeLookupKey(actual.playerName);
}

function isCleanSheetPredictionCorrect(predicted, actual) {
  if (!predicted || !actual) {
    return false;
  }

  if (typeof predicted.home === "boolean" && typeof actual.home === "boolean" && predicted.home !== actual.home) {
    return false;
  }

  if (typeof predicted.away === "boolean" && typeof actual.away === "boolean" && predicted.away !== actual.away) {
    return false;
  }

  return true;
}

function getOutcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) {
    return MATCH_OUTCOMES.HOME;
  }

  if (awayGoals > homeGoals) {
    return MATCH_OUTCOMES.AWAY;
  }

  return MATCH_OUTCOMES.DRAW;
}

function formatOutcomeLabel(outcome) {
  if (outcome === MATCH_OUTCOMES.HOME) {
    return "the home win";
  }

  if (outcome === MATCH_OUTCOMES.AWAY) {
    return "the away win";
  }

  return "the draw";
}

function resolveTournamentStartAt(match, context = {}) {
  return toDate(
    context?.tournamentStartAt ??
      match?.tournamentStartAt ??
      match?.competition?.startAt ??
      match?.competition?.dateRange?.start ??
      null
  );
}

function resolveSideByTeamId(match, teamId) {
  if (!match || !teamId) {
    return null;
  }

  if (match?.teams?.home?.id != null && String(match.teams.home.id) === String(teamId)) {
    return MATCH_OUTCOMES.HOME;
  }

  if (match?.teams?.away?.id != null && String(match.teams.away.id) === String(teamId)) {
    return MATCH_OUTCOMES.AWAY;
  }

  return null;
}

function getPredictionIdentifier(prediction) {
  return prediction?.id ?? prediction?.predictionId ?? prediction?.key ?? null;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null || value === "") {
    return [];
  }

  return [value];
}

function toLookupMap(value) {
  if (value instanceof Map) {
    return value;
  }

  const entries = value && typeof value === "object" ? Object.entries(value) : [];
  return new Map(entries.map(([key, entry]) => [String(key), entry]));
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeLookupKey(value);
    if (normalized === "true" || normalized === "yes") {
      return true;
    }

    if (normalized === "false" || normalized === "no") {
      return false;
    }
  }

  return Boolean(value);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
