import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();

let serverSupabaseClient = null;

export function isSupabaseAuthConfigured() {
	return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY);
}

export function getSupabasePublicConfig() {
	return {
		enabled: isSupabaseAuthConfigured(),
		url: SUPABASE_URL || null,
		publishableKey: SUPABASE_PUBLISHABLE_KEY || null,
	};
}

export function getBearerToken(authorizationHeader) {
	const match = String(authorizationHeader || "").match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || "";
}

export async function verifySupabaseAccessToken(accessToken) {
	if (!isSupabaseAuthConfigured()) {
		throw new Error("Supabase Auth is not configured.");
	}

	if (!accessToken) {
		return null;
	}

	const { data, error } = await getServerSupabaseClient().auth.getUser(accessToken);

	if (error) {
		throw new Error(error.message);
	}

	return data.user || null;
}

function getServerSupabaseClient() {
	if (serverSupabaseClient) {
		return serverSupabaseClient;
	}

	serverSupabaseClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false,
		},
	});

	return serverSupabaseClient;
}
