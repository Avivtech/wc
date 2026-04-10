const APP_LOCALE = detectAppLocale();
const APP_INTL_LOCALE = APP_LOCALE === "he" ? "he-IL" : "en-US";
const TRANSLATIONS = {
	en: {
		loading: "Loading high scores...",
		unavailable: "High scores are not available right now.",
		updatedAt: "Updated {date}",
		empty: "No saved players yet.",
		displayName: "Display name",
		homeTeam: "Home Team",
		bonusPoints: "Bonus points",
		currentScore: "Current Score",
		pts: "pts",
		noHomeTeam: "No home team selected",
	},
	he: {
		loading: "טוען טבלת שיא...",
		unavailable: "טבלת השיא אינה זמינה כרגע.",
		updatedAt: "עודכן {date}",
		empty: "עדיין אין שחקנים ששמרו בחירות.",
		displayName: "שם תצוגה",
		homeTeam: "נבחרת בית",
		bonusPoints: "נקודות בונוס",
		currentScore: "ניקוד נוכחי",
		pts: "נק׳",
		noHomeTeam: "לא נבחרה נבחרת בית",
	},
};

const elements = {
	status: document.getElementById("leaderboard-status"),
	list: document.getElementById("leaderboard-list"),
};

void boot();

async function boot() {
	elements.status.textContent = t("loading");

	try {
		const response = await fetch("/api/high-scores");
		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(t("unavailable"));
		}

		renderEntries(Array.isArray(data.entries) ? data.entries : []);
		elements.status.textContent = data.updatedAt ? t("updatedAt", { date: formatDateTime(data.updatedAt) }) : "";
	} catch (_error) {
		elements.status.textContent = t("unavailable");
		elements.list.innerHTML = `<div class="empty-state">${escapeHtml(t("unavailable"))}</div>`;
	}
}

function renderEntries(entries) {
	if (!entries.length) {
		elements.list.innerHTML = `<div class="empty-state">${escapeHtml(t("empty"))}</div>`;
		return;
	}

	elements.list.innerHTML = entries
		.map(
			(entry, index) => `
				<article class="leaderboard-row">
					<div class="leaderboard-rank">${index + 1}</div>
					<div class="leaderboard-user">
						<span class="leaderboard-label">${escapeHtml(t("displayName"))}</span>
						<strong class="leaderboard-name">${escapeHtml(entry.displayName || "---")}</strong>
					</div>
					<div class="leaderboard-home-team">
						<span class="leaderboard-label">${escapeHtml(t("homeTeam"))}</span>
						${renderHomeTeam(entry.homeTeam)}
					</div>
					<div class="leaderboard-score leaderboard-score-bonus">
						<span class="leaderboard-label">${escapeHtml(t("bonusPoints"))}</span>
						<strong class="leaderboard-score-value">${escapeHtml(String(Number(entry.bonusPoints || 0)))}</strong>
						<span class="leaderboard-score-unit">${escapeHtml(t("pts"))}</span>
					</div>
					<div class="leaderboard-score leaderboard-score-current">
						<span class="leaderboard-label">${escapeHtml(t("currentScore"))}</span>
						<strong class="leaderboard-score-value">${escapeHtml(String(Number(entry.currentScore || 0)))}</strong>
						<span class="leaderboard-score-unit">${escapeHtml(t("pts"))}</span>
					</div>
				</article>
			`,
		)
		.join("");
}

function renderHomeTeam(team) {
	if (!team) {
		return `<span class="leaderboard-home-team-line leaderboard-empty-team">${escapeHtml(t("noHomeTeam"))}</span>`;
	}

	return `
		<span class="leaderboard-home-team-line" title="${escapeHtml(team.teamName || "")}">
			${renderTeamLogo(team)}
			<span class="team-code">${escapeHtml(String(team.teamCode || "---"))}</span>
		</span>
	`;
}

function renderTeamLogo(team) {
	if (team?.teamLogo) {
		return `<img class="team-logo" src="${escapeHtml(team.teamLogo)}" alt="${escapeHtml(team.teamName || team.teamCode || "")} logo" />`;
	}

	return `<span class="team-logo-fallback">${escapeHtml(String(team?.teamCode || "---").slice(0, 3))}</span>`;
}

function detectAppLocale() {
	const path = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
	const htmlLang = String(document.documentElement.lang || "")
		.trim()
		.toLowerCase();

	if (htmlLang === "he" || path === "/he/high-scores" || path.startsWith("/he/")) {
		return "he";
	}

	return "en";
}

function t(key, variables = {}) {
	const template = TRANSLATIONS[APP_LOCALE]?.[key] ?? TRANSLATIONS.en[key] ?? key;

	return String(template).replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? ""));
}

function formatDateTime(value) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return new Intl.DateTimeFormat(APP_INTL_LOCALE, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
