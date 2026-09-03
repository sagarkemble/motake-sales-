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
} from '../lib/http.js';
import { getAdminCredentials } from '../lib/users.js';
import {
  assertDailySalesValue,
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
