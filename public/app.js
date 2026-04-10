import { attachClosestEdge, combine, draggable, dropTargetForElements, extractClosestEdge, monitorForElements } from "/vendor/pragmatic-dnd.js";

const APP_LOCALE = detectAppLocale();
const APP_INTL_LOCALE = APP_LOCALE === "he" ? "he-IL" : "en-US";
const DEV_PICKS_QUERY_PARAM = "devPicks";
const DEV_RESULTS_QUERY_PARAM = "devResults";
const DEV_GROUP_ORDER_PATTERNS = [
	[1, 0, 2, 3],
	[2, 0, 1, 3],
	[0, 2, 1, 3],
	[1, 2, 0, 3],
];
const TRANSLATIONS = {
	en: {
		authChecking: "Checking auth...",
		authUnavailable: "Sign in is currently unavailable.",
		authHintLogin: "Enter your email and password to log in.",
		authHintRegister: "Enter your display name, email, and password to create an account.",
		authButtonLogin: "Log in",
		authButtonRegister: "Sign up",
		authButtonLoggingIn: "Logging in...",
		authButtonSigningUp: "Signing up...",
		authValidationLogin: "Enter a valid email and password with at least 6 characters.",
		authValidationRegister: "Enter your display name, a valid email, and a password with at least 6 characters.",
		authFailureLogin: "Could not log in. Check your email and password.",
		authFailureRegister: "Could not create your account. Please try again.",
		authCreatingAccount: "Creating your account...",
		authSigningIn: "Signing you in...",
		authAccountCreatedSigningIn: "Account created. Signing you in...",
		authAccountCreatedConfirm: "Account created. Confirm your email if required, then log in.",
		authSignedIn: "Signed in.",
		authPleaseSignInAgain: "Please sign in again.",
		authSigningOut: "Signing out...",
		authSignOutFailed: "Could not sign out. Please try again.",
		authSignInFirst: "Sign in first.",
		authStartPredicting: "Sign in or register to start predicting.",
		authUnlockPredictions: "Sign in or register to unlock My Predictions.",
		welcomeBack: "Hi, Welcome back!",
		welcomeBackNamed: "Hi {name}, Welcome back!",
		homeTeamEmpty: "No home team selected yet.",
		homeTeamLiveEmpty: "Choose your home team in My Predictions to personalize the app theme.",
		homeTeamSelected: "Selected home team",
		homeTeamSearchPlaceholder: "Search by country or code",
		homeTeamNoResults: "No teams match this search.",
		saveStatusDevLive: "Development picks are loaded in My Predictions. Switch to inspect them locally.",
		saveStatusDevLocal: "Development picks are loaded locally. Changes stay local and do not overwrite saved picks.",
		saveStatusViewingLive: "Viewing live results. Switch to My Predictions to edit your picks.",
		saveStatusDefault: "Changes save automatically as you edit your picks. Submit when ready.",
		saveStatusClearedSaving: "All picks cleared. Saving changes...",
		saveStatusClearedLocal: "All picks cleared locally.",
		saveStatusSaving: "Saving changes...",
		saveStatusSavedOn: "Saved on {date}.",
		saveStatusNoSaved: "No saved picks yet. Changes will save automatically.",
		saveStatusLoadedOn: "Loaded saved picks from {date}.",
		saveStatusSubmitting: "Submitting your picks...",
		saveStatusSubmitted: "All picks submitted.",
		saveStatusDevSubmitted: "Development picks submitted locally.",
		signInToSubmit: "Sign in to submit your picks.",
		genericCouldNotLoadTournament: "Could not load the tournament right now.",
		genericCouldNotSavePicks: "Could not save your picks right now.",
		genericCouldNotLoadPicks: "Could not load your picks right now.",
		genericCouldNotSubmitPicks: "Could not submit your picks right now.",
		genericCouldNotScorePicks: "Could not score the current picks.",
		emptyGroups: "Load data to rank the groups.",
		emptyThirdPlace: "Third-place ranking will appear here.",
		emptyPlayoffs: "Projected playoff slots will appear here.",
		emptyFixtures: "Fixtures will appear here.",
		loadCalendar: "Load Calendar",
		noFixtureList: "No fixture list is available yet. Dates and locations will appear here when available.",
		calendarPrevious: "Previous",
		calendarNext: "Next",
		calendarVersus: "vs",
		calendarSelectedCount: "{count}/8 selected",
		calendarThirdPlace: "3rd Place",
		bracketFinals: "Finals",
		bracketDragHint: "To drag use two fingers or Ctrl / Cmd + drag",
		overallSubmit: "Submit",
		overallSubmitted: "Submitted",
		overallSubmitting: "Submitting...",
		groupCountry: "Country",
		groupCountryPrediction: "Country",
		groupWins: "W",
		groupLosses: "L",
		groupDraws: "D",
		groupGoalDiff: "GD",
		groupPoints: "Pts",
		pointsShort: "pts",
		goalDiffShort: "GD",
		tbd: "TBD",
		match: "Match",
		teamToBeDetermined: "Team to be determined",
		liveResults: "Live Results",
		myPredictions: "My Predictions",
		predictionsHeadline: "My Predictions",
		stageGroup: "Group Stage",
		stageRound32: "Round of 32",
		stageRound16: "Round of 16",
		stageQuarter: "Quarter-finals",
		stageSemi: "Semi-finals",
		stageFinal: "Final",
		stageThird: "Third-place play-off",
		stageGroupShort: "Group Stage",
		stageRound32Short: "R32",
		stageRound16Short: "R16",
		stageQuarterShort: "QF",
		stageSemiShort: "SF",
		stageFinalShort: "F",
		stageThirdShort: "3P",
		groupSingular: "Group",
		groupPlural: "Groups",
		matchWinner: "Winner match {match}",
		matchLoser: "Loser match {match}",
	},
	he: {
		authChecking: "בודק התחברות...",
		authUnavailable: "ההתחברות אינה זמינה כרגע.",
		authHintLogin: "הזינו אימייל וסיסמה כדי להתחבר.",
		authHintRegister: "הזינו שם תצוגה, אימייל וסיסמה כדי ליצור חשבון.",
		authButtonLogin: "התחברות",
		authButtonRegister: "הרשמה",
		authButtonLoggingIn: "מתחבר...",
		authButtonSigningUp: "נרשם...",
		authValidationLogin: "הזינו אימייל תקין וסיסמה באורך 6 תווים לפחות.",
		authValidationRegister: "הזינו שם תצוגה, אימייל תקין וסיסמה באורך 6 תווים לפחות.",
		authFailureLogin: "לא ניתן להתחבר כרגע. בדקו את האימייל והסיסמה.",
		authFailureRegister: "לא ניתן ליצור חשבון כרגע. נסו שוב.",
		authCreatingAccount: "יוצר את החשבון...",
		authSigningIn: "מחבר אותך...",
		authAccountCreatedSigningIn: "החשבון נוצר. מתחבר...",
		authAccountCreatedConfirm: "החשבון נוצר. אם נדרש, אשרו את האימייל ואז התחברו.",
		authSignedIn: "התחברתם בהצלחה.",
		authPleaseSignInAgain: "נא להתחבר שוב.",
		authSigningOut: "מתנתק...",
		authSignOutFailed: "לא ניתן להתנתק כרגע. נסו שוב.",
		authSignInFirst: "יש להתחבר תחילה.",
		authStartPredicting: "התחברו או הירשמו כדי להתחיל לנבא.",
		authUnlockPredictions: "התחברו או הירשמו כדי לפתוח את התחזיות שלי.",
		welcomeBack: "היי, ברוך שובך!",
		welcomeBackNamed: "היי {name}, ברוך שובך!",
		homeTeamEmpty: "עדיין לא נבחרה נבחרת בית.",
		homeTeamLiveEmpty: "בחרו את נבחרת הבית שלכם בהתחזיות שלי כדי להתאים את צבעי האפליקציה.",
		homeTeamSelected: "נבחרת הבית שנבחרה",
		homeTeamSearchPlaceholder: "חפשו לפי מדינה או קוד",
		homeTeamNoResults: "אין נבחרות שתואמות לחיפוש הזה.",
		saveStatusDevLive: "תחזיות הפיתוח נטענו אל התחזיות שלי. עברו אליהן כדי לבדוק מקומית.",
		saveStatusDevLocal: "תחזיות הפיתוח נטענו מקומית. השינויים נשמרים רק מקומית ואינם דורסים שמירות קיימות.",
		saveStatusViewingLive: "מוצגות כעת תוצאות חיות. עברו לתחזיות שלי כדי לערוך את הבחירות שלכם.",
		saveStatusDefault: "השינויים נשמרים אוטומטית בזמן העריכה. לחצו על שליחה כשתהיו מוכנים.",
		saveStatusClearedSaving: "כל הבחירות נמחקו. שומר שינויים...",
		saveStatusClearedLocal: "כל הבחירות נמחקו מקומית.",
		saveStatusSaving: "שומר שינויים...",
		saveStatusSavedOn: "נשמר ב-{date}.",
		saveStatusNoSaved: "עדיין אין שמירה. השינויים יישמרו אוטומטית.",
		saveStatusLoadedOn: "הבחירות נטענו מ-{date}.",
		saveStatusSubmitting: "שולח את הבחירות...",
		saveStatusSubmitted: "כל הבחירות נשלחו.",
		saveStatusDevSubmitted: "תחזיות הפיתוח נשלחו מקומית.",
		signInToSubmit: "התחברו כדי לשלוח את הבחירות.",
		genericCouldNotLoadTournament: "לא ניתן לטעון את הטורניר כרגע.",
		genericCouldNotSavePicks: "לא ניתן לשמור את הבחירות כרגע.",
		genericCouldNotLoadPicks: "לא ניתן לטעון את הבחירות כרגע.",
		genericCouldNotSubmitPicks: "לא ניתן לשלוח את הבחירות כרגע.",
		genericCouldNotScorePicks: "לא ניתן לחשב את הניקוד כרגע.",
		emptyGroups: "טענו נתונים כדי לדרג את הבתים.",
		emptyThirdPlace: "דירוג המקומות השלישיים יופיע כאן.",
		emptyPlayoffs: "מקומות הפלייאוף יוצגו כאן.",
		emptyFixtures: "לוח המשחקים יוצג כאן.",
		loadCalendar: "טען לוח משחקים",
		noFixtureList: "עדיין אין לוח משחקים זמין. תאריכים יופיעו כאן כשיהיו זמינים.",
		calendarPrevious: "הקודם",
		calendarNext: "הבא",
		calendarVersus: "נגד",
		calendarSelectedCount: "{count}/8 נבחרו",
		calendarThirdPlace: "מקום 3",
		bracketFinals: "גמרים",
		bracketDragHint: "לגרירה השתמשו בשתי אצבעות או ב-Ctrl / Cmd + גרירה",
		overallSubmit: "שליחה",
		overallSubmitted: "נשלח",
		overallSubmitting: "שולח...",
		groupCountry: "Country",
		groupCountryPrediction: "מדינה",
		groupWins: "W",
		groupLosses: "L",
		groupDraws: "D",
		groupGoalDiff: "GD",
		groupPoints: "Pts",
		pointsShort: "נק׳",
		goalDiffShort: "הפ׳",
		tbd: "טרם נקבע",
		match: "משחק",
		teamToBeDetermined: "הנבחרת תיקבע בהמשך",
		liveResults: "תוצאות חיות",
		myPredictions: "התחזיות שלי",
		predictionsHeadline: "התחזיות שלי",
		stageGroup: "שלב הבתים",
		stageRound32: "שלב 32",
		stageRound16: "שמינית הגמר",
		stageQuarter: "רבע הגמר",
		stageSemi: "חצי הגמר",
		stageFinal: "הגמר",
		stageThird: "המשחק על המקום השלישי",
		stageGroupShort: "בתים",
		stageRound32Short: "32",
		stageRound16Short: "16",
		stageQuarterShort: "רבע",
		stageSemiShort: "חצי",
		stageFinalShort: "גמר",
		stageThirdShort: "מקום 3",
		groupSingular: "בית",
		groupPlural: "בתים",
		matchWinner: "מנצחת משחק {match}",
		matchLoser: "מפסידת משחק {match}",
	},
};
const CALENDAR_WEEKDAYS = {
	en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	he: ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"],
};
const HOME_TEAM_THEMES = {
	ALG: { primary: "#0f8f56", secondary: "#f4f7f8", accent: "#d43f3f" },
	ARG: { primary: "#6fb9ef", secondary: "#f8fbff", accent: "#f4c54a" },
	AUS: { primary: "#173a82", secondary: "#f6c95b", accent: "#d84545" },
	AUT: { primary: "#d92d37", secondary: "#fbfcfd", accent: "#d92d37" },
	BEL: { primary: "#111111", secondary: "#f2c230", accent: "#d73d3d" },
	BIH: { primary: "#1554a5", secondary: "#f0c443", accent: "#fbfcfd" },
	BOS: { primary: "#1554a5", secondary: "#f0c443", accent: "#fbfcfd" },
	BRA: { primary: "#1c8b51", secondary: "#f3c63f", accent: "#2c5fb8" },
	CAN: { primary: "#d63f47", secondary: "#fbfcfd", accent: "#d63f47" },
	CPV: { primary: "#2158a8", secondary: "#f8fafc", accent: "#d84545" },
	CAP: { primary: "#2158a8", secondary: "#f8fafc", accent: "#d84545" },
	CIV: { primary: "#e48b2f", secondary: "#fbfcfd", accent: "#2f8f55" },
	IVO: { primary: "#e48b2f", secondary: "#fbfcfd", accent: "#2f8f55" },
	COD: { primary: "#56a6df", secondary: "#f0c43f", accent: "#d94d59" },
	CON: { primary: "#56a6df", secondary: "#f0c43f", accent: "#d94d59" },
	COL: { primary: "#f3ce41", secondary: "#1f56a5", accent: "#d94a4a" },
	CUW: { primary: "#2158a8", secondary: "#f2c94b", accent: "#fbfcfd" },
	CZE: { primary: "#f7f8f9", secondary: "#d63f47", accent: "#2158a8" },
	ECU: { primary: "#f0c73f", secondary: "#2158a8", accent: "#d94a4a" },
	EGY: { primary: "#d6454b", secondary: "#f7f8f9", accent: "#161616" },
	ENG: { primary: "#f7f9fb", secondary: "#d63f47", accent: "#2757a8" },
	ESP: { primary: "#d64646", secondary: "#f1c940", accent: "#8f1f1f" },
	SPA: { primary: "#d64646", secondary: "#f1c940", accent: "#8f1f1f" },
	FRA: { primary: "#2351a3", secondary: "#f8fafc", accent: "#d84d59" },
	GER: { primary: "#171717", secondary: "#d73d3d", accent: "#f1c243" },
	GHA: { primary: "#d84a4a", secondary: "#f0c53f", accent: "#2e8a4e" },
	HAI: { primary: "#2157a8", secondary: "#d64751", accent: "#f2c74a" },
	IRN: { primary: "#279054", secondary: "#f8fafc", accent: "#d7484f" },
	IRA: { primary: "#279054", secondary: "#f8fafc", accent: "#d7484f" },
	IRQ: { primary: "#d7484f", secondary: "#f7f8f9", accent: "#1c1c1c" },
	JPN: { primary: "#f8fafc", secondary: "#d8454f", accent: "#233c78" },
	JAP: { primary: "#f8fafc", secondary: "#d8454f", accent: "#233c78" },
	JOR: { primary: "#171717", secondary: "#f7f8f9", accent: "#2f8f54" },
	KOR: { primary: "#f8fafc", secondary: "#d8454f", accent: "#2757a8" },
	KSA: { primary: "#17874d", secondary: "#f8fafc", accent: "#17874d" },
	SAU: { primary: "#17874d", secondary: "#f8fafc", accent: "#17874d" },
	MAR: { primary: "#b7333b", secondary: "#2b8c54", accent: "#f7f8f9" },
	MEX: { primary: "#1f8a53", secondary: "#f8fafc", accent: "#d6484f" },
	MOR: { primary: "#b7333b", secondary: "#2b8c54", accent: "#f7f8f9" },
	NED: { primary: "#e58b2f", secondary: "#f8fafc", accent: "#2b5cae" },
	NET: { primary: "#e58b2f", secondary: "#f8fafc", accent: "#2b5cae" },
	NOR: { primary: "#c83743", secondary: "#f8fafc", accent: "#214f9d" },
	NZL: { primary: "#18386f", secondary: "#f8fafc", accent: "#d74652" },
	PAN: { primary: "#d84a4a", secondary: "#f8fafc", accent: "#2a5cab" },
	PAR: { primary: "#d84a4a", secondary: "#f8fafc", accent: "#2a5cab" },
	POR: { primary: "#1f8a53", secondary: "#c63b46", accent: "#f1c13f" },
	QAT: { primary: "#7a2942", secondary: "#f7f4f6", accent: "#7a2942" },
	RSA: { primary: "#2f8f54", secondary: "#f1c53f", accent: "#d84852" },
	SCO: { primary: "#2b5db0", secondary: "#f8fafc", accent: "#2b5db0" },
	SEN: { primary: "#2f8f54", secondary: "#f1c53f", accent: "#d84852" },
	SOU: { primary: "#2f8f54", secondary: "#f1c53f", accent: "#d84852" },
	SUI: { primary: "#d6454f", secondary: "#f8fafc", accent: "#d6454f" },
	SWI: { primary: "#d6454f", secondary: "#f8fafc", accent: "#d6454f" },
	SWE: { primary: "#2158a8", secondary: "#f2c43f", accent: "#2158a8" },
	TUN: { primary: "#d6464f", secondary: "#f8fafc", accent: "#d6464f" },
	TUR: { primary: "#c63a44", secondary: "#f8fafc", accent: "#c63a44" },
	URU: { primary: "#6eb8ec", secondary: "#f8fafc", accent: "#f3c54a" },
	USA: { primary: "#244f9d", secondary: "#f8fafc", accent: "#d74652" },
	UZB: { primary: "#2695d1", secondary: "#f8fafc", accent: "#2d8d56" },
	ZEA: { primary: "#18386f", secondary: "#f8fafc", accent: "#d74652" }
};
const HOME_TEAM_FLAG_ICON_BASE_URL = "https://cdn.jsdelivr.net/npm/flag-icons@7.3.2/flags/4x3";
const HOME_TEAM_FLAG_CODES = {
	ALG: "dz",
	ARG: "ar",
	AUT: "at",
	BEL: "be",
	BRA: "br",
	CAB: "cv",
	CAN: "ca",
	COL: "co",
	COT: "ci",
	CRO: "hr",
	CUR: "cw",
	ECU: "ec",
	EGY: "eg",
	ENG: "gb-eng",
	FRA: "fr",
	GER: "de",
	GHA: "gh",
	HAI: "ht",
	IRI: "ir",
	JAP: "jp",
	JOR: "jo",
	KOR: "kr",
	MEX: "mx",
	MOR: "ma",
	NET: "nl",
	NEW: "nz",
	NOR: "no",
	PAN: "pa",
	PAR: "py",
	POR: "pt",
	QAT: "qa",
	SAU: "sa",
	SCO: "gb-sct",
	SEN: "sn",
	SOU: "za",
	SPA: "es",
	SWI: "ch",
	TUN: "tn",
	URU: "uy",
	USA: "us",
	UZB: "uz",
};
const HOME_TEAM_FLAG_CODES_BY_NAME = {
	"algeria": "dz",
	"argentina": "ar",
	"australia": "au",
	"austria": "at",
	"belgium": "be",
	"brazil": "br",
	"cabo verde": "cv",
	"canada": "ca",
	"colombia": "co",
	"cote d ivoire": "ci",
	"croatia": "hr",
	"curacao": "cw",
	"ecuador": "ec",
	"egypt": "eg",
	"england": "gb-eng",
	"france": "fr",
	"germany": "de",
	"ghana": "gh",
	"haiti": "ht",
	"ir iran": "ir",
	"japan": "jp",
	"jordan": "jo",
	"korea republic": "kr",
	"mexico": "mx",
	"morocco": "ma",
	"netherlands": "nl",
	"new zealand": "nz",
	"norway": "no",
	"panama": "pa",
	"paraguay": "py",
	"portugal": "pt",
	"qatar": "qa",
	"saudi arabia": "sa",
	"scotland": "gb-sct",
	"senegal": "sn",
	"south africa": "za",
	"spain": "es",
	"switzerland": "ch",
	"tunisia": "tn",
	"uruguay": "uy",
	"usa": "us",
	"uzbekistan": "uz",
};

