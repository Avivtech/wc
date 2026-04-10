import { DEFAULT_SCORING_CONFIG } from "./scoring/index.js";

export function buildSavedPicksSettlementRequest(saved, worldCup) {
  if (!saved || !worldCup) {
    return {
      predictions: [],
      tournamentResults: {},
      matchesById: {},
      resultsByMatchId: {}
    };
  }

  const predictionState = buildSavedPredictionState(saved, worldCup);
  const predictedPlayoffData = getProjectedPlayoffData({
    worldCup,
    groups: predictionState.groups,
    thirdPlaceRanking: predictionState.thirdPlaceRanking,
    selectedThirdTeamIds: predictionState.selectedThirdTeamIds,
    winnerSelections: predictionState.winnerSelections
  });
  const livePlayoffData = getLivePlayoffData(worldCup);
  const playoffScoreData = buildPlayoffScoreData({
    saved,
    predictionState,
    predictedMatches: predictedPlayoffData.projectedMatches,
    liveMatches: livePlayoffData.projectedMatches
  });

  return {
    predictions: [
      ...buildTournamentScorePredictions(saved, predictionState.groups, predictedPlayoffData.projectedMatches),
      ...playoffScoreData.predictions
    ],
    tournamentResults: buildTournamentScoreResults(worldCup, livePlayoffData.projectedMatches),
    matchesById: playoffScoreData.matchesById,
    resultsByMatchId: playoffScoreData.resultsByMatchId
  };
}

export function calculatePredictedBonusPointsForSavedPicks(saved, worldCup, config = DEFAULT_SCORING_CONFIG) {
  if (!saved || !worldCup) {
    return 0;
  }

  const predictionState = buildSavedPredictionState(saved, worldCup);
  const predictedPlayoffData = getProjectedPlayoffData({
    worldCup,
    groups: predictionState.groups,
    thirdPlaceRanking: predictionState.thirdPlaceRanking,
    selectedThirdTeamIds: predictionState.selectedThirdTeamIds,
    winnerSelections: predictionState.winnerSelections
  });
  const tournamentPredictions = buildTournamentScorePredictions(saved, predictionState.groups, predictedPlayoffData.projectedMatches);
  return calculatePredictedBonusPoints(tournamentPredictions, config);
}

export function calculatePredictedBonusPoints(predictions, config = DEFAULT_SCORING_CONFIG) {
  const rewardTable = config?.bonus?.tournament || DEFAULT_SCORING_CONFIG.bonus.tournament;

  return normalizeArray(predictions).reduce((total, prediction) => {
    if (prediction?.pickType === "groupWinner") {
      return total + Number(rewardTable.groupWinner || 0) * countPredictedTeams(prediction);
    }

    if (prediction?.pickType === "champion") {
      return total + Number(rewardTable.champion || 0) * countPredictedTeams(prediction);
    }

    if (prediction?.pickType === "finalist") {
      return total + Number(rewardTable.finalist || 0) * countPredictedTeams(prediction);
    }

    if (prediction?.pickType === "semifinalist") {
      return total + Number(rewardTable.semifinalist || 0) * countPredictedTeams(prediction);
    }

    return total;
  }, 0);
}

export function calculateCurrentScoreFromSettlement(settlement) {
  const totalPoints = Number(settlement?.totalPoints || 0);
  const timingPoints = Number(settlement?.timingPoints || 0);

  if (!Number.isFinite(totalPoints) || !Number.isFinite(timingPoints)) {
    return 0;
  }

  return totalPoints - timingPoints;
}

export function resolveSavedHomeTeam(saved, worldCup) {
  const stored = saved?.homeTeam && typeof saved.homeTeam === "object" ? saved.homeTeam : null;

  if (!stored) {
    return null;
  }

  const teamLookup = buildWorldCupTeamLookup(worldCup);
  const byId = stored.teamId != null ? teamLookup.get(getTeamIdKey(stored.teamId)) : null;
  const byCode = !byId && stored.teamCode
    ? [...teamLookup.values()].find((team) => normalizeLookupValue(team.code) === normalizeLookupValue(stored.teamCode))
    : null;
  const byName = !byId && !byCode && stored.teamName
    ? [...teamLookup.values()].find((team) => normalizeLookupValue(team.name) === normalizeLookupValue(stored.teamName))
    : null;
  const resolved = byId || byCode || byName;

  return {
    teamId: resolved?.id ?? stored.teamId ?? null,
    teamCode: resolved?.code ?? stored.teamCode ?? null,
    teamName: resolved?.name ?? stored.teamName ?? null,
    teamLogo: resolved?.logo ?? stored.teamLogo ?? null
  };
}

