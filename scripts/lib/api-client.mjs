/**
 * Shared HTTP client for Motake backend scripts.
 * All operational requests go through the API — no direct database access.
 */

export function getApiBaseUrl() {
  return (
    process.env.SEED_API_BASE_URL ||
    process.env.K6_API_BASE_URL ||
    "https://motake-back.lunarstudio.dev"
  ).replace(/\/$/, "");
}

function getSupabaseAuthConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/$/,
    "",
  );
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { supabaseUrl, anonKey };
}

async function loginViaSupabaseSession(email, password, apiBaseUrl) {
  const { supabaseUrl, anonKey } = getSupabaseAuthConfig();
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Backend /api/auth/login is unavailable and Supabase env is missing for session fallback",
    );
  }

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Supabase login failed for ${email} (${tokenRes.status}): ${body}`);
  }

  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) {
    throw new Error(`Supabase login returned no access_token for ${email}`);
  }

  const sessionRes = await fetch(`${apiBaseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ accessToken }),
  });

  const text = await sessionRes.text();
  if (!sessionRes.ok) {
    throw new Error(`Backend session failed for ${email} (${sessionRes.status}): ${text}`);
  }

  const cookie = extractAuthCookie(sessionRes);
  if (!cookie) {
    throw new Error(`No authentication-token cookie received for ${email}`);
  }

  return cookie;
}

export function extractAuthCookie(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  for (const header of setCookies) {
    const match = header.match(/authentication-token=([^;]+)/);
    if (match) return `authentication-token=${match[1]}`;
  }
  return null;
}

export async function loginWithBackend(email, password, apiBaseUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 404) {
    return loginViaSupabaseSession(email, password, apiBaseUrl);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Backend login failed for ${email} (${res.status}): ${text}`);
  }

  if (json?.success === false) {
    throw new Error(`Backend login failed for ${email}: ${JSON.stringify(json)}`);
  }

  const cookie = extractAuthCookie(res);
  if (!cookie) {
    throw new Error(`No authentication-token cookie received for ${email}`);
  }

  return cookie;
}

export async function apiRequest(cookie, method, path, body, apiBaseUrl = getApiBaseUrl()) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }

  if (json && json.success === false) {
    throw new Error(`${method} ${path} API error: ${JSON.stringify(json)}`);
  }

  return json?.data ?? json;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(fn, { retries = 5, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit = String(error.message).includes("429");
      if (!isRateLimit || attempt === retries) break;
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}
