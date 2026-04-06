const state = {
  worldCup: null,
  groups: [],
  thirdPlaceRanking: [],
  saveStatus: "",
  downloadUrl: "",
  loading: true
};

let dragPayload = null;

const elements = {
  summaryGrid: document.getElementById("summary-grid"),
  groupsGrid: document.getElementById("groups-grid"),
  thirdPlaceCard: document.getElementById("third-place-card"),
  playoffBoard: document.getElementById("playoff-board"),
  fixturesFeed: document.getElementById("fixtures-feed"),
  roundsFeed: document.getElementById("rounds-feed"),
  venuesGrid: document.getElementById("venues-grid"),
  statsGrid: document.getElementById("stats-grid"),
  warningStrip: document.getElementById("warning-strip"),
  sourceBadge: document.getElementById("source-badge"),
  emailInput: document.getElementById("email-input"),
  saveForm: document.getElementById("save-form"),
  loadButton: document.getElementById("load-button"),
  saveStatus: document.getElementById("save-status"),
  downloadLink: document.getElementById("download-link"),
  refreshButton: document.getElementById("refresh-button")
};

boot();

async function boot() {
  bindEvents();
  await loadWorldCup();
}

function bindEvents() {
  elements.saveForm.addEventListener("submit", handleSave);
  elements.loadButton.addEventListener("click", handleLoad);
  elements.refreshButton.addEventListener("click", () => loadWorldCup(true));

  document.addEventListener("click", handleMoveClick);
  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", () => {
    dragPayload = null;
  });
}

