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
  if (!data.admin?.email || !data.admin?.password) {
    throw new Error('users.json must include admin.email and admin.password');
  }
  return [data.admin];
});

export const salesmenCredentials = new SharedArray('motake_salesmen', function () {
  const data = readUsersFile();
  if (!Array.isArray(data.salesmen) || data.salesmen.length === 0) {
    throw new Error('users.json must include a non-empty salesmen array');
  }
  return data.salesmen;
});

export function getAdminCredentials() {
  return adminCredentials[0];
}

export function getSalesmanCredentials(vuId) {
  const index = (vuId - 1) % salesmenCredentials.length;
  const user = salesmenCredentials[index];
  if (!user?.email || !user?.password) {
    throw new Error(`salesmen[${index}] must include email and password`);
  }
  return user;
}
