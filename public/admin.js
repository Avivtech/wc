const state = {
	auth: {
		enabled: false,
		ready: false,
		pending: false,
		client: null,
		session: null,
		user: null,
	},
	users: [],
	loadingUsers: false,
	status: "Checking auth...",
};

const elements = {
	status: document.getElementById("admin-status"),
	loginForm: document.getElementById("admin-login-form"),
	emailInput: document.getElementById("admin-email-input"),
	passwordInput: document.getElementById("admin-password-input"),
	loginButton: document.getElementById("admin-login-button"),
	signOutButton: document.getElementById("admin-signout-button"),
	sessionPanel: document.getElementById("admin-session-panel"),
	sessionEmail: document.getElementById("admin-session-email"),
	content: document.getElementById("admin-content"),
	createForm: document.getElementById("admin-create-form"),
	createDisplayNameInput: document.getElementById("create-display-name-input"),
	createEmailInput: document.getElementById("create-email-input"),
	createPasswordInput: document.getElementById("create-password-input"),
	createAdminInput: document.getElementById("create-admin-input"),
	createUserButton: document.getElementById("create-user-button"),
	refreshUsersButton: document.getElementById("refresh-users-button"),
	usersList: document.getElementById("admin-users-list"),
};

void boot();

async function boot() {
	bindEvents();
	await initializeAuth();
	render();
}

function bindEvents() {
	elements.loginForm.addEventListener("submit", handleLoginSubmit);
	elements.signOutButton.addEventListener("click", handleSignOut);
	elements.createForm.addEventListener("submit", handleCreateUser);
	elements.refreshUsersButton.addEventListener("click", () => {
		void loadUsers();
	});
	elements.usersList.addEventListener("click", handleUsersListClick);
}

async function initializeAuth() {
	state.auth.ready = false;
	state.status = "Checking auth...";
	render();

	try {
		const response = await fetch("/api/auth/config");
		const config = await response.json().catch(() => ({}));

		if (!response.ok || !config.enabled) {
			throw new Error("Sign in is currently unavailable.");
		}

		if (!window.supabase?.createClient) {
			throw new Error("Sign in is currently unavailable.");
		}

		state.auth.enabled = true;
		state.auth.client = window.supabase.createClient(config.url, config.publishableKey);
		state.auth.client.auth.onAuthStateChange((_event, session) => {
			void syncAuthSession(session);
		});

		const { data, error } = await state.auth.client.auth.getSession();

		if (error) {
			throw error;
		}

		await syncAuthSession(data.session);
	} catch (error) {
		state.auth.enabled = false;
		state.auth.client = null;
		state.auth.session = null;
		state.auth.user = null;
		state.status = getErrorMessage(error, "Sign in is currently unavailable.");
	} finally {
		state.auth.ready = true;
		render();
	}
}

async function syncAuthSession(session) {
	state.auth.pending = false;
	state.auth.session = session || null;

	if (!session?.access_token || !state.auth.client) {
		state.auth.user = null;
		state.users = [];
		state.status = "Sign in with an admin account.";
		render();
		return;
	}

	const { data, error } = await state.auth.client.auth.getUser(session.access_token);

	if (error || !data.user?.email) {
		state.auth.session = null;
		state.auth.user = null;
		state.users = [];
		state.status = "Your session is invalid. Sign in again.";
		render();
		return;
	}

	state.auth.user = data.user;
	state.status = "Loading users...";
	render();
	await loadUsers();
}

async function handleLoginSubmit(event) {
	event.preventDefault();

	if (!state.auth.client || state.auth.pending) {
		return;
	}

	if (!elements.loginForm.reportValidity()) {
		return;
	}

	state.auth.pending = true;
	state.status = "Signing in...";
	render();

	try {
		const { error } = await state.auth.client.auth.signInWithPassword({
			email: elements.emailInput.value.trim().toLowerCase(),
			password: elements.passwordInput.value,
		});

		if (error) {
			throw error;
		}

		elements.passwordInput.value = "";
		state.status = "Signed in.";
	} catch (error) {
		state.status = getErrorMessage(error, "Could not sign in.");
	} finally {
		state.auth.pending = false;
		render();
	}
}