function buildSavedPredictionState(saved, worldCup) {
  const orderByGroup = new Map(
    normalizeArray(saved?.groupRankings).map((entry) => [
      String(entry?.group || "").trim().toUpperCase(),
      normalizeArray(entry?.teamIds).map(getTeamIdKey)
    ])
  );
  const groups = cloneGroups(normalizeArray(worldCup?.groups)).map((group) => {
    const preferredOrder = orderByGroup.get(String(group?.letter || "").trim().toUpperCase()) || [];
    const orderMap = new Map(preferredOrder.map((teamId, index) => [teamId, index]));

    group.teams.sort((left, right) => {
      const leftOrder = orderMap.has(getTeamIdKey(left.id)) ? orderMap.get(getTeamIdKey(left.id)) : Number.POSITIVE_INFINITY;
      const rightOrder = orderMap.has(getTeamIdKey(right.id)) ? orderMap.get(getTeamIdKey(right.id)) : Number.POSITIVE_INFINITY;
      return leftOrder - rightOrder;
    });
    group.teams.forEach((team, index) => {
      team.standing = {
        ...(team.standing || {}),
        rank: index + 1
      };
    });

    return group;
  });
  const thirdPlaceRanking = deriveThirdPlaceRanking(
    groups,
    normalizeArray(saved?.thirdPlaceRanking).map((entry) => getTeamIdKey(entry?.teamId))
  );
  const selectedThirdTeamIds = chooseThirdPlaceSelections(
    normalizeArray(saved?.bestThirdAdvancers).map((entry) => getTeamIdKey(entry?.teamId)),
    thirdPlaceRanking
  );
  const winnerSelections = Object.fromEntries(
    normalizeArray(saved?.knockoutWinners)
      .map((entry) => {
        const matchKey = String(entry?.match || "").trim();
        const teamKey = getTeamIdKey(entry?.teamId);

        if (!matchKey || !teamKey) {
          return null;
        }

        return [matchKey, teamKey];
      })
      .filter(Boolean)
  );
  const scorePredictions = Object.fromEntries(
    normalizeArray(saved?.knockoutScorePredictions)
      .map((entry) => {
        const matchKey = String(entry?.match || "").trim();

        if (!matchKey) {
          return null;
        }

        const normalizedEntry = {
          home: normalizeBracketScoreStoredValue(entry?.homeGoals),
          away: normalizeBracketScoreStoredValue(entry?.awayGoals)
        };

        if (!normalizedEntry.home && !normalizedEntry.away) {
          return null;
        }

        return [matchKey, normalizedEntry];
      })
      .filter(Boolean)
  );

  return {
    groups,
    thirdPlaceRanking,
    selectedThirdTeamIds,
    winnerSelections,
    scorePredictions
  };
}

function buildTournamentScorePredictions(saved, groups, projectedMatches) {
  const predictions = [];
  const groupsCreatedAt = getSectionPredictionTimestamp(saved, "groups");

  for (const group of groups) {
    const winner = group?.teams?.[0];

    if (!winner?.id) {
      continue;
    }

    predictions.push({
      predictionId: `group-winner-${group.letter}`,
      pickType: "groupWinner",
      group: group.letter,
      teamId: winner.id,
      createdAt: groupsCreatedAt
    });
  }

  const playoffsCreatedAt = getSectionPredictionTimestamp(saved, "playoffs");
  const semifinalistTeamIds = collectStageTeamIds(projectedMatches, "Semi-finals", 4);
  const finalistTeamIds = collectStageTeamIds(projectedMatches, "Final", 2);
  const championTeamId = getStageWinnerTeamId(projectedMatches, "Final");

  if (semifinalistTeamIds.length === 4) {
    predictions.push({
      predictionId: "semifinalists",
      pickType: "semifinalist",
      teamIds: semifinalistTeamIds,
      createdAt: playoffsCreatedAt
    });
  }

  if (finalistTeamIds.length === 2) {
    predictions.push({
      predictionId: "finalists",
      pickType: "finalist",
      teamIds: finalistTeamIds,
      createdAt: playoffsCreatedAt
    });
  }

  if (championTeamId) {
    predictions.push({
      predictionId: "champion",
      pickType: "champion",
      teamId: championTeamId,
      createdAt: playoffsCreatedAt
    });
  }

  return predictions;
}