document.documentElement.lang = APP_LOCALE;
document.documentElement.dir = APP_LOCALE === "he" ? "rtl" : "ltr";
document.documentElement.dataset.locale = APP_LOCALE;

function detectAppLocale() {
	const path = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
	const htmlLang = String(document.documentElement.lang || "")
		.trim()
		.toLowerCase();

	if (htmlLang === "he" || path === "/he" || path.startsWith("/he/")) {
		return "he";
	}

	return "en";
}

function t(key, variables = {}) {
	const resolve = (catalog) => key.split(".").reduce((value, part) => (value && typeof value === "object" ? value[part] : undefined), catalog);
	const template = resolve(TRANSLATIONS[APP_LOCALE]) ?? resolve(TRANSLATIONS.en) ?? key;

	if (typeof template !== "string") {
		return key;
	}

	return template.replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? ""));
}

const state = {
	worldCup: null,
	homeTeamId: "",
	homeTeamSearchQuery: "",
	groups: [],
	thirdPlaceRanking: [],
	selectedThirdTeamIds: [],
	bracketWinnerSelections: {},
	bracketScorePredictions: {},
	viewMode: "live",
	devPicksEnabled: shouldUseDevPicks(),
	devLiveResultsEnabled: shouldUseDevLiveResults(),
	devLiveWorldCup: null,
	playoffDragHintDismissed: getStoredPlayoffDragHintDismissed(),
	calendarLoaded: false,
	calendarMonthIndex: null,
	playoffMatches: [],
	submittedAt: "",
	sectionSubmittedAt: createEmptySectionSubmissionState(),
	submissionPendingSection: "",
	auth: {
		enabled: false,
		ready: false,
		pending: false,
		mode: "login",
		client: null,
		session: null,
		user: null,
		displayNameDraft: "",
		status: "",
	},
	overallScore: null,
	overallBonusPoints: null,
	saveStatus: "",
	loading: true,
};

const groupDragState = {
	cleanup: null,
	activeDrag: null,
};
const groupTouchDragState = {
	active: false,
	row: null,
	groupLetter: "",
	teamId: "",
	startX: 0,
	startY: 0,
};
const syncState = {
	autoSaveTimer: 0,
	autoSaveInFlight: false,
	autoSaveQueued: false,
	lastSavedSnapshot: "",
	loadedEmail: "",
	loadingSavedPicks: false,
};
const scoreSyncState = {
	timer: 0,
	inFlight: false,
	pendingSnapshot: "",
	pendingPayload: null,
	lastResolvedSnapshot: "",
};
const tooltipState = {
	element: null,
	target: null,
	rafId: 0,
};
const playoffPanState = {
	active: false,
	touchMode: false,
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
	homeTeamPaneLive: document.getElementById("home-team-pane-live"),
	homeTeamPaneMy: document.getElementById("home-team-pane-my"),
	groupsGridLive: document.getElementById("groups-grid-live"),
	groupsGridMy: document.getElementById("groups-grid-my"),
	thirdPlaceHeadLive: document.getElementById("third-place-head-live"),
	thirdPlaceHeadMy: document.getElementById("third-place-head-my"),
	thirdPlaceListLive: document.getElementById("third-place-list-live"),
	thirdPlaceListMy: document.getElementById("third-place-list-my"),
	playoffBoardLive: document.getElementById("playoff-board-live"),
	playoffBoardMy: document.getElementById("playoff-board-my"),
	viewModeContents: Array.from(document.querySelectorAll("[data-view-content]")),
	fixturesFeed: document.getElementById("fixtures-feed"),
	homeTeamSectionTitle: document.getElementById("home-team-section-title"),
	homeTeamSectionCopy: document.getElementById("home-team-section-copy"),
	groupsSectionTitle: document.getElementById("groups-section-title"),
	groupsSectionCopy: document.getElementById("groups-section-copy"),
	thirdPlaceSectionTitle: document.getElementById("third-place-section-title"),
	thirdPlaceSectionCopy: document.getElementById("third-place-section-copy"),
	playoffsSectionTitle: document.getElementById("playoffs-section-title"),
	playoffsSectionCopy: document.getElementById("playoffs-section-copy"),
	warningStrip: document.getElementById("warning-strip"),
	savePanel: document.getElementById("save-panel"),
	authForm: document.getElementById("auth-form"),
	authModeSwitch: document.getElementById("auth-mode-switch"),
	authModeButtons: Array.from(document.querySelectorAll("[data-auth-mode]")),
	authFields: document.getElementById("auth-fields"),
	displayNameField: document.getElementById("display-name-field"),
	displayNameLabel: document.getElementById("display-name-label"),
	displayNameInput: document.getElementById("display-name-input"),
	emailField: document.getElementById("email-field"),
	emailLabel: document.getElementById("email-label"),
	emailInput: document.getElementById("email-input"),
	passwordField: document.getElementById("password-field"),
	passwordLabel: document.getElementById("password-label"),
	passwordInput: document.getElementById("password-input"),
	welcomeMessage: document.getElementById("welcome-message"),
	authButton: document.getElementById("auth-button"),
	viewModeSwitch: document.querySelector(".view-mode-switch"),
	viewModeButtons: Array.from(document.querySelectorAll("[data-view-mode]")),
	clearAllButton: document.getElementById("clear-all-button"),
	clearAllDialog: document.getElementById("clear-all-dialog"),
	clearAllCancelButton: document.getElementById("clear-all-cancel"),
	clearAllConfirmButton: document.getElementById("clear-all-confirm"),
	signOutButton: document.getElementById("signout-button"),
	authStatus: document.getElementById("auth-status"),
	saveStatus: document.getElementById("save-status"),
	overallScoreCard: document.getElementById("overall-score-card"),
	overallScoreValue: document.getElementById("overall-score-value"),
	overallScoreBonusValue: document.getElementById("overall-score-bonus-value"),
	overallScoreSubmitButton: document.getElementById("overall-score-submit-button"),
};

const SUBMISSION_SECTIONS = ["groups", "thirdPlace", "playoffs"];
const AUTH_MODES = {
	LOGIN: "login",
	REGISTER: "register",
};
const VIEW_MODES = {
	MY: "my",
	LIVE: "live",
};
const SECTION_MODE_COPY = {
	en: {
		[VIEW_MODES.LIVE]: {
			homeTeam: {
				title: "Home Team Live Results",
				copy: "Your selected home team keeps a soft flag-inspired theme across the app.",
			},
			groups: {
				title: "Group Stage Live Results",
				copy: "Current group standings and live stats from the tournament.",
			},
			thirdPlace: {
				title: "Third-Place Live Results",
				copy: "Current best third-place standings based on live group results.",
			},
			playoffs: {
				title: "Live Playoff Bracket",
				copy: "Built from live standings and updated as results come in.",
			},
		},
		[VIEW_MODES.MY]: {
			homeTeam: {
				title: "Home Team My Predictions",
				copy: "Choose one team you believe will win the World Cup. Its colors softly personalize the experience.",
			},
			groups: {
				title: "Group Stage My Predictions",
				copy: "Drag to reorder each group and set your predicted standings.",
			},
			thirdPlace: {
				title: "Third-Place My Predictions",
				copy: "Choose eight third-place teams to send them into the round of 32. Order of choice determines the placement in the playoff bracket.",
			},
			playoffs: {
				title: "Playoff Bracket My Predictions",
				copy: "Built from your current group predictions and updated immediately as you change them.",
			},
		},
	},
	he: {
		[VIEW_MODES.LIVE]: {
			homeTeam: {
				title: "נבחרת הבית תוצאות חיות",
				copy: "נבחרת הבית שבחרתם מוסיפה לאפליקציה שכבת צבע רכה בהשראת הדגל שלה.",
			},
			groups: {
				title: "שלב הבתים תוצאות חיות",
				copy: "טבלת הבתים והסטטיסטיקות החיות של הטורניר.",
			},
			thirdPlace: {
				title: "המקומות השלישיים תוצאות חיות",
				copy: "דירוג עדכני של הנבחרות שבמקום השלישי לפי התוצאות החיות.",
			},
			playoffs: {
				title: "עץ הפלייאוף תוצאות חיות",
				copy: "נבנה לפי התוצאות החיות ומתעדכן בזמן אמת.",
			},
		},
		[VIEW_MODES.MY]: {
			homeTeam: {
				title: "נבחרת הבית התחזיות שלי",
				copy: "בחרו נבחרת אחת שאתם מאמינים שתזכה במונדיאל. הצבעים שלה יתנו חותמת עדינה לכל החוויה.",
			},
			groups: {
				title: "שלב הבתים התחזיות שלי",
				copy: "גררו כדי לשנות את סדר הנבחרות בכל בית ולקבוע את התחזית שלכם.",
			},
			thirdPlace: {
				title: "המקומות השלישיים התחזיות שלי",
				copy: "בחרו שמונה נבחרות מהמקום השלישי שיעלו לשלב 32. סדר הבחירה קובע את המיקום בעץ הפלייאוף.",
			},
			playoffs: {
				title: "עץ הפלייאוף התחזיות שלי",
				copy: "נבנה מהתחזיות הנוכחיות שלכם ומתעדכן מיד עם כל שינוי.",
			},
		},
	},
};
const PLAYOFF_DRAG_HINT_STORAGE_KEY = "wc2026:playoff-drag-hint-dismissed";
const TECHNICAL_MESSAGE_PATTERN = /\b(api|server|supabase|request failed|status \d+|unknown error|cache|cached data|environment|documentation|provider|rankings page|odds|predictions|fetch|network|connection|timeout|json|syntaxerror|unexpected token)\b/i;

boot();

async function boot() {
	await initializeAuth();
	bindEvents();
	render();
	await loadWorldCup();
}

function bindEvents() {
	elements.authForm.addEventListener("submit", handleAuthSubmit);
	elements.authModeButtons.forEach((button) => {
		button.addEventListener("click", handleAuthModeClick);
	});
	elements.clearAllButton.addEventListener("click", openClearAllDialog);
	elements.clearAllCancelButton.addEventListener("click", closeClearAllDialog);
	elements.clearAllConfirmButton.addEventListener("click", handleClearAll);
	elements.signOutButton.addEventListener("click", handleSignOut);
	elements.overallScoreSubmitButton.addEventListener("click", handleOverallSubmitClick);
	elements.displayNameInput.addEventListener("input", handleAuthFieldInput);
	elements.emailInput.addEventListener("input", handleAuthFieldInput);
	elements.passwordInput.addEventListener("input", handleAuthFieldInput);
	elements.homeTeamPaneMy.addEventListener("input", handleMyHomeTeamInput);
	elements.homeTeamPaneMy.addEventListener("click", handleMyHomeTeamClick);
	elements.thirdPlaceListMy.addEventListener("click", handleMyThirdPlaceClick);
	elements.playoffBoardMy.addEventListener("click", handleMyPlayoffBoardClick);
	elements.playoffBoardMy.addEventListener("input", handleMyPlayoffBoardInput);
	elements.playoffBoardMy.addEventListener("keydown", handleMyPlayoffBoardKeyDown);
	elements.groupsGridMy.addEventListener("touchstart", handleGroupTouchDragStart, { passive: true });
	elements.groupsGridMy.addEventListener("touchmove", handleGroupTouchDragMove, { passive: false });
	elements.groupsGridMy.addEventListener("touchend", handleGroupTouchDragEnd, { passive: true });
	elements.groupsGridMy.addEventListener("touchcancel", handleGroupTouchDragEnd, { passive: true });

	document.addEventListener("click", handlePlayoffPanClickCapture, true);
	document.addEventListener("click", handleMoveClick);
	document.addEventListener("mouseover", handleTooltipMouseOver);
	document.addEventListener("mouseout", handleTooltipMouseOut);
	document.addEventListener("keydown", handleGlobalKeyDown);
	document.addEventListener("scroll", handleTooltipViewportChange, true);
	document.addEventListener("wheel", handlePlayoffWheel, { passive: false });
	document.addEventListener("pointerdown", handlePlayoffPanStart);
	document.addEventListener("pointermove", handlePlayoffPanMove);
	document.addEventListener("pointerup", handlePlayoffPanEnd);
	document.addEventListener("pointercancel", handlePlayoffPanEnd);
	document.addEventListener("touchstart", handlePlayoffTouchStart, { passive: true });
	document.addEventListener("touchmove", handlePlayoffTouchMove, { passive: false });
	document.addEventListener("touchend", handlePlayoffTouchEnd, { passive: true });
	document.addEventListener("touchcancel", handlePlayoffTouchEnd, { passive: true });
	window.addEventListener("resize", scheduleBracketLineDraw);
	window.addEventListener("resize", handleTooltipViewportChange);
	elements.clearAllDialog.addEventListener("click", handleClearAllDialogBackdrop);
}

function handleMyHomeTeamClick(event) {
	const homeTeamCard = event.target.closest("[data-select-home-team]");

	if (!homeTeamCard) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (!ensureEditableRankingsView()) {
		return;
	}

	toggleHomeTeamSelection(homeTeamCard.dataset.teamId);
}

function handleMyHomeTeamInput(event) {
	const searchInput = event.target.closest("[data-home-team-search]");

	if (!searchInput) {
		return;
	}

	state.homeTeamSearchQuery = String(searchInput.value || "");
	applyHomeTeamSearchFilter();
}

function handleMyThirdPlaceClick(event) {
	const thirdCard = event.target.closest("[data-select-third]");

	if (!thirdCard) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (!ensureEditableRankingsView()) {
		return;
	}

	toggleThirdPlaceSelection(thirdCard.dataset.teamId);
}

function handleMyPlayoffBoardClick(event) {
	const clearBracketSideButton = event.target.closest("[data-clear-bracket-source]");

	if (clearBracketSideButton) {
		event.preventDefault();
		event.stopPropagation();

		if (!ensureEditableRankingsView()) {
			return;
		}

		clearBracketSourceSelection(clearBracketSideButton.dataset.sourceMatch);
		return;
	}

	if (event.target.closest("[data-bracket-goals-input]")) {
		event.stopPropagation();
		return;
	}

	const bracketPick = event.target.closest("[data-pick-winner]");

	if (!bracketPick) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (!ensureEditableRankingsView()) {
		return;
	}

	toggleBracketWinnerSelection(bracketPick.dataset.match, bracketPick.dataset.teamId);
}

function handleMyPlayoffBoardInput(event) {
	const goalInput = event.target.closest("[data-bracket-goals-input]");

	if (!goalInput) {
		return;
	}

	event.stopPropagation();

	if (!ensureEditableRankingsView()) {
		return;
	}

	updateBracketScorePrediction(goalInput.dataset.match, goalInput.dataset.side, goalInput.value, goalInput);
}

