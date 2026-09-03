import { check, sleep } from 'k6';
import { randomIntBetween } from '../lib/random.js';
import { API_BASE_URL } from '../lib/config.js';
import { authenticateUser } from '../lib/auth.js';
import { apiDelete, apiGet, apiPatch, apiPost, parseData, todayIsoDate } from '../lib/http.js';
import { getSalesmanCredentials } from '../lib/users.js';
import {
  assertOrderMoney,
  assertShopPhoto,
  assertVarietyPrices,
} from '../lib/pricing.js';

let sessionReady = false;

function ensureSession() {
  if (sessionReady) return true;
  const creds = getSalesmanCredentials(__VU);
  const result = authenticateUser(creds, { role: 'salesman' });
  sessionReady = result.ok;
  return sessionReady;
}

function pickVariety(productsPayload) {
  const items = productsPayload?.items ?? [];
  for (const row of items) {
    if (Array.isArray(row.varieties) && row.varieties.length > 0) {
      return row.varieties[0];
    }

    const productId = row.product?.id;
    if (!productId) continue;

    const varietiesRes = apiGet(`${API_BASE_URL}/api/products/${productId}/varieties`, {
      role: 'salesman',
      name: 'product_varieties',
    });
    const varieties = parseData(varietiesRes);
    if (Array.isArray(varieties) && varieties.length > 0) {
      return varieties[0];
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

  // 404 = no gatepass allotted for today — a valid business state, not a failure
  const gatepassRes = apiGet(
    `${base}/api/gatepasses/me?businessDate=${date}`,
    {
      role: 'salesman',
      name: 'gatepass_me',
    },
    [200, 404],
  );
  const gatepassData = parseData(gatepassRes);

  apiGet(`${base}/api/gatepasses/me/history`, { role: 'salesman', name: 'gatepass_history' });

  const productsRes = apiGet(`${base}/api/products/?page=1&pageSize=20`, {
    role: 'salesman',
    name: 'products_list',
  });
  const productsPayload = parseData(productsRes);
  assertVarietyPrices(productsPayload);

  const customersListRes = apiGet(`${base}/api/customers/?page=1&pageSize=20`, {
    role: 'salesman',
    name: 'customers_list',
  });
  const existingCustomers = parseData(customersListRes)?.items ?? [];
  assertShopPhoto(existingCustomers[0]);

  const ordersRes = apiGet(`${base}/api/orders/?page=1&pageSize=20`, {
    role: 'salesman',
    name: 'orders_list',
  });
  const firstOrderRow = parseData(ordersRes)?.items?.[0];
  assertOrderMoney(firstOrderRow?.order);
  if (firstOrderRow) {
    check(firstOrderRow, {
      'order row has customerShopPhotoUrl key': (row) => 'customerShopPhotoUrl' in row,
    });
  }

  apiGet(`${base}/api/orders/due-preorders?businessDate=${date}`, {
    role: 'salesman',
    name: 'due_preorders',
  });

  const actionRoll = randomIntBetween(1, 100);
  let createdCustomerId = null;

  // 25% — register a new customer (unique phone per VU + iteration + timestamp)
  if (actionRoll <= 25) {
    const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
    const uploadRes = apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      {
        fileName: `shop-${unique}.jpg`,
        contentType: 'image/jpeg',
        contentLength: 1024,
      },
      { role: 'salesman', name: 'customer_shop_photo_upload_url' },
    );
    const shopPhotoKey = parseData(uploadRes)?.imageKey;
    if (shopPhotoKey) {
      const createRes = apiPost(
        `${base}/api/customers/`,
        {
          shopName: `Load Shop ${unique}`,
          contactName: `Salesman ${__VU}`,
          phone: `9${unique.padStart(9, '0').slice(-9)}`,
          address: `${unique} Test Street`,
          notes: 'k6 load test customer',
          shopPhotoKey,
        },
        { role: 'salesman', name: 'customer_create' },
      );
      createdCustomerId = parseData(createRes)?.id ?? null;
      assertShopPhoto(parseData(createRes), { required: true });
    }
  }

  // 26–28% — upload URL rejects an unsupported content type (expect 400)
  if (actionRoll > 25 && actionRoll <= 28) {
    apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      { fileName: 'shop.gif', contentType: 'image/gif', contentLength: 1024 },
      { role: 'salesman', name: 'customer_shop_photo_bad_type' },
      [400],
    );
  }

  // 29–31% — upload URL rejects an oversize file (> 5 MB, expect 400)
  if (actionRoll > 28 && actionRoll <= 31) {
    apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      { fileName: 'huge.jpg', contentType: 'image/jpeg', contentLength: 6 * 1024 * 1024 },
      { role: 'salesman', name: 'customer_shop_photo_too_large' },
      [400],
    );
  }

  // 32–34% — create without a shop photo is rejected (photo required, expect 400)
  if (actionRoll > 31 && actionRoll <= 34) {
    const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
    apiPost(
      `${base}/api/customers/`,
      {
        shopName: `No Photo Shop ${unique}`,
        contactName: `Salesman ${__VU}`,
        phone: `7${unique.padStart(9, '0').slice(-9)}`,
        address: `${unique} Test Street`,
        notes: 'k6 missing photo',
      },
      { role: 'salesman', name: 'customer_create_no_photo' },
      [400],
    );
  }

  // 35–37% — a shop photo key owned by someone else is rejected (expect 403)
  if (actionRoll > 34 && actionRoll <= 37) {
    const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
    apiPost(
      `${base}/api/customers/`,
      {
        shopName: `Forged Shop ${unique}`,
        contactName: `Salesman ${__VU}`,
        phone: `6${unique.padStart(9, '0').slice(-9)}`,
        address: `${unique} Test Street`,
        notes: 'k6 forged key',
        shopPhotoKey: `customers/00000000-0000-0000-0000-000000000000/forged-${unique}.jpg`,
      },
      { role: 'salesman', name: 'customer_create_forged_key' },
      [403],
    );
  }

  // 38–41% — salesmen cannot mutate photos (admin only, expect 403)
  if (actionRoll > 37 && actionRoll <= 41) {
    const targetId = createdCustomerId ?? existingCustomers[0]?.id ?? null;
    if (targetId) {
      apiPatch(
        `${base}/api/customers/${targetId}`,
        { shopPhotoKey: `customers/${__VU}/salesman-edit.jpg` },
        { role: 'salesman', name: 'customer_update_forbidden' },
        [403],
      );
      apiDelete(
        `${base}/api/customers/${targetId}/shop-photo`,
        { role: 'salesman', name: 'customer_delete_photo_forbidden' },
        [403],
      );
    }
  }

  // 10% — book-now when gatepass has stock
  if (actionRoll > 85) {
    const variety = pickVariety(productsPayload);
    const varietyId = variety?.id ?? null;
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
      const bookNowRes = apiPost(
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
      assertOrderMoney(parseData(bookNowRes)?.order);
    }
  }

  // 5% — fulfill latest open order
  if (actionRoll > 95) {
    const confirmedRes = apiGet(`${base}/api/orders/?page=1&pageSize=10&status=confirmed`, {
      role: 'salesman',
      name: 'orders_confirmed',
    });
    const ordersPayload = parseData(confirmedRes);
    const order = ordersPayload?.items?.[0]?.order;
    if (order?.id) {
      apiPatch(`${base}/api/orders/${order.id}/fulfill`, {}, {
        role: 'salesman',
        name: 'order_fulfill',
      });
    }
  }

  sleep(randomIntBetween(1, 4));
}
