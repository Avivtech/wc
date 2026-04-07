const state = {
	worldCup: null,
	groups: [],
	thirdPlaceRanking: [],
	selectedThirdTeamIds: [],
	bracketWinnerSelections: {},
	calendarMonthIndex: null,
	playoffMatches: [],
	submittedAt: "",
	sectionSubmittedAt: createEmptySectionSubmissionState(),
	submissionPendingSection: "",
	auth: {
		enabled: false,
		ready: false,
		pending: false,
		client: null,
		session: null,
		user: null,
		displayNameDraft: "",
		status: "",
	},
	saveStatus: "",
	loading: true,
};

let dragPayload = null;
const syncState = {
	autoSaveTimer: 0,
	autoSaveInFlight: false,
	autoSaveQueued: false,
	lastSavedSnapshot: "",
	loadedEmail: "",
	loadingSavedPicks: false,
};
const tooltipState = {
	element: null,
	target: null,
	rafId: 0,
};
const playoffPanState = {
	active: false,
	pointerId: null,
	scroller: null,
	startX: 0,
	startY: 0,
	startScrollLeft: 0,
	startScrollTop: 0,
	canPanHorizontally: false,
	canPanVertically: false,
	moved: false,
	suppressClickUntil: 0,
};

const elements = {
	groupsGrid: document.getElementById("groups-grid"),
	thirdPlaceCard: document.getElementById("third-place-card"),
	playoffBoard: document.getElementById("playoff-board"),
	fixturesFeed: document.getElementById("fixtures-feed"),
	warningStrip: document.getElementById("warning-strip"),
	emailLabel: document.getElementById("email-label"),
	emailInput: document.getElementById("email-input"),
	welcomeMessage: document.getElementById("welcome-message"),
	authButton: document.getElementById("auth-button"),
	submitButtons: Array.from(document.querySelectorAll("[data-submit-picks]")),
	clearAllButton: document.getElementById("clear-all-button"),
	clearAllDialog: document.getElementById("clear-all-dialog"),
	clearAllCancelButton: document.getElementById("clear-all-cancel"),
	clearAllConfirmButton: document.getElementById("clear-all-confirm"),
	signOutButton: document.getElementById("signout-button"),
	authStatus: document.getElementById("auth-status"),
	saveStatus: document.getElementById("save-status"),
};

const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const SECTION_LABELS = {
	groups: "Groups",
	thirdPlace: "Third Place",
	playoffs: "Playoffs",
};
const SECTION_LOCKS = {
	groups: ["groups", "thirdPlace", "playoffs"],
	thirdPlace: ["thirdPlace", "playoffs"],
	playoffs: ["playoffs"],
};

boot();

async function boot() {
	await initializeAuth();
	bindEvents();
	render();
	await loadWorldCup();
}

function bindEvents() {
	elements.authButton.addEventListener("click", handleAuthRequest);
	elements.clearAllButton.addEventListener("click", openClearAllDialog);
	elements.clearAllCancelButton.addEventListener("click", closeClearAllDialog);
	elements.clearAllConfirmButton.addEventListener("click", handleClearAll);
	elements.signOutButton.addEventListener("click", handleSignOut);

	document.addEventListener("click", handlePlayoffPanClickCapture, true);
	document.addEventListener("click", handleMoveClick);
	document.addEventListener("mouseover", handleTooltipMouseOver);
	document.addEventListener("mouseout", handleTooltipMouseOut);
	document.addEventListener("keydown", handleGlobalKeyDown);
	document.addEventListener("scroll", handleTooltipViewportChange, true);
	document.addEventListener("pointerdown", handlePlayoffPanStart);
	document.addEventListener("pointermove", handlePlayoffPanMove);
	document.addEventListener("pointerup", handlePlayoffPanEnd);
	document.addEventListener("pointercancel", handlePlayoffPanEnd);
	document.addEventListener("dragstart", handleDragStart);
	document.addEventListener("dragover", handleDragOver);
	document.addEventListener("drop", handleDrop);
	document.addEventListener("dragend", () => {
		dragPayload = null;
		hideFloatingTooltip();
	});
	window.addEventListener("resize", scheduleBracketLineDraw);
	window.addEventListener("resize", handleTooltipViewportChange);
	elements.clearAllDialog.addEventListener("click", handleClearAllDialogBackdrop);
}

async function initializeAuth() {
	state.auth.ready = false;
	state.auth.status = "Checking auth...";

	try {
		const response = await fetch("/api/auth/config");
		const config = await response.json();

		if (!response.ok) {
			throw new Error(config.detail || config.error || "Failed to load auth config.");
		}

		if (!config.enabled) {
			state.auth.enabled = false;
			state.auth.status = "Supabase Auth is not configured yet. Saving and loading are disabled.";
			return;
		}

		if (!window.supabase?.createClient) {
			throw new Error("Supabase browser client failed to load.");
		}

		state.auth.enabled = true;
		state.auth.client = window.supabase.createClient(config.url, config.publishableKey);
		state.auth.client.auth.onAuthStateChange((event, session) => {
			void syncAuthSession(session, event);
		});

		const { data, error } = await state.auth.client.auth.getSession();

		if (error) {
			throw error;
		}

		await syncAuthSession(data.session, "INITIAL_SESSION");
	} catch (error) {
		state.auth.enabled = false;
		state.auth.client = null;
		state.auth.session = null;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		state.auth.status = error instanceof Error ? error.message : "Failed to initialize auth.";
	} finally {
		state.auth.ready = true;
	}
}

async function syncAuthSession(session, event = "SESSION") {
	state.auth.pending = false;
	state.auth.session = session || null;

	if (!session?.access_token || !state.auth.client) {
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		resetPickSyncState();
		if (event === "SIGNED_OUT") {
			state.saveStatus = "";
		}
		state.auth.status = getSignedOutAuthMessage();
		render();
		return;
	}

	const { data, error } = await state.auth.client.auth.getUser(session.access_token);

	if (error || !data.user?.email) {
		state.auth.session = null;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		resetPickSyncState();
		state.auth.status = error?.message || "Your Supabase session could not be verified.";
		render();
		return;
	}

	if (syncState.loadedEmail && syncState.loadedEmail !== data.user.email.toLowerCase()) {
		resetPickSyncState();
	}

	state.auth.user = data.user;
	state.auth.displayNameDraft = getUserDisplayName(data.user);
	state.auth.status = "Signed in.";
	clearAuthRedirectState();

	if (event === "SIGNED_OUT") {
		state.saveStatus = "";
	}

	render();
	void ensureSavedPicksLoadedForCurrentUser();
}

function renderAuthState() {
	const email = getAuthenticatedEmail();
	const authReady = state.auth.ready;
	const authAvailable = state.auth.enabled && Boolean(state.auth.client);
	const isSignedIn = Boolean(email);

	if (isSignedIn) {
		elements.emailInput.value = email;
	}

	elements.emailInput.readOnly = isSignedIn;
	elements.emailLabel.classList.toggle("hidden", isSignedIn);
	elements.emailInput.classList.toggle("hidden", isSignedIn);
	elements.welcomeMessage.classList.toggle("hidden", !isSignedIn);
	elements.welcomeMessage.textContent = getWelcomeMessage();
	elements.authButton.textContent = state.auth.pending ? "Sending link..." : "Email magic link";
	elements.authButton.disabled = !authReady || !authAvailable || state.auth.pending || isSignedIn;
	elements.clearAllButton.disabled = state.loading || !state.worldCup || hasSubmittedSections() || isSubmissionPending();
	elements.signOutButton.disabled = !authReady || state.auth.pending;
	elements.authButton.classList.toggle("hidden", isSignedIn);
	elements.signOutButton.classList.toggle("hidden", !isSignedIn);
	elements.authStatus.textContent = state.auth.status || (!authReady ? "Checking auth..." : getSignedOutAuthMessage());
}

function renderSubmitButtons() {
	const isReadyToSubmit = Boolean(getAuthenticatedEmail()) && !state.loading && Boolean(state.worldCup);

	elements.submitButtons.forEach((button) => {
		const section = button.dataset.submitPicks || "";
		const label = isSectionPending(section) ? "Submitting..." : isSectionSubmitted(section) ? "Submitted" : isSectionLockedByDependency(section) ? "Locked" : "Submit";
		const disabled = !isReadyToSubmit || isSubmissionPending() || isSectionReadOnly(section);
		button.textContent = label;
		button.disabled = disabled;
	});
}

function getSignedOutAuthMessage() {
	if (!state.auth.enabled) {
		return state.auth.status || "Supabase Auth is not configured yet. Saving and loading are disabled.";
	}

	return "Sign in with a magic link to save and load your picks.";
}

function getAuthenticatedEmail() {
	return String(state.auth.user?.email || "")
		.trim()
		.toLowerCase();
}

function getUserDisplayName(user) {
	const value = user?.user_metadata?.display_name;
	return typeof value === "string" ? value.trim() : "";
}

function sanitizeDisplayName(value) {
	return String(value || "")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 60);
}

function getWelcomeMessage() {
	const displayName = sanitizeDisplayName(state.auth.displayNameDraft);

	if (displayName) {
		return `Hi ${displayName}, Welcome back!`;
	}

	return "Hi, Welcome back!";
}

function createEmptySectionSubmissionState() {
	return {
		groups: "",
		thirdPlace: "",
		playoffs: "",
	};
}

function normalizeSectionSubmissionState(value, fallbackSubmittedAt = "") {
	const normalized = createEmptySectionSubmissionState();

	if (value && typeof value === "object") {
		for (const section of SUBMISSION_SECTIONS) {
			const submittedAt = value[section];
			normalized[section] = typeof submittedAt === "string" ? submittedAt.trim() : "";
		}

		return normalized;
	}

	const legacySubmittedAt = typeof fallbackSubmittedAt === "string" ? fallbackSubmittedAt.trim() : "";

	if (legacySubmittedAt) {
		for (const section of SUBMISSION_SECTIONS) {
			normalized[section] = legacySubmittedAt;
		}
	}

	return normalized;
}

