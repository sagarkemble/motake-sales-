import { sleep } from 'k6';
import { randomIntBetween } from '../lib/random.js';
import { API_BASE_URL } from '../lib/config.js';
import { authenticateUser } from '../lib/auth.js';
import { apiGet, apiPatch, apiPost, parseData, isoDateTimeDaysAgo, todayIsoDate } from '../lib/http.js';
import { getAdminCredentials } from '../lib/users.js';

let sessionReady = false;

function ensureSession() {
  if (sessionReady) return true;
  const creds = getAdminCredentials(__VU);
  const result = authenticateUser(creds, { role: 'admin' });
  sessionReady = result.ok;
  return sessionReady;
}

/**
 * Realistic admin shift: dashboards → gatepass oversight → catalog/salesmen → light writes.
 */
export function adminFlow() {
  if (!ensureSession()) {
    sleep(1);
    return;
  }

  const businessDate = todayIsoDate();
  const placedFrom = isoDateTimeDaysAgo(7);
  const placedTo = new Date().toISOString();
  const base = API_BASE_URL;

  apiGet(`${base}/api/auth/me`, { role: 'admin', name: 'auth_me' });

  apiGet(
    `${base}/api/reports/daily?businessDate=${businessDate}&placedFrom=${encodeURIComponent(placedFrom)}&placedTo=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_daily' },
  );

  apiGet(
    `${base}/api/reports/monthly?from=${encodeURIComponent(placedFrom)}&to=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_monthly' },
  );

  apiGet(
    `${base}/api/reports/product-sales?from=${encodeURIComponent(placedFrom)}&to=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_product_sales' },
  );

  apiGet(`${base}/api/gatepasses/?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepasses_list',
  });

  apiGet(`${base}/api/gatepasses/allotment-matrix?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepass_matrix',
  });

  apiGet(`${base}/api/gatepasses/end-of-day-totals?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepass_eod',
  });

  apiGet(`${base}/api/salesmen/?page=1&pageSize=20`, { role: 'admin', name: 'salesmen_list' });

  apiGet(`${base}/api/products/?page=1&pageSize=20`, { role: 'admin', name: 'products_list' });

  apiGet(`${base}/api/orders/?page=1&pageSize=20`, { role: 'admin', name: 'orders_list' });

  const customersRes = apiGet(`${base}/api/customers/?page=1&pageSize=20`, {
    role: 'admin',
    name: 'customers_list',
  });
  const customersPayload = parseData(customersRes);

  const actionRoll = randomIntBetween(1, 100);

  // 5% — update an existing customer (admin cannot create; salesmen create via salesmanFlow)
  if (actionRoll <= 5) {
    const customer = customersPayload?.items?.[0];
    if (customer?.id) {
      apiPatch(
        `${base}/api/customers/${customer.id}`,
        { notes: `k6 admin touch ${Date.now()}` },
        { role: 'admin', name: 'customer_update' },
      );
    }
  }

  // 5% — allot gatepass to first salesman when varieties exist
  if (actionRoll > 95) {
    const salesmenRes = apiGet(`${base}/api/salesmen/?page=1&pageSize=5`, {
      role: 'admin',
      name: 'salesmen_pick',
    });
    const salesmenPayload = parseData(salesmenRes);
    const salesman = salesmenPayload?.items?.[0]?.salesman;

    const productsRes = apiGet(`${base}/api/products/?page=1&pageSize=5`, {
      role: 'admin',
      name: 'products_pick',
    });
    const productsPayload = parseData(productsRes);
    const productRow = productsPayload?.items?.[0];
    const varietyId =
      productRow?.varieties?.[0]?.id ??
      (productRow?.product?.id
        ? parseData(
            apiGet(`${base}/api/products/${productRow.product.id}/varieties`, {
              role: 'admin',
              name: 'varieties_pick',
            }),
          )?.[0]?.id
        : null);

    if (salesman?.id && varietyId) {
      apiPost(
        `${base}/api/gatepasses/allot`,
        {
          salesmanId: salesman.id,
          businessDate,
          items: [{ varietyId, issuedQty: 5 }],
        },
        { role: 'admin', name: 'gatepass_allot' },
      );
    }
  }

  sleep(randomIntBetween(1, 3));
}