function buildTournamentScoreResults(worldCup, liveProjectedMatches) {
  const groups = normalizeArray(worldCup?.groups);
  const liveGroupWinners = Object.fromEntries(
    groups
      .filter(isLiveGroupComplete)
      .map((group) => [group.letter, group?.teams?.[0]?.id])
      .filter(([, teamId]) => teamId != null)
  );

  return {
    groupWinners: liveGroupWinners,
    semifinalistTeamIds: collectStageTeamIds(liveProjectedMatches, "Semi-finals", 4),
    finalistTeamIds: collectStageTeamIds(liveProjectedMatches, "Final", 2),
    championTeamId: getStageWinnerTeamId(liveProjectedMatches, "Final")
  };
}

function buildPlayoffScoreData({ saved, predictionState, predictedMatches, liveMatches }) {
  const playoffsCreatedAt = getSectionPredictionTimestamp(saved, "playoffs");
  const liveMatchMap = new Map(normalizeArray(liveMatches).map((match) => [String(match.match), match]));
  const predictions = [];
  const matchesById = {};
  const resultsByMatchId = {};

  for (const predictedMatch of normalizeArray(predictedMatches)) {
    const matchKey = String(predictedMatch?.match || "").trim();

    if (!matchKey) {
      continue;
    }

    const liveMatch = liveMatchMap.get(matchKey);

    if (!doProjectedPlayoffTeamsMatchLiveMatch(predictedMatch, liveMatch)) {
      continue;
    }

    const homeGoals = getStoredBracketScoreValue(predictionState.scorePredictions, matchKey, "home");
    const awayGoals = getStoredBracketScoreValue(predictionState.scorePredictions, matchKey, "away");
    const selectedWinner = getSelectedWinnerSide(predictedMatch, predictionState.winnerSelections);
    const hasCompleteScore = homeGoals !== null && awayGoals !== null;

    if (!hasCompleteScore && !selectedWinner?.team?.id) {
      continue;
    }

    predictions.push({
      predictionId: `playoff-match-${matchKey}`,
      matchId: matchKey,
      createdAt: playoffsCreatedAt,
      homeGoals,
      awayGoals,
      winnerTeamId: selectedWinner?.team?.id ?? null
    });
    matchesById[matchKey] = createScoringPlayoffMatch(liveMatch, matchKey);
    resultsByMatchId[matchKey] = createScoringPlayoffResult(liveMatch);
  }

  return {
    predictions,
    matchesById,
    resultsByMatchId
  };
}

function getSectionPredictionTimestamp(saved, section) {
  const explicitSubmittedAt = saved?.sectionSubmittedAt?.[section];

  if (typeof explicitSubmittedAt === "string" && explicitSubmittedAt.trim()) {
    return explicitSubmittedAt.trim();
  }

  const legacySubmittedAt = typeof saved?.submittedAt === "string" && saved.submittedAt.trim() ? saved.submittedAt.trim() : null;
  return legacySubmittedAt;
}

function cloneGroups(groups) {
  return normalizeArray(groups).map((group) => ({
    ...group,
    teams: normalizeArray(group?.teams).map((team) => ({
      ...team,
      standing: { ...(team?.standing || {}) }
    })),
    fixtures: normalizeArray(group?.fixtures).map((fixture) => ({ ...fixture }))
  }));
}