function getSubmissionSectionLabel(section) {
	return SECTION_LABELS[section] || "Section";
}

function getLatestSubmittedAt() {
	return SUBMISSION_SECTIONS.map((section) => state.sectionSubmittedAt[section]).filter(Boolean).sort().at(-1) || "";
}

function isSubmissionPending() {
	return Boolean(state.submissionPendingSection);
}

function isSectionPending(section) {
	return state.submissionPendingSection === section;
}

function isSectionSubmitted(section) {
	return Boolean(state.sectionSubmittedAt[section]);
}

function hasSubmittedSections() {
	return SUBMISSION_SECTIONS.some((section) => isSectionSubmitted(section));
}

function isSectionLockedByDependency(section) {
	return (SECTION_LOCKS[section] || []).some((lockedSection) => lockedSection !== section && isSectionSubmitted(lockedSection));
}

function isSectionReadOnly(section) {
	return isSubmissionPending() || (SECTION_LOCKS[section] || [section]).some((lockedSection) => isSectionSubmitted(lockedSection));
}

function hasEditableSections() {
	return SUBMISSION_SECTIONS.some((section) => !isSectionReadOnly(section));
}

function isPicksLocked() {
	return !hasEditableSections();
}

function isPicksReadOnly() {
	return isSubmissionPending() || isPicksLocked();
}

function getSubmittedSaveMessage() {
	const submittedSections = SUBMISSION_SECTIONS.filter((section) => isSectionSubmitted(section)).map((section) => getSubmissionSectionLabel(section));

	if (!submittedSections.length) {
		return "No sections submitted yet.";
	}

	if (submittedSections.length === SUBMISSION_SECTIONS.length) {
		return "All sections submitted.";
	}

	return `Submitted sections: ${submittedSections.join(", ")}.`;
}

function getSectionSubmittedSaveMessage(section) {
	const submittedAt = state.sectionSubmittedAt[section];

	return submittedAt ? `${getSubmissionSectionLabel(section)} submitted on ${formatDateTime(submittedAt)}.` : `${getSubmissionSectionLabel(section)} submitted.`;
}

async function handleAuthRequest() {
	if (!state.auth.enabled || !state.auth.client) {
		state.auth.status = "Supabase Auth is not configured yet. Saving and loading are disabled.";
		renderAuthState();
		return;
	}

	const email = elements.emailInput.value.trim().toLowerCase();

	if (!isValidEmail(email)) {
		state.auth.status = "Enter a valid email address to receive a magic link.";
		renderAuthState();
		return;
	}

	state.auth.pending = true;
	state.auth.status = `Sending a magic link to ${email}...`;
	renderAuthState();

	try {
		const redirectTo = new URL(window.location.pathname, window.location.origin).toString();
		const displayName = sanitizeDisplayName(state.auth.displayNameDraft);
		const { error } = await state.auth.client.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: redirectTo,
				...(displayName ? { data: { display_name: displayName } } : {}),
			},
		});

		if (error) {
			throw error;
		}

		state.auth.status = `Magic link sent to ${email}. Open the email on this device to finish signing in.`;
	} catch (error) {
		state.auth.status = error instanceof Error ? error.message : "Failed to send your magic link.";
	} finally {
		state.auth.pending = false;
		renderAuthState();
	}
}

async function handleSignOut() {
	if (!state.auth.client) {
		return;
	}

	state.auth.pending = true;
	state.auth.status = "Signing out...";
	renderAuthState();

	try {
		const { error } = await state.auth.client.auth.signOut();

		if (error) {
			throw error;
		}

		state.auth.session = null;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		resetPickSyncState();
		state.auth.status = getSignedOutAuthMessage();
	} catch (error) {
		state.auth.status = error instanceof Error ? error.message : "Failed to sign out.";
	} finally {
		state.auth.pending = false;
		render();
	}
}

function handleClearAll() {
	if (!state.worldCup || isSubmissionPending() || hasSubmittedSections()) {
		return;
	}

	closeClearAllDialog();
	state.groups = cloneGroups(state.worldCup.groups || []);
	state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups);
	state.selectedThirdTeamIds = [];
	state.bracketWinnerSelections = {};

	if (getAuthenticatedEmail()) {
		state.saveStatus = "All picks cleared. Saving changes...";
	} else {
		state.saveStatus = "All picks cleared locally.";
	}

	renderInteractiveViews();
	renderAuthState();
	renderSaveState();
	scheduleAutoSave();
}

function openClearAllDialog() {
	if (!state.worldCup || state.loading || isSubmissionPending() || hasSubmittedSections()) {
		return;
	}

	elements.clearAllDialog.classList.remove("hidden");
	document.body.classList.add("dialog-open");
	elements.clearAllConfirmButton.focus();
}

function closeClearAllDialog() {
	elements.clearAllDialog.classList.add("hidden");
	document.body.classList.remove("dialog-open");
}

function handleClearAllDialogBackdrop(event) {
	if (event.target === elements.clearAllDialog) {
		closeClearAllDialog();
	}
}

function handleGlobalKeyDown(event) {
	if (event.key === "Escape" && !elements.clearAllDialog.classList.contains("hidden")) {
		closeClearAllDialog();
	}
}

function clearAuthRedirectState() {
	const url = new URL(window.location.href);
	let changed = false;

	for (const key of ["code", "token_hash", "type", "error", "error_code", "error_description"]) {
		if (url.searchParams.has(key)) {
			url.searchParams.delete(key);
			changed = true;
		}
	}

	if (url.hash && /access_token=|refresh_token=|type=|error=/.test(url.hash)) {
		url.hash = "";
		changed = true;
	}

	if (!changed) {
		return;
	}

	const nextUrl = `${url.pathname}${url.search}${url.hash}`;
	window.history.replaceState({}, document.title, nextUrl || "/");
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
		state.selectedThirdTeamIds = [];
		state.bracketWinnerSelections = {};
		state.calendarMonthIndex = null;
		state.submittedAt = "";
		state.sectionSubmittedAt = createEmptySectionSubmissionState();
		state.submissionPendingSection = "";
		state.saveStatus = "";
		syncState.lastSavedSnapshot = "";
		syncState.loadedEmail = "";
	} catch (error) {
		state.worldCup = null;
		state.groups = [];
		state.thirdPlaceRanking = [];
		state.selectedThirdTeamIds = [];
		state.bracketWinnerSelections = {};
		state.calendarMonthIndex = null;
		state.submittedAt = "";
		state.sectionSubmittedAt = createEmptySectionSubmissionState();
		state.submissionPendingSection = "";
		state.saveStatus = error instanceof Error ? error.message : "Failed to load data.";
		syncState.lastSavedSnapshot = "";
		syncState.loadedEmail = "";
	} finally {
		state.loading = false;
		render();
		void ensureSavedPicksLoadedForCurrentUser();
	}
}

function render() {
	hideFloatingTooltip();
	renderWarnings();
	renderInteractiveViews();
	renderAuthState();
	renderSubmitButtons();
	renderSaveState();
}