async function handleSignOut() {
	if (!state.auth.client || state.auth.pending) {
		return;
	}

	state.auth.pending = true;
	state.status = "Signing out...";
	render();

	try {
		const { error } = await state.auth.client.auth.signOut();

		if (error) {
			throw error;
		}

		state.auth.session = null;
		state.auth.user = null;
		state.users = [];
		state.status = "Sign in with an admin account.";
	} catch (error) {
		state.status = getErrorMessage(error, "Could not sign out.");
	} finally {
		state.auth.pending = false;
		render();
	}
}

async function loadUsers() {
	if (!state.auth.user || state.loadingUsers) {
		return;
	}

	state.loadingUsers = true;
	state.status = "Loading users...";
	render();

	try {
		const response = await fetchWithAuth("/api/admin/users");
		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(data?.error || "Could not load users.");
		}

		state.users = Array.isArray(data.users) ? data.users : [];
		state.status = data.updatedAt ? `Loaded ${state.users.length} users. Updated ${formatDateTime(data.updatedAt)}.` : `Loaded ${state.users.length} users.`;
	} catch (error) {
		state.users = [];
		state.status = getErrorMessage(error, "Could not load users.");
	} finally {
		state.loadingUsers = false;
		render();
	}
}

async function handleCreateUser(event) {
	event.preventDefault();

	if (!state.auth.user || !elements.createForm.reportValidity()) {
		return;
	}

	setFormDisabled(elements.createForm, true);
	state.status = "Creating user...";
	render();

	try {
		const response = await fetchWithAuth("/api/admin/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				displayName: elements.createDisplayNameInput.value,
				email: elements.createEmailInput.value,
				password: elements.createPasswordInput.value,
				isAdmin: elements.createAdminInput.checked,
			}),
		});
		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(data?.error || "Could not create user.");
		}

		elements.createForm.reset();
		state.status = "User created.";
		await loadUsers();
	} catch (error) {
		state.status = getErrorMessage(error, "Could not create user.");
		render();
	} finally {
		setFormDisabled(elements.createForm, false);
	}
}

function handleUsersListClick(event) {
	const actionButton = event.target.closest("[data-admin-action]");

	if (!actionButton) {
		return;
	}

	const row = actionButton.closest("[data-user-id]");
	const userId = row?.dataset.userId || "";

	if (!userId) {
		return;
	}

	const action = actionButton.dataset.adminAction;

	if (action === "save") {
		void updateUser(row, userId);
		return;
	}

	if (action === "delete") {
		void deleteUser(row, userId);
	}
}