function buildWorldCupTeamLookup(worldCup) {
  const lookup = new Map();

  for (const group of normalizeArray(worldCup?.groups)) {
    for (const team of normalizeArray(group?.teams)) {
      const teamKey = getTeamIdKey(team?.id);

      if (teamKey && !lookup.has(teamKey)) {
        lookup.set(teamKey, team);
      }
    }
  }

  return lookup;
}

function deriveThirdPlaceRanking(groups, preferredOrder = []) {
  const teams = normalizeArray(groups)
    .map((group) => group?.teams?.[2])
    .filter(Boolean);
  const orderMap = new Map(normalizeArray(preferredOrder).map((teamId, index) => [getTeamIdKey(teamId), index]));

  return [...teams].sort((left, right) => {
    const leftOrder = orderMap.has(getTeamIdKey(left.id)) ? orderMap.get(getTeamIdKey(left.id)) : Number.POSITIVE_INFINITY;
    const rightOrder = orderMap.has(getTeamIdKey(right.id)) ? orderMap.get(getTeamIdKey(right.id)) : Number.POSITIVE_INFINITY;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return compareTeams(left, right);
  });
}

function compareTeams(left, right) {
  const pointsDelta = toNumericStanding(right?.standing?.points, Number.NEGATIVE_INFINITY) - toNumericStanding(left?.standing?.points, Number.NEGATIVE_INFINITY);

  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const goalDifferenceDelta =
    toNumericStanding(right?.standing?.goalDifference, Number.NEGATIVE_INFINITY) -
    toNumericStanding(left?.standing?.goalDifference, Number.NEGATIVE_INFINITY);

  if (goalDifferenceDelta !== 0) {
    return goalDifferenceDelta;
  }

  const goalsForDelta = toNumericStanding(right?.standing?.goalsFor, Number.NEGATIVE_INFINITY) - toNumericStanding(left?.standing?.goalsFor, Number.NEGATIVE_INFINITY);

  if (goalsForDelta !== 0) {
    return goalsForDelta;
  }

  return `${left?.groupLetter || ""}${left?.name || ""}`.localeCompare(`${right?.groupLetter || ""}${right?.name || ""}`);
}

function chooseThirdPlaceSelections(preferredIds, thirdPlaceRanking) {
  const availableIds = new Set(normalizeArray(thirdPlaceRanking).map((team) => getTeamIdKey(team?.id)));

  return Array.from(
    new Set(normalizeArray(preferredIds).map(getTeamIdKey).filter((teamId) => availableIds.has(teamId)))
  ).slice(0, 8);
}

function countPredictedTeams(prediction) {
  if (prediction?.teamId != null) {
    return 1;
  }

  return normalizeArray(prediction?.teamIds).length;
}

function getSelectedBestThirdTeams(selectedThirdTeamIds, thirdPlaceRanking) {
  const teamMap = new Map(normalizeArray(thirdPlaceRanking).map((team) => [getTeamIdKey(team?.id), team]));
  return normalizeArray(selectedThirdTeamIds)
    .map((teamId) => teamMap.get(getTeamIdKey(teamId)))
    .filter(Boolean);
}

function getCurrentQualifiers({ groups, thirdPlaceRanking, selectedThirdTeamIds }) {
  return {
    winners: normalizeArray(groups).map((group) => group?.teams?.[0]).filter(Boolean),
    runnersUp: normalizeArray(groups).map((group) => group?.teams?.[1]).filter(Boolean),
    bestThird: getSelectedBestThirdTeams(selectedThirdTeamIds, thirdPlaceRanking)
  };
}