function renderInteractiveViews() {
	renderGroups();
	renderThirdPlace();
	renderPlayoffBoard();
	renderFixtures();
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
            <h3>${escapeHtml(group.label)}</h3>
          </div>
          <div class="group-table-wrap">
			<table class="group-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Country</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody data-drop-zone="group" data-group="${group.letter}">
                ${group.teams.map((team, index) => renderGroupTableRow(team, index, group.letter)).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `,
		)
		.join("");
}

function renderThirdPlace() {
	if (!state.worldCup) {
		elements.thirdPlaceCard.innerHTML = emptyState("Third-place ranking will appear here.");
		return;
	}

	const selectedCount = getSelectedBestThirdTeams().length;
	const cards = state.thirdPlaceRanking.map((team) => renderThirdPlaceSelectionCard(team)).join("");

	elements.thirdPlaceCard.innerHTML = `
    <div class="third-place-head">
      <span class="status-pill">${selectedCount}/8 selected</span>
    </div>
    <div class="third-place-list">
      ${cards}
    </div>
  `;
}

function renderPlayoffBoard() {
	if (!state.worldCup) {
		elements.playoffBoard.innerHTML = emptyState("Projected playoff slots will appear here.");
		return;
	}

	const scrollSnapshot = getPlayoffScrollSnapshot();
	clearPlayoffPanState();

	const { projectedMatches } = getProjectedPlayoffData();
	const bracket = buildPlayoffBracketLayout(projectedMatches);

	elements.playoffBoard.innerHTML = `
    <div class="playoff-bracket-scroll">
      <div class="playoff-bracket-shell">
        <svg class="bracket-lines" aria-hidden="true"></svg>
        <div class="playoff-bracket">
          ${renderBracketHalf("left", bracket.left)}
          <section class="bracket-center">
            <div class="bracket-stage-head">
              <h3>Finals</h3>
            </div>
            <div class="bracket-center-stack">
              ${bracket.final ? renderBracketMatch(bracket.final, "featured") : ""}
              ${bracket.thirdPlace ? renderBracketMatch(bracket.thirdPlace, "featured") : ""}
            </div>
          </section>
          ${renderBracketHalf("right", bracket.right)}
        </div>
      </div>
    </div>
  `;

	restorePlayoffScrollSnapshot(scrollSnapshot);
	scheduleBracketLineDraw();
	requestAnimationFrame(() => {
		restorePlayoffScrollSnapshot(scrollSnapshot);
	});
}

function getPlayoffScrollSnapshot() {
	const scroller = elements.playoffBoard.querySelector(".playoff-bracket-scroll");

	return {
		left: scroller ? scroller.scrollLeft : 0,
		top: scroller ? scroller.scrollTop : 0,
	};
}

function restorePlayoffScrollSnapshot(snapshot) {
	const scroller = elements.playoffBoard.querySelector(".playoff-bracket-scroll");

	if (!scroller || !snapshot) {
		return;
	}

	scroller.scrollLeft = snapshot.left;
	scroller.scrollTop = snapshot.top;
}

function renderFixtures() {
	if (!state.worldCup) {
		elements.fixturesFeed.innerHTML = emptyState("Fixtures will appear here.");
		return;
	}

	const fixtures = buildCalendarFixtures();

	if (!fixtures.length) {
		elements.fixturesFeed.innerHTML = emptyState("No live fixture list is available yet. When API-Football publishes the schedule, dates and locations will show here.");
		return;
	}

	const months = buildCalendarMonths(fixtures);
	const monthIndex = getVisibleCalendarMonthIndex(months);
	const activeMonth = months[monthIndex];

	elements.fixturesFeed.innerHTML = `
    <div class="calendar-months">
      <div class="calendar-controls">
        <button
          class="button small secondary"
          type="button"
          data-calendar-step="-1"
          ${monthIndex <= 0 ? "disabled" : ""}
        >
          Previous
        </button>
        <div class="calendar-controls-copy">
          <strong>${escapeHtml(formatCalendarMonthLabel(activeMonth.year, activeMonth.month))}</strong>
          <span class="status-pill">${activeMonth.fixtures.length}</span>
        </div>
        <button
          class="button small secondary"
          type="button"
          data-calendar-step="1"
          ${monthIndex >= months.length - 1 ? "disabled" : ""}
        >
          Next
        </button>
      </div>
      ${renderCalendarMonth(activeMonth, false)}
    </div>
  `;
}

function buildCalendarFixtures() {
	const liveFixtures = [...(state.worldCup?.fixtures || [])]
		.filter((fixture) => !Number.isNaN(getFixtureDate(fixture).getTime()))
		.map((fixture) => ({
			...fixture,
			calendarKey: `live-${fixture.id}`,
			homeSide: {
				type: "team",
				team: fixture.teams.home,
			},
			awaySide: {
				type: "team",
				team: fixture.teams.away,
			},
		}));

	const { projectedMatches } = getProjectedPlayoffData();
	const projectedFixtures = projectedMatches
		.filter((match) => !hasLiveFixtureEquivalent(match, liveFixtures))
		.map((match) => ({
			id: `template-${match.match}`,
			calendarKey: `template-${match.match}`,
			date: match.date,
			timestamp: null,
			stage: match.stage,
			venue: { name: match.venue },
			status: { short: "TBD" },
			homeSide: match.home,
			awaySide: match.away,
		}));

	return [...liveFixtures, ...projectedFixtures].sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime());
}

function hasLiveFixtureEquivalent(match, liveFixtures) {
	return liveFixtures.some((fixture) => {
		const sameStage = fixture.stage === match.stage;
		const sameVenue = fixture.venue?.name === match.venue;
		const sameDay = getCalendarDateKey(getFixtureDate(fixture)) === getCalendarDateKey(getFixtureDate(match));

		return sameStage && sameVenue && sameDay;
	});
}

function getCalendarDateKey(date) {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildCalendarMonths(fixtures) {
	const months = new Map();

	for (const fixture of fixtures) {
		const date = getFixtureDate(fixture);

		if (Number.isNaN(date.getTime())) {
			continue;
		}

		const key = `${date.getFullYear()}-${date.getMonth()}`;

		if (!months.has(key)) {
			months.set(key, {
				key,
				year: date.getFullYear(),
				month: date.getMonth(),
				fixtures: [],
			});
		}

		months.get(key).fixtures.push(fixture);
	}

	return [...months.values()]
		.sort((left, right) => left.year - right.year || left.month - right.month)
		.map((month) => ({
			...month,
			cells: buildCalendarMonthCells(month.year, month.month, month.fixtures),
		}));
}

function buildCalendarMonthCells(year, month, fixtures) {
	const fixturesByDay = new Map();

	for (const fixture of fixtures) {
		const date = getFixtureDate(fixture);

		if (date.getFullYear() !== year || date.getMonth() !== month) {
			continue;
		}

		const day = date.getDate();

		if (!fixturesByDay.has(day)) {
			fixturesByDay.set(day, []);
		}

		fixturesByDay.get(day).push(fixture);
	}

	for (const dayFixtures of fixturesByDay.values()) {
		dayFixtures.sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime());
	}

	const firstDay = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cells = [];

	for (let index = 0; index < firstDay; index += 1) {
		cells.push({ key: `empty-start-${year}-${month}-${index}`, isEmpty: true });
	}

	for (let day = 1; day <= daysInMonth; day += 1) {
		cells.push({
			key: `day-${year}-${month}-${day}`,
			day,
			fixtures: fixturesByDay.get(day) || [],
		});
	}

	while (cells.length % 7 !== 0) {
		cells.push({ key: `empty-end-${year}-${month}-${cells.length}`, isEmpty: true });
	}

	return cells;
}

function renderCalendarMonth(month, showHeader = true) {
	return `
    <article class="calendar-month panel-card">
      ${
							showHeader
								? `<div class="calendar-month-head">
        <h3>${escapeHtml(formatCalendarMonthLabel(month.year, month.month))}</h3>
        <span class="status-pill">${month.fixtures.length}</span>
      </div>`
								: ""
						}
      <div class="calendar-month-body">
        <div class="calendar-weekdays">
          ${CALENDAR_WEEKDAYS.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
        </div>
        <div class="calendar-grid">
          ${month.cells.map(renderCalendarCell).join("")}
        </div>
      </div>
    </article>
  `;
}

function getVisibleCalendarMonthIndex(months) {
	if (!months.length) {
		state.calendarMonthIndex = 0;
		return 0;
	}

	if (state.calendarMonthIndex == null || state.calendarMonthIndex < 0 || state.calendarMonthIndex >= months.length) {
		state.calendarMonthIndex = getInitialCalendarMonthIndex(months);
	}

	return state.calendarMonthIndex;
}

function getInitialCalendarMonthIndex(months) {
	const now = new Date();
	const currentIndex = months.findIndex((month) => month.year === now.getFullYear() && month.month === now.getMonth());

	return currentIndex >= 0 ? currentIndex : 0;
}

function changeCalendarMonth(step) {
	if (!state.worldCup) {
		return;
	}

	const months = buildCalendarMonths(buildCalendarFixtures());

	if (!months.length) {
		return;
	}

	const currentIndex = getVisibleCalendarMonthIndex(months);
	const nextIndex = Math.max(0, Math.min(currentIndex + step, months.length - 1));

	if (nextIndex === currentIndex) {
		return;
	}

	state.calendarMonthIndex = nextIndex;
	renderFixtures();
}

function renderCalendarCell(cell) {
	if (cell.isEmpty) {
		return `<div class="calendar-day is-empty" aria-hidden="true"></div>`;
	}

	return `
    <div class="calendar-day ${cell.fixtures.length ? "has-matches" : ""}">
      <div class="calendar-day-number">${cell.day}</div>
      <div class="calendar-day-matches">
        ${cell.fixtures.map(renderCalendarMatch).join("")}
      </div>
    </div>
  `;
}

function renderCalendarMatch(fixture) {
	return `
    <article class="calendar-match" data-calendar-key="${escapeHtml(fixture.calendarKey || String(fixture.id || ""))}">
      <div class="calendar-match-head">
        <span class="calendar-match-time">${escapeHtml(formatFixtureTime(fixture))}</span>
        <span class="calendar-match-status">${escapeHtml(formatStageShortLabel(fixture.stage))}</span>
      </div>
      <div class="calendar-match-teams">
        ${renderCalendarSide(fixture.homeSide)}
        <span class="muted">vs</span>
        ${renderCalendarSide(fixture.awaySide)}
      </div>
    </article>
  `;
}

function getFixtureDate(fixture) {
	const timestamp = fixture?.timestamp;

	if (timestamp !== null && timestamp !== undefined && timestamp !== "" && Number.isFinite(Number(timestamp))) {
		return new Date(Number(timestamp) * 1000);
	}

	return parseFixtureDateValue(fixture?.date);
}

function formatFixtureTime(fixture) {
	const timestamp = fixture?.timestamp;

	if (timestamp === null || timestamp === undefined || timestamp === "" || !Number.isFinite(Number(timestamp))) {
		return "TBD";
	}

	return formatTime(getFixtureDate(fixture));
}

function renderCalendarSide(side) {
	if (!side) {
		return `<span class="calendar-side-label">TBD</span>`;
	}

	if (side.type === "team") {
		return `
      <span class="calendar-team-mark">
        ${renderTeamLogo(side.team)}
        ${renderTeamCode(side.team, "team-code calendar-team-code")}
      </span>
    `;
	}

	return `<span class="calendar-side-label">${escapeHtml(formatCalendarSideLabel(side))}</span>`;
}

function formatCalendarSideLabel(side) {
	if (side.type === "thirdEligible") {
		return "3rd Place";
	}

	if (side.type === "matchLink") {
		return side.label.replace("match ", "");
	}

	return side.label || "TBD";
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

function getUserTimeZoneLabel() {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return timezone || "Local time";
}

function renderSaveState() {
	elements.saveStatus.textContent = state.saveStatus || getDefaultSaveStatus();
}

function getDefaultSaveStatus() {
	if (!hasEditableSections() && hasSubmittedSections()) {
		return getSubmittedSaveMessage();
	}

	if (hasSubmittedSections()) {
		return `${getSubmittedSaveMessage()} Changes save automatically for unsubmitted sections.`;
	}

	if (!state.auth.enabled) {
		return "Sign-in must be configured before picks can sync.";
	}

	if (!getAuthenticatedEmail()) {
		return "Sign in to load your saved picks automatically.";
	}

	return "Changes save automatically as you edit your picks.";
}

async function fetchWithAuth(input, init = {}) {
	if (!state.auth.client || !state.auth.enabled) {
		throw new Error("Supabase Auth is not configured.");
	}

	const { data, error } = await state.auth.client.auth.getSession();

	if (error) {
		throw error;
	}

	if (!data.session?.access_token) {
		throw new Error("Sign in first.");
	}

	const headers = new Headers(init.headers || {});
	headers.set("Authorization", `Bearer ${data.session.access_token}`);

	return fetch(input, {
		...init,
		headers,
	});
}

function buildCurrentSaveState() {
	const email = getAuthenticatedEmail();

	if (!state.worldCup || !email) {
		return null;
	}

	const payload = buildSavePayload(email);
	return {
		email,
		payload,
		snapshot: JSON.stringify(payload),
	};
}

async function saveCurrentPicks(preparedState = null) {
	const current = preparedState || buildCurrentSaveState();

	if (!current) {
		return false;
	}

	if (current.snapshot === syncState.lastSavedSnapshot) {
		return true;
	}

	const response = await fetchWithAuth("/api/picks", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(current.payload),
	});
	const data = await response.json();

	if (!response.ok) {
		throw new Error(data.detail || data.error || "Failed to save picks.");
	}

	state.sectionSubmittedAt = normalizeSectionSubmissionState(data.sectionSubmittedAt, data.submittedAt);
	state.submittedAt = getLatestSubmittedAt();
	syncState.lastSavedSnapshot = current.snapshot;
	syncState.loadedEmail = current.email;
	state.saveStatus = `Saved on ${formatDateTime(data.savedAt)}.`;
	renderSaveState();
	return true;
}

async function loadSavedPicks({ silentMissing = false, silentSuccess = false } = {}) {
	const email = getAuthenticatedEmail();

	if (!email || !state.worldCup || syncState.loadingSavedPicks) {
		return false;
	}

	syncState.loadingSavedPicks = true;

	try {
		const response = await fetchWithAuth("/api/picks/me");
		const data = await response.json().catch(() => ({}));

		if (response.status === 404) {
			state.submittedAt = "";
			state.sectionSubmittedAt = createEmptySectionSubmissionState();
			state.submissionPendingSection = "";
			syncState.loadedEmail = email;
			syncState.lastSavedSnapshot = buildCurrentSaveState()?.snapshot || "";
			if (!silentMissing) {
				state.saveStatus = "No saved picks yet. Changes will save automatically.";
				renderSaveState();
			}
			return false;
		}

		if (!response.ok) {
			throw new Error(data.detail || data.error || "Failed to load saved picks.");
		}

		applySavedPicks(data);
		syncState.loadedEmail = email;
		syncState.lastSavedSnapshot = buildCurrentSaveState()?.snapshot || "";
		if (!silentSuccess) {
			state.saveStatus = `Loaded saved picks from ${formatDateTime(data.savedAt)}.`;
		}
		render();
		return true;
	} catch (error) {
		state.saveStatus = error instanceof Error ? error.message : "Failed to load saved picks.";
		renderSaveState();
		return false;
	} finally {
		syncState.loadingSavedPicks = false;
	}
}

function ensureSavedPicksLoadedForCurrentUser() {
	const email = getAuthenticatedEmail();

	if (!email || !state.worldCup || syncState.loadingSavedPicks || syncState.loadedEmail === email) {
		return Promise.resolve(false);
	}

	return loadSavedPicks({ silentMissing: true, silentSuccess: true });
}

function scheduleAutoSave() {
	if (!getAuthenticatedEmail() || !state.worldCup || syncState.loadingSavedPicks || isSubmissionPending() || !hasEditableSections()) {
		return;
	}

	if (syncState.autoSaveTimer) {
		clearTimeout(syncState.autoSaveTimer);
	}

	syncState.autoSaveQueued = true;
	syncState.autoSaveTimer = window.setTimeout(() => {
		syncState.autoSaveTimer = 0;
		void flushAutoSave();
	}, 700);
}

async function flushAutoSave() {
	if (syncState.autoSaveInFlight) {
		syncState.autoSaveQueued = true;
		return;
	}

	const current = buildCurrentSaveState();

	if (!current || current.snapshot === syncState.lastSavedSnapshot || syncState.loadingSavedPicks || isSubmissionPending() || !hasEditableSections()) {
		syncState.autoSaveQueued = false;
		return;
	}

	syncState.autoSaveInFlight = true;
	syncState.autoSaveQueued = false;
	state.saveStatus = "Saving changes...";
	renderSaveState();

	try {
		await saveCurrentPicks(current);
	} catch (error) {
		state.saveStatus = error instanceof Error ? error.message : "Failed to save picks.";
		renderSaveState();
	} finally {
		syncState.autoSaveInFlight = false;
		if (syncState.autoSaveQueued) {
			scheduleAutoSave();
		}
	}
}

async function handleSubmitPicks(section) {
	if (!state.worldCup || !SUBMISSION_SECTIONS.includes(section) || isSubmissionPending() || isSectionReadOnly(section)) {
		return;
	}

	if (!getAuthenticatedEmail()) {
		state.saveStatus = "Sign in to submit your picks.";
		renderSaveState();
		return;
	}

	if (syncState.autoSaveTimer) {
		clearTimeout(syncState.autoSaveTimer);
		syncState.autoSaveTimer = 0;
	}

	const previousSectionSubmittedAt = { ...state.sectionSubmittedAt };
	state.submissionPendingSection = section;
	state.sectionSubmittedAt = {
		...state.sectionSubmittedAt,
		[section]: new Date().toISOString(),
	};
	state.submittedAt = getLatestSubmittedAt();
	state.saveStatus = `Submitting ${getSubmissionSectionLabel(section).toLowerCase()}...`;
	render();

	try {
		await waitForAutoSaveToSettle();
		await saveCurrentPicks(buildCurrentSaveState());
		state.saveStatus = getSectionSubmittedSaveMessage(section);
		render();
	} catch (error) {
		state.sectionSubmittedAt = previousSectionSubmittedAt;
		state.submittedAt = getLatestSubmittedAt();
		const message = error instanceof Error ? error.message : "Failed to submit picks.";

		if (/submitted/i.test(message)) {
			await loadSavedPicks({ silentMissing: true, silentSuccess: true });
			state.saveStatus = getSubmittedSaveMessage();
			render();
			return;
		}

		state.saveStatus = message;
		render();
	} finally {
		state.submissionPendingSection = "";
		renderSubmitButtons();
		renderAuthState();
		renderSaveState();
	}
}

async function waitForAutoSaveToSettle() {
	if (syncState.autoSaveInFlight) {
		await new Promise((resolve) => {
			const poll = () => {
				if (!syncState.autoSaveInFlight) {
					resolve();
					return;
				}

				window.setTimeout(poll, 40);
			};

			poll();
		});
	}
}

function resetPickSyncState() {
	if (syncState.autoSaveTimer) {
		clearTimeout(syncState.autoSaveTimer);
		syncState.autoSaveTimer = 0;
	}

	syncState.autoSaveInFlight = false;
	syncState.autoSaveQueued = false;
	syncState.lastSavedSnapshot = "";
	syncState.loadedEmail = "";
	syncState.loadingSavedPicks = false;
}

function handleMoveClick(event) {
	const submitButton = event.target.closest("[data-submit-picks]");

	if (submitButton) {
		void handleSubmitPicks(submitButton.dataset.submitPicks || "");
		return;
	}

	const calendarButton = event.target.closest("[data-calendar-step]");

	if (calendarButton) {
		changeCalendarMonth(Number(calendarButton.dataset.calendarStep));
		return;
	}

	const thirdCard = event.target.closest("[data-select-third]");

	if (thirdCard) {
		if (isSectionReadOnly("thirdPlace")) {
			return;
		}

		toggleThirdPlaceSelection(thirdCard.dataset.teamId);
		return;
	}

	const clearBracketSideButton = event.target.closest("[data-clear-bracket-source]");

	if (clearBracketSideButton) {
		if (isSectionReadOnly("playoffs")) {
			return;
		}

		clearBracketSourceSelection(clearBracketSideButton.dataset.sourceMatch);
		return;
	}

	const bracketPick = event.target.closest("[data-pick-winner]");

	if (bracketPick) {
		if (isSectionReadOnly("playoffs")) {
			return;
		}

		toggleBracketWinnerSelection(bracketPick.dataset.match, bracketPick.dataset.teamId);
		return;
	}

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
}

function handlePlayoffPanClickCapture(event) {
	if (!shouldSuppressPlayoffPanClick(event)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
}

function handlePlayoffPanStart(event) {
	const scroller = event.target.closest(".playoff-bracket-scroll");

	if (!scroller || event.isPrimary === false) {
		return;
	}

	if (event.pointerType === "mouse" && event.button !== 0) {
		return;
	}

	const canPanHorizontally = scroller.scrollWidth > scroller.clientWidth + 1;
	const canPanVertically = scroller.scrollHeight > scroller.clientHeight + 1;

	if (!canPanHorizontally && !canPanVertically) {
		return;
	}

	playoffPanState.active = true;
	playoffPanState.pointerId = event.pointerId;
	playoffPanState.scroller = scroller;
	playoffPanState.startX = event.clientX;
	playoffPanState.startY = event.clientY;
	playoffPanState.startScrollLeft = scroller.scrollLeft;
	playoffPanState.startScrollTop = scroller.scrollTop;
	playoffPanState.canPanHorizontally = canPanHorizontally;
	playoffPanState.canPanVertically = canPanVertically;
	playoffPanState.moved = false;
}

function handlePlayoffPanMove(event) {
	if (!playoffPanState.active || event.pointerId !== playoffPanState.pointerId || !playoffPanState.scroller) {
		return;
	}

	const deltaX = event.clientX - playoffPanState.startX;
	const deltaY = event.clientY - playoffPanState.startY;

	if (!playoffPanState.moved) {
		if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
			return;
		}

		playoffPanState.moved = true;
		playoffPanState.scroller.classList.add("is-panning");

		if (typeof playoffPanState.scroller.setPointerCapture === "function") {
			try {
				playoffPanState.scroller.setPointerCapture(event.pointerId);
			} catch (_error) {
				// Ignore browsers that reject pointer capture for this event.
			}
		}
	}

	event.preventDefault();
	hideFloatingTooltip();

	if (playoffPanState.canPanHorizontally) {
		playoffPanState.scroller.scrollLeft = playoffPanState.startScrollLeft - deltaX;
	}

	if (playoffPanState.canPanVertically) {
		playoffPanState.scroller.scrollTop = playoffPanState.startScrollTop - deltaY;
	}
}

function handlePlayoffPanEnd(event) {
	if (!playoffPanState.active || event.pointerId !== playoffPanState.pointerId) {
		return;
	}

	clearPlayoffPanState(playoffPanState.moved);
}

function shouldSuppressPlayoffPanClick(event) {
	if (Date.now() > playoffPanState.suppressClickUntil) {
		return false;
	}

	return Boolean(event.target.closest(".playoff-bracket-scroll"));
}

function clearPlayoffPanState(suppressClick = false) {
	if (playoffPanState.scroller) {
		if (typeof playoffPanState.scroller.releasePointerCapture === "function" && playoffPanState.pointerId != null) {
			try {
				playoffPanState.scroller.releasePointerCapture(playoffPanState.pointerId);
			} catch (_error) {
				// Ignore browsers that reject pointer release for this event.
			}
		}

		playoffPanState.scroller.classList.remove("is-panning");
	}

	playoffPanState.active = false;
	playoffPanState.pointerId = null;
	playoffPanState.scroller = null;
	playoffPanState.startX = 0;
	playoffPanState.startY = 0;
	playoffPanState.startScrollLeft = 0;
	playoffPanState.startScrollTop = 0;
	playoffPanState.canPanHorizontally = false;
	playoffPanState.canPanVertically = false;
	playoffPanState.moved = false;

	if (suppressClick) {
		playoffPanState.suppressClickUntil = Date.now() + 300;
	}
}

function handleDragStart(event) {
	if (isSectionReadOnly("groups")) {
		return;
	}

	const row = event.target.closest("[data-drag-kind]");

	if (!row) {
		return;
	}

	dragPayload = {
		kind: row.dataset.dragKind,
		group: row.dataset.group || null,
		index: Number(row.dataset.index),
	};

	event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
	if (isSectionReadOnly("groups")) {
		return;
	}

	const dropZone = event.target.closest("[data-drop-zone]");

	if (!dropZone || !dragPayload) {
		return;
	}

	event.preventDefault();

	const targetRow = event.target.closest("[data-index]");
	const targetIndex = targetRow ? Number(targetRow.dataset.index) : null;

	if (dropZone.dataset.dropZone === "group" && dragPayload.kind === "group") {
		if (dragPayload.group !== dropZone.dataset.group || targetIndex === null || targetIndex === dragPayload.index) {
			return;
		}

		const targetRect = targetRow.getBoundingClientRect();
		const targetMidpoint = targetRect.top + targetRect.height / 2;
		const movingDown = dragPayload.index < targetIndex;
		const crossedThreshold = movingDown ? event.clientY >= targetMidpoint : event.clientY <= targetMidpoint;

		if (!crossedThreshold) {
			return;
		}

		reorderGroup(dropZone.dataset.group, dragPayload.index, targetIndex);
		dragPayload.index = targetIndex;
	}
}

function handleDrop(event) {
	if (isSectionReadOnly("groups")) {
		return;
	}

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

		reorderGroup(dropZone.dataset.group, dragPayload.index, targetIndex === null ? state.groups.find((group) => group.letter === dragPayload.group).teams.length - 1 : targetIndex);
		return;
	}
}

function reorderGroup(groupLetter, fromIndex, toIndex) {
	if (isSectionReadOnly("groups")) {
		return;
	}

	const group = state.groups.find((entry) => entry.letter === groupLetter);

	if (!group || fromIndex === toIndex || toIndex < 0 || toIndex >= group.teams.length) {
		return;
	}

	const previousRects = captureRowRects(".group-table-row[data-team-id]");

	moveItem(group.teams, fromIndex, toIndex);
	group.teams.forEach((team, index) => {
		team.standing.rank = index + 1;
	});
	state.thirdPlaceRanking = deriveThirdPlaceRanking(
		state.groups,
		state.thirdPlaceRanking.map((team) => team.id),
	);
	state.selectedThirdTeamIds = chooseThirdPlaceSelections(state.selectedThirdTeamIds);
	renderInteractiveViews();
	animateMovedRows(previousRects, ".group-table-row[data-team-id]");
	scheduleAutoSave();
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

	const gdDelta = (right.standing?.goalDifference ?? Number.NEGATIVE_INFINITY) - (left.standing?.goalDifference ?? Number.NEGATIVE_INFINITY);
	if (gdDelta !== 0) {
		return gdDelta;
	}

	const gfDelta = (right.standing?.goalsFor ?? Number.NEGATIVE_INFINITY) - (left.standing?.goalsFor ?? Number.NEGATIVE_INFINITY);
	if (gfDelta !== 0) {
		return gfDelta;
	}

	return `${left.groupLetter}${left.name}`.localeCompare(`${right.groupLetter}${right.name}`);
}

function getCurrentQualifiers() {
	return {
		winners: state.groups.map((group) => group.teams[0]).filter(Boolean),
		runnersUp: state.groups.map((group) => group.teams[1]).filter(Boolean),
		bestThird: getSelectedBestThirdTeams(),
	};
}

function getSelectedBestThirdTeams() {
	const teamMap = new Map(state.thirdPlaceRanking.map((team) => [getTeamIdKey(team.id), team]));

	return state.selectedThirdTeamIds.map((teamId) => teamMap.get(getTeamIdKey(teamId))).filter(Boolean);
}

function getSelectedThirdTeamRank(teamId) {
	const selectedIndex = state.selectedThirdTeamIds.indexOf(getTeamIdKey(teamId));
	return selectedIndex >= 0 ? selectedIndex + 1 : 0;
}

function chooseThirdPlaceSelections(preferredIds) {
	const availableTeams = state.thirdPlaceRanking;
	const availableIds = new Set(availableTeams.map((team) => getTeamIdKey(team.id)));

	return Array.from(new Set((preferredIds || []).map(getTeamIdKey).filter((teamId) => availableIds.has(teamId)))).slice(0, 8);
}

function toggleThirdPlaceSelection(teamId) {
	if (isSectionReadOnly("thirdPlace")) {
		return;
	}

	const teamKey = getTeamIdKey(teamId);

	if (!teamKey) {
		return;
	}

	const isSelected = state.selectedThirdTeamIds.includes(teamKey);

	if (isSelected) {
		state.selectedThirdTeamIds = state.selectedThirdTeamIds.filter((id) => id !== teamKey);
	} else if (state.selectedThirdTeamIds.length < 8) {
		state.selectedThirdTeamIds = [...state.selectedThirdTeamIds, teamKey];
	} else {
		return;
	}

	renderThirdPlace();
	renderPlayoffBoard();
	renderFixtures();
	scheduleAutoSave();
}

function toggleBracketWinnerSelection(matchId, teamId) {
	if (isSectionReadOnly("playoffs")) {
		return;
	}

	const matchKey = String(matchId || "").trim();
	const teamKey = getTeamIdKey(teamId);

	if (!matchKey || !teamKey) {
		return;
	}

	if (state.bracketWinnerSelections[matchKey] === teamKey) {
		const nextSelections = { ...state.bracketWinnerSelections };
		delete nextSelections[matchKey];
		state.bracketWinnerSelections = nextSelections;
	} else {
		state.bracketWinnerSelections = {
			...state.bracketWinnerSelections,
			[matchKey]: teamKey,
		};
	}

	renderPlayoffBoard();
	renderFixtures();
	scheduleAutoSave();
}

function clearBracketSourceSelection(sourceMatchId) {
	if (isSectionReadOnly("playoffs")) {
		return;
	}

	const matchKey = String(sourceMatchId || "").trim();

	if (!matchKey || !state.bracketWinnerSelections[matchKey]) {
		return;
	}

	const nextSelections = { ...state.bracketWinnerSelections };
	delete nextSelections[matchKey];
	state.bracketWinnerSelections = nextSelections;
	renderPlayoffBoard();
	renderFixtures();
	scheduleAutoSave();
}

function getProjectedPlayoffData() {
	if (!state.worldCup?.playoffBoard?.knockoutTemplate) {
		state.playoffMatches = [];
		return { projectedMatches: [] };
	}

	const qualifiers = getCurrentQualifiers();
	const knockoutTemplate = state.worldCup.playoffBoard.knockoutTemplate;
	const thirdPlaceAssignments = buildThirdPlaceAssignments(knockoutTemplate, qualifiers.bestThird);
	const projectedMatchMap = new Map();
	const projectedMatches = knockoutTemplate.map((match) => {
		const projectedMatch = projectMatch(match, {
			bestThird: qualifiers.bestThird,
			thirdPlaceAssignments,
			projectedMatchMap,
			winnerSelections: state.bracketWinnerSelections,
		});
		const selectedWinner = getSelectedWinnerSide(projectedMatch, state.bracketWinnerSelections);
		projectedMatch.selectedWinnerTeamId = selectedWinner?.team ? getTeamIdKey(selectedWinner.team.id) : "";
		projectedMatchMap.set(projectedMatch.match, projectedMatch);
		return projectedMatch;
	});
	const cleanedSelections = Object.fromEntries(projectedMatches.flatMap((match) => (match.selectedWinnerTeamId ? [[String(match.match), match.selectedWinnerTeamId]] : [])));

	if (!areWinnerSelectionsEqual(state.bracketWinnerSelections, cleanedSelections)) {
		state.bracketWinnerSelections = cleanedSelections;
	}

	state.playoffMatches = projectedMatches;
	return {
		qualifiers,
		projectedMatches,
		thirdPlaceAssignments,
	};
}

function areWinnerSelectionsEqual(left, right) {
	const leftKeys = Object.keys(left || {});
	const rightKeys = Object.keys(right || {});

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((key) => left[key] === right[key]);
}

function projectMatch(match, projectionContext) {
	return {
		...match,
		home: resolveProjectedSide(match.homeSource, projectionContext, createThirdPlaceSlotKey(match.match, "home")),
		away: resolveProjectedSide(match.awaySource, projectionContext, createThirdPlaceSlotKey(match.match, "away")),
	};
}

function resolveProjectedSide(source, projectionContext, thirdPlaceSlotKey = "") {
	const { bestThird, thirdPlaceAssignments = new Map(), projectedMatchMap = new Map(), winnerSelections = {} } = projectionContext;

	if (source.type === "groupPlacement") {
		const group = state.groups.find((entry) => entry.letter === source.group);
		const team = group?.teams?.[source.placement - 1] || null;

		return {
			type: "team",
			label: team ? `${team.groupLetter}${source.placement} • ${getTeamCode(team)}` : `${source.group}${source.placement}`,
			groupSlot: `${source.group}${source.placement}`,
			team,
		};
	}

	if (source.type === "thirdEligible") {
		const assignedTeam = thirdPlaceAssignments.get(thirdPlaceSlotKey) || null;

		if (assignedTeam) {
			return {
				type: "team",
				label: `${assignedTeam.groupLetter}3 • ${getTeamCode(assignedTeam)}`,
				groupSlot: `${assignedTeam.groupLetter}3`,
				team: assignedTeam,
			};
		}

		return {
			type: "thirdEligible",
			label: formatThirdEligibleLabel(
				bestThird.filter((team) => source.groups.includes(team.groupLetter)),
				source.groups,
			),
			candidates: [],
		};
	}

	if (source.type === "matchWinner" || source.type === "matchLoser") {
		return resolveLinkedMatchSide(source, projectedMatchMap, winnerSelections);
	}

	return createMatchLinkSide(source);
}

function resolveLinkedMatchSide(source, projectedMatchMap, winnerSelections) {
	const sourceMatch = projectedMatchMap.get(source.match);

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

function createMatchLinkSide(source) {
	return {
		type: "matchLink",
		label: `${source.type === "matchLoser" ? "Loser" : "Winner"} match ${source.match}`,
		match: source.match,
	};
}

function cloneProjectedTeamSide(side) {
	return {
		...side,
		team: side.team,
	};
}

function getSelectedWinnerSide(match, winnerSelections = state.bracketWinnerSelections) {
	const selectedTeamId = winnerSelections?.[String(match.match)];

	if (!selectedTeamId) {
		return null;
	}

	if (match.home?.type === "team" && match.home.team && getTeamIdKey(match.home.team.id) === selectedTeamId) {
		return match.home;
	}

	if (match.away?.type === "team" && match.away.team && getTeamIdKey(match.away.team.id) === selectedTeamId) {
		return match.away;
	}

	return null;
}

function buildPlayoffBracketLayout(projectedMatches) {
	const matchMap = new Map(projectedMatches.map((match) => [match.match, match]));

	return {
		left: [
			{
				stage: "Round of 32",
				className: "round-of-32",
				matches: [74, 77, 73, 75, 83, 84, 81, 82].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Round of 16",
				className: "round-of-16",
				matches: [89, 90, 93, 94].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Quarter-finals",
				className: "quarter-finals",
				matches: [97, 98].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Semi-finals",
				className: "semi-finals",
				matches: [101].map((id) => matchMap.get(id)).filter(Boolean),
			},
		],
		right: [
			{
				stage: "Semi-finals",
				className: "semi-finals",
				matches: [102].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Quarter-finals",
				className: "quarter-finals",
				matches: [99, 100].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Round of 16",
				className: "round-of-16",
				matches: [91, 92, 95, 96].map((id) => matchMap.get(id)).filter(Boolean),
			},
			{
				stage: "Round of 32",
				className: "round-of-32",
				matches: [76, 78, 79, 80, 86, 88, 85, 87].map((id) => matchMap.get(id)).filter(Boolean),
			},
		],
		final: matchMap.get(104) || null,
		thirdPlace: matchMap.get(103) || null,
	};
}

function buildThirdPlaceAssignments(knockoutTemplate, selectedTeams) {
	const slots = knockoutTemplate
		.flatMap((match) => [
			{ key: createThirdPlaceSlotKey(match.match, "home"), side: "home", match: match.match, source: match.homeSource },
			{ key: createThirdPlaceSlotKey(match.match, "away"), side: "away", match: match.match, source: match.awaySource },
		])
		.filter((slot) => slot.source?.type === "thirdEligible")
		.map((slot, index) => ({
			...slot,
			index,
			groups: slot.source.groups,
		}));

	if (!selectedTeams.length || !slots.length) {
		return new Map();
	}

	const teamOrder = new Map(selectedTeams.map((team, index) => [team.id, index]));
	const teamEntries = selectedTeams
		.map((team) => ({
			team,
			slots: slots.filter((slot) => slot.groups.includes(team.groupLetter)).sort((left, right) => left.index - right.index),
		}))
		.sort((left, right) => {
			const slotDelta = left.slots.length - right.slots.length;

			if (slotDelta !== 0) {
				return slotDelta;
			}

			return (teamOrder.get(left.team.id) ?? 0) - (teamOrder.get(right.team.id) ?? 0);
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

function renderBracketHalf(side, rounds) {
	return `
    <section class="bracket-half bracket-half-${escapeHtml(side)}">
      ${rounds.map(renderBracketRound).join("")}
    </section>
  `;
}

function renderBracketRound(round) {
	return `
    <div class="bracket-round-column ${escapeHtml(round.className)}">
      <div class="bracket-stage-head">
        <h3>${escapeHtml(round.stage)}</h3>
      </div>
      <div class="bracket-stage-matches">
        ${round.matches.map((match) => renderBracketMatch(match)).join("")}
      </div>
    </div>
  `;
}

function renderBracketMatch(match, extraClass = "") {
	return `
    <article class="bracket-match ${escapeHtml(extraClass)}" data-match-id="${match.match}">
      <div class="bracket-match-meta">
        <span class="bracket-match-date">${escapeHtml(formatDate(match.date))}</span>
        <a
          class="bracket-match-venue"
          href="${escapeHtml(getVenueMapsUrl(match.venue))}"
          target="_blank"
          rel="noreferrer noopener"
        >
          ${escapeHtml(match.venue)}
        </a>
      </div>
      <div class="bracket-sides">
        ${renderBracketSide(match, match.home, match.homeSource)}
        ${renderBracketSide(match, match.away, match.awaySource)}
      </div>
    </article>
  `;
}

function renderBracketSide(match, side, source) {
	if (side.type === "team" && side.team) {
		const teamId = getTeamIdKey(side.team.id);
		const isSelected = match.selectedWinnerTeamId === teamId;
		const canClear = canClearBracketSide(match, source);
		const isDisabled = isSectionReadOnly("playoffs");

		return `
      <div class="bracket-side-shell">
        <button
          class="bracket-side bracket-side-pick ${isSelected ? "is-selected" : ""} ${canClear ? "has-clear" : ""}"
          type="button"
          data-pick-winner="true"
          data-match="${match.match}"
          data-team-id="${escapeHtml(teamId)}"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="Pick ${escapeHtml(getTeamDisplayName(side.team))} to win ${escapeHtml(match.stage)}"
          ${isDisabled ? "disabled" : ""}
        >
          ${renderBracketTeamRow(side.team, side.groupSlot)}
        </button>
        ${
									canClear
										? `
          <button
            class="bracket-side-clear"
            type="button"
            data-clear-bracket-source="true"
            data-source-match="${escapeHtml(String(source.match))}"
            aria-label="Remove ${escapeHtml(getTeamDisplayName(side.team))} from this bracket slot"
            ${isDisabled ? "disabled" : ""}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        `
										: ""
								}
      </div>
    `;
	}

	if (side.type === "thirdEligible") {
		return `
      <div class="bracket-side">
        ${side.candidates.length ? renderBracketFlagOptions(side.candidates) : `<div class="bracket-placeholder-row">${escapeHtml(side.label)}</div>`}
      </div>
    `;
	}

	return `
    <div class="bracket-side">
      <div class="bracket-placeholder-row">
        <strong>${escapeHtml(side.label)}</strong>
      </div>
    </div>
  `;
}

function canClearBracketSide(match, source) {
	if (!source || !match?.stage) {
		return false;
	}

	const stage = String(match.stage).toLowerCase();
	return !stage.includes("round of 32") && (source.type === "matchWinner" || source.type === "matchLoser");
}

function renderBracketTeamRow(team, groupSlot) {
	return `
    <div class="bracket-team-row">
      <span class="bracket-team-flag-cell">
        ${renderTeamLogo(team)}
      </span>
      <strong>${renderTeamCode(team, "team-code bracket-team-code")}</strong>
      <span class="bracket-team-group">${escapeHtml(groupSlot || team?.groupLetter || "TBD")}</span>
    </div>
  `;
}

function renderBracketFlagOptions(teams) {
	return `
    <div class="bracket-flag-options">
      ${teams.map((team) => `<span class="bracket-flag-option">${renderTeamLogo(team)}</span>`).join("")}
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
        <strong>${renderTeamCode(entry.teams.home)} vs ${renderTeamCode(entry.teams.away)}</strong>
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

function renderThirdPlaceSelectionCard(team) {
	const isSelected = state.selectedThirdTeamIds.includes(getTeamIdKey(team.id));
	const selectedRank = getSelectedThirdTeamRank(team.id);
	const points = team.standing?.points != null ? String(team.standing.points) : "-";
	const goalDifference = team.standing?.goalDifference != null ? formatSignedValue(team.standing.goalDifference) : "-";
	const lockedOut = !isSelected && state.selectedThirdTeamIds.length >= 8;
	const isDisabled = isSectionReadOnly("thirdPlace") || lockedOut;
	const groupLabel = selectedRank ? `#${selectedRank} • ${team.groupLetter}` : team.groupLetter;

	return `
    <button
      class="third-choice-card ${isSelected ? "is-selected" : ""} ${lockedOut ? "is-locked" : ""}"
      type="button"
      data-select-third="true"
      data-team-id="${escapeHtml(String(team.id))}"
      aria-pressed="${isSelected ? "true" : "false"}"
      ${isDisabled ? "disabled" : ""}
    >
      <div class="third-choice-head">
        <div class="team-name">
          ${renderTeamLogo(team)}
          ${renderTeamCode(team)}
        </div>
        <span class="third-choice-group">${escapeHtml(groupLabel)}</span>
      </div>
      <p class="third-choice-name">${escapeHtml(team.name)}</p>
      <div class="third-choice-stats">
        <span>${escapeHtml(points)} pts</span>
        <span>${escapeHtml(goalDifference)} GD</span>
      </div>
    </button>
  `;
}

function renderTeamRow(team, index, groupLetter, listType) {
	const isGroupList = listType === "group";
	const positionClass = index < 2 ? "qualify" : index === 2 ? "third-place" : "out";
	const badge = listType === "third" ? (index < 8 ? "Advances" : "Out") : index < 2 ? "Qualifies" : index === 2 ? "Third-place race" : "Out";

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
          ${renderTeamCode(team)}
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

function renderGroupTableRow(team, index, groupLetter) {
	const positionClass = index < 2 ? "qualify" : index === 2 ? "third-place" : "out";
	const badge = index < 2 ? "Qualifies" : index === 2 ? "Third-place race" : "Out";
	const canDrag = !isSectionReadOnly("groups");

	return `
    <tr
      class="group-table-row ${positionClass}"
      draggable="${canDrag ? "true" : "false"}"
      data-drag-kind="group"
      data-group="${escapeHtml(groupLetter)}"
      data-index="${index}"
      data-team-id="${escapeHtml(String(team.id))}"
    >
      <td class="group-rank-cell">${index + 1}</td>
      <td>
        <div class="team-cell">
          ${renderTeamLogo(team)}
          <div class="team-cell-copy">
            <strong>${renderTeamCode(team)}</strong>
          </div>
        </div>
      </td>
      <td>
        <span class="muted">${escapeHtml(badge)}</span>
      </td>
    </tr>
  `;
}

function renderTeamLogo(team) {
	const tooltip = getTeamDisplayName(team);

	if (!team) {
		return renderTeamTooltip(`<span class="team-logo-fallback">TBD</span>`, tooltip, "team-mark");
	}

	if (team.logo) {
		return renderTeamTooltip(`<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(tooltip)} logo" />`, tooltip, "team-mark");
	}

	return renderTeamTooltip(`<span class="team-logo-fallback">${escapeHtml((team.code || team.name).slice(0, 3))}</span>`, tooltip, "team-mark");
}

function getTeamCode(team) {
	if (!team) {
		return "TBD";
	}

	const code = String(team.code || "")
		.trim()
		.toUpperCase();

	if (code) {
		return code;
	}

	return deriveFallbackCode(team.name || team.country || "TBD");
}

function getTeamIdKey(teamId) {
	if (teamId == null) {
		return "";
	}

	return String(teamId);
}

function renderTeamCode(team, className = "") {
	const classes = ["team-code", className].filter(Boolean).join(" ");
	const tooltip = getTeamDisplayName(team);

	return renderTeamTooltip(`<span class="${escapeHtml(classes)}">${escapeHtml(getTeamCode(team))}</span>`, tooltip);
}

function getTeamDisplayName(team) {
	if (!team) {
		return "Team to be determined";
	}

	return team.country || team.name || getTeamCode(team);
}

function renderTeamTooltip(content, tooltip, className = "") {
	const classes = ["team-tooltip", className].filter(Boolean).join(" ");
	return `<span class="${escapeHtml(classes)}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">${content}</span>`;
}

function handleTooltipMouseOver(event) {
	const trigger = event.target.closest(".team-tooltip[data-tooltip]");

	if (!trigger) {
		return;
	}

	showFloatingTooltip(trigger);
}

function handleTooltipMouseOut(event) {
	const trigger = event.target.closest(".team-tooltip[data-tooltip]");

	if (!trigger || tooltipState.target !== trigger) {
		return;
	}

	if (event.relatedTarget instanceof Element && trigger.contains(event.relatedTarget)) {
		return;
	}

	hideFloatingTooltip();
}

function handleTooltipViewportChange() {
	if (!tooltipState.target) {
		return;
	}

	scheduleFloatingTooltipPosition();
}

function ensureFloatingTooltipElement() {
	if (tooltipState.element) {
		return tooltipState.element;
	}

	const element = document.createElement("div");
	element.className = "floating-tooltip";
	element.setAttribute("role", "tooltip");
	document.body.appendChild(element);
	tooltipState.element = element;
	return element;
}

function showFloatingTooltip(target) {
	const tooltip = target?.dataset?.tooltip;

	if (!tooltip) {
		hideFloatingTooltip();
		return;
	}

	const element = ensureFloatingTooltipElement();
	tooltipState.target = target;
	element.textContent = tooltip;
	element.classList.add("is-visible");
	scheduleFloatingTooltipPosition();
}

function scheduleFloatingTooltipPosition() {
	if (tooltipState.rafId) {
		cancelAnimationFrame(tooltipState.rafId);
	}

	tooltipState.rafId = requestAnimationFrame(() => {
		tooltipState.rafId = 0;
		positionFloatingTooltip();
	});
}

function positionFloatingTooltip() {
	const { element, target } = tooltipState;

	if (!element || !target) {
		return;
	}

	if (!document.body.contains(target)) {
		hideFloatingTooltip();
		return;
	}

	const rect = target.getBoundingClientRect();

	if (!rect.width && !rect.height) {
		hideFloatingTooltip();
		return;
	}

	const padding = 12;
	const gap = 10;
	const tooltipWidth = element.offsetWidth;
	const tooltipHeight = element.offsetHeight;
	const centerX = rect.left + rect.width / 2;
	const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding);
	const left = Math.min(Math.max(centerX - tooltipWidth / 2, padding), maxLeft);
	let top = rect.top - tooltipHeight - gap;
	let placement = "top";

	if (top < padding) {
		top = rect.bottom + gap;
		placement = "bottom";
	}

	const maxTop = Math.max(padding, window.innerHeight - tooltipHeight - padding);
	top = Math.min(Math.max(top, padding), maxTop);

	element.dataset.placement = placement;
	element.style.left = `${Math.round(left)}px`;
	element.style.top = `${Math.round(top)}px`;
	element.style.setProperty("--tooltip-arrow-left", `${Math.round(Math.min(Math.max(centerX - left, 14), tooltipWidth - 14))}px`);
}

function hideFloatingTooltip() {
	if (tooltipState.rafId) {
		cancelAnimationFrame(tooltipState.rafId);
		tooltipState.rafId = 0;
	}

	tooltipState.target = null;

	if (!tooltipState.element) {
		return;
	}

	tooltipState.element.classList.remove("is-visible");
	tooltipState.element.textContent = "";
	tooltipState.element.dataset.placement = "top";
	tooltipState.element.style.removeProperty("left");
	tooltipState.element.style.removeProperty("top");
	tooltipState.element.style.removeProperty("--tooltip-arrow-left");
}

function formatThirdEligibleLabel(candidates, groups) {
	if (candidates.length) {
		return candidates.map((team) => getTeamCode(team)).join("/");
	}

	return groups.join("/");
}

function deriveFallbackCode(value) {
	const text = String(value || "")
		.normalize("NFKD")
		.replace(/[^\p{L}\s]/gu, " ")
		.trim();

	if (!text) {
		return "TBD";
	}

	const parts = text.split(/\s+/).filter(Boolean);

	if (parts.length >= 3) {
		return parts
			.slice(0, 3)
			.map((part) => part[0])
			.join("")
			.toUpperCase();
	}

	if (parts.length === 2) {
		return `${parts[0][0] || ""}${parts[1].slice(0, 2)}`.toUpperCase();
	}

	return parts[0].slice(0, 3).toUpperCase();
}

function getVenueMapsUrl(venue) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue} stadium`)}`;
}

function scheduleBracketLineDraw() {
	requestAnimationFrame(layoutBracketBoard);
}

function layoutBracketBoard() {
	layoutBracketMatches();
	syncPlayoffPanAvailability();
	drawBracketLines();
}

function syncPlayoffPanAvailability() {
	const scroller = elements.playoffBoard.querySelector(".playoff-bracket-scroll");

	if (!scroller) {
		return;
	}

	const canPanHorizontally = scroller.scrollWidth > scroller.clientWidth + 1;
	const canPanVertically = scroller.scrollHeight > scroller.clientHeight + 1;
	scroller.classList.toggle("is-drag-scrollable", canPanHorizontally || canPanVertically);
}

function layoutBracketMatches() {
	const shell = elements.playoffBoard.querySelector(".playoff-bracket-shell");

	if (!shell || !state.playoffMatches.length) {
		return;
	}

	shell.querySelectorAll(".bracket-match").forEach((element) => {
		element.style.marginTop = "0px";
	});

	const stageOrder = ["Round of 16", "Quarter-finals", "Semi-finals"];

	for (const stage of stageOrder) {
		const entries = state.playoffMatches
			.filter((match) => match.stage === stage)
			.map((match) => ({
				match,
				element: shell.querySelector(`[data-match-id="${match.match}"]`),
			}))
			.filter((entry) => entry.element)
			.sort((left, right) => left.element.getBoundingClientRect().top - right.element.getBoundingClientRect().top);

		for (const entry of entries) {
			positionMatchFromSources(shell, entry.match, entry.element);
		}
	}

	positionCenterMatches(shell);
}

function positionMatchFromSources(shell, match, element) {
	const sourceElements = [match.homeSource, match.awaySource]
		.filter((source) => source?.type === "matchWinner" || source?.type === "matchLoser")
		.map((source) => shell.querySelector(`[data-match-id="${source.match}"]`))
		.filter(Boolean);

	if (sourceElements.length < 2) {
		return;
	}

	positionMatchByCenter(shell, element, averageMatchCenters(shell, sourceElements));
}

function positionCenterMatches(shell) {
	const finalElement = shell.querySelector('[data-match-id="104"]');
	const thirdPlaceElement = shell.querySelector('[data-match-id="103"]');
	const semiFinalElements = [101, 102].map((matchId) => shell.querySelector(`[data-match-id="${matchId}"]`)).filter(Boolean);

	if (finalElement && semiFinalElements.length === 2) {
		positionMatchByCenter(shell, finalElement, averageMatchCenters(shell, semiFinalElements));
	}

	if (!thirdPlaceElement) {
		return;
	}

	const shellRect = shell.getBoundingClientRect();
	const container = thirdPlaceElement.parentElement;
	const gap = getContainerGap(container);
	const previous = thirdPlaceElement.previousElementSibling;
	const currentRect = thirdPlaceElement.getBoundingClientRect();
	const currentTop = currentRect.top - shellRect.top;

	if (!previous) {
		return;
	}

	const previousRect = previous.getBoundingClientRect();
	const minimumTop = previousRect.bottom - shellRect.top + gap;

	if (minimumTop > currentTop) {
		thirdPlaceElement.style.marginTop = `${minimumTop - currentTop}px`;
	}
}

function positionMatchByCenter(shell, element, desiredCenter) {
	const shellRect = shell.getBoundingClientRect();
	const container = element.parentElement;
	const gap = getContainerGap(container);
	const elementRect = element.getBoundingClientRect();
	const currentTop = elementRect.top - shellRect.top;
	const desiredTop = desiredCenter - elementRect.height / 2;
	const previous = element.previousElementSibling;
	const containerTop = container.getBoundingClientRect().top - shellRect.top;
	const minimumTop = previous ? previous.getBoundingClientRect().bottom - shellRect.top + gap : containerTop;
	const targetTop = Math.max(desiredTop, minimumTop);

	if (targetTop > currentTop) {
		element.style.marginTop = `${targetTop - currentTop}px`;
	}
}

function averageMatchCenters(shell, elements) {
	const shellRect = shell.getBoundingClientRect();

	return elements.reduce((total, element) => total + (element.getBoundingClientRect().top - shellRect.top + element.getBoundingClientRect().height / 2), 0) / elements.length;
}

function getContainerGap(container) {
	const styles = window.getComputedStyle(container);
	return Number.parseFloat(styles.rowGap || styles.gap || "0") || 0;
}

function drawBracketLines() {
	const shell = elements.playoffBoard.querySelector(".playoff-bracket-shell");
	const svg = elements.playoffBoard.querySelector(".bracket-lines");

	if (!shell || !svg || !state.playoffMatches.length) {
		return;
	}

	const shellRect = shell.getBoundingClientRect();
	const width = Math.ceil(shell.scrollWidth);
	const height = Math.ceil(shell.scrollHeight);
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.setAttribute("width", `${width}`);
	svg.setAttribute("height", `${height}`);

	const paths = [];

	for (const targetMatch of state.playoffMatches) {
		for (const source of [targetMatch.homeSource, targetMatch.awaySource]) {
			if (source?.type !== "matchWinner" && source?.type !== "matchLoser") {
				continue;
			}

			const fromElement = shell.querySelector(`[data-match-id="${source.match}"]`);
			const toElement = shell.querySelector(`[data-match-id="${targetMatch.match}"]`);

			if (!fromElement || !toElement) {
				continue;
			}

			const fromRect = fromElement.getBoundingClientRect();
			const toRect = toElement.getBoundingClientRect();
			const sourceOnLeft = fromRect.left < toRect.left;
			const startX = (sourceOnLeft ? fromRect.right : fromRect.left) - shellRect.left;
			const endX = (sourceOnLeft ? toRect.left : toRect.right) - shellRect.left;
			const startY = fromRect.top + fromRect.height / 2 - shellRect.top;
			const endY = toRect.top + toRect.height / 2 - shellRect.top;
			const midX = startX + (endX - startX) / 2;
			const path = `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
			const className = source.type === "matchLoser" ? "loser-path" : "winner-path";

			paths.push(`<path class="${className}" d="${path}" />`);
		}
	}

	svg.innerHTML = paths.join("");
}

function buildSavePayload(email) {
	const { projectedMatches } = getProjectedPlayoffData();
	const projectedRoundOf32 = projectedMatches.slice(0, 16).map((match) => ({
		match: match.match,
		stage: match.stage,
		date: match.date,
		venue: match.venue,
		home: serializeSide(match.home),
		away: serializeSide(match.away),
	}));

	return {
		email,
		userId: state.auth.user?.id || null,
		submittedAt: getLatestSubmittedAt() || null,
		sectionSubmittedAt: state.sectionSubmittedAt,
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
				teamName: team.name,
			})),
		})),
		thirdPlaceRanking: state.thirdPlaceRanking.map((team, index) => ({
			rank: index + 1,
			teamId: team.id,
			group: team.groupLetter,
			teamName: team.name,
		})),
		bestThirdAdvancers: getSelectedBestThirdTeams().map((team, index) => ({
			rank: index + 1,
			teamId: team.id,
			group: team.groupLetter,
			teamName: team.name,
		})),
		knockoutWinners: projectedMatches
			.map((match) => {
				const winner = getSelectedWinnerSide(match);

				if (!winner?.team) {
					return null;
				}

				return {
					match: match.match,
					stage: match.stage,
					teamId: winner.team.id,
					teamCode: getTeamCode(winner.team),
					teamName: winner.team.name,
					groupSlot: winner.groupSlot || "",
				};
			})
			.filter(Boolean),
		projectedRoundOf32,
	};
}

function serializeSide(side) {
	if (side.type === "team") {
		return {
			type: "team",
			label: side.label,
			teamId: side.team.id,
			teamName: side.team.name,
		};
	}

	if (side.type === "thirdEligible") {
		return {
			type: "thirdEligible",
			label: side.label,
			candidates: side.candidates.map((team) => ({
				teamId: team.id,
				teamName: team.name,
				group: team.groupLetter,
			})),
		};
	}

	return {
		type: side.type,
		label: side.label,
		match: side.match,
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
		(saved.thirdPlaceRanking || []).map((entry) => entry.teamId),
	);
	state.selectedThirdTeamIds = chooseThirdPlaceSelections(Array.isArray(saved.bestThirdAdvancers) ? saved.bestThirdAdvancers.map((entry) => entry.teamId) : []);
	state.bracketWinnerSelections = Object.fromEntries((Array.isArray(saved.knockoutWinners) ? saved.knockoutWinners : []).map((entry) => [String(entry.match || ""), getTeamIdKey(entry.teamId)]).filter(([matchId, teamId]) => matchId && teamId));
	state.sectionSubmittedAt = normalizeSectionSubmissionState(saved.sectionSubmittedAt, saved.submittedAt);
	state.submittedAt = getLatestSubmittedAt();
	state.submissionPendingSection = "";
}

function cloneGroups(groups) {
	return groups.map((group) => ({
		...group,
		teams: group.teams.map((team) => ({
			...team,
			standing: { ...(team.standing || {}) },
		})),
		fixtures: (group.fixtures || []).map((fixture) => ({ ...fixture })),
	}));
}

function moveItem(list, fromIndex, toIndex) {
	const [item] = list.splice(fromIndex, 1);
	list.splice(toIndex, 0, item);
}

function captureRowRects(selector) {
	const rects = new Map();

	document.querySelectorAll(selector).forEach((element) => {
		rects.set(element.dataset.teamId, element.getBoundingClientRect());
	});

	return rects;
}

function animateMovedRows(previousRects, selector) {
	if (!previousRects.size) {
		return;
	}

	requestAnimationFrame(() => {
		document.querySelectorAll(selector).forEach((element) => {
			const previousRect = previousRects.get(element.dataset.teamId);

			if (!previousRect) {
				return;
			}

			const nextRect = element.getBoundingClientRect();
			const deltaX = previousRect.left - nextRect.left;
			const deltaY = previousRect.top - nextRect.top;

			if (!deltaX && !deltaY) {
				return;
			}

			element.getAnimations().forEach((animation) => animation.cancel());
			element.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
				duration: 260,
				easing: "cubic-bezier(0.22, 1, 0.36, 1)",
			});
		});
	});
}

function pickFixturePreview(fixtures) {
	const now = Date.now();
	const upcoming = fixtures.filter((fixture) => new Date(fixture.date).getTime() >= now - 24 * 60 * 60 * 1000).slice(0, 12);

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

	const includeYear = date.getFullYear() !== 2026;

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		...(includeYear ? { year: "numeric" } : {}),
	}).format(date);
}

function formatCalendarMonthLabel(year, month) {
	return new Intl.DateTimeFormat(undefined, {
		month: "long",
		year: "numeric",
	}).format(new Date(year, month, 1));
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
		minute: "2-digit",
	}).format(date);
}

function formatTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "TBD";
	}

	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatLocation(venue) {
	return [venue.city, venue.country].filter(Boolean).join(", ") || "Location pending";
}

function formatStageShortLabel(stage) {
	const label = String(stage || "").toLowerCase();

	if (label.includes("group")) {
		return "Group Stage";
	}

	if (label.includes("round of 32")) {
		return "R32";
	}

	if (label.includes("round of 16")) {
		return "R16";
	}

	if (label.includes("quarter")) {
		return "QF";
	}

	if (label.includes("semi")) {
		return "SF";
	}

	if (label.includes("third")) {
		return "3P";
	}

	if (label.includes("final")) {
		return "F";
	}

	return stage || "Match";
}

function formatGoalDiff(value) {
	return `${Number(value) > 0 ? "+" : ""}${value} GD`;
}

function formatSignedValue(value) {
	return `${Number(value) > 0 ? "+" : ""}${value}`;
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
