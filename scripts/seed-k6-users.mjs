#!/usr/bin/env node
/**
 * Bootstrap K6 load-test users:
 * 1. Create admin accounts in Supabase Auth (service role) + profiles via Supabase REST
 * 2. Create salesman accounts via POST /api/salesmen/ (admin backend API)
 * 3. Write k6/data/users.json
 *
 * Admin bootstrap uses Supabase directly (auth + profiles only).
 * All other operations go through the backend.
 *
 * Usage:
 *   SEED_API_BASE_URL=https://motake-back.lunarstudio.dev \
 *   dotenv -- node scripts/seed-k6-users.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getApiBaseUrl,
  loginWithBackend,
  sleep,
  withRetry,
} from "./lib/api-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, "..", "k6", "data", "users.json");

const API_BASE_URL = getApiBaseUrl();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ADMIN_COUNT = Number(process.env.SEED_ADMIN_COUNT || 3);
const SALESMAN_COUNT = Number(process.env.SEED_SALESMAN_COUNT || 100);
const PASSWORD = process.env.SEED_USER_PASSWORD || "Motake@Load2026";
const PROFILES_ONLY = process.env.SEED_PROFILES_ONLY === "1";

const ADMINS = Array.from({ length: ADMIN_COUNT }, (_, i) => {
  const n = i + 1;
  return {
    email: `load-admin-${n}@lunarstudio.dev`,
    password: PASSWORD,
    name: `Load Admin ${n}`,
  };
});

function padSalesman(n) {
  return String(n).padStart(3, "0");
}

function assertConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}

function supabaseAdminHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function getSupabaseUserIdByEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?${new URLSearchParams({ page: "1", per_page: "1000" })}`,
    { headers: supabaseAdminHeaders() },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase list users failed (${res.status}): ${body}`);
  }

  const body = await res.json();
  const user = (body.users ?? []).find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
  return user?.id ?? null;
}

async function ensureAdminProfile(admin, userId) {
  const authUserId = userId ?? (await getSupabaseUserIdByEmail(admin.email));
  if (!authUserId) {
    throw new Error(`Could not resolve Supabase user id for ${admin.email}`);
  }

  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUserId}&select=id&limit=1`,
    { headers: supabaseAdminHeaders() },
  );

  if (!checkRes.ok) {
    const body = await checkRes.text();
    throw new Error(`Supabase profile check failed for ${admin.email} (${checkRes.status}): ${body}`);
  }

  const existing = await checkRes.json();
  if (Array.isArray(existing) && existing.length > 0) {
    return { profileCreated: false, userId: authUserId };
  }

  const now = new Date().toISOString();

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      ...supabaseAdminHeaders(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: authUserId,
      role: "admin",
      email: admin.email,
      name: admin.name ?? null,
      status: "active",
      updated_at: now,
    }),
  });

  if (!insertRes.ok) {
    const body = await insertRes.text();
    throw new Error(`Supabase profile insert failed for ${admin.email} (${insertRes.status}): ${body}`);
  }

  return { profileCreated: true, userId: authUserId };
}

async function createSupabaseAdmin(admin) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: supabaseAdminHeaders(),
    body: JSON.stringify({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { name: admin.name },
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    return { created: true, id: body.id };
  }

  const alreadyExists =
    body.msg?.includes("already been registered") ||
    body.message?.includes("already been registered") ||
    body.error_code === "email_exists";

  if (alreadyExists) {
    const userId = await getSupabaseUserIdByEmail(admin.email);
    return { created: false, existed: true, id: userId };
  }

  throw new Error(`Supabase admin create failed for ${admin.email} (${res.status}): ${JSON.stringify(body)}`);
}

async function createSalesman(cookie, salesman, createdByAdmin) {
  const res = await fetch(`${API_BASE_URL}/api/salesmen/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      email: salesman.email,
      password: salesman.password,
      name: salesman.name,
      phone: salesman.phone,
      salesmanCode: salesman.salesmanCode,
    }),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.ok && json?.success !== false) {
    return { created: true, createdBy: createdByAdmin };
  }

  const message = JSON.stringify(json ?? text);
  const alreadyExists =
    message.toLowerCase().includes("already") ||
    message.toLowerCase().includes("duplicate") ||
    message.toLowerCase().includes("unique");

  if (alreadyExists) {
    return { created: false, existed: true, createdBy: createdByAdmin };
  }

  throw new Error(`Salesman create failed for ${salesman.email} (${res.status}): ${message}`);
}

async function main() {
  assertConfig();
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Creating ${ADMIN_COUNT} admins and ${SALESMAN_COUNT} salesmen...\n`);

  for (const admin of ADMINS) {
    const result = await createSupabaseAdmin(admin);
    const profileResult = await ensureAdminProfile(admin, result.id);
    const authLabel = result.created ? "Created" : "Exists";
    const profileLabel = profileResult.profileCreated ? "profile created" : "profile exists";
    console.log(`${authLabel} admin: ${admin.email} (${profileLabel})`);
  }

  const extraAdmins = [
    { email: "team@lunarstudio.dev", name: "Team Admin" },
    { email: "motake@lunarstudio.dev", name: "Motake Admin" },
  ];
  for (const admin of extraAdmins) {
    const userId = await getSupabaseUserIdByEmail(admin.email);
    if (!userId) continue;
    const profileResult = await ensureAdminProfile(admin, userId);
    if (profileResult.profileCreated) {
      console.log(`Backfilled profile: ${admin.email}`);
    }
  }

  if (PROFILES_ONLY) {
    console.log("\nSEED_PROFILES_ONLY=1 — skipping salesman bootstrap.");
    return;
  }

  const salesmen = Array.from({ length: SALESMAN_COUNT }, (_, i) => {
    const n = i + 1;
    const padded = padSalesman(n);
    return {
      email: `load-salesman-${padded}@lunarstudio.dev`,
      password: PASSWORD,
      name: `Load Salesman ${padded}`,
      phone: `910000${padded}`,
      salesmanCode: `LS${padded}`,
    };
  });

  const adminCookies = new Map();
  async function getAdminCookie(admin) {
    if (!adminCookies.has(admin.email)) {
      const cookie = await withRetry(() => loginWithBackend(admin.email, admin.password, API_BASE_URL));
      adminCookies.set(admin.email, cookie);
    }
    return adminCookies.get(admin.email);
  }

  const salesmenResults = [];

  for (let i = 0; i < salesmen.length; i++) {
    const salesman = salesmen[i];
    const admin = ADMINS[i % ADMINS.length];
    const cookie = await getAdminCookie(admin);
    const result = await withRetry(() => createSalesman(cookie, salesman, admin.email));
    salesmenResults.push({ ...salesman, createdBy: admin.email, ...result });

    if ((i + 1) % 10 === 0 || i === salesmen.length - 1) {
      console.log(`Salesmen progress: ${i + 1}/${SALESMAN_COUNT}`);
    }

    await sleep(250);
  }

  const usersPayload = {
    admin: { email: ADMINS[0].email, password: ADMINS[0].password },
    admins: ADMINS.map(({ email, password, name }) => ({ email, password, name })),
    salesmen: salesmenResults.map(({ email, password, name, salesmanCode, createdBy }) => ({
      email,
      password,
      name,
      salesmanCode,
      createdBy,
    })),
  };

  writeFileSync(USERS_FILE, `${JSON.stringify(usersPayload, null, 2)}\n`, "utf8");

  const createdAdmins = ADMINS.length;
  const createdSalesmen = salesmenResults.filter((s) => s.created).length;
  const existingSalesmen = salesmenResults.filter((s) => s.existed).length;

  console.log(`\nWrote ${USERS_FILE}`);
  console.log(`Admins: ${createdAdmins} (${ADMINS.map((a) => a.email).join(", ")})`);
  console.log(`Salesmen: ${createdSalesmen} created, ${existingSalesmen} already existed`);
  console.log(`Primary K6 admin: ${usersPayload.admin.email}`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message);
  process.exit(1);
});