function getProjectedPlayoffData({
  worldCup,
  groups = [],
  thirdPlaceRanking = [],
  selectedThirdTeamIds = [],
  winnerSelections = {},
  liveFixtureMap = null
} = {}) {
  const knockoutTemplate = normalizeArray(worldCup?.playoffBoard?.knockoutTemplate);

  if (!knockoutTemplate.length) {
    return {
      projectedMatches: [],
      thirdPlaceAssignments: new Map(),
      qualifiers: {
        winners: [],
        runnersUp: [],
        bestThird: []
      }
    };
  }

  const qualifiers = getCurrentQualifiers({ groups, thirdPlaceRanking, selectedThirdTeamIds });
  const thirdPlaceAssignments = buildThirdPlaceAssignments(knockoutTemplate, qualifiers.bestThird);
  const projectedMatchMap = new Map();
  const projectedMatches = knockoutTemplate.map((match) => {
    const projectedMatch = projectMatch(match, {
      groups,
      bestThird: qualifiers.bestThird,
      thirdPlaceAssignments,
      projectedMatchMap,
      winnerSelections,
      liveFixture: liveFixtureMap?.get(match.match) || null
    });
    const selectedWinner = getSelectedWinnerSide(projectedMatch, winnerSelections);
    projectedMatch.selectedWinnerTeamId = selectedWinner?.team ? getTeamIdKey(selectedWinner.team.id) : "";
    projectedMatchMap.set(projectedMatch.match, projectedMatch);
    return projectedMatch;
  });

  return {
    qualifiers,
    projectedMatches,
    thirdPlaceAssignments
  };
}

function getLivePlayoffData(worldCup) {
  if (!hasLiveTournamentStarted(worldCup)) {
    return getProjectedPlayoffData({
      worldCup,
      groups: [],
      thirdPlaceRanking: [],
      selectedThirdTeamIds: [],
      winnerSelections: {}
    });
  }

  const knockoutTemplate = normalizeArray(worldCup?.playoffBoard?.knockoutTemplate);
  const liveFixtureMap = buildLiveKnockoutFixtureMap(knockoutTemplate, normalizeArray(worldCup?.fixtures));
  const liveWinnerSelections = buildLiveWinnerSelections(liveFixtureMap);

  return getProjectedPlayoffData({
    worldCup,
    groups: normalizeArray(worldCup?.groups),
    thirdPlaceRanking: normalizeArray(worldCup?.thirdPlaceRanking),
    selectedThirdTeamIds: getLiveSelectedThirdTeamIds(worldCup),
    winnerSelections: liveWinnerSelections,
    liveFixtureMap
  });
}

function getLiveSelectedThirdTeamIds(worldCup) {
  if (!hasLiveTournamentStarted(worldCup)) {
    return [];
  }

  const liveAdvancers = normalizeArray(worldCup?.playoffBoard?.advancingThirdPlaces).length
    ? normalizeArray(worldCup?.playoffBoard?.advancingThirdPlaces)
    : normalizeArray(worldCup?.thirdPlaceRanking).slice(0, 8);

  return liveAdvancers.map((team) => getTeamIdKey(team?.id)).filter(Boolean);
}

function hasLiveTournamentStarted(worldCup) {
  return normalizeArray(worldCup?.fixtures).some(
    (fixture) => isGroupStageStage(fixture?.stage) && hasFixtureStarted(fixture)
  );
}

function hasFixtureStarted(fixture) {
  return !["NS", "TBD"].includes(String(fixture?.status?.short || "").toUpperCase());
}

function isGroupStageStage(stage) {
  return String(stage || "").toLowerCase() === "group stage";
}

function buildThirdPlaceAssignments(knockoutTemplate, selectedTeams) {
  const slots = normalizeArray(knockoutTemplate)
    .flatMap((match) => [
      { key: createThirdPlaceSlotKey(match.match, "home"), match: match.match, source: match.homeSource, index: 0 },
      { key: createThirdPlaceSlotKey(match.match, "away"), match: match.match, source: match.awaySource, index: 1 }
    ])
    .filter((slot) => slot.source?.type === "thirdEligible")
    .map((slot, index) => ({
      ...slot,
      index,
      groups: normalizeArray(slot.source?.groups)
    }));

  if (!normalizeArray(selectedTeams).length || !slots.length) {
    return new Map();
  }

  const teamOrder = new Map(normalizeArray(selectedTeams).map((team, index) => [getTeamIdKey(team?.id), index]));
  const teamEntries = normalizeArray(selectedTeams)
    .map((team) => ({
      team,
      slots: slots
        .filter((slot) => slot.groups.includes(team?.groupLetter))
        .sort((left, right) => left.index - right.index)
    }))
    .sort((left, right) => {
      const slotDelta = left.slots.length - right.slots.length;

      if (slotDelta !== 0) {
        return slotDelta;
      }

      return (teamOrder.get(getTeamIdKey(left.team?.id)) ?? 0) - (teamOrder.get(getTeamIdKey(right.team?.id)) ?? 0);
    });

  const assignments = new Map();
  const usedSlotKeys = new Set();

  function assignTeam(index) {
    if (index >= teamEntries.length) {
      return true;
    }

    const entry = teamEntries[index];

    for (const slot of entry.slots) {
      if (usedSlotKeys.has(slot.key)) {
        continue;
      }

      usedSlotKeys.add(slot.key);
      assignments.set(slot.key, entry.team);

      if (assignTeam(index + 1)) {
        return true;
      }

      assignments.delete(slot.key);
      usedSlotKeys.delete(slot.key);
    }

    return false;
  }

  return assignTeam(0) ? assignments : new Map();
}

