import { check } from 'k6';

export function assertVarietyPrices(productsPayload) {
  const items = productsPayload?.items ?? [];
  for (const row of items.slice(0, 5)) {
    for (const variety of row.varieties ?? []) {
      check(variety, {
        'variety has unitPrice number': (x) => typeof x.unitPrice === 'number' && x.unitPrice >= 0,
      });
    }
  }
}

export function assertOrderMoney(order) {
  if (!order) return;
  check(order, {
    'order.totalAmount is number': (o) => typeof o.totalAmount === 'number' && o.totalAmount >= 0,
  });
}

export function assertOrderDetailMoney(detail) {
  if (!detail?.order) return;
  assertOrderMoney(detail.order);
  for (const item of detail.items ?? []) {
    check(item, {
      'item.unitPrice number': (i) => typeof i.unitPrice === 'number' && i.unitPrice >= 0,
      'item has imageUrl key': (i) => 'imageUrl' in i,
    });
  }
}

export function assertLifetimeValue(stats) {
  if (!stats) return;
  check(stats, {
    'customer.lifetimeValue number': (s) => typeof s.lifetimeValue === 'number',
  });
}

export function assertDailySalesValue(daily) {
  if (!daily) return;
  check(daily, {
    'daily.salesValue number': (d) => typeof d.salesValue === 'number',
  });
}

/**
 * Validate a customer's shop photo fields.
 * @param {object} customer - customer record returned by the API
 * @param {{ required?: boolean }} [options] - when required, shopPhotoUrl must be a non-empty string
 */
export function assertShopPhoto(customer, options = {}) {
  if (!customer) return;
  const { required = false } = options;
  check(customer, {
    'customer has shopPhotoUrl key': (c) => 'shopPhotoUrl' in c,
    'customer has shopPhotoKey key': (c) => 'shopPhotoKey' in c,
  });
  if (required) {
    check(customer, {
      'customer.shopPhotoUrl non-empty string': (c) =>
        typeof c.shopPhotoUrl === 'string' && c.shopPhotoUrl.length > 0,
      'customer.shopPhotoKey non-empty string': (c) =>
        typeof c.shopPhotoKey === 'string' && c.shopPhotoKey.length > 0,
    });
  }
}

/**
 * Assert a customer's shop photo has been cleared (both key and url null).
 */
export function assertShopPhotoCleared(customer) {
  if (!customer) return;
  check(customer, {
    'customer.shopPhotoUrl cleared': (c) => c.shopPhotoUrl == null,
    'customer.shopPhotoKey cleared': (c) => c.shopPhotoKey == null,
  });
}