async function updateUser(row, userId) {
	const displayNameInput = row.querySelector("[data-user-display-name]");
	const adminInput = row.querySelector("[data-user-admin]");

	setRowBusy(row, true);
	state.status = "Updating user...";
	renderStatusOnly();

	try {
		const response = await fetchWithAuth(`/api/admin/users/${encodeURIComponent(userId)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				displayName: displayNameInput?.value || "",
				isAdmin: Boolean(adminInput?.checked),
			}),
		});
		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(data?.error || "Could not update user.");
		}

		state.status = "User updated.";
		await loadUsers();
	} catch (error) {
		state.status = getErrorMessage(error, "Could not update user.");
		renderStatusOnly();
	} finally {
		setRowBusy(row, false);
	}
}

async function deleteUser(row, userId) {
	const email = row.dataset.userEmail || "this user";

	if (!window.confirm(`Delete ${email}? This also removes saved picks.`)) {
		return;
	}

	setRowBusy(row, true);
	state.status = "Deleting user...";
	renderStatusOnly();

	try {
		const response = await fetchWithAuth(`/api/admin/users/${encodeURIComponent(userId)}`, {
			method: "DELETE",
		});
		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			throw new Error(data?.error || "Could not delete user.");
		}

		state.status = "User deleted.";
		await loadUsers();
	} catch (error) {
		state.status = getErrorMessage(error, "Could not delete user.");
		renderStatusOnly();
	} finally {
		setRowBusy(row, false);
	}
}

async function fetchWithAuth(input, init = {}) {
	if (!state.auth.client || !state.auth.enabled) {
		throw new Error("Sign in is currently unavailable.");
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

function render() {
	const isSignedIn = Boolean(state.auth.user?.email);
	const canUseAuth = state.auth.ready && state.auth.enabled && state.auth.client;

	elements.status.textContent = state.status;
	elements.loginForm.classList.toggle("hidden", !canUseAuth || isSignedIn);
	elements.sessionPanel.classList.toggle("hidden", !isSignedIn);
	elements.content.classList.toggle("hidden", !isSignedIn);
	elements.signOutButton.classList.toggle("hidden", !isSignedIn);
	elements.sessionEmail.textContent = state.auth.user?.email || "Admin";
	elements.loginButton.disabled = state.auth.pending || !canUseAuth;
	elements.signOutButton.disabled = state.auth.pending;
	elements.refreshUsersButton.disabled = state.loadingUsers;
	elements.createUserButton.disabled = state.loadingUsers;
	renderUsers();
}

function renderStatusOnly() {
	elements.status.textContent = state.status;
}

function renderUsers() {
	if (!state.auth.user) {
		elements.usersList.innerHTML = "";
		return;
	}

	if (state.loadingUsers && !state.users.length) {
		elements.usersList.innerHTML = `<div class="empty-state">Loading users...</div>`;
		return;
	}

	if (!state.users.length) {
		elements.usersList.innerHTML = `<div class="empty-state">No users found.</div>`;
		return;
	}

	elements.usersList.innerHTML = state.users.map(renderUserRow).join("");
}

function renderUserRow(user) {
	const isCurrentUser = user.id === state.auth.user?.id;
	const adminLocked = Boolean(user.isAdminEmail);
	const deleteDisabled = isCurrentUser ? "disabled" : "";

	return `
		<article class="admin-user-row" data-user-id="${escapeHtml(user.id)}" data-user-email="${escapeHtml(user.email)}">
			<div class="admin-user-primary">
				<strong class="admin-user-email">${escapeHtml(user.email || "---")}</strong>
				<span class="admin-user-id">${escapeHtml(user.id || "")}</span>
			</div>
			<div class="admin-user-field">
				<label class="leaderboard-label" for="display-name-${escapeHtml(user.id)}">Display name</label>
				<input id="display-name-${escapeHtml(user.id)}" class="field-input" data-user-display-name type="text" maxlength="60" value="${escapeHtml(user.displayName || "")}" />
			</div>
			<label class="admin-check-field admin-user-admin-toggle">
				<input data-user-admin type="checkbox" ${user.isAdmin ? "checked" : ""} ${adminLocked ? "disabled" : ""} ${adminLocked ? "data-admin-locked" : ""} />
				<span>Admin${adminLocked ? " by email" : ""}</span>
			</label>
			<div class="admin-user-meta">
				<span>${escapeHtml(user.hasSavedPicks ? "Saved picks" : "No saved picks")}</span>
				<span>Created ${escapeHtml(formatDate(user.createdAt))}</span>
				<span>Last sign-in ${escapeHtml(formatDate(user.lastSignInAt))}</span>
				<span>Submitted ${escapeHtml(formatDate(user.submittedAt))}</span>
			</div>
			<div class="admin-user-actions">
				<button class="button primary small" type="button" data-admin-action="save">Save</button>
				<button class="button secondary small" type="button" data-admin-action="delete" ${deleteDisabled} ${isCurrentUser ? "data-delete-locked" : ""}>Delete</button>
			</div>
		</article>
	`;
}

function setFormDisabled(form, disabled) {
	Array.from(form.elements).forEach((element) => {
		element.disabled = disabled;
	});
}

function setRowBusy(row, isBusy) {
	Array.from(row.querySelectorAll("input, button")).forEach((element) => {
		element.disabled = isBusy || element.hasAttribute("data-admin-locked") || element.hasAttribute("data-delete-locked");
	});
}

function formatDate(value) {
	if (!value) {
		return "never";
	}

	const formatted = formatDateTime(value);
	return formatted || "unknown";
}

function formatDateTime(value) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function getErrorMessage(error, fallback) {
	const message = String(error?.message || "").trim();
	return message || fallback;
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
