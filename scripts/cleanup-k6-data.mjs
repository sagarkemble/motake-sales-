#!/usr/bin/env node
/**
 * Remove all K6 load-test data via the Motake backend API.
 *
 * The backend handles all database and Supabase Auth cleanup internally.
 * This script only authenticates as admin and calls POST /api/admin/k6-cleanup.
 *
 * Usage:
 *   dotenv -- node scripts/cleanup-k6-data.mjs              # dry-run (default)
 *   CLEANUP_CONFIRM=1 dotenv -- node scripts/cleanup-k6-data.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiRequest,
  getApiBaseUrl,
  loginWithBackend,
} from "./lib/api-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, "..", "k6", "data", "users.json");

const API_BASE_URL = getApiBaseUrl();
const ADMIN_EMAIL =
  process.env.CLEANUP_ADMIN_EMAIL ||
  process.env.SEED_ADMIN_EMAIL ||
  process.env.K6_ADMIN_EMAIL ||
  "load-admin-1@lunarstudio.dev";
const ADMIN_PASSWORD =
  process.env.CLEANUP_ADMIN_PASSWORD ||
  process.env.SEED_ADMIN_PASSWORD ||
  process.env.K6_ADMIN_PASSWORD ||
  process.env.SEED_USER_PASSWORD ||
  "Motake@Load2026";

const CONFIRMED = process.env.CLEANUP_CONFIRM === "1";

function loadEmailsFromUsersFile() {
  if (!existsSync(USERS_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(USERS_FILE, "utf8"));
    const emails = new Set();
    if (data.admin?.email) emails.add(data.admin.email);
    for (const admin of data.admins ?? []) {
      if (admin.email) emails.add(admin.email);
    }
    for (const salesman of data.salesmen ?? []) {
      if (salesman.email) emails.add(salesman.email);
    }
    return [...emails];
  } catch {
    return [];
  }
}

function printSummary(label, targets) {
  console.log(`\n${label}`);
  console.log(`  Profiles (load-test users):  ${targets.profiles.length}`);
  for (const profile of targets.profiles.slice(0, 5)) {
    console.log(`    - ${profile.email} (${profile.role})`);
  }
  if (targets.profiles.length > 5) {
    console.log(`    ... and ${targets.profiles.length - 5} more`);
  }

  console.log(`  Customers (k6-tagged):       ${targets.customers.length}`);
  console.log(`  Orders (k6-tagged):          ${targets.orders.length}`);
  console.log(`  Gatepasses (load salesmen):  ${targets.gatepasses.length}`);
  console.log(`  Audit logs (load actors):    ${targets.auditLogs.length}`);
  console.log(`  Supabase auth users:         ${targets.authUsers.length}`);
}

async function main() {
  const extraEmails = loadEmailsFromUsersFile();
  console.log(`API: ${API_BASE_URL}`);
  console.log(`Admin: ${ADMIN_EMAIL}`);

  const cookie = await loginWithBackend(ADMIN_EMAIL, ADMIN_PASSWORD, API_BASE_URL);
  const result = await apiRequest(
    cookie,
    "POST",
    "/api/admin/k6-cleanup",
    { dryRun: !CONFIRMED, extraEmails },
    API_BASE_URL,
  );

  printSummary(
    CONFIRMED ? "Deleting K6 load-test data..." : "Dry run — would delete:",
    result.targets,
  );

  const { profiles, customers, orders, gatepasses } = result.targets;
  if (
    profiles.length === 0 &&
    customers.length === 0 &&
    orders.length === 0 &&
    gatepasses.length === 0
  ) {
    console.log("\nNothing to clean up.");
    return;
  }

  if (!CONFIRMED) {
    console.log("\nNo changes made. Re-run with CLEANUP_CONFIRM=1 to delete.");
    return;
  }

  const counts = result.counts;
  console.log("\nDeleted:");
  console.log(`  order_items:    ${counts.orderItemsDeleted}`);
  console.log(`  orders:         ${counts.ordersDeleted}`);
  console.log(`  gatepass_items: ${counts.gatepassItemsDeleted}`);
  console.log(`  gatepasses:     ${counts.gatepassesDeleted}`);
  console.log(`  audit_logs:     ${counts.auditDeleted}`);
  console.log(`  customers:      ${counts.customersDeleted}`);
  console.log(`  profiles:       ${counts.profilesDeleted} (salesmen cascade)`);
  console.log(`  auth users:     ${counts.authDeleted}`);
  console.log("\nK6 cleanup complete.");
}

main().catch((error) => {
  console.error("\nCleanup failed:", error.message);
  process.exit(1);
});