function createThirdPlaceSlotKey(matchId, side) {
  return `${matchId}:${side}`;
}

function projectMatch(match, projectionContext) {
  const projectedMatch = {
    ...match,
    home: resolveProjectedSide(match.homeSource, projectionContext, createThirdPlaceSlotKey(match.match, "home")),
    away: resolveProjectedSide(match.awaySource, projectionContext, createThirdPlaceSlotKey(match.match, "away"))
  };

  return projectionContext.liveFixture ? applyLiveFixtureToProjectedMatch(projectedMatch, projectionContext.liveFixture) : projectedMatch;
}

function resolveProjectedSide(source, projectionContext, thirdPlaceSlotKey = "") {
  const {
    groups = [],
    thirdPlaceAssignments = new Map(),
    projectedMatchMap = new Map(),
    winnerSelections = {}
  } = projectionContext;

  if (source?.type === "groupPlacement") {
    const group = normalizeArray(groups).find((entry) => entry?.letter === source.group);
    const team = group?.teams?.[source.placement - 1] || null;

    return {
      type: "team",
      label: `${source.group}${source.placement}`,
      groupSlot: `${source.group}${source.placement}`,
      team
    };
  }

  if (source?.type === "thirdEligible") {
    const assignedTeam = thirdPlaceAssignments.get(thirdPlaceSlotKey) || null;

    if (assignedTeam) {
      return {
        type: "team",
        label: `${assignedTeam.groupLetter}3`,
        groupSlot: `${assignedTeam.groupLetter}3`,
        team: assignedTeam
      };
    }

    return {
      type: "thirdEligible",
      label: `3rd ${normalizeArray(source.groups).join("/")}`,
      candidates: []
    };
  }

  if (source?.type === "matchWinner" || source?.type === "matchLoser") {
    return resolveLinkedMatchSide(source, projectedMatchMap, winnerSelections);
  }

  return createMatchLinkSide(source);
}

function resolveLinkedMatchSide(source, projectedMatchMap, winnerSelections) {
  const sourceMatch = projectedMatchMap.get(source?.match);

  if (!sourceMatch) {
    return createMatchLinkSide(source);
  }

  const selectedWinner = getSelectedWinnerSide(sourceMatch, winnerSelections);

  if (!selectedWinner) {
    return createMatchLinkSide(source);
  }

  if (source.type === "matchWinner") {
    return cloneProjectedTeamSide(selectedWinner);
  }

  const losingSide = selectedWinner === sourceMatch.home ? sourceMatch.away : sourceMatch.home;

  if (losingSide?.type !== "team" || !losingSide.team) {
    return createMatchLinkSide(source);
  }

  return cloneProjectedTeamSide(losingSide);
}

function cloneProjectedTeamSide(side) {
  return {
    ...side,
    team: side?.team || null
  };
}

function createMatchLinkSide(source) {
  return {
    type: "matchLink",
    label: source?.type === "matchLoser" ? `Loser match ${source?.match ?? ""}` : `Winner match ${source?.match ?? ""}`,
    match: source?.match ?? null
  };
}