function handleMyPlayoffBoardKeyDown(event) {
	if (event.target.closest("[data-bracket-goals-input]")) {
		return;
	}

	const bracketPick = event.target.closest("[data-pick-winner]");

	if (!bracketPick) {
		return;
	}

	if (event.key !== "Enter" && event.key !== " ") {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	if (!ensureEditableRankingsView()) {
		return;
	}

	toggleBracketWinnerSelection(bracketPick.dataset.match, bracketPick.dataset.teamId);
}

async function initializeAuth() {
	state.auth.ready = false;
	state.auth.status = t("authChecking");

	try {
		const response = await fetch("/api/auth/config");
		const config = await response.json();

		if (!response.ok) {
			throw new Error(t("authUnavailable"));
		}

		if (!config.enabled) {
			state.auth.enabled = false;
			state.auth.status = t("authUnavailable");
			return;
		}

		if (!window.supabase?.createClient) {
			throw new Error(t("authUnavailable"));
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
		state.auth.status = t("authUnavailable");
	} finally {
		state.auth.ready = true;
	}
}

async function syncAuthSession(session, event = "SESSION") {
	state.auth.pending = false;
	state.auth.session = session || null;

	if (!session?.access_token || !state.auth.client) {
		state.auth.mode = AUTH_MODES.LOGIN;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		state.homeTeamId = "";
		elements.passwordInput.value = "";
		state.viewMode = VIEW_MODES.LIVE;
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
		state.auth.mode = AUTH_MODES.LOGIN;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		state.homeTeamId = "";
		elements.passwordInput.value = "";
		state.viewMode = VIEW_MODES.LIVE;
		resetPickSyncState();
		state.auth.status = t("authPleaseSignInAgain");
		render();
		return;
	}

	if (syncState.loadedEmail && syncState.loadedEmail !== data.user.email.toLowerCase()) {
		resetPickSyncState();
	}

	state.auth.user = data.user;
	state.auth.displayNameDraft = getUserDisplayName(data.user);
	elements.passwordInput.value = "";
	if (event === "SIGNED_IN" || isUsingDevPicks()) {
		state.viewMode = VIEW_MODES.MY;
	}
	state.auth.status = t("authSignedIn");
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
	const isRegisterMode = isRegisterAuthMode();
	const hasRequiredFields = hasRequiredAuthFields();
	const shouldShowAuthForm = authReady && authAvailable && !isSignedIn;

	if (isSignedIn) {
		elements.displayNameInput.value = state.auth.displayNameDraft;
		elements.emailInput.value = email;
		elements.passwordInput.value = "";
	} else if (elements.displayNameInput.value !== state.auth.displayNameDraft) {
		elements.displayNameInput.value = state.auth.displayNameDraft;
	}

	elements.displayNameInput.readOnly = isSignedIn;
	elements.emailInput.readOnly = isSignedIn;
	elements.passwordInput.readOnly = isSignedIn;
	elements.displayNameInput.required = !isSignedIn && isRegisterMode;
	elements.emailInput.required = !isSignedIn;
	elements.passwordInput.required = !isSignedIn;
	elements.passwordInput.autocomplete = isRegisterMode ? "new-password" : "current-password";
	elements.authForm.classList.toggle("hidden", !shouldShowAuthForm);
	elements.authModeSwitch.classList.toggle("hidden", isSignedIn);
	elements.authFields.classList.toggle("hidden", isSignedIn);
	elements.displayNameField.classList.toggle("hidden", isSignedIn || !isRegisterMode);
	elements.emailField.classList.toggle("hidden", isSignedIn);
	elements.passwordField.classList.toggle("hidden", isSignedIn);
	elements.authModeSwitch.dataset.activeAuthMode = state.auth.mode;
	elements.authModeButtons.forEach((button) => {
		const isActive = button.dataset.authMode === state.auth.mode;
		button.classList.toggle("is-active", isActive);
		button.setAttribute("aria-pressed", isActive ? "true" : "false");
		button.disabled = isSignedIn || state.auth.pending;
	});
	elements.welcomeMessage.classList.toggle("hidden", !isSignedIn);
	elements.welcomeMessage.textContent = getWelcomeMessage();
	elements.authButton.textContent = state.auth.pending ? getPendingAuthButtonLabel() : getAuthButtonLabel();
	elements.authButton.disabled = !authReady || !authAvailable || state.auth.pending || isSignedIn || !hasRequiredFields;
	elements.clearAllButton.disabled = state.loading || !state.worldCup || isSubmissionPending() || isShowingLiveResults();
	elements.signOutButton.disabled = !authReady || state.auth.pending;
	elements.savePanel.classList.toggle("is-signed-out", authReady && authAvailable && !isSignedIn);
	elements.clearAllButton.classList.toggle("hidden", !isSignedIn);
	elements.authButton.classList.toggle("hidden", isSignedIn);
	elements.signOutButton.classList.toggle("hidden", !isSignedIn);
	elements.authStatus.textContent = state.auth.status || (!authReady ? t("authChecking") : getSignedOutAuthMessage());
}

function renderViewModeSwitch() {
	const canAccessMyRankings = canAccessRankings();

	if (elements.viewModeSwitch) {
		elements.viewModeSwitch.dataset.activeMode = state.viewMode;
	}

	elements.viewModeButtons.forEach((button) => {
		const isActive = button.dataset.viewMode === state.viewMode;
		const isMyRankingsButton = button.dataset.viewMode === VIEW_MODES.MY;
		button.classList.toggle("is-active", isActive);
		button.setAttribute("aria-pressed", isActive ? "true" : "false");
		button.disabled = isMyRankingsButton && !canAccessMyRankings;
	});
}

function getSignedOutAuthMessage() {
	if (!state.auth.enabled) {
		return t("authUnavailable");
	}

	return isRegisterAuthMode() ? t("authHintRegister") : t("authHintLogin");
}

function getAuthenticatedEmail() {
	return String(state.auth.user?.email || "")
		.trim()
		.toLowerCase();
}

function getTournamentTeams() {
	if (!state.worldCup?.groups?.length) {
		return [];
	}

	const seen = new Set();

	return state.worldCup.groups
		.flatMap((group) =>
			(group.teams || []).map((team) => ({
				...team,
				groupLetter: team.groupLetter || group.letter,
			})),
		)
		.filter((team) => {
			const teamKey = getTeamIdKey(team.id);

			if (!teamKey || seen.has(teamKey)) {
				return false;
			}

			seen.add(teamKey);
			return true;
		});
}

function findTournamentTeamById(teamId) {
	const teamKey = getTeamIdKey(teamId);
	return getTournamentTeams().find((team) => getTeamIdKey(team.id) === teamKey) || null;
}

function resolveSavedHomeTeamId(savedHomeTeam) {
	if (!savedHomeTeam || typeof savedHomeTeam !== "object") {
		return "";
	}

	const byId = findTournamentTeamById(savedHomeTeam.teamId);

	if (byId) {
		return getTeamIdKey(byId.id);
	}

	const savedCode = String(savedHomeTeam.teamCode || "").trim().toUpperCase();
	const savedName = String(savedHomeTeam.teamName || "").trim().toLowerCase();
	const matchedTeam = getTournamentTeams().find((team) => {
		if (savedCode && getTeamCode(team) === savedCode) {
			return true;
		}

		return savedName && getTeamDisplayName(team).toLowerCase() === savedName;
	});

	return matchedTeam ? getTeamIdKey(matchedTeam.id) : "";
}

function getSelectedHomeTeam() {
	return findTournamentTeamById(state.homeTeamId);
}

function shouldUseDevPicks() {
	try {
		return new URLSearchParams(window.location.search).get(DEV_PICKS_QUERY_PARAM) === "1";
	} catch (_error) {
		return false;
	}
}

function shouldUseDevLiveResults() {
	try {
		return new URLSearchParams(window.location.search).get(DEV_RESULTS_QUERY_PARAM) === "1";
	} catch (_error) {
		return false;
	}
}

function isUsingDevPicks() {
	return state.devPicksEnabled;
}

function isUsingDevLiveResults() {
	return state.devLiveResultsEnabled;
}

function canAccessRankings() {
	return Boolean(getAuthenticatedEmail());
}

function isRegisterAuthMode() {
	return state.auth.mode === AUTH_MODES.REGISTER;
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

function getDisplayNameDraft() {
	return sanitizeDisplayName(elements.displayNameInput?.value || state.auth.displayNameDraft);
}

function getPasswordValue() {
	return String(elements.passwordInput?.value || "");
}

function hasRequiredAuthFields() {
	const hasEmail = isValidEmail(
		String(elements.emailInput?.value || "")
			.trim()
			.toLowerCase(),
	);
	const hasPassword = getPasswordValue().length >= 6;

	if (!hasEmail || !hasPassword) {
		return false;
	}

	return isRegisterAuthMode() ? Boolean(getDisplayNameDraft()) : true;
}

function handleAuthFieldInput() {
	state.auth.displayNameDraft = getDisplayNameDraft();
	renderAuthState();
}

function handleAuthSubmit(event) {
	event.preventDefault();

	if (getAuthenticatedEmail() || !elements.authForm.reportValidity()) {
		return;
	}

	void handleAuthRequest();
}

function handleAuthModeClick(event) {
	setAuthMode(event.currentTarget?.dataset?.authMode || "");
}

function setAuthMode(nextMode) {
	if (!Object.values(AUTH_MODES).includes(nextMode) || state.auth.mode === nextMode || getAuthenticatedEmail()) {
		return;
	}

	state.auth.mode = nextMode;
	state.auth.status = getSignedOutAuthMessage();
	renderAuthState();
}

function getAuthButtonLabel() {
	return isRegisterAuthMode() ? t("authButtonRegister") : t("authButtonLogin");
}

function getPendingAuthButtonLabel() {
	return isRegisterAuthMode() ? t("authButtonSigningUp") : t("authButtonLoggingIn");
}

function getAuthValidationMessage() {
	return isRegisterAuthMode() ? t("authValidationRegister") : t("authValidationLogin");
}

function getAuthFailureMessage() {
	return isRegisterAuthMode() ? t("authFailureRegister") : t("authFailureLogin");
}

function getWelcomeMessage() {
	const displayName = sanitizeDisplayName(state.auth.displayNameDraft);

	if (displayName) {
		return t("welcomeBackNamed", { name: displayName });
	}

	return t("welcomeBack");
}

function createEmptySectionSubmissionState() {
	return {
		groups: "",
		thirdPlace: "",
		playoffs: "",
	};
}

function createSubmittedSectionState(timestamp) {
	return Object.fromEntries(SUBMISSION_SECTIONS.map((section) => [section, timestamp]));
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

function getLatestSubmittedAt() {
	return (
		SUBMISSION_SECTIONS.map((section) => state.sectionSubmittedAt[section])
			.filter(Boolean)
			.sort()
			.at(-1) || ""
	);
}

function isSubmissionPending() {
	return Boolean(state.submissionPendingSection);
}

function isSectionReadOnly(section) {
	return !canAccessRankings() || isShowingLiveResults() || isSubmissionPending();
}

function hasEditableSections() {
	return SUBMISSION_SECTIONS.some((section) => !isSectionReadOnly(section));
}

function hasSubmittedAllPicks() {
	return SUBMISSION_SECTIONS.every((section) => {
		const submittedAt = state.sectionSubmittedAt[section];
		return typeof submittedAt === "string" && submittedAt.trim();
	});
}

function clearSubmittedPicksState() {
	state.submittedAt = "";
	state.sectionSubmittedAt = createEmptySectionSubmissionState();
}

function invalidateSubmittedPicks() {
	if (!state.submittedAt && !hasSubmittedAllPicks()) {
		return;
	}

	clearSubmittedPicksState();
	state.saveStatus = "";
	renderSaveState();
	renderOverallScore();
}

function sanitizeUserFacingMessage(message, fallback) {
	const text = typeof message === "string" ? message.trim() : "";

	if (!text) {
		return fallback;
	}

	if (TECHNICAL_MESSAGE_PATTERN.test(text)) {
		return fallback;
	}

	return text;
}

function getResponseErrorMessage(data, fallback) {
	return sanitizeUserFacingMessage(data?.error, fallback);
}

async function handleAuthRequest() {
	if (!state.auth.enabled || !state.auth.client) {
		state.auth.status = t("authUnavailable");
		renderAuthState();
		return;
	}

	const isRegisterMode = isRegisterAuthMode();
	const displayName = getDisplayNameDraft();
	const email = elements.emailInput.value.trim().toLowerCase();
	const password = getPasswordValue();
	state.auth.displayNameDraft = displayName;

	if (!hasRequiredAuthFields()) {
		state.auth.status = getAuthValidationMessage();
		renderAuthState();
		return;
	}

	state.auth.pending = true;
	state.auth.status = isRegisterMode ? t("authCreatingAccount") : t("authSigningIn");
	renderAuthState();

	try {
		if (isRegisterMode) {
			const { data, error } = await state.auth.client.auth.signUp({
				email,
				password,
				options: {
					data: { display_name: displayName },
				},
			});

			if (error) {
				throw error;
			}

			elements.passwordInput.value = "";

			if (data.session?.access_token) {
				state.auth.status = t("authAccountCreatedSigningIn");
			} else {
				state.auth.mode = AUTH_MODES.LOGIN;
				state.auth.status = t("authAccountCreatedConfirm");
			}
		} else {
			const { error } = await state.auth.client.auth.signInWithPassword({
				email,
				password,
			});

			if (error) {
				throw error;
			}

			elements.passwordInput.value = "";
			state.auth.status = t("authSignedIn");
		}
	} catch (error) {
		state.auth.status = getAuthFailureMessage();
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
	state.auth.status = t("authSigningOut");
	renderAuthState();

	try {
		const { error } = await state.auth.client.auth.signOut();

		if (error) {
			throw error;
		}

		state.auth.session = null;
		state.auth.mode = AUTH_MODES.LOGIN;
		state.auth.user = null;
		state.auth.displayNameDraft = "";
		state.homeTeamId = "";
		elements.passwordInput.value = "";
		state.viewMode = VIEW_MODES.LIVE;
		resetPickSyncState();
		state.auth.status = getSignedOutAuthMessage();
	} catch (error) {
		state.auth.status = t("authSignOutFailed");
	} finally {
		state.auth.pending = false;
		render();
	}
}

function handleClearAll() {
	if (!state.worldCup || isShowingLiveResults() || isSubmissionPending()) {
		return;
	}

	closeClearAllDialog();
	state.homeTeamId = "";
	state.groups = cloneGroups(state.worldCup.groups || []);
	state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups);
	state.selectedThirdTeamIds = [];
	state.bracketWinnerSelections = {};
	state.bracketScorePredictions = {};
	clearSubmittedPicksState();

	if (getAuthenticatedEmail() && !isUsingDevPicks()) {
		state.saveStatus = t("saveStatusClearedSaving");
	} else {
		state.saveStatus = t("saveStatusClearedLocal");
	}

	renderInteractiveViews();
	renderAuthState();
	renderSaveState();
	renderOverallScore();
	scheduleAutoSave();
}

function openClearAllDialog() {
	if (!state.worldCup || state.loading || isShowingLiveResults() || isSubmissionPending()) {
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
			throw new Error(t("genericCouldNotLoadTournament"));
		}

		state.worldCup = data;
		state.homeTeamId = "";
		state.groups = cloneGroups(data.groups || []);
		state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups);
		state.selectedThirdTeamIds = [];
		state.bracketWinnerSelections = {};
		state.bracketScorePredictions = {};
		state.calendarLoaded = false;
		state.calendarMonthIndex = null;
		state.submittedAt = "";
		state.sectionSubmittedAt = createEmptySectionSubmissionState();
		state.submissionPendingSection = "";
		state.saveStatus = "";
		syncState.lastSavedSnapshot = "";
		syncState.loadedEmail = "";
		state.devLiveWorldCup = isUsingDevLiveResults() ? buildDevLiveWorldCup() : null;

		if (isUsingDevPicks()) {
			applyDevPicksSeed();
		}
	} catch (error) {
		state.worldCup = null;
		state.homeTeamId = "";
		state.groups = [];
		state.thirdPlaceRanking = [];
		state.selectedThirdTeamIds = [];
		state.bracketWinnerSelections = {};
		state.bracketScorePredictions = {};
		state.calendarLoaded = false;
		state.calendarMonthIndex = null;
		state.submittedAt = "";
		state.sectionSubmittedAt = createEmptySectionSubmissionState();
		state.submissionPendingSection = "";
		state.saveStatus = t("genericCouldNotLoadTournament");
		syncState.lastSavedSnapshot = "";
		syncState.loadedEmail = "";
		state.devLiveWorldCup = null;
	} finally {
		state.loading = false;
		render();
		void ensureSavedPicksLoadedForCurrentUser();
	}
}

function render() {
	hideFloatingTooltip();
	document.body.dataset.viewMode = state.viewMode;
	applyHomeTeamTheme();
	renderWarnings();
	renderViewModeSwitch();
	renderSectionHeadings();
	renderInteractiveViews();
	syncViewModeContentVisibility();
	renderAuthState();
	renderSaveState();
	renderOverallScore();
	scheduleOverallScoreRefresh();
}

function renderSectionHeadings() {
	const copy = SECTION_MODE_COPY[APP_LOCALE]?.[state.viewMode] || SECTION_MODE_COPY.en[state.viewMode] || SECTION_MODE_COPY.en[VIEW_MODES.LIVE];

	elements.homeTeamSectionTitle.innerHTML = renderSectionTitleMarkup(copy.homeTeam.title);
	elements.homeTeamSectionCopy.textContent = copy.homeTeam.copy;
	elements.groupsSectionTitle.innerHTML = renderSectionTitleMarkup(copy.groups.title);
	elements.groupsSectionCopy.textContent = copy.groups.copy;
	elements.thirdPlaceSectionTitle.innerHTML = renderSectionTitleMarkup(copy.thirdPlace.title);
	elements.thirdPlaceSectionCopy.textContent = copy.thirdPlace.copy;
	elements.playoffsSectionTitle.innerHTML = renderSectionTitleMarkup(copy.playoffs.title);
	elements.playoffsSectionCopy.textContent = copy.playoffs.copy;
}

function renderSectionTitleMarkup(title) {
	const predictionSuffix = ` ${t("predictionsHeadline")}`;

	if (!title.endsWith(predictionSuffix)) {
		return escapeHtml(title);
	}

	const baseTitle = title.slice(0, -predictionSuffix.length);
	return `${escapeHtml(baseTitle)} <span class="section-title-my-predictions">${escapeHtml(t("predictionsHeadline"))}</span>`;
}

function renderInteractiveViews() {
	renderHomeTeam();
	renderGroups();
	renderThirdPlace();
	renderPlayoffBoard();
	renderFixtures();
}

function renderWarnings() {
	elements.warningStrip.classList.add("hidden");
	elements.warningStrip.innerHTML = "";
}

function syncViewModeContentVisibility() {
	elements.viewModeContents.forEach((element) => {
		setModeContentVisibility(element, element.dataset.viewContent === state.viewMode);
	});
}

function setModeContentVisibility(element, isVisible) {
	if (!element) {
		return;
	}

	element.classList.toggle("hidden", !isVisible);
	element.hidden = !isVisible;
	element.inert = !isVisible;
	element.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function renderHomeTeam() {
	if (!state.worldCup) {
		const emptyMarkup = emptyState(t("homeTeamEmpty"));
		elements.homeTeamPaneLive.innerHTML = emptyMarkup;
		elements.homeTeamPaneMy.innerHTML = emptyMarkup;
		return;
	}

	const selectedTeam = getSelectedHomeTeam();

	elements.homeTeamPaneLive.innerHTML = renderHomeTeamSummary(selectedTeam);
	elements.homeTeamPaneMy.innerHTML = `
		<div class="home-team-picker">
			<div class="home-team-search">
				<input
					class="field-input home-team-search-input"
					type="search"
					inputmode="search"
					data-home-team-search="true"
					value="${escapeHtml(state.homeTeamSearchQuery)}"
					placeholder="${escapeHtml(t("homeTeamSearchPlaceholder"))}"
					aria-label="${escapeHtml(t("homeTeamSearchPlaceholder"))}"
				/>
			</div>
			<div class="home-team-grid">
				${getTournamentTeams().map((team) => renderHomeTeamSelectionCard(team)).join("")}
			</div>
			<div class="home-team-search-empty hidden">${escapeHtml(t("homeTeamNoResults"))}</div>
		</div>
	`;
	applyHomeTeamSearchFilter();
}

function renderHomeTeamSummary(team) {
	if (!team) {
		return `
			<article class="home-team-summary-card home-team-summary-card-empty">
				<p class="status-pill">${escapeHtml(t("homeTeamSelected"))}</p>
				<p class="panel-note">${escapeHtml(t("homeTeamLiveEmpty"))}</p>
			</article>
		`;
	}

	return `
		<article class="home-team-summary-card" ${renderHomeTeamThemeStyle(team)}>
			<p class="status-pill">${escapeHtml(t("homeTeamSelected"))}</p>
			<div class="home-team-summary-head">
				<div class="team-name">
					${renderTeamLogo(team)}
					${renderTeamCode(team, "home-team-code")}
				</div>
				<span class="home-team-summary-group">${escapeHtml(formatGroupCardLabel({ letter: team.groupLetter }))}</span>
			</div>
			<p class="home-team-summary-name">${escapeHtml(getTeamDisplayName(team))}</p>
		</article>
	`;
}

function renderHomeTeamSelectionCard(team) {
	const isSelected = getTeamIdKey(team.id) === state.homeTeamId;
	const cardClasses = ["home-team-card"];

	if (isSelected) {
		cardClasses.push("is-selected");
	}

	return `
		<button
			class="${cardClasses.join(" ")}"
			type="button"
			data-select-home-team="true"
			data-home-team-card="true"
			data-team-id="${escapeHtml(String(team.id))}"
			data-home-team-search-index="${escapeHtml(buildHomeTeamSearchIndex(team))}"
			aria-pressed="${isSelected ? "true" : "false"}"
			${renderHomeTeamThemeStyle(team)}
		>
			<div class="home-team-card-head">
				<div class="team-name">
					${renderTeamLogo(team)}
					${renderTeamCode(team, "home-team-code")}
				</div>
				<span class="home-team-card-group">${escapeHtml(formatGroupCardLabel({ letter: team.groupLetter }))}</span>
			</div>
			<p class="home-team-card-name">${escapeHtml(getTeamDisplayName(team))}</p>
		</button>
	`;
}

function buildHomeTeamSearchIndex(team) {
	return normalizeSearchText([getTeamDisplayName(team), getTeamCode(team), team?.groupLetter].filter(Boolean).join(" "));
}

function applyHomeTeamSearchFilter(root = elements.homeTeamPaneMy) {
	if (!root) {
		return;
	}

	const normalizedQuery = normalizeSearchText(state.homeTeamSearchQuery);
	const homeTeamCards = Array.from(root.querySelectorAll("[data-home-team-card]"));
	const emptyStateElement = root.querySelector(".home-team-search-empty");
	let visibleCount = 0;

	homeTeamCards.forEach((card) => {
		const searchIndex = String(card.dataset.homeTeamSearchIndex || "");
		const isVisible = !normalizedQuery || searchIndex.includes(normalizedQuery);
		card.hidden = !isVisible;

		if (isVisible) {
			visibleCount += 1;
		}
	});

	if (emptyStateElement) {
		emptyStateElement.classList.toggle("hidden", visibleCount > 0);
	}
}

function normalizeSearchText(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		replace(/[^\p{L}\p{N}\s]+/gu, " ")
		replace(/\s+/g, " ");
}

function renderHomeTeamThemeStyle(team) {
	const theme = resolveHomeTeamTheme(team);

	if (!theme) {
		return "";
	}

	return `style="--team-theme-primary: ${escapeHtml(theme.primary)}; --team-theme-secondary: ${escapeHtml(theme.secondary)}; --team-theme-accent: ${escapeHtml(theme.accent)};"`;
}

function applyHomeTeamTheme() {
	const selectedTeam = getSelectedHomeTeam();
	const theme = resolveHomeTeamTheme(selectedTeam);
	const body = document.body;

	body.dataset.homeTeamSelected = theme ? "true" : "false";

	setBodyThemeVariable("--home-team-primary", theme?.primary || "transparent");
	setBodyThemeVariable("--home-team-secondary", theme?.secondary || "transparent");
	setBodyThemeVariable("--home-team-accent", theme?.accent || "transparent");
	setBodyThemeVariable("--home-team-outline", theme ? hexToRgba(theme.primary, 0.16) : "transparent");
	setBodyThemeVariable("--home-team-glow", theme ? hexToRgba(theme.primary, 0.14) : "transparent");
	setBodyThemeVariable("--home-team-wash-start", theme ? hexToRgba(theme.primary, 0.16) : "transparent");
	setBodyThemeVariable("--home-team-wash-end", theme ? hexToRgba(theme.secondary, 0.12) : "transparent");
	setBodyThemeVariable("--home-team-mark-image", getHomeTeamMarkImage(selectedTeam));
}

function setBodyThemeVariable(name, value) {
	document.body.style.setProperty(name, value);
}

function getHomeTeamMarkImage(team) {
	const flagCode = resolveHomeTeamFlagCode(team);

	if (!flagCode) {
		return "none";
	}

	return `url(${JSON.stringify(`${HOME_TEAM_FLAG_ICON_BASE_URL}/${flagCode}.svg`)})`;
}

function resolveHomeTeamFlagCode(team) {
	if (!team) {
		return "";
	}

	const normalizedName = normalizeSearchText(getTeamDisplayName(team));

	if (HOME_TEAM_FLAG_CODES_BY_NAME[normalizedName]) {
		return HOME_TEAM_FLAG_CODES_BY_NAME[normalizedName];
	}

	const teamCode = String(getTeamCode(team) || "").trim().toUpperCase();
	return HOME_TEAM_FLAG_CODES[teamCode] || "";
}

function resolveHomeTeamTheme(team) {
	if (!team) {
		return null;
	}

	const teamCode = String(getTeamCode(team) || "").trim().toUpperCase();
	const theme = HOME_TEAM_THEMES[teamCode];

	if (theme) {
		return theme;
	}

	return buildDerivedHomeTeamTheme(teamCode || getTeamDisplayName(team));
}

function buildDerivedHomeTeamTheme(seed) {
	const source = String(seed || "WC");
	let hash = 0;

	for (const character of source) {
		hash = (hash << 5) - hash + character.charCodeAt(0);
		hash |= 0;
	}

	const hue = Math.abs(hash) % 360;
	return {
		primary: `hsl(${hue} 62% 58%)`,
		secondary: `hsl(${(hue + 38) % 360} 42% 76%)`,
		accent: `hsl(${(hue + 12) % 360} 72% 84%)`,
	};
}

function hexToRgba(color, alpha) {
	const value = String(color || "").trim();

	if (!value) {
		return `rgba(0, 0, 0, ${alpha})`;
	}

	if (value.startsWith("hsl(") || value.startsWith("hsla(") || value.startsWith("rgb(") || value.startsWith("rgba(")) {
		return value;
	}

	const normalized = value.replace("#", "");
	const hex = normalized.length === 3
		? normalized
				.split("")
				.map((character) => character + character)
				.join("")
		: normalized;

	if (!/^[\da-fA-F]{6}$/.test(hex)) {
		return value;
	}

	const red = Number.parseInt(hex.slice(0, 2), 16);
	const green = Number.parseInt(hex.slice(2, 4), 16);
	const blue = Number.parseInt(hex.slice(4, 6), 16);

	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function renderGroups() {
	teardownGroupDragAndDrop();

	if (!state.worldCup) {
		const emptyMarkup = emptyState(t("emptyGroups"));
		elements.groupsGridLive.innerHTML = emptyMarkup;
		elements.groupsGridMy.innerHTML = emptyMarkup;
		return;
	}

	renderGroupsGrid(elements.groupsGridLive, getLiveGroups(), { mode: VIEW_MODES.LIVE });
	renderGroupsGrid(elements.groupsGridMy, state.groups, { mode: VIEW_MODES.MY });

	if (!isShowingLiveResults()) {
		bindGroupDragAndDrop(elements.groupsGridMy);
	}
}

function renderGroupsGrid(container, groups, { mode }) {
	const isLiveView = mode === VIEW_MODES.LIVE;

	container.innerHTML = groups
		.map(
			(group) => `
        <article class="group-card">
          <div class="group-head">
            <h3>${escapeHtml(formatGroupCardLabel(group))}</h3>
          </div>
          <div class="group-table-wrap">
			<table class="group-table">
              <thead>
                <tr>
                  ${renderGroupTableHeaderCells(isLiveView)}
                </tr>
              </thead>
              <tbody data-group="${group.letter}">
                ${group.teams.map((team, index) => renderGroupTableRow(team, index, group.letter, { mode, isLiveView })).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `,
		)
		.join("");
}

function renderGroupTableHeaderCells(isLiveView) {
	if (isLiveView) {
		return `
      <th>#</th>
      <th>${escapeHtml(t("groupCountry"))}</th>
      <th class="group-stat-head">${escapeHtml(t("groupWins"))}</th>
      <th class="group-stat-head">${escapeHtml(t("groupLosses"))}</th>
      <th class="group-stat-head">${escapeHtml(t("groupDraws"))}</th>
      <th class="group-stat-head">${escapeHtml(t("groupGoalDiff"))}</th>
      <th class="group-stat-head">${escapeHtml(t("groupPoints"))}</th>
    `;
	}

	return `
    <th>#</th>
    <th>${escapeHtml(t("groupCountryPrediction"))}</th>
  `;
}

function renderThirdPlace() {
	if (!state.worldCup) {
		const emptyMarkup = emptyState(t("emptyThirdPlace"));
		elements.thirdPlaceHeadLive.innerHTML = "";
		elements.thirdPlaceHeadMy.innerHTML = "";
		elements.thirdPlaceListLive.innerHTML = emptyMarkup;
		elements.thirdPlaceListMy.innerHTML = emptyMarkup;
		return;
	}

	const showEmptyLiveCards = shouldRenderEmptyLiveThirdPlaceCards();

	renderThirdPlaceList({
		mode: VIEW_MODES.LIVE,
		ranking: showEmptyLiveCards ? [] : getLiveThirdPlaceRanking(),
		selectedTeamIds: showEmptyLiveCards ? [] : getLiveSelectedThirdTeamIds(),
		placeholderCount: showEmptyLiveCards ? getLiveThirdPlacePlaceholderCount() : 0,
		headElement: elements.thirdPlaceHeadLive,
		listElement: elements.thirdPlaceListLive,
	});
	renderThirdPlaceList({
		mode: VIEW_MODES.MY,
		ranking: state.thirdPlaceRanking,
		selectedTeamIds: state.selectedThirdTeamIds,
		headElement: elements.thirdPlaceHeadMy,
		listElement: elements.thirdPlaceListMy,
	});
}

function renderThirdPlaceList({ mode, ranking, selectedTeamIds, headElement, listElement, placeholderCount = 0 }) {
	const selectedCount = getSelectedBestThirdTeams(selectedTeamIds, ranking).length;
	const cards = placeholderCount ? Array.from({ length: placeholderCount }, () => renderEmptyThirdPlaceCard()).join("") : ranking.map((team) => renderThirdPlaceSelectionCard(team, { mode, ranking, selectedTeamIds })).join("");

	headElement.innerHTML = `<span class="status-pill">${escapeHtml(t("calendarSelectedCount", { count: selectedCount }))}</span>`;
	listElement.innerHTML = cards;
}

function renderEmptyThirdPlaceCard() {
	return `
    <article class="third-choice-card third-choice-card-static third-choice-card-empty" aria-hidden="true">
      <div class="third-choice-head">
        <div class="team-name">
          <span class="team-mark team-mark-placeholder" aria-hidden="true">
            <span class="team-logo-fallback team-logo-placeholder"></span>
          </span>
        </div>
        <span class="third-choice-group">-</span>
      </div>
      <p class="third-choice-name">---</p>
      <div class="third-choice-stats">
        <span>0 pts</span>
        <span>0 GD</span>
      </div>
    </article>
  `;
}

function renderPlayoffBoard() {
	if (!state.worldCup) {
		const emptyMarkup = emptyState(t("emptyPlayoffs"));
		elements.playoffBoardLive.innerHTML = emptyMarkup;
		elements.playoffBoardMy.innerHTML = emptyMarkup;
		return;
	}

	const liveScrollSnapshot = getPlayoffScrollSnapshot(elements.playoffBoardLive);
	const myScrollSnapshot = getPlayoffScrollSnapshot(elements.playoffBoardMy);
	clearPlayoffPanState();
	const livePlayoffData = getLivePlayoffData({ syncRenderedMatches: isShowingLiveResults() });
	const myPlayoffData = getProjectedPlayoffData({ syncRenderedMatches: !isShowingLiveResults() });
	const liveWinnerTeamIdsByMatch = new Map(livePlayoffData.projectedMatches.map((match) => [String(match.match), String(match.selectedWinnerTeamId || "")]).filter(([, teamId]) => teamId));

	renderPlayoffBoardForMode(elements.playoffBoardLive, {
		mode: VIEW_MODES.LIVE,
		projectedMatches: livePlayoffData.projectedMatches,
	});
	renderPlayoffBoardForMode(elements.playoffBoardMy, {
		mode: VIEW_MODES.MY,
		projectedMatches: myPlayoffData.projectedMatches,
		liveWinnerTeamIdsByMatch,
	});

	restorePlayoffScrollSnapshot(elements.playoffBoardLive, liveScrollSnapshot);
	restorePlayoffScrollSnapshot(elements.playoffBoardMy, myScrollSnapshot);
	scheduleBracketLineDraw();
	requestAnimationFrame(() => {
		restorePlayoffScrollSnapshot(elements.playoffBoardLive, liveScrollSnapshot);
		restorePlayoffScrollSnapshot(elements.playoffBoardMy, myScrollSnapshot);
	});
}

function renderPlayoffBoardForMode(container, { mode, projectedMatches, liveWinnerTeamIdsByMatch = new Map() }) {
	const bracket = buildPlayoffBracketLayout(projectedMatches);

	container.innerHTML = `
    <div class="playoff-bracket-scroll">
      <div class="playoff-drag-overlay" aria-hidden="true">
        <span class="playoff-drag-overlay-copy">${escapeHtml(t("bracketDragHint"))}</span>
      </div>
      <div class="playoff-bracket-shell">
        <svg class="bracket-lines" aria-hidden="true"></svg>
        <div class="playoff-bracket">
          ${renderBracketHalf("left", bracket.left, mode, liveWinnerTeamIdsByMatch)}
          <section class="bracket-center">
            <div class="bracket-stage-head">
              <h3>${escapeHtml(t("bracketFinals"))}</h3>
            </div>
            <div class="bracket-center-stack">
              ${bracket.final ? renderBracketMatch(bracket.final, mode, "featured", liveWinnerTeamIdsByMatch) : ""}
              ${bracket.thirdPlace ? renderBracketMatch(bracket.thirdPlace, mode, "featured", liveWinnerTeamIdsByMatch) : ""}
            </div>
          </section>
          ${renderBracketHalf("right", bracket.right, mode, liveWinnerTeamIdsByMatch)}
        </div>
      </div>
    </div>
  `;
}

function getPlayoffScrollSnapshot(container) {
	const scroller = container?.querySelector(".playoff-bracket-scroll");

	return {
		left: scroller ? scroller.scrollLeft : 0,
		top: scroller ? scroller.scrollTop : 0,
	};
}

function restorePlayoffScrollSnapshot(container, snapshot) {
	const scroller = container?.querySelector(".playoff-bracket-scroll");

	if (!scroller || !snapshot) {
		return;
	}

	scroller.scrollLeft = snapshot.left;
	scroller.scrollTop = snapshot.top;
}

function renderFixtures() {
	if (!state.worldCup) {
		elements.fixturesFeed.innerHTML = emptyState(t("emptyFixtures"));
		return;
	}

	if (!state.calendarLoaded) {
		elements.fixturesFeed.innerHTML = `
      <div class="calendar-load-state">
        <button class="button secondary" type="button" data-load-calendar="true">${escapeHtml(t("loadCalendar"))}</button>
      </div>
    `;
		return;
	}

	const fixtures = buildCalendarFixtures();

	if (!fixtures.length) {
		elements.fixturesFeed.innerHTML = emptyState(t("noFixtureList"));
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
          ${escapeHtml(t("calendarPrevious"))}
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
          ${escapeHtml(t("calendarNext"))}
        </button>
      </div>
      ${renderCalendarMonth(activeMonth, false)}
    </div>
  `;
}

function buildCalendarFixtures() {
	const includeAllLiveFixtures = isShowingLiveResults();
	const liveFixtures = [...getLiveFixtures()]
		.filter((fixture) => includeAllLiveFixtures || isGroupStageStage(fixture.stage))
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

	const { projectedMatches } = getDisplayedPlayoffData();
	const projectedFixtures = projectedMatches
		.filter((match) => !includeAllLiveFixtures || !hasLiveFixtureEquivalent(match, liveFixtures))
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
	const sameStageDayFixtures = liveFixtures.filter((fixture) => {
		const sameStage = fixture.stage === match.stage;
		const sameDay = getCalendarDateKey(getFixtureDate(fixture)) === getCalendarDateKey(getFixtureDate(match));
		return sameStage && sameDay;
	});

	if (!sameStageDayFixtures.length) {
		return false;
	}

	if (sameStageDayFixtures.length === 1) {
		return true;
	}

	return sameStageDayFixtures.some((fixture) => normalizeVenueMatchValue(fixture.venue?.name) === normalizeVenueMatchValue(match.venue));
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
          ${(CALENDAR_WEEKDAYS[APP_LOCALE] || CALENDAR_WEEKDAYS.en).map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
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
        <span class="muted">${escapeHtml(t("calendarVersus"))}</span>
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
		return t("tbd");
	}

	return formatTime(getFixtureDate(fixture));
}

function renderCalendarSide(side) {
	if (!side) {
		return `<span class="calendar-side-label">${escapeHtml(t("tbd"))}</span>`;
	}

	if (side.type === "team" && side.team) {
		return `
      <span class="calendar-team-mark">
        ${renderTeamLogo(side.team)}
        ${renderTeamCode(side.team, "team-code calendar-team-code")}
      </span>
    `;
	}

	if (side.type === "team") {
		return `<span class="calendar-side-label">${escapeHtml(side.groupSlot || side.label || t("tbd"))}</span>`;
	}

	return `<span class="calendar-side-label">${escapeHtml(formatCalendarSideLabel(side))}</span>`;
}

function formatCalendarSideLabel(side) {
	if (side.type === "thirdEligible") {
		return side.label || t("calendarThirdPlace");
	}

	if (side.type === "matchLink") {
		return side.label;
	}

	return side.label || t("tbd");
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

function renderSaveState() {
	elements.saveStatus.textContent = state.saveStatus || getDefaultSaveStatus();
}

function renderOverallScore() {
	const shouldShow = Boolean(state.worldCup);
	elements.overallScoreCard.classList.toggle("hidden", !shouldShow);

	if (!shouldShow) {
		return;
	}

	elements.overallScoreValue.textContent = state.overallScore === null ? "--" : String(state.overallScore);
	elements.overallScoreBonusValue.textContent = state.overallBonusPoints === null ? "--" : String(state.overallBonusPoints);
	const shouldShowSubmitAction = !isShowingLiveResults() && canAccessRankings();
	elements.overallScoreSubmitButton.textContent = isSubmissionPending() ? t("overallSubmitting") : hasSubmittedAllPicks() ? t("overallSubmitted") : t("overallSubmit");
	elements.overallScoreSubmitButton.disabled = !shouldShowSubmitAction || state.loading || !state.worldCup || isSubmissionPending() || hasSubmittedAllPicks();
	elements.overallScoreSubmitButton.classList.toggle("is-inert", !shouldShowSubmitAction);
	elements.overallScoreSubmitButton.setAttribute("aria-hidden", shouldShowSubmitAction ? "false" : "true");
}

function getDefaultSaveStatus() {
	if (!state.auth.enabled) {
		return t("authUnavailable");
	}

	if (!canAccessRankings()) {
		return isShowingLiveResults() ? t("authUnlockPredictions") : t("authStartPredicting");
	}

	if (isUsingDevPicks()) {
		return isShowingLiveResults() ? t("saveStatusDevLive") : t("saveStatusDevLocal");
	}

	if (isShowingLiveResults()) {
		return t("saveStatusViewingLive");
	}

	return t("saveStatusDefault");
}

function scheduleOverallScoreRefresh() {
	const request = buildOverallScoreRequest();

	if (!request) {
		resetOverallScore();
		return;
	}

	if (request.snapshot === scoreSyncState.lastResolvedSnapshot && !scoreSyncState.inFlight) {
		return;
	}

	scoreSyncState.pendingSnapshot = request.snapshot;
	scoreSyncState.pendingPayload = request.payload;

	if (scoreSyncState.timer) {
		clearTimeout(scoreSyncState.timer);
	}

	scoreSyncState.timer = window.setTimeout(() => {
		scoreSyncState.timer = 0;
		void flushOverallScoreRefresh();
	}, 180);
}

async function flushOverallScoreRefresh() {
	if (scoreSyncState.inFlight || !scoreSyncState.pendingPayload || !scoreSyncState.pendingSnapshot) {
		return;
	}

	const payload = scoreSyncState.pendingPayload;
	const snapshot = scoreSyncState.pendingSnapshot;

	scoreSyncState.inFlight = true;

	try {
		const response = await fetch("/api/scoring/settle", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		const data = await response.json().catch(() => ({}));

		const resolvedCurrentScore = Number.isFinite(Number(data?.currentScore))
			? Number(data.currentScore)
			: Number.isFinite(Number(data?.totalPoints))
				? Number(data.totalPoints) - Number(data?.timingPoints || 0)
				: Number.NaN;
		const resolvedBonusPoints = Number.isFinite(Number(data?.predictedBonusPoints))
			? Number(data.predictedBonusPoints)
			: Number.isFinite(Number(data?.bonusPoints))
				? Number(data.bonusPoints)
				: 0;

		if (!response.ok || !Number.isFinite(resolvedCurrentScore)) {
			throw new Error(t("genericCouldNotScorePicks"));
		}

		state.overallScore = resolvedCurrentScore;
		state.overallBonusPoints = resolvedBonusPoints;
		renderOverallScore();
	} catch (_error) {
		// Keep score failures silent in the UI.
	} finally {
		scoreSyncState.inFlight = false;
		scoreSyncState.lastResolvedSnapshot = snapshot;

		if (scoreSyncState.pendingSnapshot === snapshot) {
			scoreSyncState.pendingSnapshot = "";
			scoreSyncState.pendingPayload = null;
			return;
		}

		if (scoreSyncState.pendingSnapshot && scoreSyncState.pendingSnapshot !== scoreSyncState.lastResolvedSnapshot) {
			void flushOverallScoreRefresh();
		}
	}
}

function resetOverallScore() {
	if (scoreSyncState.timer) {
		clearTimeout(scoreSyncState.timer);
		scoreSyncState.timer = 0;
	}

	scoreSyncState.inFlight = false;
	scoreSyncState.pendingSnapshot = "";
	scoreSyncState.pendingPayload = null;
	scoreSyncState.lastResolvedSnapshot = "";
	state.overallScore = null;
	state.overallBonusPoints = null;
	renderOverallScore();
}

function buildOverallScoreRequest() {
	if (!canAccessRankings() || !state.worldCup) {
		return null;
	}

	const playoffScoreData = buildPlayoffScoreDataForScoring();
	const predictions = [...buildTournamentScorePredictions(), ...playoffScoreData.predictions];
	const tournamentResults = buildTournamentScoreResults();
	const payload = {
		predictions,
		tournamentResults,
		matchesById: playoffScoreData.matchesById,
		resultsByMatchId: playoffScoreData.resultsByMatchId,
	};

	return {
		payload,
		snapshot: JSON.stringify(payload),
	};
}

function buildTournamentScorePredictions() {
	const predictions = [];
	const groupsCreatedAt = getSectionPredictionTimestamp("groups");

	for (const group of state.groups) {
		const winner = group.teams?.[0];

		if (!winner?.id) {
			continue;
		}

		predictions.push({
			predictionId: `group-winner-${group.letter}`,
			pickType: "groupWinner",
			group: group.letter,
			teamId: winner.id,
			createdAt: groupsCreatedAt,
		});
	}

	const { projectedMatches } = getProjectedPlayoffData({
		syncWinnerSelections: false,
		syncRenderedMatches: false,
	});
	const playoffsCreatedAt = getSectionPredictionTimestamp("playoffs");
	const semifinalistTeamIds = collectStageTeamIds(projectedMatches, "Semi-finals", 4);
	const finalistTeamIds = collectStageTeamIds(projectedMatches, "Final", 2);
	const championTeamId = getStageWinnerTeamId(projectedMatches, "Final");

	if (semifinalistTeamIds.length === 4) {
		predictions.push({
			predictionId: "semifinalists",
			pickType: "semifinalist",
			teamIds: semifinalistTeamIds,
			createdAt: playoffsCreatedAt,
		});
	}

	if (finalistTeamIds.length === 2) {
		predictions.push({
			predictionId: "finalists",
			pickType: "finalist",
			teamIds: finalistTeamIds,
			createdAt: playoffsCreatedAt,
		});
	}

	if (championTeamId) {
		predictions.push({
			predictionId: "champion",
			pickType: "champion",
			teamId: championTeamId,
			createdAt: playoffsCreatedAt,
		});
	}

	return predictions;
}

function buildTournamentScoreResults() {
	const liveGroups = getLiveGroups();
	const liveGroupWinners = Object.fromEntries(
		liveGroups
			.filter((group) => isLiveGroupComplete(group))
			.map((group) => [group.letter, group.teams?.[0]?.id])
			.filter(([, teamId]) => teamId != null),
	);
	const { projectedMatches } = getLivePlayoffData({
		syncWinnerSelections: false,
		syncRenderedMatches: false,
	});

	return {
		groupWinners: liveGroupWinners,
		semifinalistTeamIds: collectStageTeamIds(projectedMatches, "Semi-finals", 4),
		finalistTeamIds: collectStageTeamIds(projectedMatches, "Final", 2),
		championTeamId: getStageWinnerTeamId(projectedMatches, "Final"),
	};
}

function buildPlayoffScoreDataForScoring() {
	const playoffsCreatedAt = getSectionPredictionTimestamp("playoffs");
	const { projectedMatches: predictedMatches } = getProjectedPlayoffData({
		syncWinnerSelections: false,
		syncRenderedMatches: false,
	});
	const { projectedMatches: liveMatches } = getLivePlayoffData({
		syncWinnerSelections: false,
		syncRenderedMatches: false,
	});
	const liveMatchMap = new Map(liveMatches.map((match) => [String(match.match), match]));
	const predictions = [];
	const matchesById = {};
	const resultsByMatchId = {};

	for (const predictedMatch of predictedMatches) {
		const matchKey = String(predictedMatch.match);
		const liveMatch = liveMatchMap.get(matchKey);

		if (!doProjectedPlayoffTeamsMatchLiveMatch(predictedMatch, liveMatch)) {
			continue;
		}

		const homeGoals = getStoredBracketScoreValue(matchKey, "home");
		const awayGoals = getStoredBracketScoreValue(matchKey, "away");
		const selectedWinner = getSelectedWinnerSide(predictedMatch);
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
			winnerTeamId: selectedWinner?.team?.id ?? null,
		});
		matchesById[matchKey] = createScoringPlayoffMatch(liveMatch, matchKey);
		resultsByMatchId[matchKey] = createScoringPlayoffResult(liveMatch);
	}

	return {
		predictions,
		matchesById,
		resultsByMatchId,
	};
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
		home: match?.home ?? null,
		away: match?.away ?? null,
	};
}

function createScoringPlayoffResult(match) {
	return {
		goals: match?.goals ?? null,
		score: match?.score ?? null,
		status: match?.status ?? null,
		settled: isCompletedFixtureStatus(match?.status?.short),
	};
}

function getSectionPredictionTimestamp(section) {
	const submittedAt = state.sectionSubmittedAt?.[section];
	return typeof submittedAt === "string" && submittedAt.trim() ? submittedAt.trim() : null;
}

function isLiveGroupComplete(group) {
	return Array.isArray(group?.fixtures) && group.fixtures.length > 0 && group.fixtures.every((fixture) => isCompletedFixtureStatus(fixture?.status?.short));
}

function collectStageTeamIds(matches, stage, expectedCount = 0) {
	const teamIds = Array.from(
		new Set(
			(matches || [])
				.filter((match) => match.stage === stage)
				.flatMap((match) => [match.home, match.away])
				.filter((side) => side?.type === "team" && side.team?.id != null)
				.map((side) => getTeamIdKey(side.team.id)),
		),
	);

	if (expectedCount > 0 && teamIds.length !== expectedCount) {
		return [];
	}

	return teamIds;
}

function getStageWinnerTeamId(matches, stage) {
	const match = (matches || []).find((entry) => entry.stage === stage);
	const winner = match ? getSelectedWinnerSide(match, match.selectedWinnerTeamId ? { [String(match.match)]: match.selectedWinnerTeamId } : {}) : null;
	return winner?.team?.id != null ? getTeamIdKey(winner.team.id) : "";
}

async function fetchWithAuth(input, init = {}) {
	if (!state.auth.client || !state.auth.enabled) {
		throw new Error(t("authUnavailable"));
	}

	const { data, error } = await state.auth.client.auth.getSession();

	if (error) {
		throw error;
	}

	if (!data.session?.access_token) {
		throw new Error(t("authSignInFirst"));
	}

	const headers = new Headers(init.headers || {});
	headers.set("Authorization", `Bearer ${data.session.access_token}`);

	const response = await fetch(input, {
		...init,
		headers,
	});

	if (response.status !== 431) {
		return response;
	}

	const refreshedSession = await refreshAuthSessionAfterLargeHeader();

	if (!refreshedSession?.access_token) {
		return response;
	}

	headers.set("Authorization", `Bearer ${refreshedSession.access_token}`);

	return fetch(input, {
		...init,
		headers,
	});
}

async function refreshAuthSessionAfterLargeHeader() {
	if (!state.auth.client) {
		return null;
	}

	const { data, error } = await state.auth.client.auth.refreshSession();

	if (error || !data.session?.access_token) {
		return null;
	}

	state.auth.session = data.session;
	return data.session;
}

function buildCurrentSaveState() {
	const email = getAuthenticatedEmail();

	if (!state.worldCup || !email || isUsingDevPicks()) {
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
		throw new Error(getResponseErrorMessage(data, t("genericCouldNotSavePicks")));
	}

	state.sectionSubmittedAt = normalizeSectionSubmissionState(data.sectionSubmittedAt, data.submittedAt);
	state.submittedAt = getLatestSubmittedAt();
	syncState.lastSavedSnapshot = current.snapshot;
	syncState.loadedEmail = current.email;
	state.saveStatus = t("saveStatusSavedOn", { date: formatDateTime(data.savedAt) });
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
				state.saveStatus = t("saveStatusNoSaved");
				renderSaveState();
			}
			return false;
		}

		if (!response.ok) {
			throw new Error(getResponseErrorMessage(data, t("genericCouldNotLoadPicks")));
		}

		applySavedPicks(data);
		syncState.loadedEmail = email;
		syncState.lastSavedSnapshot = buildCurrentSaveState()?.snapshot || "";
		if (!silentSuccess) {
			state.saveStatus = t("saveStatusLoadedOn", { date: formatDateTime(data.savedAt) });
		}
		render();
		return true;
	} catch (error) {
		state.saveStatus = sanitizeUserFacingMessage(error instanceof Error ? error.message : "", t("genericCouldNotLoadPicks"));
		renderSaveState();
		return false;
	} finally {
		syncState.loadingSavedPicks = false;
	}
}

function ensureSavedPicksLoadedForCurrentUser() {
	const email = getAuthenticatedEmail();

	if (isUsingDevPicks() || !email || !state.worldCup || syncState.loadingSavedPicks || syncState.loadedEmail === email) {
		return Promise.resolve(false);
	}

	return loadSavedPicks({ silentMissing: true, silentSuccess: true });
}

function scheduleAutoSave() {
	if (isUsingDevPicks() || !getAuthenticatedEmail() || !state.worldCup || syncState.loadingSavedPicks || isSubmissionPending() || !hasEditableSections()) {
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
	state.saveStatus = t("saveStatusSaving");
	renderSaveState();

	try {
		await saveCurrentPicks(current);
	} catch (error) {
		state.saveStatus = sanitizeUserFacingMessage(error instanceof Error ? error.message : "", t("genericCouldNotSavePicks"));
		renderSaveState();
	} finally {
		syncState.autoSaveInFlight = false;
		if (syncState.autoSaveQueued) {
			scheduleAutoSave();
		}
	}
}

function handleOverallSubmitClick() {
	void handleSubmitAllPicks();
}

async function handleSubmitAllPicks() {
	if (!state.worldCup || isSubmissionPending() || isShowingLiveResults()) {
		return;
	}

	if (!getAuthenticatedEmail()) {
		state.saveStatus = t("signInToSubmit");
		renderSaveState();
		return;
	}

	if (syncState.autoSaveTimer) {
		clearTimeout(syncState.autoSaveTimer);
		syncState.autoSaveTimer = 0;
	}

	const submittedAt = new Date().toISOString();
	const previousSectionSubmittedAt = { ...state.sectionSubmittedAt };
	const previousSubmittedAt = state.submittedAt;
	state.submissionPendingSection = "all";
	state.sectionSubmittedAt = createSubmittedSectionState(submittedAt);
	state.submittedAt = submittedAt;
	state.saveStatus = t("saveStatusSubmitting");
	render();

	try {
		await waitForAutoSaveToSettle();

		if (isUsingDevPicks()) {
			state.saveStatus = t("saveStatusDevSubmitted");
			render();
			return;
		}

		await saveCurrentPicks(buildCurrentSaveState());
		state.saveStatus = t("saveStatusSubmitted");
		render();
	} catch (error) {
		state.sectionSubmittedAt = previousSectionSubmittedAt;
		state.submittedAt = previousSubmittedAt;
		const message = sanitizeUserFacingMessage(error instanceof Error ? error.message : "", t("genericCouldNotSubmitPicks"));

		state.saveStatus = message;
		render();
	} finally {
		state.submissionPendingSection = "";
		renderAuthState();
		renderSaveState();
		renderOverallScore();
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
	const viewModeButton = event.target.closest("[data-view-mode]");

	if (viewModeButton) {
		setViewMode(viewModeButton.dataset.viewMode);
		return;
	}

	const calendarButton = event.target.closest("[data-calendar-step]");

	if (calendarButton) {
		changeCalendarMonth(Number(calendarButton.dataset.calendarStep));
		return;
	}

	const loadCalendarButton = event.target.closest("[data-load-calendar]");

	if (loadCalendarButton) {
		state.calendarLoaded = true;
		renderFixtures();
		return;
	}

	const thirdCard = event.target.closest("[data-select-third]");

	if (thirdCard) {
		if (!ensureEditableRankingsView()) {
			return;
		}

		toggleThirdPlaceSelection(thirdCard.dataset.teamId);
		return;
	}

	const clearBracketSideButton = event.target.closest("[data-clear-bracket-source]");

	if (clearBracketSideButton) {
		if (!ensureEditableRankingsView()) {
			return;
		}

		clearBracketSourceSelection(clearBracketSideButton.dataset.sourceMatch);
		return;
	}

	const bracketPick = event.target.closest("[data-pick-winner]");

	if (bracketPick) {
		if (!ensureEditableRankingsView()) {
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

function handlePlayoffWheel(event) {
	if (!(event.target instanceof Element)) {
		return;
	}

	const scroller = event.target.closest(".playoff-bracket-scroll");

	if (!scroller) {
		return;
	}

	if (!event.cancelable) {
		return;
	}

	event.preventDefault();

	if (event.ctrlKey || event.metaKey) {
		scrollPlayoffByWheel(scroller, event);
		return;
	}

	window.scrollBy({
		top: normalizeWheelDeltaToPixels(event.deltaY, event.deltaMode),
		behavior: "auto",
	});
}

function normalizeWheelDeltaToPixels(delta, deltaMode) {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
		return delta * 16;
	}

	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
		return delta * window.innerHeight * 0.85;
	}

	return delta;
}

function scrollPlayoffByWheel(scroller, event) {
	const deltaX = normalizeWheelDeltaToPixels(event.deltaX, event.deltaMode);
	const deltaY = normalizeWheelDeltaToPixels(event.deltaY, event.deltaMode);
	const canScrollHorizontally = scroller.scrollWidth > scroller.clientWidth + 1;
	const canScrollVertically = scroller.scrollHeight > scroller.clientHeight + 1;

	if (canScrollHorizontally && !canScrollVertically && Math.abs(deltaX) < 0.5) {
		scroller.scrollLeft += deltaY;
		return;
	}

	if (canScrollHorizontally) {
		scroller.scrollLeft += deltaX;
	}

	if (canScrollVertically) {
		scroller.scrollTop += deltaY;
	}
}

function handlePlayoffPanStart(event) {
	const scroller = event.target.closest(".playoff-bracket-scroll");

	if (!scroller || event.pointerType === "touch" || event.isPrimary === false) {
		return;
	}

	if (event.pointerType === "mouse" && event.button !== 0) {
		return;
	}

	if (shouldRequirePlayoffPanModifier(event) && !event.ctrlKey && !event.metaKey) {
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

function handlePlayoffTouchStart(event) {
	if (!(event.target instanceof Element)) {
		return;
	}

	const scroller = event.target.closest(".playoff-bracket-scroll");

	if (!scroller || playoffPanState.active || event.touches.length !== 2) {
		return;
	}

	const canPanHorizontally = scroller.scrollWidth > scroller.clientWidth + 1;
	const canPanVertically = scroller.scrollHeight > scroller.clientHeight + 1;

	if (!canPanHorizontally && !canPanVertically) {
		return;
	}

	const centroid = getTouchCentroid(event.touches);

	if (!centroid) {
		return;
	}

	playoffPanState.active = true;
	playoffPanState.touchMode = true;
	playoffPanState.pointerId = null;
	playoffPanState.scroller = scroller;
	playoffPanState.startX = centroid.x;
	playoffPanState.startY = centroid.y;
	playoffPanState.startScrollLeft = scroller.scrollLeft;
	playoffPanState.startScrollTop = scroller.scrollTop;
	playoffPanState.canPanHorizontally = canPanHorizontally;
	playoffPanState.canPanVertically = canPanVertically;
	playoffPanState.moved = false;
}

function shouldRequirePlayoffPanModifier(event) {
	return event.pointerType !== "touch";
}

function deviceSupportsTouchInput() {
	return (navigator.maxTouchPoints || 0) > 0;
}

function supportsFinePointerInput() {
	return window.matchMedia?.("(pointer: fine), (any-pointer: fine)")?.matches ?? false;
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
		dismissPlayoffDragOverlay();
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

function handlePlayoffTouchMove(event) {
	if (!playoffPanState.active || !playoffPanState.touchMode || !playoffPanState.scroller) {
		return;
	}

	if (event.touches.length < 2) {
		clearPlayoffPanState(playoffPanState.moved);
		return;
	}

	const centroid = getTouchCentroid(event.touches);

	if (!centroid) {
		return;
	}

	const deltaX = centroid.x - playoffPanState.startX;
	const deltaY = centroid.y - playoffPanState.startY;

	if (!playoffPanState.moved) {
		if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
			return;
		}

		playoffPanState.moved = true;
		playoffPanState.scroller.classList.add("is-panning");
	}

	if (event.cancelable) {
		event.preventDefault();
	}

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

function handlePlayoffTouchEnd(event) {
	if (!playoffPanState.active || !playoffPanState.touchMode) {
		return;
	}

	if (event.touches.length >= 2 && playoffPanState.scroller) {
		const centroid = getTouchCentroid(event.touches);

		if (centroid) {
			playoffPanState.startX = centroid.x;
			playoffPanState.startY = centroid.y;
			playoffPanState.startScrollLeft = playoffPanState.scroller.scrollLeft;
			playoffPanState.startScrollTop = playoffPanState.scroller.scrollTop;
			return;
		}
	}

	clearPlayoffPanState(playoffPanState.moved);
}

function getTouchCentroid(touches) {
	if (!touches || touches.length < 2) {
		return null;
	}

	const first = touches[0];
	const second = touches[1];

	return {
		x: (first.clientX + second.clientX) / 2,
		y: (first.clientY + second.clientY) / 2,
	};
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
	playoffPanState.touchMode = false;
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

function teardownGroupDragAndDrop() {
	if (typeof groupDragState.cleanup === "function") {
		groupDragState.cleanup();
	}

	if (groupDragState.activeDrag?.row?.isConnected) {
		groupDragState.activeDrag.row.classList.remove("is-dragging");
	}

	groupDragState.cleanup = null;
	groupDragState.activeDrag = null;
}

function bindGroupDragAndDrop(root) {
	if (isSectionReadOnly("groups")) {
		return;
	}

	const rows = Array.from((root || document).querySelectorAll(".group-table-row[data-team-id]"));

	if (!rows.length) {
		return;
	}

	const cleanup = combine(
		...rows.map((row) =>
			combine(
				draggable({
					element: row,
					getInitialData() {
						return getGroupRowDragData(row);
					},
					onDragStart() {
						startGroupRowDrag(row);
					},
					onDrop() {
						row.classList.remove("is-dragging");
					},
				}),
				dropTargetForElements({
					element: row,
					getIsSticky: () => true,
					canDrop({ source }) {
						return canDropOnGroupRow(source.data, row);
					},
					getData({ element, input }) {
						return attachClosestEdge(getGroupRowDropTargetData(row), {
							element,
							input,
							allowedEdges: ["top", "bottom"],
						});
					},
					onDragEnter({ source, self }) {
						handleGroupRowDropInteraction(source.data, self.data);
					},
					onDrag({ source, self }) {
						handleGroupRowDropInteraction(source.data, self.data);
					},
				}),
			),
		),
		monitorForElements({
			canMonitor({ source }) {
				return isGroupRowDragData(source.data);
			},
			onDrop({ source, location }) {
				finishGroupRowDrag(source.data, location.current.dropTargets);
			},
		}),
	);

	groupDragState.cleanup = cleanup;
}

function startGroupRowDrag(row) {
	if (isSectionReadOnly("groups")) {
		return;
	}

	const container = row.closest("tbody");

	if (!container) {
		return;
	}

	hideFloatingTooltip();

	if (groupDragState.activeDrag?.row?.isConnected) {
		groupDragState.activeDrag.row.classList.remove("is-dragging");
	}

	groupDragState.activeDrag = {
		groupLetter: row.dataset.group || "",
		teamId: row.dataset.teamId || "",
		row,
		container,
		hasMoved: false,
	};

	row.classList.add("is-dragging");
}

function handleGroupRowDropInteraction(sourceData, targetData) {
	if (!isGroupRowDragData(sourceData) || !isGroupRowDropTargetData(targetData)) {
		return;
	}

	const activeDrag = groupDragState.activeDrag;

	if (!activeDrag || activeDrag.teamId !== sourceData.teamId || activeDrag.groupLetter !== sourceData.groupLetter) {
		return;
	}

	if (activeDrag.groupLetter !== targetData.groupLetter || activeDrag.teamId === targetData.teamId) {
		return;
	}

	const closestEdge = extractClosestEdge(targetData);

	if (closestEdge !== "top" && closestEdge !== "bottom") {
		return;
	}

	const targetRow = findGroupRowByTeamId(activeDrag.container, targetData.teamId);

	if (!targetRow) {
		return;
	}

	const previousRects = captureRowRects(activeDrag.container);

	if (!moveGroupRowElement(activeDrag.row, targetRow, closestEdge)) {
		return;
	}

	activeDrag.hasMoved = true;
	animateMovedRows(previousRects, activeDrag.container);
}

function finishGroupRowDrag(sourceData, dropTargets) {
	const activeDrag = groupDragState.activeDrag;

	if (!activeDrag) {
		return;
	}

	activeDrag.row.classList.remove("is-dragging");
	groupDragState.activeDrag = null;

	if (!isGroupRowDragData(sourceData)) {
		renderGroups();
		return;
	}

	const droppedOnValidRow = Array.isArray(dropTargets) && dropTargets.some((dropTarget) => isGroupRowDropTargetData(dropTarget?.data) && dropTarget.data.groupLetter === activeDrag.groupLetter);

	if (!activeDrag.hasMoved && !droppedOnValidRow) {
		return;
	}

	applyGroupOrderByTeamIds(activeDrag.groupLetter, getGroupDomTeamIds(activeDrag.container));
}

function handleGroupTouchDragStart(event) {
	if (isSectionReadOnly("groups") || isShowingLiveResults() || event.touches.length !== 1) {
		return;
	}

	if (!(event.target instanceof Element)) {
		return;
	}

	const handle = event.target.closest("[data-group-drag-handle='true']");
	const row = handle?.closest(".group-table-row.is-draggable[data-team-id]") ?? null;

	if (!row) {
		return;
	}

	const touch = event.touches[0];

	groupTouchDragState.active = true;
	groupTouchDragState.row = row;
	groupTouchDragState.groupLetter = row.dataset.group || "";
	groupTouchDragState.teamId = row.dataset.teamId || "";
	groupTouchDragState.startX = touch.clientX;
	groupTouchDragState.startY = touch.clientY;
}

function handleGroupTouchDragMove(event) {
	if (!groupTouchDragState.active || event.touches.length !== 1 || !groupTouchDragState.row?.isConnected) {
		return;
	}

	const touch = event.touches[0];
	const deltaX = touch.clientX - groupTouchDragState.startX;
	const deltaY = touch.clientY - groupTouchDragState.startY;

	if (!groupDragState.activeDrag) {
		if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
			return;
		}

		startGroupRowDrag(groupTouchDragState.row);

		if (!groupDragState.activeDrag) {
			clearGroupTouchDragState();
			return;
		}
	}

	if (event.cancelable) {
		event.preventDefault();
	}

	hideFloatingTooltip();

	const activeDrag = groupDragState.activeDrag;
	const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
	const targetRow = targetElement?.closest(".group-table-row[data-team-id]") ?? null;

	if (!activeDrag || !targetRow || targetRow.parentElement !== activeDrag.container || targetRow.dataset.group !== activeDrag.groupLetter || targetRow === activeDrag.row) {
		return;
	}

	const rect = targetRow.getBoundingClientRect();
	const closestEdge = touch.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
	const previousRects = captureRowRects(activeDrag.container);

	if (!moveGroupRowElement(activeDrag.row, targetRow, closestEdge)) {
		return;
	}

	activeDrag.hasMoved = true;
	animateMovedRows(previousRects, activeDrag.container);
}

function handleGroupTouchDragEnd() {
	if (!groupTouchDragState.active) {
		return;
	}

	const activeDrag = groupDragState.activeDrag;

	if (activeDrag) {
		activeDrag.row.classList.remove("is-dragging");
		groupDragState.activeDrag = null;

		if (activeDrag.hasMoved) {
			applyGroupOrderByTeamIds(activeDrag.groupLetter, getGroupDomTeamIds(activeDrag.container));
		}
	}

	clearGroupTouchDragState();
}

function clearGroupTouchDragState() {
	groupTouchDragState.active = false;
	groupTouchDragState.row = null;
	groupTouchDragState.groupLetter = "";
	groupTouchDragState.teamId = "";
	groupTouchDragState.startX = 0;
	groupTouchDragState.startY = 0;
}

function applyGroupOrderByTeamIds(groupLetter, orderedTeamIds) {
	if (isSectionReadOnly("groups")) {
		renderGroups();
		return;
	}

	const group = state.groups.find((entry) => entry.letter === groupLetter);

	if (!group || !orderedTeamIds.length) {
		renderGroups();
		return;
	}

	const currentOrder = group.teams.map((team) => getTeamIdKey(team.id));

	if (currentOrder.length === orderedTeamIds.length && currentOrder.every((teamId, index) => teamId === orderedTeamIds[index])) {
		return;
	}

	const orderMap = new Map(orderedTeamIds.map((teamId, index) => [teamId, index]));

	group.teams = [...group.teams].sort((left, right) => {
		const leftOrder = orderMap.has(getTeamIdKey(left.id)) ? orderMap.get(getTeamIdKey(left.id)) : Number.POSITIVE_INFINITY;
		const rightOrder = orderMap.has(getTeamIdKey(right.id)) ? orderMap.get(getTeamIdKey(right.id)) : Number.POSITIVE_INFINITY;
		return leftOrder - rightOrder;
	});
	group.teams.forEach((team, index) => {
		team.standing.rank = index + 1;
	});
	state.thirdPlaceRanking = deriveThirdPlaceRanking(
		state.groups,
		state.thirdPlaceRanking.map((team) => team.id),
	);
	state.selectedThirdTeamIds = chooseThirdPlaceSelections(state.selectedThirdTeamIds);
	invalidateSubmittedPicks();
	renderInteractiveViews();
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

function applyDevPicksSeed() {
	if (!state.worldCup?.groups?.length) {
		return;
	}

	state.groups = buildDevSeedGroups(state.worldCup.groups);
	state.thirdPlaceRanking = deriveThirdPlaceRanking(state.groups);
	state.selectedThirdTeamIds = chooseThirdPlaceSelections(
		state.thirdPlaceRanking.slice(0, 8).map((team) => team.id),
		state.thirdPlaceRanking,
	);
	state.bracketWinnerSelections = buildDevSeedWinnerSelections({
		groups: state.groups,
		thirdPlaceRanking: state.thirdPlaceRanking,
		selectedThirdTeamIds: state.selectedThirdTeamIds,
	});
	clearSubmittedPicksState();
}

function buildDevLiveWorldCup() {
	if (!state.worldCup?.groups?.length) {
		return null;
	}

	const groups = buildDevLiveGroups(state.worldCup.groups);
	const thirdPlaceRanking = deriveThirdPlaceRanking(groups);
	const selectedThirdTeamIds = chooseThirdPlaceSelections(
		thirdPlaceRanking.slice(0, 8).map((team) => team.id),
		thirdPlaceRanking,
	);
	const advancingThirdPlaces = getSelectedBestThirdTeams(selectedThirdTeamIds, thirdPlaceRanking);
	const winnerSelections = buildDevSeedWinnerSelections({
		groups,
		thirdPlaceRanking,
		selectedThirdTeamIds,
	});
	const { projectedMatches } = getProjectedPlayoffData({
		groups,
		thirdPlaceRanking,
		selectedThirdTeamIds,
		winnerSelections,
		syncWinnerSelections: false,
		syncRenderedMatches: false,
	});
	const fixtures = buildDevLiveFixtures({
		groups,
		projectedMatches,
	});
	const groupsWithFixtures = groups.map((group) => ({
		...group,
		fixtures: fixtures.filter((fixture) => fixture.groupLetter === group.letter),
	}));

	return {
		...state.worldCup,
		groups: groupsWithFixtures,
		thirdPlaceRanking,
		fixtures,
		playoffBoard: {
			...(state.worldCup.playoffBoard || {}),
			advancingThirdPlaces,
		},
	};
}

function buildDevLiveGroups(groups) {
	return buildDevSeedGroups(groups).map((group, groupIndex) => {
		const thirdPlacePoints = groupIndex < 4 ? 4 : groupIndex < 8 ? 3 : 1;
		const thirdPlaceGoalDifference = groupIndex < 4 ? 1 - groupIndex : groupIndex < 8 ? -1 - (groupIndex - 4) : -3 - (groupIndex - 8);
		const thirdPlaceGoalsFor = groupIndex < 4 ? 4 - groupIndex : groupIndex < 8 ? 3 - (groupIndex - 4) : 2;
		const standings = [
			{ rank: 1, points: 7, wins: 2, draws: 1, losses: 0, goalsFor: 7, goalsAgainst: 2, description: "Advances" },
			{ rank: 2, points: 6, wins: 2, draws: 0, losses: 1, goalsFor: 5, goalsAgainst: 3, description: "Advances" },
			{
				rank: 3,
				points: thirdPlacePoints,
				wins: thirdPlacePoints >= 3 ? 1 : 0,
				draws: thirdPlacePoints === 4 ? 1 : thirdPlacePoints === 1 ? 1 : 0,
				losses: thirdPlacePoints === 4 ? 1 : thirdPlacePoints === 3 ? 2 : 2,
				goalsFor: thirdPlaceGoalsFor,
				goalsAgainst: thirdPlaceGoalsFor - thirdPlaceGoalDifference,
				description: "3rd place race",
			},
			{
				rank: 4,
				points: thirdPlacePoints === 1 ? 0 : 1,
				wins: 0,
				draws: thirdPlacePoints === 1 ? 1 : 0,
				losses: thirdPlacePoints === 1 ? 2 : 3,
				goalsFor: 1,
				goalsAgainst: 6,
				description: "Out",
			},
		];

		group.teams = group.teams.map((team, index) => ({
			...team,
			standing: {
				...(team.standing || {}),
				...standings[index],
				goalDifference: standings[index].goalsFor - standings[index].goalsAgainst,
				played: 3,
				form: buildDevFormString(standings[index]),
				update: new Date().toISOString(),
			},
		}));

		return group;
	});
}

function buildDevFormString(standing) {
	return [...Array.from({ length: standing.wins || 0 }, () => "W"), ...Array.from({ length: standing.draws || 0 }, () => "D"), ...Array.from({ length: standing.losses || 0 }, () => "L")].join("");
}

function buildDevSeedGroups(groups) {
	return cloneGroups(groups).map((group, groupIndex) => {
		const pattern = DEV_GROUP_ORDER_PATTERNS[groupIndex % DEV_GROUP_ORDER_PATTERNS.length] || [];
		const orderedIndexes = Array.from(new Set([...pattern, ...group.teams.map((_, index) => index)])).filter((index) => index < group.teams.length);

		group.teams = orderedIndexes.map((index) => group.teams[index]);
		group.teams.forEach((team, index) => {
			team.standing.rank = index + 1;
		});

		return group;
	});
}

function buildDevSeedWinnerSelections({ groups = state.groups, thirdPlaceRanking = state.thirdPlaceRanking, selectedThirdTeamIds = state.selectedThirdTeamIds } = {}) {
	const winnerSelections = {};
	const knockoutTemplate = state.worldCup?.playoffBoard?.knockoutTemplate || [];

	for (const templateMatch of knockoutTemplate) {
		const { projectedMatches } = getProjectedPlayoffData({
			groups,
			thirdPlaceRanking,
			selectedThirdTeamIds,
			winnerSelections,
			syncWinnerSelections: false,
			syncRenderedMatches: false,
		});
		const projectedMatch = projectedMatches.find((match) => match.match === templateMatch.match);
		const winnerTeamId = getDevSeedWinnerTeamId(projectedMatch);

		if (winnerTeamId) {
			winnerSelections[String(templateMatch.match)] = winnerTeamId;
		}
	}

	return winnerSelections;
}

function getDevSeedWinnerTeamId(match) {
	if (!match) {
		return "";
	}

	const homeTeamId = getTeamIdKey(match.home?.team?.id);
	const awayTeamId = getTeamIdKey(match.away?.team?.id);

	if (!homeTeamId && !awayTeamId) {
		return "";
	}

	if (!homeTeamId) {
		return awayTeamId;
	}

	if (!awayTeamId) {
		return homeTeamId;
	}

	return Number(match.match) % 3 === 0 ? awayTeamId : homeTeamId;
}

function buildDevLiveFixtures({ groups, projectedMatches }) {
	const teamLookup = new Map(groups.flatMap((group) => group.teams.map((team) => [getTeamIdKey(team.id), team])));
	const groupFixtures = (state.worldCup?.fixtures || []).filter((fixture) => isGroupStageStage(fixture.stage)).map((fixture) => createDevGroupFixture(fixture, teamLookup));
	const knockoutFixtures = projectedMatches.filter((match) => match.home?.team?.id != null && match.away?.team?.id != null).map((match) => createDevKnockoutFixture(match));

	return [...groupFixtures, ...knockoutFixtures].sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime());
}

function createDevGroupFixture(fixture, teamLookup) {
	const homeTeam = teamLookup.get(getTeamIdKey(fixture.teams?.home?.id)) || fixture.teams.home;
	const awayTeam = teamLookup.get(getTeamIdKey(fixture.teams?.away?.id)) || fixture.teams.away;
	const score = getDevFixtureScore(homeTeam?.standing?.rank, awayTeam?.standing?.rank, fixture.id);

	return createCompletedFixture({
		fixture,
		homeTeam,
		awayTeam,
		score,
	});
}

function createDevKnockoutFixture(match) {
	const winnerTeamId = match.selectedWinnerTeamId || getDevSeedWinnerTeamId(match);
	const homeTeam = match.home?.team;
	const awayTeam = match.away?.team;
	const homeWins = winnerTeamId && getTeamIdKey(homeTeam?.id) === winnerTeamId;
	const score = homeWins ? { home: 2, away: 1 } : { home: 1, away: 2 };

	return createCompletedFixture({
		fixture: {
			id: `dev-knockout-${match.match}`,
			date: match.date,
			timestamp: null,
			timezone: "Asia/Jerusalem",
			referee: null,
			stage: match.stage,
			round: match.stage,
			groupLetter: null,
			venue: {
				id: null,
				name: match.venue || "TBD",
				city: null,
				country: null,
				capacity: null,
				image: null,
			},
		},
		homeTeam,
		awayTeam,
		score,
	});
}

function createCompletedFixture({ fixture, homeTeam, awayTeam, score }) {
	const homeGoals = Number(score?.home ?? 0);
	const awayGoals = Number(score?.away ?? 0);
	const homeWon = homeGoals > awayGoals;
	const awayWon = awayGoals > homeGoals;

	return {
		...fixture,
		status: {
			long: "Match Finished",
			short: "FT",
			elapsed: 90,
		},
		venue: {
			id: fixture.venue?.id ?? null,
			name: fixture.venue?.name || "TBD",
			city: fixture.venue?.city ?? null,
			country: fixture.venue?.country ?? null,
			capacity: fixture.venue?.capacity ?? null,
			image: fixture.venue?.image ?? null,
		},
		teams: {
			home: {
				...homeTeam,
				winner: homeWon ? true : awayWon ? false : null,
			},
			away: {
				...awayTeam,
				winner: awayWon ? true : homeWon ? false : null,
			},
		},
		goals: {
			home: homeGoals,
			away: awayGoals,
		},
		score: {
			halftime: { home: null, away: null },
			fulltime: { home: homeGoals, away: awayGoals },
			extratime: { home: null, away: null },
			penalty: { home: null, away: null },
		},
	};
}

function getDevFixtureScore(homeRank, awayRank, seed) {
	const leftRank = Number.isFinite(Number(homeRank)) ? Number(homeRank) : 4;
	const rightRank = Number.isFinite(Number(awayRank)) ? Number(awayRank) : 4;

	if (leftRank === rightRank) {
		return { home: 1, away: 1 };
	}

	if (Math.abs(leftRank - rightRank) === 1 && Number(seed) % 5 === 0) {
		return { home: 1, away: 1 };
	}

	const homeIsStronger = leftRank < rightRank;

	return homeIsStronger ? (Number(seed) % 2 === 0 ? { home: 2, away: 0 } : { home: 3, away: 1 }) : Number(seed) % 2 === 0 ? { home: 0, away: 2 } : { home: 1, away: 3 };
}

function getCurrentQualifiers({ groups = state.groups, thirdPlaceRanking = state.thirdPlaceRanking, selectedThirdTeamIds = state.selectedThirdTeamIds } = {}) {
	return {
		winners: groups.map((group) => group.teams[0]).filter(Boolean),
		runnersUp: groups.map((group) => group.teams[1]).filter(Boolean),
		bestThird: getSelectedBestThirdTeams(selectedThirdTeamIds, thirdPlaceRanking),
	};
}

function getSelectedBestThirdTeams(selectedThirdTeamIds = state.selectedThirdTeamIds, thirdPlaceRanking = state.thirdPlaceRanking) {
	const teamMap = new Map(thirdPlaceRanking.map((team) => [getTeamIdKey(team.id), team]));

	return selectedThirdTeamIds.map((teamId) => teamMap.get(getTeamIdKey(teamId))).filter(Boolean);
}

function getSelectedThirdTeamRank(teamId, selectedThirdTeamIds = state.selectedThirdTeamIds) {
	const selectedIndex = selectedThirdTeamIds.indexOf(getTeamIdKey(teamId));
	return selectedIndex >= 0 ? selectedIndex + 1 : 0;
}

function chooseThirdPlaceSelections(preferredIds, thirdPlaceRanking = state.thirdPlaceRanking) {
	const availableTeams = thirdPlaceRanking;
	const availableIds = new Set(availableTeams.map((team) => getTeamIdKey(team.id)));

	return Array.from(new Set((preferredIds || []).map(getTeamIdKey).filter((teamId) => availableIds.has(teamId)))).slice(0, 8);
}

function toggleHomeTeamSelection(teamId) {
	if (!canAccessRankings() || isSubmissionPending()) {
		return;
	}

	const teamKey = getTeamIdKey(teamId);

	if (!teamKey) {
		return;
	}

	state.homeTeamId = state.homeTeamId === teamKey ? "" : teamKey;
	invalidateSubmittedPicks();
	render();
	scheduleAutoSave();
}

function toggleThirdPlaceSelection(teamId) {
	if (!canAccessRankings() || isSubmissionPending()) {
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

	invalidateSubmittedPicks();
	render();
	scheduleAutoSave();
}

function toggleBracketWinnerSelection(matchId, teamId) {
	if (!canAccessRankings() || isSubmissionPending()) {
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

	invalidateSubmittedPicks();
	render();
	scheduleAutoSave();
}

function clearBracketSourceSelection(sourceMatchId) {
	if (!canAccessRankings() || isSubmissionPending()) {
		return;
	}

	const matchKey = String(sourceMatchId || "").trim();

	if (!matchKey || !state.bracketWinnerSelections[matchKey]) {
		return;
	}

	const nextSelections = { ...state.bracketWinnerSelections };
	delete nextSelections[matchKey];
	state.bracketWinnerSelections = nextSelections;
	invalidateSubmittedPicks();
	render();
	scheduleAutoSave();
}

function updateBracketScorePrediction(matchId, side, nextValue, input = null) {
	if (!canAccessRankings() || isSubmissionPending()) {
		return;
	}

	const matchKey = String(matchId || "").trim();
	const sideKey = side === "away" ? "away" : side === "home" ? "home" : "";

	if (!matchKey || !sideKey) {
		return;
	}

	const normalizedValue = normalizeBracketScoreInput(nextValue);

	if (input && input.value !== normalizedValue) {
		input.value = normalizedValue;
	}

	const currentEntry = state.bracketScorePredictions[matchKey] || {};
	const nextEntry = {
		home: normalizeBracketScoreStoredValue(currentEntry.home),
		away: normalizeBracketScoreStoredValue(currentEntry.away),
		[sideKey]: normalizedValue,
	};
	const nextPredictions = { ...state.bracketScorePredictions };

	if (!nextEntry.home && !nextEntry.away) {
		delete nextPredictions[matchKey];
	} else {
		nextPredictions[matchKey] = nextEntry;
	}

	if (JSON.stringify(nextPredictions) === JSON.stringify(state.bracketScorePredictions)) {
		return;
	}

	state.bracketScorePredictions = nextPredictions;
	invalidateSubmittedPicks();
	scheduleOverallScoreRefresh();
	scheduleAutoSave();
}

function normalizeBracketScoreInput(value) {
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

function normalizeBracketScoreStoredValue(value) {
	return normalizeBracketScoreInput(value);
}

function getBracketScorePredictionEntry(matchId) {
	return state.bracketScorePredictions[String(matchId || "").trim()] || null;
}

function getBracketScorePredictionValue(matchId, side) {
	const entry = getBracketScorePredictionEntry(matchId);
	return normalizeBracketScoreStoredValue(side === "away" ? entry?.away : entry?.home);
}

function getStoredBracketScoreValue(matchId, side) {
	const value = getBracketScorePredictionValue(matchId, side);
	return value === "" ? null : Number(value);
}

function getProjectedPlayoffData({ groups = state.groups, thirdPlaceRanking = state.thirdPlaceRanking, selectedThirdTeamIds = state.selectedThirdTeamIds, winnerSelections = state.bracketWinnerSelections, liveFixtureMap = null, syncWinnerSelections = true, syncRenderedMatches = false } = {}) {
	if (!state.worldCup?.playoffBoard?.knockoutTemplate) {
		if (syncRenderedMatches) {
			state.playoffMatches = [];
		}

		return { projectedMatches: [] };
	}

	const qualifiers = getCurrentQualifiers({ groups, thirdPlaceRanking, selectedThirdTeamIds });
	const knockoutTemplate = state.worldCup.playoffBoard.knockoutTemplate;
	const thirdPlaceAssignments = buildThirdPlaceAssignments(knockoutTemplate, qualifiers.bestThird);
	const projectedMatchMap = new Map();
	const projectedMatches = knockoutTemplate.map((match) => {
		const projectedMatch = projectMatch(match, {
			groups,
			bestThird: qualifiers.bestThird,
			thirdPlaceAssignments,
			projectedMatchMap,
			winnerSelections,
			liveFixture: liveFixtureMap?.get(match.match) || null,
		});
		const selectedWinner = getSelectedWinnerSide(projectedMatch, winnerSelections);
		projectedMatch.selectedWinnerTeamId = selectedWinner?.team ? getTeamIdKey(selectedWinner.team.id) : "";
		projectedMatchMap.set(projectedMatch.match, projectedMatch);
		return projectedMatch;
	});
	const cleanedSelections = Object.fromEntries(projectedMatches.flatMap((match) => (match.selectedWinnerTeamId ? [[String(match.match), match.selectedWinnerTeamId]] : [])));

	if (syncWinnerSelections && !areWinnerSelectionsEqual(state.bracketWinnerSelections, cleanedSelections)) {
		state.bracketWinnerSelections = cleanedSelections;
	}

	if (syncRenderedMatches) {
		state.playoffMatches = projectedMatches;
	}

	return {
		qualifiers,
		projectedMatches,
		thirdPlaceAssignments,
	};
}

function getDisplayedPlayoffData(options = {}) {
	return isShowingLiveResults() ? getLivePlayoffData(options) : getProjectedPlayoffData(options);
}

function getLivePlayoffData(options = {}) {
	if (!hasLiveTournamentStarted()) {
		return getProjectedPlayoffData({
			...options,
			groups: [],
			thirdPlaceRanking: [],
			selectedThirdTeamIds: [],
			winnerSelections: {},
			syncWinnerSelections: false,
		});
	}

	const knockoutTemplate = getLiveWorldCup()?.playoffBoard?.knockoutTemplate || state.worldCup?.playoffBoard?.knockoutTemplate || [];
	const liveFixtureMap = buildLiveKnockoutFixtureMap(knockoutTemplate, getLiveFixtures());
	const liveWinnerSelections = buildLiveWinnerSelections(liveFixtureMap);

	return getProjectedPlayoffData({
		...options,
		groups: getLiveGroups(),
		thirdPlaceRanking: getLiveThirdPlaceRanking(),
		selectedThirdTeamIds: getLiveSelectedThirdTeamIds(),
		winnerSelections: liveWinnerSelections,
		liveFixtureMap,
		syncWinnerSelections: false,
	});
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
	const projectedMatch = {
		...match,
		home: resolveProjectedSide(match.homeSource, projectionContext, createThirdPlaceSlotKey(match.match, "home")),
		away: resolveProjectedSide(match.awaySource, projectionContext, createThirdPlaceSlotKey(match.match, "away")),
	};

	return projectionContext.liveFixture ? applyLiveFixtureToProjectedMatch(projectedMatch, projectionContext.liveFixture) : projectedMatch;
}

function resolveProjectedSide(source, projectionContext, thirdPlaceSlotKey = "") {
	const { groups = [], bestThird, thirdPlaceAssignments = new Map(), projectedMatchMap = new Map(), winnerSelections = {} } = projectionContext;

	if (source.type === "groupPlacement") {
		const group = groups.find((entry) => entry.letter === source.group);
		const team = group?.teams?.[source.placement - 1] || null;

		return {
			type: "team",
			label: team ? `${team.groupLetter}${source.placement} • ${getTeamCode(team)}` : formatGroupPlacementLabel(source.group, source.placement),
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

function applyLiveFixtureToProjectedMatch(projectedMatch, fixture) {
	return {
		...projectedMatch,
		id: fixture.id ?? projectedMatch.id,
		date: fixture.date || projectedMatch.date,
		timestamp: fixture.timestamp ?? projectedMatch.timestamp ?? null,
		venue: fixture.venue?.name || projectedMatch.venue,
		status: fixture.status || projectedMatch.status || null,
		goals: fixture.goals || projectedMatch.goals || null,
		score: fixture.score || projectedMatch.score || null,
		home: createLiveFixtureSide(fixture.teams?.home, projectedMatch.home),
		away: createLiveFixtureSide(fixture.teams?.away, projectedMatch.away),
	};
}

function createLiveFixtureSide(team, fallbackSide) {
	if (!team?.id) {
		return fallbackSide;
	}

	const teamKey = getTeamIdKey(team.id);
	const fallbackGroupSlot = fallbackSide?.type === "team" && fallbackSide.team && getTeamIdKey(fallbackSide.team.id) === teamKey ? fallbackSide.groupSlot || fallbackSide.team.groupLetter || "" : team.groupLetter || "";

	return {
		type: "team",
		label: fallbackGroupSlot ? `${fallbackGroupSlot} • ${getTeamCode(team)}` : getTeamCode(team),
		groupSlot: fallbackGroupSlot,
		team,
	};
}

function buildLiveKnockoutFixtureMap(knockoutTemplate, fixtures) {
	const templateStages = new Set(knockoutTemplate.map((match) => match.stage));
	const liveKnockoutFixtures = fixtures.filter((fixture) => templateStages.has(fixture.stage));
	const fixtureMap = new Map();

	for (const stage of templateStages) {
		const stageTemplates = knockoutTemplate.filter((match) => match.stage === stage).sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime() || left.match - right.match);
		const remainingFixtures = liveKnockoutFixtures.filter((fixture) => fixture.stage === stage).sort((left, right) => getFixtureDate(left).getTime() - getFixtureDate(right).getTime() || String(left.venue?.name || "").localeCompare(String(right.venue?.name || "")));

		for (const templateMatch of stageTemplates) {
			if (!remainingFixtures.length) {
				break;
			}

			const templateDateKey = getCalendarDateKey(getFixtureDate(templateMatch));
			const sameDayCandidates = remainingFixtures.map((fixture, index) => ({ fixture, index })).filter(({ fixture }) => getCalendarDateKey(getFixtureDate(fixture)) === templateDateKey);
			const exactVenueCandidate = sameDayCandidates.find(({ fixture }) => normalizeVenueMatchValue(fixture.venue?.name) === normalizeVenueMatchValue(templateMatch.venue));
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
			.filter(([, teamId]) => teamId),
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

function getResolvedFixtureScore(fixture, side) {
	for (const value of [fixture?.score?.penalty?.[side], fixture?.score?.extratime?.[side], fixture?.score?.fulltime?.[side], fixture?.goals?.[side]]) {
		if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
			return Number(value);
		}
	}

	return Number.NaN;
}

function isCompletedFixtureStatus(status) {
	return ["FT", "AET", "PEN", "AWD", "WO"].includes(String(status || "").toUpperCase());
}

function normalizeVenueMatchValue(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
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
		label: source.type === "matchLoser" ? t("matchLoser", { match: source.match }) : t("matchWinner", { match: source.match }),
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

function renderBracketHalf(side, rounds, mode, liveWinnerTeamIdsByMatch = new Map()) {
	return `
    <section class="bracket-half bracket-half-${escapeHtml(side)}">
      ${rounds.map((round) => renderBracketRound(round, mode, liveWinnerTeamIdsByMatch)).join("")}
    </section>
  `;
}

function renderBracketRound(round, mode, liveWinnerTeamIdsByMatch = new Map()) {
	return `
    <div class="bracket-round-column ${escapeHtml(round.className)}">
      <div class="bracket-stage-head">
        <h3>${escapeHtml(translateStageLabel(round.stage))}</h3>
      </div>
      <div class="bracket-stage-matches">
        ${round.matches.map((match) => renderBracketMatch(match, mode, "", liveWinnerTeamIdsByMatch)).join("")}
      </div>
    </div>
  `;
}

function renderBracketMatch(match, mode, extraClass = "", liveWinnerTeamIdsByMatch = new Map()) {
	return `
    <article class="bracket-match ${escapeHtml(extraClass)}" data-match-id="${match.match}">
      <div class="bracket-match-meta">
        <span class="bracket-match-date">${escapeHtml(formatDate(match.date))}</span>
      </div>
      <div class="bracket-sides">
        ${renderBracketSide(match, match.home, match.homeSource, mode, liveWinnerTeamIdsByMatch)}
        ${renderBracketSide(match, match.away, match.awaySource, mode, liveWinnerTeamIdsByMatch)}
      </div>
    </article>
  `;
}

function renderBracketSide(match, side, source, mode, liveWinnerTeamIdsByMatch = new Map()) {
	const sideKey = side === match.home ? "home" : "away";

	if (side.type === "team" && side.team) {
		const teamId = getTeamIdKey(side.team.id);
		const isSelected = match.selectedWinnerTeamId === teamId;
		const matchesLiveWinner = mode === VIEW_MODES.MY && isSelected && liveWinnerTeamIdsByMatch.get(String(match.match)) === teamId;
		const canClear = canClearBracketSide(match, source);
		const isInteractive = mode === VIEW_MODES.MY;
		const goals = mode === VIEW_MODES.LIVE ? getBracketSideGoals(match, sideKey) : null;
		const pickClasses = ["bracket-side"];

		if (isInteractive) {
			pickClasses.push("bracket-side-pick");
		}

		if (isSelected) {
			pickClasses.push("is-selected");
		}

		if (!isInteractive && isSelected) {
			pickClasses.push("is-live-winner");
		}

		if (matchesLiveWinner) {
			pickClasses.push("matches-live");
		}

		if (isInteractive && canClear) {
			pickClasses.push("has-clear");
		}

		if (!isInteractive) {
			return `
      <div class="bracket-side-shell" data-bracket-side="${escapeHtml(sideKey)}">
        <div class="${pickClasses.join(" ")}">
          ${renderBracketTeamRow(side.team, side.groupSlot, { goals, showGroupSlot: false })}
        </div>
      </div>
    `;
		}

		return `
      <div class="bracket-side-shell" data-bracket-side="${escapeHtml(sideKey)}">
        <div
          class="${pickClasses.join(" ")}"
          role="button"
          tabindex="0"
          data-pick-winner="true"
          data-match="${match.match}"
          data-team-id="${escapeHtml(teamId)}"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="${escapeHtml(getTeamDisplayName(side.team))}"
        >
          ${renderBracketTeamRow(side.team, side.groupSlot, {
											goalInput: {
												matchId: match.match,
												side: sideKey,
												value: getBracketScorePredictionValue(match.match, sideKey),
												teamName: getTeamDisplayName(side.team),
												stage: match.stage,
											},
										})}
        </div>
        ${
									canClear
										? `
          <button
            class="bracket-side-clear"
            type="button"
            data-clear-bracket-source="true"
            data-source-match="${escapeHtml(String(source.match))}"
            aria-label="Remove ${escapeHtml(getTeamDisplayName(side.team))} from this bracket slot"
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
      <div class="bracket-side-shell" data-bracket-side="${escapeHtml(sideKey)}">
        <div class="bracket-side">
          <div class="bracket-placeholder-row">${escapeHtml(side.label)}</div>
        </div>
      </div>
    `;
	}

	return `
    <div class="bracket-side-shell" data-bracket-side="${escapeHtml(sideKey)}">
      <div class="bracket-side">
        <div class="bracket-placeholder-row">
          <strong>${escapeHtml(side.label)}</strong>
        </div>
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

function getBracketSideGoals(match, sideKey) {
	const goals = getResolvedFixtureScore(match, sideKey);
	return Number.isFinite(goals) ? goals : null;
}

function renderBracketTeamRow(team, groupSlot, { goals = null, goalInput = null, showGroupSlot = true } = {}) {
	const metaContent = goalInput ? renderBracketGoalInput(goalInput) : showGroupSlot ? `<span class="bracket-team-group">${escapeHtml(groupSlot || team?.groupLetter || t("tbd"))}</span>` : "";

	return `
    <div class="bracket-team-row">
      <span class="bracket-team-flag-cell">
        ${renderTeamLogo(team)}
      </span>
      <strong>${renderTeamCode(team, "team-code bracket-team-code")}</strong>
      ${metaContent}
      ${goals === null ? "" : `<span class="bracket-team-goals">${escapeHtml(String(goals))}</span>`}
    </div>
  `;
}

function renderBracketGoalInput({ matchId, side, value, teamName, stage }) {
	return `
      <input
        class="bracket-team-score-input"
        type="number"
        inputmode="numeric"
        min="0"
        step="1"
        value="${escapeHtml(value)}"
        data-bracket-goals-input="true"
        data-match="${escapeHtml(String(matchId))}"
        data-side="${escapeHtml(side)}"
        aria-label="${escapeHtml(teamName)}"
      />
    `;
}

function renderThirdPlaceSelectionCard(team, { mode = state.viewMode, selectedTeamIds = state.selectedThirdTeamIds } = {}) {
	const isSelected = selectedTeamIds.includes(getTeamIdKey(team.id));
	const selectedRank = getSelectedThirdTeamRank(team.id, selectedTeamIds);
	const points = team.standing?.points != null ? String(team.standing.points) : "-";
	const goalDifference = team.standing?.goalDifference != null ? formatSignedValue(team.standing.goalDifference) : "-";
	const cardClasses = ["third-choice-card"];
	const isInteractive = mode === VIEW_MODES.MY;

	if (isSelected) {
		cardClasses.push("is-selected");
	}

	if (!isInteractive) {
		cardClasses.push("third-choice-card-static");

		return `
    <article class="${cardClasses.join(" ")}">
      <div class="third-choice-head">
        <div class="team-name">
          ${renderTeamLogo(team)}
          ${renderTeamCode(team)}
        </div>
        ${renderThirdChoiceGroupLabel(team.groupLetter, selectedRank)}
      </div>
      <p class="third-choice-name">${escapeHtml(team.name)}</p>
      <div class="third-choice-stats">
        <span>${escapeHtml(points)} ${escapeHtml(t("pointsShort"))}</span>
        <span>${escapeHtml(goalDifference)} ${escapeHtml(t("goalDiffShort"))}</span>
      </div>
    </article>
  `;
	}

	return `
    <button
      class="${cardClasses.join(" ")}"
      type="button"
      data-select-third="true"
      data-team-id="${escapeHtml(String(team.id))}"
      aria-pressed="${isSelected ? "true" : "false"}"
    >
      <div class="third-choice-head">
        <div class="team-name">
          ${renderTeamLogo(team)}
          ${renderTeamCode(team)}
        </div>
        ${renderThirdChoiceGroupLabel(team.groupLetter, selectedRank)}
      </div>
      <p class="third-choice-name">${escapeHtml(team.name)}</p>
      <div class="third-choice-stats">
        <span>${escapeHtml(points)} ${escapeHtml(t("pointsShort"))}</span>
        <span>${escapeHtml(goalDifference)} ${escapeHtml(t("goalDiffShort"))}</span>
      </div>
    </button>
  `;
}

function renderThirdChoiceGroupLabel(groupLetter, selectedRank) {
	if (selectedRank) {
		return `
      <span class="third-choice-group">
        <span class="third-choice-rank">#${escapeHtml(String(selectedRank))}</span>
        <span class="third-choice-group-separator" aria-hidden="true">•</span>
        <span>${escapeHtml(groupLetter)}</span>
      </span>
    `;
	}

	return `<span class="third-choice-group">${escapeHtml(groupLetter)}</span>`;
}

function renderGroupTableRow(team, index, groupLetter, { mode = state.viewMode, isLiveView = mode === VIEW_MODES.LIVE } = {}) {
	const canDrag = mode === VIEW_MODES.MY && canAccessRankings() && !isSubmissionPending();
	const rankLabel = getGroupRankLabel(team, index);
	const rowClasses = ["group-table-row"];
	const matchesLiveGroupPosition = mode === VIEW_MODES.MY && doesGroupPickMatchLive(team, index, groupLetter);
	const dragIndicator = canDrag ? `<span class="group-row-drag-indicator" data-group-drag-handle="true" aria-hidden="true">↕</span>` : "";

	if (canDrag) {
		rowClasses.push("is-draggable");
	}

	if (matchesLiveGroupPosition) {
		rowClasses.push("matches-live");
	}

	return `
    <tr
      class="${rowClasses.join(" ")}"
      data-group="${escapeHtml(groupLetter)}"
      data-index="${index}"
      data-team-id="${escapeHtml(String(team.id))}"
    >
      <td class="group-rank-cell">${escapeHtml(rankLabel)}</td>
      <td>
        <div class="team-cell">
          ${renderTeamLogo(team)}
          <div class="team-cell-copy">
            <strong>${renderTeamCode(team)}</strong>
          </div>
          ${dragIndicator}
        </div>
      </td>
      ${
							isLiveView
								? `
      <td class="group-stat-cell">${escapeHtml(getGroupStandingValue(team?.standing?.wins))}</td>
      <td class="group-stat-cell">${escapeHtml(getGroupStandingValue(team?.standing?.losses))}</td>
      <td class="group-stat-cell">${escapeHtml(getGroupStandingValue(team?.standing?.draws))}</td>
      <td class="group-stat-cell">${escapeHtml(getGroupStandingValue(team?.standing?.goalDifference, true))}</td>
      <td class="group-stat-cell">${escapeHtml(getGroupStandingValue(team?.standing?.points))}</td>
    `
								: ""
						}
    </tr>
  `;
}

function doesGroupPickMatchLive(team, index, groupLetter) {
	if (!hasLiveTournamentStarted()) {
		return false;
	}

	const liveGroup = getLiveGroups().find((entry) => entry.letter === groupLetter);
	const liveTeam = liveGroup?.teams?.[index];

	return Boolean(liveTeam?.id != null && getTeamIdKey(liveTeam.id) === getTeamIdKey(team?.id));
}

function getGroupRankLabel(team, index) {
	if (!isShowingLiveResults()) {
		return String(index + 1);
	}

	if (!hasLiveTournamentStarted()) {
		return "-";
	}

	const rank = team?.standing?.rank;
	return rank != null ? String(rank) : String(index + 1);
}

function getGroupStandingValue(value, signed = false) {
	if (value == null || value === "") {
		return "-";
	}

	if (signed) {
		return formatSignedValue(value);
	}

	return String(value);
}

function renderTeamLogo(team) {
	const tooltip = getTeamDisplayName(team);

	if (!team) {
		return renderTeamTooltip(`<span class="team-logo-fallback">${escapeHtml(t("tbd"))}</span>`, tooltip, "team-mark");
	}

	if (team.logo) {
		return renderTeamTooltip(`<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(tooltip)} logo" />`, tooltip, "team-mark");
	}

	return renderTeamTooltip(`<span class="team-logo-fallback">${escapeHtml((team.code || team.name).slice(0, 3))}</span>`, tooltip, "team-mark");
}

function getTeamCode(team) {
	if (!team) {
		return t("tbd");
	}

	const code = String(team.code || "")
		.trim()
		.toUpperCase();

	if (code) {
		return code;
	}

	return deriveFallbackCode(team.name || team.country || t("tbd"));
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
		return t("teamToBeDetermined");
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

function isShowingLiveResults() {
	return state.viewMode === VIEW_MODES.LIVE;
}

function getStoredPlayoffDragHintDismissed() {
	try {
		return window.localStorage?.getItem(PLAYOFF_DRAG_HINT_STORAGE_KEY) === "true";
	} catch (_error) {
		return false;
	}
}

function dismissPlayoffDragOverlay() {
	if (state.playoffDragHintDismissed || deviceSupportsTouchInput()) {
		return;
	}

	state.playoffDragHintDismissed = true;

	try {
		window.localStorage?.setItem(PLAYOFF_DRAG_HINT_STORAGE_KEY, "true");
	} catch (_error) {
		// Ignore storage failures.
	}

	getActivePlayoffBoardElement()?.querySelector(".playoff-bracket-scroll")?.classList.remove("shows-drag-overlay");
}

function setViewMode(nextMode) {
	if (!Object.values(VIEW_MODES).includes(nextMode) || state.viewMode === nextMode) {
		return;
	}

	if (nextMode === VIEW_MODES.MY && !canAccessRankings()) {
		state.viewMode = VIEW_MODES.LIVE;
		state.auth.status = t("authStartPredicting");
		hideFloatingTooltip();
		render();
		return;
	}

	state.viewMode = nextMode;
	hideFloatingTooltip();
	render();
}

function ensureEditableRankingsView() {
	if (!canAccessRankings()) {
		state.auth.status = t("authStartPredicting");
		renderAuthState();
		return false;
	}

	if (isSubmissionPending()) {
		return false;
	}

	if (isShowingLiveResults()) {
		state.viewMode = VIEW_MODES.MY;
		hideFloatingTooltip();
	}

	return true;
}

function getLiveGroups() {
	return getLiveWorldCup()?.groups || [];
}

function getLiveThirdPlaceRanking() {
	return getLiveWorldCup()?.thirdPlaceRanking || [];
}

function getLiveSelectedThirdTeamIds() {
	if (!hasLiveTournamentStarted()) {
		return [];
	}

	const liveAdvancers = getLiveWorldCup()?.playoffBoard?.advancingThirdPlaces || getLiveThirdPlaceRanking().slice(0, 8);
	return liveAdvancers.map((team) => getTeamIdKey(team.id)).filter(Boolean);
}

function shouldRenderEmptyLiveThirdPlaceCards() {
	return !hasLiveTournamentStarted();
}

function getLiveThirdPlacePlaceholderCount() {
	return Math.max(getLiveGroups().length || state.worldCup?.groups?.length || 0, 8);
}

function hasLiveTournamentStarted() {
	return getLiveFixtures().some((fixture) => isGroupStageStage(fixture.stage) && hasFixtureStarted(fixture));
}

function getLiveWorldCup() {
	return state.devLiveWorldCup || state.worldCup;
}

function getLiveFixtures() {
	return getLiveWorldCup()?.fixtures || [];
}

function hasFixtureStarted(fixture) {
	return !["NS", "TBD"].includes(String(fixture?.status?.short || "").toUpperCase());
}

function isGroupStageStage(stage) {
	return String(stage || "").toLowerCase() === "group stage";
}

function formatThirdEligibleLabel(candidates, groups) {
	return `${formatOrdinalPlacement(3)}, ${groups.length === 1 ? t("groupSingular") : t("groupPlural")} ${groups.join("/")}`;
}

function formatGroupPlacementLabel(group, placement) {
	return `${formatOrdinalPlacement(placement)}, ${t("groupSingular")} ${group}`;
}

function formatOrdinalPlacement(value) {
	const number = Number(value);

	if (APP_LOCALE === "he") {
		return `מקום ${number}`;
	}

	if (number === 1) {
		return "1st";
	}

	if (number === 2) {
		return "2nd";
	}

	if (number === 3) {
		return "3rd";
	}

	return `${number}th`;
}

function deriveFallbackCode(value) {
	const text = String(value || "")
		.normalize("NFKD")
		.replace(/[^\p{L}\s]/gu, " ")
		.trim();

	if (!text) {
		return t("tbd");
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

function formatGroupCardLabel(group) {
	return `${t("groupSingular")} ${group?.letter || ""}`.trim();
}

function translateStageLabel(stage) {
	const label = String(stage || "").toLowerCase();

	if (label.includes("group")) {
		return t("stageGroup");
	}

	if (label.includes("round of 32")) {
		return t("stageRound32");
	}

	if (label.includes("round of 16")) {
		return t("stageRound16");
	}

	if (label.includes("quarter")) {
		return t("stageQuarter");
	}

	if (label.includes("semi")) {
		return t("stageSemi");
	}

	if (label.includes("third")) {
		return t("stageThird");
	}

	if (label.includes("final")) {
		return t("stageFinal");
	}

	return stage || t("match");
}

function getPlayoffBoardElement(mode = state.viewMode) {
	return mode === VIEW_MODES.LIVE ? elements.playoffBoardLive : elements.playoffBoardMy;
}

function getActivePlayoffBoardElement() {
	return getPlayoffBoardElement(state.viewMode);
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
	const scroller = getActivePlayoffBoardElement()?.querySelector(".playoff-bracket-scroll");

	if (!scroller) {
		return;
	}

	const canPanHorizontally = scroller.scrollWidth > scroller.clientWidth + 1;
	const canPanVertically = scroller.scrollHeight > scroller.clientHeight + 1;
	const isDragScrollable = canPanHorizontally || canPanVertically;
	scroller.classList.toggle("is-drag-scrollable", isDragScrollable);
	scroller.classList.toggle("is-touch-pan-surface", deviceSupportsTouchInput());
	scroller.classList.toggle("shows-drag-overlay", shouldShowPlayoffDragOverlay(isDragScrollable));
}

function shouldShowPlayoffDragOverlay(isDragScrollable = true) {
	return Boolean(isDragScrollable && supportsFinePointerInput() && !state.playoffDragHintDismissed);
}

function layoutBracketMatches() {
	const shell = getActivePlayoffBoardElement()?.querySelector(".playoff-bracket-shell");

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

function getMatchById(matchId) {
	return state.playoffMatches.find((match) => String(match.match) === String(matchId)) || null;
}

function getBracketSideShell(matchElement, sideKey) {
	return matchElement?.querySelector(`.bracket-side-shell[data-bracket-side="${sideKey}"]`) || null;
}

function getBracketElementCenterY(shellRect, element) {
	const rect = element.getBoundingClientRect();
	return rect.top + rect.height / 2 - shellRect.top;
}

function getSelectedWinnerSideKey(match) {
	const selectedWinnerTeamId = String(match?.selectedWinnerTeamId || "");

	if (!selectedWinnerTeamId) {
		return null;
	}

	const homeTeamId = getTeamIdKey(match?.home?.team?.id);
	const awayTeamId = getTeamIdKey(match?.away?.team?.id);

	if (selectedWinnerTeamId === homeTeamId) {
		return "home";
	}

	if (selectedWinnerTeamId === awayTeamId) {
		return "away";
	}

	return null;
}

function getSourceAnchorSideKey(match, sourceType) {
	const winnerSideKey = getSelectedWinnerSideKey(match);

	if (!winnerSideKey) {
		return null;
	}

	if (sourceType === "matchWinner") {
		return winnerSideKey;
	}

	if (sourceType === "matchLoser") {
		return winnerSideKey === "home" ? "away" : "home";
	}

	return null;
}

function drawBracketLines() {
	const board = getActivePlayoffBoardElement();
	const shell = board?.querySelector(".playoff-bracket-shell");
	const svg = board?.querySelector(".bracket-lines");

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
		for (const [targetSideKey, source] of [
			["home", targetMatch.homeSource],
			["away", targetMatch.awaySource],
		]) {
			if (source?.type !== "matchWinner" && source?.type !== "matchLoser") {
				continue;
			}

			const sourceMatch = getMatchById(source.match);
			const fromElement = shell.querySelector(`[data-match-id="${source.match}"]`);
			const toElement = shell.querySelector(`[data-match-id="${targetMatch.match}"]`);

			if (!sourceMatch || !fromElement || !toElement) {
				continue;
			}

			const fallbackFromElement = fromElement.querySelector(".bracket-sides") || fromElement;
			const fallbackToElement = getBracketSideShell(toElement, targetSideKey) || toElement.querySelector(".bracket-sides") || toElement;
			const sourceAnchorSideKey = getSourceAnchorSideKey(sourceMatch, source.type);
			const sourceAnchorElement = sourceAnchorSideKey ? getBracketSideShell(fromElement, sourceAnchorSideKey) || fallbackFromElement : fallbackFromElement;
			const fromRect = sourceAnchorElement.getBoundingClientRect();
			const toRect = fallbackToElement.getBoundingClientRect();
			const sourceOnLeft = fromRect.left < toRect.left;
			const startX = (sourceOnLeft ? fromRect.right : fromRect.left) - shellRect.left;
			const endX = (sourceOnLeft ? toRect.left : toRect.right) - shellRect.left;
			const startY = getBracketElementCenterY(shellRect, sourceAnchorElement);
			const endY = getBracketElementCenterY(shellRect, fallbackToElement);
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
		homeTeam: serializeHomeTeam(getSelectedHomeTeam()),
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
		knockoutScorePredictions: projectedMatches
			.map((match) => {
				const prediction = getBracketScorePredictionEntry(match.match);

				if (!prediction) {
					return null;
				}

				return {
					match: match.match,
					stage: match.stage,
					homeGoals: getStoredBracketScoreValue(match.match, "home"),
					awayGoals: getStoredBracketScoreValue(match.match, "away"),
				};
			})
			.filter(Boolean),
		projectedRoundOf32,
	};
}

function serializeHomeTeam(team) {
	if (!team) {
		return null;
	}

	return {
		teamId: team.id,
		teamCode: getTeamCode(team),
		teamName: getTeamDisplayName(team),
		teamLogo: team.logo || null,
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
	state.homeTeamId = resolveSavedHomeTeamId(saved?.homeTeam);
	state.selectedThirdTeamIds = chooseThirdPlaceSelections(Array.isArray(saved.bestThirdAdvancers) ? saved.bestThirdAdvancers.map((entry) => entry.teamId) : []);
	state.bracketWinnerSelections = Object.fromEntries((Array.isArray(saved.knockoutWinners) ? saved.knockoutWinners : []).map((entry) => [String(entry.match || ""), getTeamIdKey(entry.teamId)]).filter(([matchId, teamId]) => matchId && teamId));
	state.bracketScorePredictions = Object.fromEntries(
		(Array.isArray(saved.knockoutScorePredictions) ? saved.knockoutScorePredictions : [])
			.map((entry) => {
				const matchKey = String(entry?.match || "").trim();

				if (!matchKey) {
					return null;
				}

				return [
					matchKey,
					{
						home: normalizeBracketScoreStoredValue(entry?.homeGoals),
						away: normalizeBracketScoreStoredValue(entry?.awayGoals),
					},
				];
			})
			.filter((entry) => entry && (entry[1].home || entry[1].away)),
	);
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

function getGroupRowDragData(row) {
	return {
		type: "group-row",
		groupLetter: row.dataset.group || "",
		teamId: row.dataset.teamId || "",
	};
}

function getGroupRowDropTargetData(row) {
	return {
		type: "group-row",
		groupLetter: row.dataset.group || "",
		teamId: row.dataset.teamId || "",
	};
}

function isGroupRowDragData(value) {
	return Boolean(value && typeof value === "object" && value.type === "group-row" && typeof value.groupLetter === "string" && typeof value.teamId === "string");
}

function isGroupRowDropTargetData(value) {
	return isGroupRowDragData(value);
}

function canDropOnGroupRow(sourceData, row) {
	return isGroupRowDragData(sourceData) && sourceData.groupLetter === (row.dataset.group || "") && sourceData.teamId !== (row.dataset.teamId || "");
}

function findGroupRowByTeamId(container, teamId) {
	return Array.from(container.querySelectorAll(".group-table-row[data-team-id]")).find((row) => row.dataset.teamId === teamId) ?? null;
}

function getGroupDomTeamIds(container) {
	return Array.from(container.querySelectorAll(".group-table-row[data-team-id]"))
		.map((row) => row.dataset.teamId || "")
		.filter(Boolean);
}

function moveGroupRowElement(sourceRow, targetRow, closestEdge) {
	if (sourceRow === targetRow) {
		return false;
	}

	const container = sourceRow.parentElement;

	if (!container || container !== targetRow.parentElement) {
		return false;
	}

	if (closestEdge === "top") {
		if (sourceRow.nextElementSibling === targetRow) {
			return false;
		}

		container.insertBefore(sourceRow, targetRow);
		return true;
	}

	if (targetRow.nextElementSibling === sourceRow) {
		return false;
	}

	container.insertBefore(sourceRow, targetRow.nextElementSibling);
	return true;
}

function captureRowRects(root, selector = ".group-table-row[data-team-id]") {
	const rects = new Map();

	(root || document).querySelectorAll(selector).forEach((element) => {
		rects.set(element.dataset.teamId, element.getBoundingClientRect());
	});

	return rects;
}

function animateMovedRows(previousRects, root, selector = ".group-table-row[data-team-id]") {
	if (!previousRects.size) {
		return;
	}

	requestAnimationFrame(() => {
		(root || document).querySelectorAll(selector).forEach((element) => {
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

function formatDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return t("tbd");
	}

	const includeYear = date.getFullYear() !== 2026;

	return new Intl.DateTimeFormat(APP_INTL_LOCALE, {
		month: "short",
		day: "numeric",
		...(includeYear ? { year: "numeric" } : {}),
	}).format(date);
}

function formatCalendarMonthLabel(year, month) {
	return new Intl.DateTimeFormat(APP_INTL_LOCALE, {
		month: "long",
		year: "numeric",
	}).format(new Date(year, month, 1));
}

function formatDateTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return t("tbd");
	}

	return new Intl.DateTimeFormat(APP_INTL_LOCALE, {
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
		return t("tbd");
	}

	return new Intl.DateTimeFormat(APP_INTL_LOCALE, {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatStageShortLabel(stage) {
	const label = String(stage || "").toLowerCase();

	if (label.includes("group")) {
		return t("stageGroupShort");
	}

	if (label.includes("round of 32")) {
		return t("stageRound32Short");
	}

	if (label.includes("round of 16")) {
		return t("stageRound16Short");
	}

	if (label.includes("quarter")) {
		return t("stageQuarterShort");
	}

	if (label.includes("semi")) {
		return t("stageSemiShort");
	}

	if (label.includes("third")) {
		return t("stageThirdShort");
	}

	if (label.includes("final")) {
		return t("stageFinalShort");
	}

	return stage || t("match");
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
