import { check, sleep } from 'k6';
import { randomIntBetween } from '../lib/random.js';
import { API_BASE_URL } from '../lib/config.js';
import { authenticateUser } from '../lib/auth.js';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  parseData,
  todayIsoDate,
  NIL_UUID,
} from '../lib/http.js';
import { getSalesmanCredentials } from '../lib/users.js';
import {
  assertGatepassItemHandoverShape,
  assertHandoverItemsConsistent,
  assertHandoverSubmitted,
  assertOrderMoney,
  assertShopPhoto,
  assertVarietyPrices,
} from '../lib/pricing.js';

/** Items eligible for return: those with stock still on the salesman. */
function returnableGatepassItems(gatepassItems) {
  return (gatepassItems ?? []).filter(
    (item) => (item.availableQty ?? item.issuedQty - item.soldQty) > 0,
  );
}

function remainingOf(item) {
  return item.availableQty ?? item.issuedQty - item.soldQty;
}

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
  const myGatepass = gatepassData?.gatepass ?? null;
  const isActiveGatepass = myGatepass?.status === 'active';
  assertGatepassItemHandoverShape(gatepassData?.items?.[0]);

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

  const gatepassId = myGatepass?.id ?? null;
  const returnable = returnableGatepassItems(gatepassData?.items);

  // 42–46% — happy path: hand over the full return, then it awaits approval
  if (actionRoll > 41 && actionRoll <= 46 && isActiveGatepass && gatepassId) {
    const items = returnable.map((item) => ({
      gatepassItemId: item.id,
      returnedQty: remainingOf(item),
    }));
    const handoverRes = apiPost(
      `${base}/api/gatepasses/${gatepassId}/handover`,
      { items },
      { role: 'salesman', name: 'handover_full' },
      [200, 409, 404],
    );
    if (handoverRes.status === 200) {
      const payload = parseData(handoverRes);
      assertHandoverSubmitted(payload?.gatepass);
      assertHandoverItemsConsistent(payload?.items);
    }
  }

  // 47–49% — happy path: partial return with a shortfall reason on one item
  if (actionRoll > 46 && actionRoll <= 49 && isActiveGatepass && gatepassId && returnable.length > 0) {
    const items = returnable.map((item, index) => {
      const remaining = remainingOf(item);
      if (index === 0 && remaining >= 1) {
        return {
          gatepassItemId: item.id,
          returnedQty: remaining - 1,
          shortReason: 'damaged',
          shortNote: 'k6 damaged in transit',
        };
      }
      return { gatepassItemId: item.id, returnedQty: remaining };
    });
    const handoverRes = apiPost(
      `${base}/api/gatepasses/${gatepassId}/handover`,
      { items },
      { role: 'salesman', name: 'handover_partial' },
      [200, 409, 404],
    );
    if (handoverRes.status === 200) {
      const payload = parseData(handoverRes);
      assertHandoverSubmitted(payload?.gatepass);
      assertHandoverItemsConsistent(payload?.items);
    }
  }

  // 50–52% — shortfall without a reason is rejected (400 when still active)
  if (actionRoll > 49 && actionRoll <= 52 && isActiveGatepass && gatepassId && returnable.length > 0) {
    const target = returnable[0];
    const remaining = remainingOf(target);
    if (remaining >= 1) {
      apiPost(
        `${base}/api/gatepasses/${gatepassId}/handover`,
        { items: [{ gatepassItemId: target.id, returnedQty: remaining - 1 }] },
        { role: 'salesman', name: 'handover_short_no_reason' },
        [400, 409, 404],
      );
    }
  }

  // 53–55% — returning more than is due back is rejected (400 when still active)
  if (actionRoll > 52 && actionRoll <= 55 && isActiveGatepass && gatepassId && returnable.length > 0) {
    const target = returnable[0];
    apiPost(
      `${base}/api/gatepasses/${gatepassId}/handover`,
      { items: [{ gatepassItemId: target.id, returnedQty: remainingOf(target) + 5 }] },
      { role: 'salesman', name: 'handover_over_return' },
      [400, 409, 404],
    );
  }

  // 56–58% — a gatepass item id from another gatepass is rejected (400 when still active)
  if (actionRoll > 55 && actionRoll <= 58 && isActiveGatepass && gatepassId) {
    apiPost(
      `${base}/api/gatepasses/${gatepassId}/handover`,
      { items: [{ gatepassItemId: NIL_UUID, returnedQty: 0 }] },
      { role: 'salesman', name: 'handover_foreign_item' },
      [400, 409, 404],
    );
  }

  // 59–61% — handover against an unknown gatepass is not found (404)
  if (actionRoll > 58 && actionRoll <= 61) {
    apiPost(
      `${base}/api/gatepasses/${NIL_UUID}/handover`,
      { items: [] },
      { role: 'salesman', name: 'handover_not_found' },
      [404],
    );
  }

  // 62–64% — a non-active gatepass cannot be handed over again. A salesman may hold several
  // gatepasses per day, but once one leaves `active` (handed over / closed) it is frozen — the
  // salesman must be re-allotted a fresh gatepass rather than resubmitting the old one.
  if (actionRoll > 61 && actionRoll <= 63 && myGatepass && !isActiveGatepass && gatepassId) {
    apiPost(
      `${base}/api/gatepasses/${gatepassId}/handover`,
      { items: [] },
      { role: 'salesman', name: 'handover_not_active_resubmit' },
      [409],
    );
  }

  // 64–66% — salesmen cannot approve or flag gatepasses (admin only)
  if (actionRoll > 63 && actionRoll <= 66) {
    apiPatch(
      `${base}/api/gatepasses/${gatepassId ?? NIL_UUID}/verify`,
      {},
      { role: 'salesman', name: 'handover_verify_forbidden' },
      [401, 403],
    );
    apiPatch(
      `${base}/api/gatepasses/${gatepassId ?? NIL_UUID}/flag`,
      { reason: 'k6 salesman flag attempt' },
      { role: 'salesman', name: 'handover_flag_forbidden' },
      [401, 403],
    );
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

    // Only an active gatepass can absorb a sale; once handed over it moves to pending/closed.
    // Accept 400/409 defensively in case a concurrent VU hands the gatepass over mid-iteration.
    if (varietyId && customerId && availableItem && isActiveGatepass) {
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
        [200, 400, 409],
      );
      if (bookNowRes.status === 200) {
        assertOrderMoney(parseData(bookNowRes)?.order);
      }
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
