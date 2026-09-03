import { sleep } from 'k6';
import { check } from 'k6';
import { randomIntBetween } from '../lib/random.js';
import { API_BASE_URL } from '../lib/config.js';
import { authenticateUser } from '../lib/auth.js';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  parseData,
  isoDateTimeDaysAgo,
  todayIsoDate,
  NIL_UUID,
} from '../lib/http.js';
import { getAdminCredentials } from '../lib/users.js';
import {
  assertDailySalesValue,
  assertDiscrepancyRow,
  assertGatepassApproved,
  assertGatepassFlagged,
  assertLifetimeValue,
  assertOrderDetailMoney,
  assertOrderMoney,
  assertShopPhoto,
  assertShopPhotoCleared,
  assertVarietyPrices,
} from '../lib/pricing.js';

let sessionReady = false;

function ensureSession() {
  if (sessionReady) return true;
  const creds = getAdminCredentials(__VU);
  const result = authenticateUser(creds, { role: 'admin' });
  sessionReady = result.ok;
  return sessionReady;
}

/**
 * Realistic admin shift: dashboards → gatepass oversight → catalog/salesmen → customer CRUD.
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

  const dailyRes = apiGet(
    `${base}/api/reports/daily?businessDate=${businessDate}&placedFrom=${encodeURIComponent(placedFrom)}&placedTo=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_daily' },
  );
  assertDailySalesValue(parseData(dailyRes));

  apiGet(
    `${base}/api/reports/monthly?from=${encodeURIComponent(placedFrom)}&to=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_monthly' },
  );

  apiGet(
    `${base}/api/reports/product-sales?from=${encodeURIComponent(placedFrom)}&to=${encodeURIComponent(placedTo)}`,
    { role: 'admin', name: 'reports_product_sales' },
  );

  const gatepassesRes = apiGet(`${base}/api/gatepasses/?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepasses_list',
  });
  const allGatepasses = parseData(gatepassesRes) ?? [];
  const pendingGatepass = allGatepasses.find((g) => g.status === 'pending_verification') ?? null;
  const nonPendingGatepass =
    allGatepasses.find((g) => g.status === 'active' || g.status === 'closed') ?? null;

  // Multiple gatepasses per salesman per day are allowed (one active at a time). Group today's
  // gatepasses by salesman so we can exercise re-allotment and the active-gatepass conflict.
  const gatepassesBySalesman = new Map();
  for (const g of allGatepasses) {
    const list = gatepassesBySalesman.get(g.salesmanId) ?? [];
    list.push(g);
    gatepassesBySalesman.set(g.salesmanId, list);
  }
  let salesmanWithActiveGatepass = null; // { id, list } — currently holds an active gatepass
  let salesmanWithoutActiveGatepass = null; // { id, list } — has ≥1 gatepass today, none active
  for (const [salesmanId, list] of gatepassesBySalesman) {
    const hasActive = list.some((g) => g.status === 'active');
    if (hasActive && !salesmanWithActiveGatepass) {
      salesmanWithActiveGatepass = { id: salesmanId, list };
    }
    if (!hasActive && !salesmanWithoutActiveGatepass) {
      salesmanWithoutActiveGatepass = { id: salesmanId, list };
    }
  }

  // Resolve any allottable varietyId (needed by the allot / re-allot branches below).
  function resolveAdminVarietyId() {
    const productsPickRes = apiGet(`${base}/api/products/?page=1&pageSize=5`, {
      role: 'admin',
      name: 'products_pick',
    });
    const productRow = parseData(productsPickRes)?.items?.[0];
    if (productRow?.varieties?.[0]?.id) return productRow.varieties[0].id;
    if (!productRow?.product?.id) return null;
    const varietiesRes = apiGet(`${base}/api/products/${productRow.product.id}/varieties`, {
      role: 'admin',
      name: 'varieties_pick',
    });
    return parseData(varietiesRes)?.[0]?.id ?? null;
  }

  apiGet(`${base}/api/gatepasses/allotment-matrix?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepass_matrix',
  });

  apiGet(`${base}/api/gatepasses/end-of-day-totals?businessDate=${businessDate}`, {
    role: 'admin',
    name: 'gatepass_eod',
  });

  // Discrepancy dashboard data: flagged gatepasses with salesman, reason, and qty totals.
  const discrepanciesRes = apiGet(
    `${base}/api/gatepasses/discrepancies?businessDate=${businessDate}`,
    { role: 'admin', name: 'gatepass_discrepancies' },
  );
  assertDiscrepancyRow(parseData(discrepanciesRes)?.[0]);

  apiGet(`${base}/api/salesmen/?page=1&pageSize=20`, { role: 'admin', name: 'salesmen_list' });

  const productsRes = apiGet(`${base}/api/products/?page=1&pageSize=20`, {
    role: 'admin',
    name: 'products_list',
  });
  assertVarietyPrices(parseData(productsRes));

  const ordersRes = apiGet(`${base}/api/orders/?page=1&pageSize=20`, {
    role: 'admin',
    name: 'orders_list',
  });
  const ordersPayload = parseData(ordersRes);
  const firstOrder = ordersPayload?.items?.[0]?.order;
  assertOrderMoney(firstOrder);
  if (firstOrder?.id) {
    const detailRes = apiGet(`${base}/api/orders/${firstOrder.id}/detail`, {
      role: 'admin',
      name: 'order_detail',
    });
    const detail = parseData(detailRes);
    assertOrderDetailMoney(detail);
    if (detail?.customer) {
      check(detail.customer, {
        'order detail customer has shopPhotoUrl key': (c) => 'shopPhotoUrl' in c,
      });
    }
  }

  const customersRes = apiGet(`${base}/api/customers/?page=1&pageSize=20`, {
    role: 'admin',
    name: 'customers_list',
  });
  const customersPayload = parseData(customersRes);
  assertShopPhoto(customersPayload?.items?.[0]);

  apiGet(`${base}/api/customers/?page=1&pageSize=20&includeInactive=true`, {
    role: 'admin',
    name: 'customers_list_inactive',
  });

  const firstCustomer = customersPayload?.items?.[0];
  if (firstCustomer?.id) {
    const statsRes = apiGet(`${base}/api/customers/${firstCustomer.id}/stats`, {
      role: 'admin',
      name: 'customer_stats',
    });
    assertLifetimeValue(parseData(statsRes));
  }

  const actionRoll = randomIntBetween(1, 100);
  let touchedCustomerId = null;

  // ≤8% — admin create customer
  if (actionRoll <= 8) {
    const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
    const uploadRes = apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      {
        fileName: `admin-shop-${unique}.jpg`,
        contentType: 'image/jpeg',
        contentLength: 1024,
      },
      { role: 'admin', name: 'customer_shop_photo_upload_url' },
    );
    const shopPhotoKey = parseData(uploadRes)?.imageKey;
    if (shopPhotoKey) {
      const createRes = apiPost(
        `${base}/api/customers/`,
        {
          shopName: `Admin Shop ${unique}`,
          contactName: `Admin ${__VU}`,
          phone: `8${unique.padStart(9, '0').slice(-9)}`,
          address: `${unique} Admin Street`,
          notes: 'k6 admin create',
          shopPhotoKey,
        },
        { role: 'admin', name: 'customer_admin_create' },
      );
      touchedCustomerId = parseData(createRes)?.id ?? null;
      assertShopPhoto(parseData(createRes), { required: true });
    }
  }

  // ≤16% — update customer, replacing the shop photo (admin only)
  if (actionRoll > 8 && actionRoll <= 16) {
    const customer = customersPayload?.items?.find((row) => row.notes?.includes('k6')) ??
      customersPayload?.items?.[0];
    if (customer?.id) {
      const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
      const uploadRes = apiPost(
        `${base}/api/customers/shop-photo-upload-url`,
        {
          fileName: `replace-${unique}.jpg`,
          contentType: 'image/jpeg',
          contentLength: 1024,
        },
        { role: 'admin', name: 'customer_shop_photo_replace_url' },
      );
      const newShopPhotoKey = parseData(uploadRes)?.imageKey;
      const updateRes = apiPatch(
        `${base}/api/customers/${customer.id}`,
        {
          notes: `k6 admin touch ${Date.now()}`,
          ...(newShopPhotoKey ? { shopPhotoKey: newShopPhotoKey } : {}),
        },
        { role: 'admin', name: 'customer_update' },
      );
      if (newShopPhotoKey) {
        assertShopPhoto(parseData(updateRes), { required: true });
      }
      touchedCustomerId = customer.id;
    }
  }

  // ≤20% — deactivate (resolve open orders first if needed)
  if (actionRoll > 16 && actionRoll <= 20) {
    const customer =
      customersPayload?.items?.find((row) => row.notes?.includes('k6') && row.status === 'active') ??
      null;
    if (customer?.id) {
      const openRes = apiGet(`${base}/api/customers/${customer.id}/open-orders`, {
        role: 'admin',
        name: 'customer_open_orders',
      });
      const openOrders = parseData(openRes) ?? [];
      for (const order of openOrders) {
        apiPatch(
          `${base}/api/orders/${order.id}/cancel`,
          {},
          { role: 'admin', name: 'order_admin_cancel' },
          [200, 409],
        );
      }
      const deactivateRes = apiDelete(
        `${base}/api/customers/${customer.id}`,
        { role: 'admin', name: 'customer_deactivate' },
        [200, 409],
      );
      if (deactivateRes.status === 200) {
        touchedCustomerId = customer.id;
        check(parseData(deactivateRes), {
          'customer deactivated inactive': (c) => c?.status === 'inactive',
        });
      }
    }
  }

  // ≤24% — reactivate
  if (actionRoll > 20 && actionRoll <= 24) {
    const inactiveRes = apiGet(`${base}/api/customers/?page=1&pageSize=20&includeInactive=true`, {
      role: 'admin',
      name: 'customers_pick_inactive',
    });
    const inactivePayload = parseData(inactiveRes);
    const inactiveCustomer =
      inactivePayload?.items?.find(
        (row) => row.status === 'inactive' && row.notes?.includes('k6'),
      ) ?? null;
    if (inactiveCustomer?.id) {
      const reactivateRes = apiPost(
        `${base}/api/customers/${inactiveCustomer.id}/reactivate`,
        {},
        { role: 'admin', name: 'customer_reactivate' },
        [200, 409],
      );
      if (reactivateRes.status === 200) {
        check(parseData(reactivateRes), {
          'customer reactivated active': (c) => c?.status === 'active' && c?.deletedAt == null,
        });
      }
    }
  }

  // 24–27% — upload URL rejects an unsupported content type (expect 400)
  if (actionRoll > 24 && actionRoll <= 27) {
    apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      { fileName: 'shop.gif', contentType: 'image/gif', contentLength: 1024 },
      { role: 'admin', name: 'customer_shop_photo_bad_type' },
      [400],
    );
  }

  // 27–30% — upload URL rejects an oversize file (> 5 MB, expect 400)
  if (actionRoll > 27 && actionRoll <= 30) {
    apiPost(
      `${base}/api/customers/shop-photo-upload-url`,
      { fileName: 'huge.jpg', contentType: 'image/jpeg', contentLength: 6 * 1024 * 1024 },
      { role: 'admin', name: 'customer_shop_photo_too_large' },
      [400],
    );
  }

  // 30–33% — remove a shop photo via the delete endpoint (admin only)
  if (actionRoll > 30 && actionRoll <= 33) {
    const customer =
      customersPayload?.items?.find(
        (row) => row.notes?.includes('k6') && row.status === 'active',
      ) ?? null;
    if (customer?.id) {
      const deleteRes = apiDelete(
        `${base}/api/customers/${customer.id}/shop-photo`,
        { role: 'admin', name: 'customer_delete_photo' },
      );
      assertShopPhotoCleared(parseData(deleteRes));
      touchedCustomerId = customer.id;
    }
  }

  // 33–36% — clear a shop photo via PATCH shopPhotoKey:null (nullable path)
  if (actionRoll > 33 && actionRoll <= 36) {
    const customer =
      customersPayload?.items?.find(
        (row) => row.notes?.includes('k6') && row.status === 'active',
      ) ?? null;
    if (customer?.id) {
      const clearRes = apiPatch(
        `${base}/api/customers/${customer.id}`,
        { shopPhotoKey: null },
        { role: 'admin', name: 'customer_clear_photo' },
      );
      assertShopPhotoCleared(parseData(clearRes));
      touchedCustomerId = customer.id;
    }
  }

  // 37–42% — approve a handover awaiting verification (→ closed, no discrepancy)
  if (actionRoll > 36 && actionRoll <= 42 && pendingGatepass?.id) {
    const verifyRes = apiPatch(
      `${base}/api/gatepasses/${pendingGatepass.id}/verify`,
      {},
      { role: 'admin', name: 'handover_approve' },
      [200, 409],
    );
    if (verifyRes.status === 200) {
      assertGatepassApproved(parseData(verifyRes));
    }
  }

  // 43–48% — flag a handover as a discrepancy with a reason (→ closed, discrepancy)
  if (actionRoll > 42 && actionRoll <= 48 && pendingGatepass?.id) {
    const flagRes = apiPatch(
      `${base}/api/gatepasses/${pendingGatepass.id}/flag`,
      { reason: 'k6 returned count does not match reported shortfall' },
      { role: 'admin', name: 'handover_flag' },
      [200, 409],
    );
    if (flagRes.status === 200) {
      assertGatepassFlagged(parseData(flagRes));
    }
  }

  // 49–52% — approving a gatepass that is not pending is rejected (409)
  if (actionRoll > 48 && actionRoll <= 52 && nonPendingGatepass?.id) {
    apiPatch(
      `${base}/api/gatepasses/${nonPendingGatepass.id}/verify`,
      {},
      { role: 'admin', name: 'handover_approve_not_pending' },
      [409],
    );
  }

  // 53–56% — flagging with an empty reason is rejected by validation (400)
  if (actionRoll > 52 && actionRoll <= 56) {
    const targetId = nonPendingGatepass?.id ?? pendingGatepass?.id ?? NIL_UUID;
    apiPatch(
      `${base}/api/gatepasses/${targetId}/flag`,
      { reason: '' },
      { role: 'admin', name: 'handover_flag_no_reason' },
      [400],
    );
  }

  // 57–60% — verifying an unknown gatepass is not found (404)
  if (actionRoll > 56 && actionRoll <= 60) {
    apiPatch(
      `${base}/api/gatepasses/${NIL_UUID}/verify`,
      {},
      { role: 'admin', name: 'handover_verify_not_found' },
      [404],
    );
  }

  // 61–64% — flagging an unknown gatepass is not found (404)
  if (actionRoll > 60 && actionRoll <= 64) {
    apiPatch(
      `${base}/api/gatepasses/${NIL_UUID}/flag`,
      { reason: 'k6 flag missing gatepass' },
      { role: 'admin', name: 'handover_flag_not_found' },
      [404],
    );
  }

  // 64–70% — re-allot a fresh gatepass to a salesman whose current one is no longer active
  // (already handed over / closed). This is the core "multiple gatepasses per day" happy path.
  if (actionRoll > 64 && actionRoll <= 70 && salesmanWithoutActiveGatepass) {
    const varietyId = resolveAdminVarietyId();
    if (varietyId) {
      const reallotRes = apiPost(
        `${base}/api/gatepasses/allot`,
        {
          salesmanId: salesmanWithoutActiveGatepass.id,
          businessDate,
          items: [{ varietyId, issuedQty: 3 }],
        },
        { role: 'admin', name: 'gatepass_reallot_after_handover' },
        // 200 = fresh gatepass; 409 = a concurrent VU re-allotted first (now active again).
        [200, 409],
      );
      if (reallotRes.status === 200) {
        const created = parseData(reallotRes)?.gatepass;
        const existingIds = new Set(salesmanWithoutActiveGatepass.list.map((g) => g.id));
        check(created, {
          're-allotted gatepass is active': (g) => g?.status === 'active',
          're-allotted gatepass is a new distinct record': (g) =>
            Boolean(g?.id) && !existingIds.has(g.id),
          're-allotted gatepass same salesman/date': (g) =>
            g?.salesmanId === salesmanWithoutActiveGatepass.id && g?.businessDate === businessDate,
        });
      }
    }
  }

  // 70–76% — allotting while the salesman already holds an ACTIVE gatepass is rejected: only one
  // active gatepass per salesman per day is permitted.
  if (actionRoll > 70 && actionRoll <= 76 && salesmanWithActiveGatepass) {
    const varietyId = resolveAdminVarietyId();
    if (varietyId) {
      apiPost(
        `${base}/api/gatepasses/allot`,
        {
          salesmanId: salesmanWithActiveGatepass.id,
          businessDate,
          items: [{ varietyId, issuedQty: 3 }],
        },
        { role: 'admin', name: 'gatepass_allot_active_conflict' },
        // 409 = active gatepass present (expected); 200 only if it was closed out concurrently.
        [409, 200],
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

    const productsPickRes = apiGet(`${base}/api/products/?page=1&pageSize=5`, {
      role: 'admin',
      name: 'products_pick',
    });
    const productsPayload = parseData(productsPickRes);
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
        [200, 409],
      );
    }
  }

  void touchedCustomerId;
  sleep(randomIntBetween(1, 3));
}
