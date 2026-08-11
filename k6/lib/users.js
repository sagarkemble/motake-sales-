import { SharedArray } from 'k6/data';

const usersFilePath = __ENV.K6_USERS_FILE || 'k6/data/users.json';

function readUsersFile() {
  try {
    return JSON.parse(open(usersFilePath));
  } catch {
    throw new Error(
      `Could not read ${usersFilePath}. Copy k6/data/users.example.json to k6/data/users.json and fill credentials.`,
    );
  }
}

export const adminCredentials = new SharedArray('motake_admin', function () {
  const data = readUsersFile();
  const admins = Array.isArray(data.admins) && data.admins.length > 0
    ? data.admins
    : data.admin
      ? [data.admin]
      : [];
  if (admins.length === 0 || !admins[0].email) {
    throw new Error('users.json must include admins (or admin) with email and password');
  }
  return admins;
});

export const salesmenCredentials = new SharedArray('motake_salesmen', function () {
  const data = readUsersFile();
  if (!Array.isArray(data.salesmen) || data.salesmen.length === 0) {
    throw new Error('users.json must include a non-empty salesmen array');
  }
  return data.salesmen;
});

export function getAdminCredentials(vuId = 1) {
  const index = (vuId - 1) % adminCredentials.length;
  return adminCredentials[index];
}

export function getSalesmanCredentials(vuId) {
  const index = (vuId - 1) % salesmenCredentials.length;
  const user = salesmenCredentials[index];
  if (!user?.email) {
    throw new Error(`salesmen[${index}] must include email`);
  }
  return user;
}
