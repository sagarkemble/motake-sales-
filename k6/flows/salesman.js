import { sleep } from 'k6';
import { randomIntBetween } from '../lib/random.js';
import { API_BASE_URL } from '../lib/config.js';
import { authenticateUser } from '../lib/auth.js';
import { apiGet, apiPatch, apiPost, parseData, todayIsoDate } from '../lib/http.js';
import { getSalesmanCredentials } from '../lib/users.js';

let sessionReady = false;

function ensureSession() {
  if (sessionReady) return true;
  const creds = getSalesmanCredentials(__VU);
  const result = authenticateUser(creds.email, creds.password, { role: 'salesman' });
  sessionReady = result.ok;
  return sessionReady;
}

function pickVariety(productsPayload) {
  const items = productsPayload?.items ?? [];
  for (const row of items) {
    if (Array.isArray(row.varieties) && row.varieties.length > 0) {
      return row.varieties[0].id;
    }

    const productId = row.product?.id;
    if (!productId) continue;

    const varietiesRes = apiGet(`${API_BASE_URL}/api/products/${productId}/varieties`, {
      role: 'salesman',
      name: 'product_varieties',
    });
    const varieties = parseData(varietiesRes);
    if (Array.isArray(varieties) && varieties.length > 0) {
      return varieties[0].id;
    }
  }
  return null;
}

/**
 * Realistic salesman day: check gatepass → browse catalog → customers → optional order flow.
 */
export function salesmanFlow() {
  if (!ensureSession()) {
    sleep(1);
    return;
  }

  const businessDate = todayIsoDate();
  const base = API_BASE_URL;

  apiGet(`${base}/api/auth/me`, { role: 'salesman', name: 'auth_me' });

  const canonicalRes = apiGet(`${base}/api/gatepasses/canonical-date`, {
    role: 'salesman',
    name: 'canonical_date',
  });
  const canonical = parseData(canonicalRes);
  const date = canonical?.businessDate || businessDate;

  const gatepassRes = apiGet(`${base}/api/gatepasses/me?businessDate=${date}`, {
    role: 'salesman',
    name: 'gatepass_me',
  });
  const gatepassData = parseData(gatepassRes);

  apiGet(`${base}/api/gatepasses/me/history`, { role: 'salesman', name: 'gatepass_history' });

  const productsRes = apiGet(`${base}/api/products/?page=1&pageSize=20`, {
    role: 'salesman',
    name: 'products_list',
  });
  const productsPayload = parseData(productsRes);

  apiGet(`${base}/api/customers/?page=1&pageSize=20`, { role: 'salesman', name: 'customers_list' });

  apiGet(`${base}/api/orders/?page=1&pageSize=20`, { role: 'salesman', name: 'orders_list' });

  apiGet(`${base}/api/orders/due-preorders?businessDate=${date}`, {
    role: 'salesman',
    name: 'due_preorders',
  });

  const actionRoll = randomIntBetween(1, 100);
  let createdCustomerId = null;

  // 25% — register a new customer (unique phone per VU + iteration + timestamp)
  if (actionRoll <= 25) {
    const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
    const createRes = apiPost(
      `${base}/api/customers/`,
      {
        shopName: `Load Shop ${unique}`,
        contactName: `Salesman ${__VU}`,
        phone: `9${unique.padStart(9, '0').slice(-9)}`,
        address: `${unique} Test Street`,
        notes: 'k6 load test customer',
      },
      { role: 'salesman', name: 'customer_create' },
    );
    createdCustomerId = parseData(createRes)?.id ?? null;
  }

  // 10% — book-now when gatepass has stock
  if (actionRoll > 85) {
    const varietyId = pickVariety(productsPayload);
    let customerId = createdCustomerId;

    if (!customerId) {
      const customersRes = apiGet(`${base}/api/customers/?page=1&pageSize=5`, {
        role: 'salesman',
        name: 'customers_pick',
      });
      const customersPayload = parseData(customersRes);
      customerId = customersPayload?.items?.[0]?.id ?? null;
    }

    const availableItem = gatepassData?.items?.find((item) => (item.availableQty ?? 0) > 0);

    if (varietyId && customerId && availableItem) {
      apiPost(
        `${base}/api/orders/book-now`,
        {
          customerId,
          businessDate: date,
          idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
          notes: 'k6 book-now',
          items: [{ varietyId, quantity: 1 }],
        },
        { role: 'salesman', name: 'order_book_now' },
      );
    }
  }

  // 5% — fulfill latest open order
  if (actionRoll > 95) {
    const ordersRes = apiGet(`${base}/api/orders/?page=1&pageSize=10&status=confirmed`, {
      role: 'salesman',
      name: 'orders_confirmed',
    });
    const ordersPayload = parseData(ordersRes);
    const order = ordersPayload?.items?.[0]?.order;
    if (order?.id) {
      apiPatch(`${base}/api/orders/${order.id}/fulfill`, {}, { role: 'salesman', name: 'order_fulfill' });
    }
  }

  sleep(randomIntBetween(1, 4));
}