async function loadWorldCup(refresh = false) {
  state.loading = true;
  render();

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  const query = new URLSearchParams({ timezone });

  if (refresh) {
    query.set("refresh", "true");
  }

  try {
    const response = await fetch(`/api/world-cup?${query.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "Failed to load data.");
    }

    state.worldCup = data;
    state.groups = cloneGroups(data.groups || []);
    state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups);
    state.saveStatus = "";
    state.downloadUrl = "";
  } catch (error) {
    state.worldCup = null;
    state.groups = [];
    state.thirdPlaceRanking = [];
    state.saveStatus = error instanceof Error ? error.message : "Failed to load data.";
    state.downloadUrl = "";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  renderSource();
  renderWarnings();
  renderSummary();
  renderGroups();
  renderThirdPlace();
  renderPlayoffBoard();
  renderFixtures();
  renderRounds();
  renderVenues();
  renderStats();
  renderSaveState();
}

function renderSource() {
  if (state.loading) {
    elements.sourceBadge.textContent = "Loading";
    return;
  }

  if (!state.worldCup) {
    elements.sourceBadge.textContent = "Unavailable";
    return;
  }

  elements.sourceBadge.textContent =
    state.worldCup.source?.mode === "live" ? "Live API-Football data" : "Demo field";
}

function renderWarnings() {
  const warnings = state.worldCup?.source?.warnings || [];

  if (!warnings.length) {
    elements.warningStrip.classList.add("hidden");
    elements.warningStrip.innerHTML = "";
    return;
  }

  elements.warningStrip.classList.remove("hidden");
  elements.warningStrip.innerHTML = warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("");
}

function renderSummary() {
  if (!state.worldCup) {
    elements.summaryGrid.innerHTML = emptyState("World Cup data is not available right now.");
    return;
  }

  const summary = state.worldCup.summary;
  const cards = [
    { label: "Groups", value: summary.groupsCount },
    { label: "Teams", value: summary.teamsCount },
    { label: "Fixtures", value: summary.fixturesCount || "TBD" },
    { label: "Venues", value: summary.venuesCount || "TBD" },
    { label: "Hosts", value: (summary.hostCountries || []).join(", ") || "TBD" }
  ];

  elements.summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <span class="summary-label">${escapeHtml(card.label)}</span>
          <span class="summary-value">${escapeHtml(String(card.value))}</span>
        </article>
      `
    )
    .join("");
}

function renderGroups() {
  if (!state.worldCup) {
    elements.groupsGrid.innerHTML = emptyState("Load data to rank the groups.");
    return;
  }

  elements.groupsGrid.innerHTML = state.groups
    .map(
      (group) => `
        <article class="group-card">
          <div class="group-head">
            <div>
              <h3>${escapeHtml(group.label)}</h3>
              <p class="muted">Top two go through automatically.</p>
            </div>
            <span class="status-pill">${group.teams.length} teams</span>
          </div>
          <div class="team-list" data-drop-zone="group" data-group="${group.letter}">
            ${group.teams
              .map((team, index) => renderTeamRow(team, index, group.letter, "group"))
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderThirdPlace() {
  if (!state.worldCup) {
    elements.thirdPlaceCard.innerHTML = emptyState("Third-place ranking will appear here.");
    return;
  }

  const rows = state.thirdPlaceRanking
    .map((team, index) => renderTeamRow(team, index, null, "third"))
    .join("");

  elements.thirdPlaceCard.innerHTML = `
    <div class="third-place-head">
      <div>
        <h3>Best third-place race</h3>
        <p class="muted">Top eight advance into the round of 32.</p>
      </div>
      <span class="status-pill">${Math.min(state.thirdPlaceRanking.length, 8)} advance</span>
    </div>
    <div class="third-place-list" data-drop-zone="third">
      ${rows}
    </div>
  `;
}

function renderPlayoffBoard() {
  if (!state.worldCup) {
    elements.playoffBoard.innerHTML = emptyState("Projected playoff slots will appear here.");
    return;
  }

  const qualifiers = getCurrentQualifiers();
  const qualifierCards = [
    {
      title: "Group winners",
      teams: qualifiers.winners
    },
    {
      title: "Group runners-up",
      teams: qualifiers.runnersUp
    },
    {
      title: "Best third-place teams",
      teams: qualifiers.bestThird
    }
  ];

  const projectedMatches = state.worldCup.playoffBoard.knockoutTemplate
    .map((match) => projectMatch(match, qualifiers.bestThird))
    .slice(0, 16);

  elements.playoffBoard.innerHTML = `
    <div class="qualifier-grid">
      ${qualifierCards
        .map(
          (group) => `
            <article class="qualifier-card">
              <div class="qualifier-group-head">
                <h3>${escapeHtml(group.title)}</h3>
                <span class="status-pill">${group.teams.length}</span>
              </div>
              <div class="team-list">
                ${group.teams
                  .map(
                    (team) => `
                      <div class="team-row bubble">
                        <div class="rank-badge">${escapeHtml(team.groupLetter)}</div>
                        <div class="team-meta">
                          <div class="team-name">
                            ${renderTeamLogo(team)}
                            <span>${escapeHtml(team.name)}</span>
                          </div>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
    <div class="playoff-grid">
      ${projectedMatches.map(renderPlayoffCard).join("")}
    </div>
  `;
}

function renderFixtures() {
  if (!state.worldCup) {
    elements.fixturesFeed.innerHTML = emptyState("Fixtures will appear here.");
    return;
  }

  const fixtures = pickFixturePreview(state.worldCup.fixtures || []);

  if (!fixtures.length) {
    elements.fixturesFeed.innerHTML = emptyState(
      "No live fixture list is available yet. When API-Football publishes the schedule, dates and locations will show here."
    );
    return;
  }

  elements.fixturesFeed.innerHTML = fixtures
    .map(
      (fixture) => `
        <article class="fixture-card">
          <div class="fixture-head">
            <strong>${escapeHtml(fixture.stage)}</strong>
            <span class="status-pill">${escapeHtml(fixture.status.short || "TBD")}</span>
          </div>
          <div class="fixture-versus">
            <strong>${escapeHtml(fixture.teams.home.name)}</strong>
            <span class="muted">vs</span>
            <strong>${escapeHtml(fixture.teams.away.name)}</strong>
          </div>
          <div class="fixture-subline">
            <span class="chip">${escapeHtml(formatDate(fixture.date))}</span>
            <span class="chip">${escapeHtml(fixture.venue.name)}</span>
            <span class="chip">${escapeHtml(formatLocation(fixture.venue))}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderRounds() {
  if (!state.worldCup) {
    elements.roundsFeed.innerHTML = emptyState("Round dates will appear here.");
    return;
  }

  const rounds = (state.worldCup.rounds || []).slice(0, 18);

  if (!rounds.length) {
    elements.roundsFeed.innerHTML = emptyState(
      "The API has not exposed round-level date ranges yet."
    );
    return;
  }

  elements.roundsFeed.innerHTML = rounds
    .map(
      (round) => `
        <article class="round-card">
          <div class="round-head">
            <strong>${escapeHtml(round.round)}</strong>
            <span class="status-pill">${escapeHtml(round.stage)}</span>
          </div>
          <p class="muted">
            ${round.dates && round.dates.length
              ? round.dates.map((date) => escapeHtml(formatDate(date))).join(", ")
              : "Dates not provided"}
          </p>
        </article>
      `
    )
    .join("");
}

function renderVenues() {
  if (!state.worldCup) {
    elements.venuesGrid.innerHTML = emptyState("Venue cards will appear here.");
    return;
  }

  if (!state.worldCup.venues?.length) {
    elements.venuesGrid.innerHTML = emptyState(
      "Venue details are not available from the current feed yet."
    );
    return;
  }

  elements.venuesGrid.innerHTML = state.worldCup.venues
    .slice(0, 18)
    .map(
      (venue) => `
        <article class="venue-card">
          <div class="venue-head">
            <strong>${escapeHtml(venue.name)}</strong>
            <span class="status-pill">${escapeHtml(venue.country || "Host city")}</span>
          </div>
          <p class="muted">${escapeHtml([venue.city, venue.country].filter(Boolean).join(", "))}</p>
          <div class="fixture-subline">
            ${venue.capacity ? `<span class="chip">Capacity ${escapeHtml(String(venue.capacity))}</span>` : ""}
            ${venue.surface ? `<span class="chip">${escapeHtml(venue.surface)}</span>` : ""}
          </div>
        </article>
      `
    )
    .join("");
}

function renderStats() {
  if (!state.worldCup) {
    elements.statsGrid.innerHTML = emptyState("Featured stats will appear here.");
    return;
  }

  const featuredStats = state.worldCup.featuredStats || [];

  if (!featuredStats.length) {
    elements.statsGrid.innerHTML = emptyState(
      "No fixture-level statistics are available yet for the current dataset."
    );
    return;
  }

  elements.statsGrid.innerHTML = featuredStats.map(renderStatsCard).join("");
}

function renderSaveState() {
  elements.saveStatus.textContent = state.saveStatus || "The saved file includes your group order and playoff projection.";

  if (state.downloadUrl) {
    elements.downloadLink.classList.remove("hidden");
    elements.downloadLink.href = state.downloadUrl;
  } else {
    elements.downloadLink.classList.add("hidden");
    elements.downloadLink.href = "#";
  }
}

async function handleSave(event) {
  event.preventDefault();

  if (!state.worldCup) {
    state.saveStatus = "Load the World Cup data before saving.";
    renderSaveState();
    return;
  }

  const email = elements.emailInput.value.trim().toLowerCase();

  if (!isValidEmail(email)) {
    state.saveStatus = "Enter a valid email address first.";
    renderSaveState();
    return;
  }

  const payload = buildSavePayload(email);

  try {
    const response = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "Failed to save picks.");
    }

    state.saveStatus = `Saved on ${formatDateTime(data.savedAt)}.`;
    state.downloadUrl = data.downloadUrl;
  } catch (error) {
    state.saveStatus = error instanceof Error ? error.message : "Failed to save picks.";
  }

  renderSaveState();
}

async function handleLoad() {
  const email = elements.emailInput.value.trim().toLowerCase();

  if (!isValidEmail(email)) {
    state.saveStatus = "Enter a valid email address to load saved picks.";
    renderSaveState();
    return;
  }

  try {
    const response = await fetch(`/api/picks/${encodeURIComponent(email)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || data.error || "Failed to load saved picks.");
    }

    applySavedPicks(data);
    state.saveStatus = `Loaded saved picks from ${formatDateTime(data.savedAt)}.`;
    state.downloadUrl = `/api/picks/${encodeURIComponent(email)}/download`;
  } catch (error) {
    state.saveStatus = error instanceof Error ? error.message : "Failed to load saved picks.";
  }

  render();
}

function handleMoveClick(event) {
  const button = event.target.closest("[data-move]");

  if (!button) {
    return;
  }

  const direction = Number(button.dataset.direction);
  const index = Number(button.dataset.index);
  const list = button.dataset.list;

  if (list === "group") {
    reorderGroup(button.dataset.group, index, index + direction);
    return;
  }

  reorderThirdPlace(index, index + direction);
}

function handleDragStart(event) {
  const row = event.target.closest("[data-drag-kind]");

  if (!row) {
    return;
  }

  dragPayload = {
    kind: row.dataset.dragKind,
    group: row.dataset.group || null,
    index: Number(row.dataset.index)
  };

  event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  const dropZone = event.target.closest("[data-drop-zone]");

  if (!dropZone || !dragPayload) {
    return;
  }

  event.preventDefault();
}

function handleDrop(event) {
  const dropZone = event.target.closest("[data-drop-zone]");

  if (!dropZone || !dragPayload) {
    return;
  }

  event.preventDefault();

  const targetRow = event.target.closest("[data-index]");
  const targetIndex = targetRow ? Number(targetRow.dataset.index) : null;

  if (dropZone.dataset.dropZone === "group" && dragPayload.kind === "group") {
    if (dragPayload.group !== dropZone.dataset.group) {
      return;
    }

    reorderGroup(
      dropZone.dataset.group,
      dragPayload.index,
      targetIndex === null ? state.groups.find((group) => group.letter === dragPayload.group).teams.length - 1 : targetIndex
    );
    return;
  }

  if (dropZone.dataset.dropZone === "third" && dragPayload.kind === "third") {
    reorderThirdPlace(
      dragPayload.index,
      targetIndex === null ? state.thirdPlaceRanking.length - 1 : targetIndex
    );
  }
}

function reorderGroup(groupLetter, fromIndex, toIndex) {
  const group = state.groups.find((entry) => entry.letter === groupLetter);

  if (!group || fromIndex === toIndex || toIndex < 0 || toIndex >= group.teams.length) {
    return;
  }

  moveItem(group.teams, fromIndex, toIndex);
  group.teams.forEach((team, index) => {
    team.standing.rank = index + 1;
  });
  state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups, state.thirdPlaceRanking.map((team) => team.id));
  render();
}

function reorderThirdPlace(fromIndex, toIndex) {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= state.thirdPlaceRanking.length) {
    return;
  }

  moveItem(state.thirdPlaceRanking, fromIndex, toIndex);
  render();
}

function deriveThirdPlaceRanking(groups, preferredOrder = []) {
  const teams = groups.map((group) => group.teams[2]).filter(Boolean);
  const orderMap = new Map(preferredOrder.map((teamId, index) => [teamId, index]));

  return [...teams].sort((left, right) => {
    const leftOrder = orderMap.has(left.id) ? orderMap.get(left.id) : Number.POSITIVE_INFINITY;
    const rightOrder = orderMap.has(right.id) ? orderMap.get(right.id) : Number.POSITIVE_INFINITY;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return compareTeams(left, right);
  });
}

function compareTeams(left, right) {
  const pointsDelta = (right.standing?.points ?? Number.NEGATIVE_INFINITY) - (left.standing?.points ?? Number.NEGATIVE_INFINITY);
  if (pointsDelta !== 0) {
    return pointsDelta;
  }

  const gdDelta =
    (right.standing?.goalDifference ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalDifference ?? Number.NEGATIVE_INFINITY);
  if (gdDelta !== 0) {
    return gdDelta;
  }

  const gfDelta =
    (right.standing?.goalsFor ?? Number.NEGATIVE_INFINITY) -
    (left.standing?.goalsFor ?? Number.NEGATIVE_INFINITY);
  if (gfDelta !== 0) {
    return gfDelta;
  }

  return `${left.groupLetter}${left.name}`.localeCompare(`${right.groupLetter}${right.name}`);
}

function getCurrentQualifiers() {
  return {
    winners: state.groups.map((group) => group.teams[0]).filter(Boolean),
    runnersUp: state.groups.map((group) => group.teams[1]).filter(Boolean),
    bestThird: state.thirdPlaceRanking.slice(0, 8)
  };
}

function projectMatch(match, bestThird) {
  return {
    ...match,
    home: resolveProjectedSide(match.homeSource, bestThird),
    away: resolveProjectedSide(match.awaySource, bestThird)
  };
}

function resolveProjectedSide(source, bestThird) {
  if (source.type === "groupPlacement") {
    const group = state.groups.find((entry) => entry.letter === source.group);
    const team = group?.teams?.[source.placement - 1] || null;

    return {
      type: "team",
      label: team ? `${team.groupLetter}${source.placement} • ${team.name}` : `${source.group}${source.placement}`,
      team
    };
  }

  if (source.type === "thirdEligible") {
    return {
      type: "thirdEligible",
      label: `Best 3rd from ${source.groups.join("/")}`,
      candidates: bestThird.filter((team) => source.groups.includes(team.groupLetter))
    };
  }

  if (source.type === "matchWinner") {
    return {
      type: "matchLink",
      label: `Winner match ${source.match}`,
      match: source.match
    };
  }

  return {
    type: "matchLink",
    label: `Loser match ${source.match}`,
    match: source.match
  };
}

function renderPlayoffCard(match) {
  return `
    <article class="playoff-card">
      <div class="playoff-head">
        <strong>Match ${match.match}</strong>
        <span class="status-pill">${escapeHtml(match.stage)}</span>
      </div>
      <div class="fixture-subline">
        <span class="chip">${escapeHtml(formatDate(match.date))}</span>
        <span class="chip">${escapeHtml(match.venue)}</span>
      </div>
      ${renderPlayoffSide("Home", match.home)}
      ${renderPlayoffSide("Away", match.away)}
    </article>
  `;
}

function renderPlayoffSide(label, side) {
  if (side.type === "team") {
    return `
      <div class="playoff-side">
        <span class="playoff-side-title">${escapeHtml(label)}</span>
        <strong>${escapeHtml(side.team?.name || side.label)}</strong>
        <p class="muted">${escapeHtml(side.label)}</p>
      </div>
    `;
  }

  if (side.type === "thirdEligible") {
    return `
      <div class="playoff-side">
        <span class="playoff-side-title">${escapeHtml(label)}</span>
        <strong>${escapeHtml(side.label)}</strong>
        <div class="candidate-row">
          ${
            side.candidates.length
              ? side.candidates
                  .map((team) => `<span class="chip">${escapeHtml(team.groupLetter)} • ${escapeHtml(team.name)}</span>`)
                  .join("")
              : `<span class="muted">No eligible projected third-place team</span>`
          }
        </div>
      </div>
    `;
  }

  return `
    <div class="playoff-side">
      <span class="playoff-side-title">${escapeHtml(label)}</span>
      <strong>${escapeHtml(side.label)}</strong>
    </div>
  `;
}

function renderStatsCard(entry) {
  const left = entry.statistics[0];
  const right = entry.statistics[1];
  const statNames = ["Ball Possession", "Total Shots", "Corner Kicks", "Passes accurate"];

  return `
    <article class="stat-card">
      <div class="stat-head">
        <strong>${escapeHtml(entry.teams.home.name)} vs ${escapeHtml(entry.teams.away.name)}</strong>
        <span class="status-pill">${escapeHtml(entry.round)}</span>
      </div>
      <p class="muted">${escapeHtml(formatDate(entry.date))} • ${escapeHtml(entry.venue.name)}</p>
      <div class="stats-table">
        ${statNames
          .map((name) => {
            const leftValue = left?.values?.[name] ?? "-";
            const rightValue = right?.values?.[name] ?? "-";
            return `
              <div class="stat-row">
                <span>${escapeHtml(name)}</span>
                <strong>${escapeHtml(String(leftValue))}</strong>
                <strong>${escapeHtml(String(rightValue))}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderTeamRow(team, index, groupLetter, listType) {
  const isGroupList = listType === "group";
  const positionClass =
    index < 2 ? "qualify" : index === 2 ? "bubble" : "out";
  const badge =
    listType === "third" ? (index < 8 ? "Advances" : "Out") : index < 2 ? "Qualifies" : index === 2 ? "Bubble" : "Out";

  return `
    <div
      class="team-row ${positionClass}"
      draggable="true"
      data-drag-kind="${escapeHtml(isGroupList ? "group" : "third")}"
      data-group="${escapeHtml(groupLetter || "")}"
      data-index="${index}"
    >
      <div class="rank-badge">${index + 1}</div>
      <div class="team-meta">
        <div class="team-name">
          ${renderTeamLogo(team)}
          <span>${escapeHtml(team.name)}</span>
        </div>
        <div class="team-stats">
          <span class="chip">${escapeHtml(team.groupLetter)}</span>
          <span class="chip">${escapeHtml(badge)}</span>
          ${team.standing?.points != null ? `<span class="chip">${escapeHtml(String(team.standing.points))} pts</span>` : ""}
          ${team.standing?.goalDifference != null ? `<span class="chip">${escapeHtml(formatGoalDiff(team.standing.goalDifference))}</span>` : ""}
        </div>
      </div>
      <div class="team-actions">
        <button
          class="button small secondary"
          type="button"
          data-move="true"
          data-direction="-1"
          data-index="${index}"
          data-group="${escapeHtml(groupLetter || "")}"
          data-list="${escapeHtml(listType)}"
        >
          Up
        </button>
        <button
          class="button small secondary"
          type="button"
          data-move="true"
          data-direction="1"
          data-index="${index}"
          data-group="${escapeHtml(groupLetter || "")}"
          data-list="${escapeHtml(listType)}"
        >
          Down
        </button>
      </div>
    </div>
  `;
}

function renderTeamLogo(team) {
  if (team.logo) {
    return `<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)} logo" />`;
  }

  return `<span class="team-logo-fallback">${escapeHtml((team.code || team.name).slice(0, 3))}</span>`;
}

function buildSavePayload(email) {
  const projectedRoundOf32 = state.worldCup.playoffBoard.knockoutTemplate
    .map((match) => projectMatch(match, getCurrentQualifiers().bestThird))
    .slice(0, 16)
    .map((match) => ({
      match: match.match,
      stage: match.stage,
      date: match.date,
      venue: match.venue,
      home: serializeSide(match.home),
      away: serializeSide(match.away)
    }));

  return {
    email,
    source: state.worldCup.source,
    competition: state.worldCup.competition,
    summary: state.worldCup.summary,
    groupRankings: state.groups.map((group) => ({
      group: group.letter,
      label: group.label,
      teamIds: group.teams.map((team) => team.id),
      teams: group.teams.map((team, index) => ({
        rank: index + 1,
        teamId: team.id,
        teamName: team.name
      }))
    })),
    thirdPlaceRanking: state.thirdPlaceRanking.map((team, index) => ({
      rank: index + 1,
      teamId: team.id,
      group: team.groupLetter,
      teamName: team.name
    })),
    bestThirdAdvancers: state.thirdPlaceRanking.slice(0, 8).map((team, index) => ({
      rank: index + 1,
      teamId: team.id,
      group: team.groupLetter,
      teamName: team.name
    })),
    projectedRoundOf32
  };
}

function serializeSide(side) {
  if (side.type === "team") {
    return {
      type: "team",
      label: side.label,
      teamId: side.team.id,
      teamName: side.team.name
    };
  }

  if (side.type === "thirdEligible") {
    return {
      type: "thirdEligible",
      label: side.label,
      candidates: side.candidates.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        group: team.groupLetter
      }))
    };
  }

  return {
    type: side.type,
    label: side.label,
    match: side.match
  };
}

function applySavedPicks(saved) {
  if (!state.worldCup) {
    return;
  }

  const orderByGroup = new Map(saved.groupRankings.map((entry) => [entry.group, entry.teamIds]));
  const freshGroups = cloneGroups(state.worldCup.groups || []);

  state.groups = freshGroups.map((group) => {
    const preferredOrder = orderByGroup.get(group.letter) || [];
    const rankMap = new Map(preferredOrder.map((teamId, index) => [teamId, index]));

    group.teams.sort((left, right) => {
      const leftRank = rankMap.has(left.id) ? rankMap.get(left.id) : Number.POSITIVE_INFINITY;
      const rightRank = rankMap.has(right.id) ? rankMap.get(right.id) : Number.POSITIVE_INFINITY;
      return leftRank - rightRank;
    });

    group.teams.forEach((team, index) => {
      team.standing.rank = index + 1;
    });

    return group;
  });

  state.thirdPlaceRanking = deriveThirdPlaceRanking(
    state.groups,
    (saved.thirdPlaceRanking || []).map((entry) => entry.teamId)
  );
}

function cloneGroups(groups) {
  return groups.map((group) => ({
    ...group,
    teams: group.teams.map((team) => ({
      ...team,
      standing: { ...(team.standing || {}) }
    })),
    fixtures: (group.fixtures || []).map((fixture) => ({ ...fixture }))
  }));
}

function moveItem(list, fromIndex, toIndex) {
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
}

function pickFixturePreview(fixtures) {
  const now = Date.now();
  const upcoming = fixtures
    .filter((fixture) => new Date(fixture.date).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 12);

  if (upcoming.length) {
    return upcoming;
  }

  return [...fixtures].reverse().slice(0, 12);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatLocation(venue) {
  return [venue.city, venue.country].filter(Boolean).join(", ") || "Location pending";
}

function formatGoalDiff(value) {
  return `${Number(value) > 0 ? "+" : ""}${value} GD`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
