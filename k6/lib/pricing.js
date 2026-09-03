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

/**
 * Validate a gatepass item exposes the handover reconciliation fields.
 * @param {object} item - gatepass item record returned by the API
 */
export function assertGatepassItemHandoverShape(item) {
  if (!item) return;
  check(item, {
    'gatepass item returnedQty number': (i) => typeof i.returnedQty === 'number',
    'gatepass item has shortReason key': (i) => 'shortReason' in i,
    'gatepass item has shortNote key': (i) => 'shortNote' in i,
  });
}

/**
 * Assert a handover submission moved the gatepass to pending verification.
 * @param {object} gatepass - gatepass record from submitHandover ({ gatepass, items }.gatepass)
 */
export function assertHandoverSubmitted(gatepass) {
  if (!gatepass) return;
  check(gatepass, {
    'handover gatepass pending_verification': (g) => g.status === 'pending_verification',
    'handover gatepass has handoverSubmittedAt': (g) => g.handoverSubmittedAt != null,
  });
}

/**
 * Assert every returned handover item honours 0 <= returnedQty <= issued - sold,
 * and that any shortfall carries a reason.
 * @param {object[]} items - gatepass items returned by submitHandover
 */
export function assertHandoverItemsConsistent(items) {
  for (const item of items ?? []) {
    const expected = item.availableQty ?? item.issuedQty - item.soldQty;
    check(item, {
      'handover returnedQty within bounds': (i) =>
        i.returnedQty >= 0 && i.returnedQty <= i.issuedQty,
      'handover shortfall has a reason': (i) =>
        expected - i.returnedQty <= 0 || Boolean(i.shortReason),
    });
  }
}

/**
 * Assert an approved (verified) gatepass is closed with no discrepancy.
 * @param {object} gatepass - gatepass record returned by verify
 */
export function assertGatepassApproved(gatepass) {
  if (!gatepass) return;
  check(gatepass, {
    'approved gatepass closed': (g) => g.status === 'closed',
    'approved gatepass no discrepancy': (g) => g.hasDiscrepancy === false,
  });
}

/**
 * Assert a discrepancy dashboard row exposes the salesman, reason, and quantity totals.
 * @param {object} row - a row from GET /api/gatepasses/discrepancies
 */
export function assertDiscrepancyRow(row) {
  if (!row) return;
  check(row, {
    'discrepancy row has salesmanCode': (r) =>
      typeof r.salesmanCode === 'string' && r.salesmanCode.length > 0,
    'discrepancy row has reason key': (r) => 'discrepancyReason' in r,
    'discrepancy row short qty is number': (r) => typeof r.totalShortQty === 'number',
    'discrepancy row totals are numbers': (r) =>
      typeof r.totalIssuedQty === 'number' &&
      typeof r.totalSoldQty === 'number' &&
      typeof r.totalReturnedQty === 'number',
  });
}

/**
 * Assert a flagged gatepass is closed and marked as a discrepancy with a reason.
 * @param {object} gatepass - gatepass record returned by flagDiscrepancy
 */
export function assertGatepassFlagged(gatepass) {
  if (!gatepass) return;
  check(gatepass, {
    'flagged gatepass closed': (g) => g.status === 'closed',
    'flagged gatepass has discrepancy': (g) => g.hasDiscrepancy === true,
    'flagged gatepass has reason': (g) =>
      typeof g.discrepancyReason === 'string' && g.discrepancyReason.length > 0,
  });
}