function applyLiveFixtureToProjectedMatch(projectedMatch, fixture) {
  return {
    ...projectedMatch,
    id: fixture?.id ?? projectedMatch.id,
    date: fixture?.date || projectedMatch.date,
    timestamp: fixture?.timestamp ?? projectedMatch.timestamp ?? null,
    venue: fixture?.venue?.name || projectedMatch.venue,
    status: fixture?.status || projectedMatch.status || null,
    goals: fixture?.goals || projectedMatch.goals || null,
    score: fixture?.score || projectedMatch.score || null,
    home: createLiveFixtureSide(fixture?.teams?.home, projectedMatch.home),
    away: createLiveFixtureSide(fixture?.teams?.away, projectedMatch.away)
  };
}

function createLiveFixtureSide(team, fallbackSide) {
  if (!team?.id) {
    return fallbackSide;
  }

  const teamKey = getTeamIdKey(team.id);
  const fallbackGroupSlot = fallbackSide?.type === "team" && fallbackSide.team && getTeamIdKey(fallbackSide.team.id) === teamKey
    ? fallbackSide.groupSlot || fallbackSide.team.groupLetter || ""
    : team.groupLetter || "";

  return {
    type: "team",
    label: fallbackGroupSlot || String(team.code || team.name || ""),
    groupSlot: fallbackGroupSlot,
    team
  };
}

function buildLiveKnockoutFixtureMap(knockoutTemplate, fixtures) {
  const templateStages = new Set(normalizeArray(knockoutTemplate).map((match) => match?.stage));
  const liveKnockoutFixtures = normalizeArray(fixtures).filter((fixture) => templateStages.has(fixture?.stage));
  const fixtureMap = new Map();

  for (const stage of templateStages) {
    const stageTemplates = normalizeArray(knockoutTemplate)
      .filter((match) => match?.stage === stage)
      .sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime() || Number(left?.match || 0) - Number(right?.match || 0));
    const remainingFixtures = liveKnockoutFixtures
      .filter((fixture) => fixture?.stage === stage)
      .sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime() || String(left?.venue?.name || "").localeCompare(String(right?.venue?.name || "")));

    for (const templateMatch of stageTemplates) {
      if (!remainingFixtures.length) {
        break;
      }

      const templateDateKey = getCalendarDateKey(getFixtureDate(templateMatch));
      const sameDayCandidates = remainingFixtures
        .map((fixture, index) => ({ fixture, index }))
        .filter(({ fixture }) => getCalendarDateKey(getFixtureDate(fixture)) === templateDateKey);
      const exactVenueCandidate = sameDayCandidates.find(
        ({ fixture }) => normalizeVenueMatchValue(fixture?.venue?.name) === normalizeVenueMatchValue(templateMatch?.venue)
      );
      const fixtureIndex = exactVenueCandidate ? exactVenueCandidate.index : sameDayCandidates.length === 1 ? sameDayCandidates[0].index : 0;
      const [matchedFixture] = remainingFixtures.splice(fixtureIndex, 1);

      if (matchedFixture) {
        fixtureMap.set(templateMatch.match, matchedFixture);
      }
    }
  }

  return fixtureMap;
}

function buildLiveWinnerSelections(liveFixtureMap) {
  return Object.fromEntries(
    Array.from(liveFixtureMap.entries())
      .map(([matchId, fixture]) => [String(matchId), getFixtureWinnerTeamId(fixture)])
      .filter(([, teamId]) => teamId)
  );
}

function getFixtureWinnerTeamId(fixture) {
  const homeTeam = fixture?.teams?.home;
  const awayTeam = fixture?.teams?.away;

  if (homeTeam?.winner === true) {
    return getTeamIdKey(homeTeam.id);
  }

  if (awayTeam?.winner === true) {
    return getTeamIdKey(awayTeam.id);
  }

  if (!isCompletedFixtureStatus(fixture?.status?.short)) {
    return "";
  }

  const homeScore = getResolvedFixtureScore(fixture, "home");
  const awayScore = getResolvedFixtureScore(fixture, "away");

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
    return "";
  }

  return getTeamIdKey(homeScore > awayScore ? homeTeam?.id : awayTeam?.id);
}

function doProjectedPlayoffTeamsMatchLiveMatch(predictedMatch, liveMatch) {
  const predictedHomeId = getTeamIdKey(predictedMatch?.home?.team?.id);
  const predictedAwayId = getTeamIdKey(predictedMatch?.away?.team?.id);
  const liveHomeId = getTeamIdKey(liveMatch?.home?.team?.id);
  const liveAwayId = getTeamIdKey(liveMatch?.away?.team?.id);

  return Boolean(predictedHomeId && predictedAwayId && liveHomeId && liveAwayId && predictedHomeId === liveHomeId && predictedAwayId === liveAwayId);
}

function createScoringPlayoffMatch(match, matchKey) {
  return {
    id: matchKey,
    matchId: matchKey,
    date: match?.date ?? null,
    status: match?.status ?? null,
    home: match?.home?.team ?? null,
    away: match?.away?.team ?? null
  };
}

function createScoringPlayoffResult(match) {
  return {
    goals: match?.goals ?? null,
    score: match?.score ?? null,
    status: match?.status ?? null,
    settled: isCompletedFixtureStatus(match?.status?.short)
  };
}

function getSelectedWinnerSide(match, winnerSelections) {
  const selectedTeamId = winnerSelections?.[String(match?.match || "")];

  if (!selectedTeamId) {
    return null;
  }

  if (match?.home?.type === "team" && match.home.team && getTeamIdKey(match.home.team.id) === selectedTeamId) {
    return match.home;
  }

  if (match?.away?.type === "team" && match.away.team && getTeamIdKey(match.away.team.id) === selectedTeamId) {
    return match.away;
  }

  return null;
}

function getResolvedFixtureScore(fixture, side) {
  for (const value of [
    fixture?.score?.penalty?.[side],
    fixture?.score?.extratime?.[side],
    fixture?.score?.fulltime?.[side],
    fixture?.goals?.[side]
  ]) {
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return Number.NaN;
}

function isCompletedFixtureStatus(status) {
  return ["FT", "AET", "PEN", "AWD", "WO"].includes(String(status || "").toUpperCase());
}

function isLiveGroupComplete(group) {
  const fixtures = normalizeArray(group?.fixtures);
  return fixtures.length > 0 && fixtures.every((fixture) => isCompletedFixtureStatus(fixture?.status?.short));
}

function collectStageTeamIds(matches, stage, expectedCount = 0) {
  const teamIds = Array.from(
    new Set(
      normalizeArray(matches)
        .filter((match) => match?.stage === stage)
        .flatMap((match) => [match?.home, match?.away])
        .filter((side) => side?.type === "team" && side?.team?.id != null)
        .map((side) => getTeamIdKey(side.team.id))
    )
  );

  if (expectedCount > 0 && teamIds.length !== expectedCount) {
    return [];
  }

  return teamIds;
}

function getStageWinnerTeamId(matches, stage) {
  const match = normalizeArray(matches).find((entry) => entry?.stage === stage);
  const winner = match ? getSelectedWinnerSide(match, match.selectedWinnerTeamId ? { [String(match.match)]: match.selectedWinnerTeamId } : {}) : null;
  return winner?.team?.id != null ? getTeamIdKey(winner.team.id) : "";
}

function getFixtureDate(fixture) {
  const timestamp = fixture?.timestamp;

  if (timestamp !== null && timestamp !== undefined && timestamp !== "" && Number.isFinite(Number(timestamp))) {
    return new Date(Number(timestamp) * 1000);
  }

  return parseFixtureDateValue(fixture?.date);
}

function parseFixtureDateValue(value) {
  const text = String(value || "");
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

function getCalendarDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function normalizeVenueMatchValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getStoredBracketScoreValue(scorePredictions, matchId, side) {
  const entry = scorePredictions?.[String(matchId || "").trim()] || null;
  const value = normalizeBracketScoreStoredValue(side === "away" ? entry?.away : entry?.home);
  return value === "" ? null : Number(value);
}

function normalizeBracketScoreStoredValue(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return String(Math.max(0, Math.floor(parsed)));
}

function getTeamIdKey(teamId) {
  if (teamId == null) {
    return "";
  }

  return String(teamId);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumericStanding(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}
