# Motake — Admin Customer CRUD Wireframe + Technical Plan

Mobile-first. Matches live Admin chrome (Products / Salesmen patterns).
`[NEW]` = admin customer CRUD addition. Salesman checkout create stays.

**Related:** pricing already shipped (see `pricing-wireframe.md`). This plan also covers **k6** updates for pricing validation + admin customer CRUD.

---

## Current state (gap analysis)

| Capability | API today | Admin UI today | Notes |
|---|---|---|---|
| List / search | ✓ `customers.list` | ✓ `/admin/customers` | Active only (`deletedAt IS NULL`) |
| Detail + stats | ✓ `getById` / `getStats` | ✓ `/admin/customers/[id]` | Read-only; Lifetime value already shown |
| Create | ✓ but **salesman only** | ✗ | Admin cannot create via API |
| Update | ✓ `adminProcedure` | ✗ | Hook exists; no form |
| Deactivate | ✓ soft-delete | ✗ | Sets `deletedAt` + `status=inactive`; disappears from list |
| Reactivate | ✗ | ✗ | Products/salesmen have this; customers do not |
| Include inactive | ✗ | ✗ | Products have “Show deleted” |

**Decision (recommended):** Treat admin customers like **Products**: Create / Edit / Deactivate / Reactivate + optional “Show inactive”. Soft-delete remains the delete model (no hard delete). Order history for inactive customers stays visible when opened via deep link or include-inactive list.

---

## End-to-end user flow

```
 ADMIN CUSTOMERS                         SALESMAN (unchanged)
 ────────────────                        ────────────────────
 /admin/customers                        Checkout · Customer step
    |                                         |
    |  [+] Add customer [NEW]                 |  Select existing
    |  ⌕ Search                               |  OR inline create
    |  □ Show inactive [NEW]                  v
    v                                    Shared customers table
 List cards (shop · phone · status)           (same records)
    |
    +-- tap card --> /admin/customers/[id]
    |                     |
    |                     +-- Edit details [NEW]
    |                     +-- Deactivate / Reactivate [NEW]
    |                     |         |
    |                     |         v  (if open pre-orders)
    |                     |    Resolve open orders sheet [NEW]
    |                     |    per order: Close (fulfil) / Cancel
    |                     |         |
    |                     |         v
    |                     |    then deactivate customer
    |                     +-- Lifetime stats (incl. ₹)
    |                     +-- Order history
    |
    +-- [+] --> /admin/customers/new [NEW]
                      |
                      v
                 Customer form
                 Save --> detail or list
```

### Flow A — Create (admin)

1. Admin opens **Customers** tab.
2. Taps **+** → `/admin/customers/new`.
3. Fills: Shop name*, Contact name, Phone*, Address*, Notes.
4. Save → `POST /api/customers/` (admin allowed) → toast → navigate to detail.
5. Duplicate active phone → 409 conflict toast (same rule as salesman).

### Flow B — Read / search

1. List shows active customers (default).
2. Search by shop, contact, or phone (existing).
3. Optional **Show inactive** reveals soft-deleted / inactive rows.
4. Tap card → detail: contact block, KPIs, order history.

### Flow C — Update

1. On detail, tap **Edit** (or edit form inline like Products).
2. Change fields → `PATCH /api/customers/{id}`.
3. Phone uniqueness enforced among active rows.
4. Toast “Customer updated”; list + detail invalidate.

### Flow D — Deactivate (“delete”)

1. On detail, tap **Deactivate**.
2. Client (or server) loads **open orders** for this customer — statuses in `scheduled` | `due` | `confirmed` (pre-orders and any still-open book-now). Fulfilled / cancelled are ignored.
3. **No open orders** → simple confirm dialog (A5) → `DELETE /api/customers/{id}` → inactive.
4. **Has open orders** → **do not deactivate yet**. Show **Resolve open orders** sheet (A6):
   - List each open order (code, type, status, scheduled date, qty, ₹).
   - Per order, admin must choose:
     - **Close** → fulfil the order (mark delivered / closed).
     - **Cancel** → cancel the order (restore gatepass stock if book-now rules apply).
   - Optional bulk: **Close all** / **Cancel all**.
5. After every open order is either closed or cancelled, enable **Deactivate customer** (or auto-proceed with a final confirm).
6. `DELETE /api/customers/{id}` → `status=inactive`, `deletedAt=now`.
7. Customer drops from default list; salesmen cannot select for new orders.
8. History (including just-cancelled / fulfilled) remains on detail via include-inactive.

### Flow E — Reactivate

1. With **Show inactive**, open inactive customer.
2. Tap **Reactivate** → clear `deletedAt`, `status=active`.
3. Phone must not collide with another active customer (409 if conflict).
4. Customer returns to default list and checkout picker.

### Flow F — Salesman (no UX change)

- Checkout still creates customers when needed.
- After admin deactivate, inactive shops no longer appear in salesman search.

---

## A. UI wireframes (ASCII)

### A1. Customers list  `/admin/customers`  `[NEW]` controls

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
│         Customers           │
├─────────────────────────────┤
│  ⌕  Search shop / phone…  ⊕ │  ← ⊕ Add customer [NEW]
│  □ Show inactive customers  │  ← [NEW] (like products)
│  128 total                  │
│                             │
│  ┌───────────────────────┐  │
│  │ 🏪 Sharma Kirana      │  │
│  │ Ravi · 98765…  Active │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ 🏪 Patel Dairy        │  │
│  │ Meena · 98…  Inactive │  │  ← only if Show inactive
│  └───────────────────────┘  │
│                             │
│  Page 1 of 7   Prev  Next   │
├─────────────────────────────┤
│ Dash│Prod│Sales│Ord│Cust    │
└─────────────────────────────┘
```

### A2. New customer  `/admin/customers/new`  `[NEW]`

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
├─────────────────────────────┤
│ ← New customer              │
│                             │
│  Shop name *                │
│  ┌───────────────────────┐  │
│  │ Sharma Kirana         │  │
│  └───────────────────────┘  │
│  Contact name               │
│  ┌───────────────────────┐  │
│  │ Ravi Sharma           │  │
│  └───────────────────────┘  │
│  Phone *                    │
│  ┌───────────────────────┐  │
│  │ 9876543210            │  │
│  └───────────────────────┘  │
│  Address *                  │
│  ┌───────────────────────┐  │
│  │ 12 MG Road, Pune      │  │
│  └───────────────────────┘  │
│  Notes                      │
│  ┌───────────────────────┐  │
│  │ Prefers morning…      │  │
│  └───────────────────────┘  │
│                             │
│  [     Save customer     ]  │  ← primary brand CTA
└─────────────────────────────┘
```

### A3. Customer detail (CRUD chrome)  `/admin/customers/[id]`

```
┌─────────────────────────────┐
│ ← Sharma Kirana             │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Ravi Sharma    Active   │ │
│ │ 9876543210              │ │
│ │ 12 MG Road, Pune        │ │
│ │ Prefers morning delivery│ │
│ │                         │ │
│ │ [ Edit ] [ Deactivate ] │ │  ← [NEW]
│ └─────────────────────────┘ │
│                             │
│ Lifetime stats              │
│ ┌────────┐ ┌────────┐       │
│ │ Items  │ │ Orders │       │
│ │  186   │ │   42   │       │
│ └────────┘ └────────┘       │
│ ┌─────────────────────────┐ │
│ │ Lifetime value ₹34,820  │ │  (pricing already live)
│ └─────────────────────────┘ │
│ Last order  24 Aug 2026     │
│                             │
│ Order history               │
│ (existing OrderList cards)  │
└─────────────────────────────┘
```

Inactive detail variant:

```
│ │ …              Inactive │ │
│ │ [ Edit ] [ Reactivate ] │ │  ← [NEW]
```

### A4. Edit customer  (dialog **or** `/admin/customers/[id]/edit`)

**Recommended:** same full-page form as New, prefilled — mirrors Products edit density on mobile.

```
┌─────────────────────────────┐
│ ← Edit customer             │
│  (same fields as New)       │
│  [     Save changes      ]  │
└─────────────────────────────┘
```

### A5. Deactivate confirm (no open orders)

```
┌─────────────────────────────┐
│  Deactivate this customer?  │
│  They will leave the active │
│  list. Order history stays. │
│  Salesmen cannot select     │
│  them for new orders.       │
│                             │
│  [ Keep active ] [Deactivate]│
└─────────────────────────────┘
```

### A6. Resolve open orders before deactivate  `[NEW]`

Shown when deactivate is tapped and the customer has one or more open orders.
Deactivate stays **blocked** until every listed order is Closed or Cancelled.

```
┌─────────────────────────────┐
│  Cannot deactivate yet      │
│  3 open orders must be      │
│  closed or cancelled first. │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ PO-466A74DC    Due    │  │
│  │ Pre-order · 20 Aug    │  │
│  │ 3 qty · ₹0.00         │  │
│  │ [ Close ]  [ Cancel ] │  │  ← Close = fulfil
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ PO-A1B2C3D4 Scheduled │  │
│  │ Pre-order · 22 Aug    │  │
│  │ 2 qty · ₹112.00       │  │
│  │ [ Close ]  [ Cancel ] │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ BN-54324E47 Confirmed │  │
│  │ Book now · today      │  │
│  │ 4 qty · ₹0.00         │  │
│  │ [ Close ]  [ Cancel ] │  │
│  └───────────────────────┘  │
│                             │
│  [ Close all ] [Cancel all] │  ← optional bulk
│                             │
│  Progress  0 of 3 resolved  │
│  [ Keep active ]            │
│  [ Deactivate ]  (disabled) │  ← enables when 3/3 done
└─────────────────────────────┘
```

After each Close/Cancel succeeds, that row shows a check / “Resolved” and drops out of the open count. When progress is complete:

```
│  Progress  3 of 3 resolved  │
│  [ Keep active ] [Deactivate]│  ← Deactivate enabled
```

**Semantics**

| Action | Meaning | API (planned) |
|---|---|---|
| **Close** | Order is completed — mark **fulfilled** | Admin-capable fulfil |
| **Cancel** | Order will not be delivered — mark **cancelled** | Admin-capable cancel |
| **Keep active** | Abort deactivate; leave customer + remaining open orders as-is | — |

---

## B. Technical implementation

### B1. API / tRPC (`packages/trpc/server/routes/customers/`)

| Change | Detail |
|---|---|
| **Create auth** | Change `create` from `salesmanProcedure` → `protectedProcedure` (admin + salesman). `createdBy = ctx.user.id` still works for admin profiles. |
| **List filter** | Extend `listCustomersInputSchema` with `includeInactive?: boolean` (default `false`). |
| **Reactivate** | New `reactivate: adminProcedure` → `POST/PATCH …/{id}/reactivate`, output `customerSchema`. |
| **Update** | Already admin-only; optionally allow clearing `contactName` / `notes` with empty string → null (confirm). |
| **Deactivate** | Keep `DELETE` as soft-delete, but **block** with a structured error if the customer still has open orders (unless a dedicated “deactivate after resolve” path already cleared them). Prefer: UI resolves orders first; server still enforces the guard. |
| **Open orders for deactivate** | **New** query or reuse list: `customers.getOpenOrders` / `orders.list` filtered by `customerId` + open statuses. Used by Resolve sheet (A6). |
| **Admin fulfil / cancel** | Today `orders.fulfill` and `orders.cancel` are **salesmanProcedure** (cancel only by placing salesman). For A6, add **admin** access (or `adminProcedure` variants) so admin can Close/Cancel any open order on that customer without being the placer. |

**Open-order definition (for deactivate gate)**

- Status ∈ `{ scheduled, due, confirmed }`
- Typically pre-orders (`scheduled` / `due`) plus any unfulfilled book-now (`confirmed`)
- Exclude `fulfilled` and `cancelled`

**Deactivate guard (server)**

```
IF count(open orders for customer) > 0
  THEN 409 conflict: { code: "OPEN_ORDERS", openOrderCount, orders?: preview[] }
  ELSE soft-delete
```

UI should rarely hit this if A6 completed first; guard prevents race / API misuse.

**getById today** filters `deletedAt IS NULL` — inactive detail is unreachable after deactivate. **Required fix:**

- Admin detail: `getCustomerById` should return row even if soft-deleted **or** add `getByIdIncludingDeleted` for admin.
- Recommended: `getById` returns any non-hard-missing row; list stays active-only unless `includeInactive`. Salesman list/search stays active-only always.

### B2. Database / queries (`packages/database/queries/customers/`)

| Function | Change |
|---|---|
| `searchActiveCustomers` | Rename or add `searchCustomers({ includeInactive })`. When true: drop `isNull(deletedAt)` (or filter `status` / `deletedAt` accordingly). |
| `getCustomerById` | Remove `deletedAt IS NULL` filter (or admin-only variant). |
| `reactivateCustomer` | **New:** `deletedAt=null`, `status='active'` where id matches; return row. Before update, run phone uniqueness check among other active rows. |
| `softDeleteCustomer` | Keep as-is (only called after open-orders guard passes). |
| `findActiveCustomerByPhone` | Unchanged (reactivate conflict check). |
| `listOpenOrdersByCustomerId` | **New** (orders queries): orders for customer where status ∈ `scheduled` \| `due` \| `confirmed`, ordered by scheduled/placed date. |
| `countOpenOrdersByCustomerId` | **Optional** lightweight count for deactivate guard. |

**No new migration** if we only reuse `status` + `deletedAt`. Unique index `customers_phone_active_unique` already allows same phone on deleted rows.

### B3. Service layer (`packages/services/customers/` + orders)

- `createCustomer` — unchanged rules; callable by admin.
- `searchCustomers` — pass `includeInactive`.
- `reactivateCustomer(id)` — conflict if phone taken by another active customer.
- `updateCustomer` — allow edit while inactive (recommended).
- `deactivateCustomer(id)` — **before** soft-delete, call `listOpenOrdersByCustomerId`; if any, throw conflict (`OPEN_ORDERS`); else soft-delete.
- `listOpenOrdersByCustomerId(customerId)` — **new** (customers or orders query package).
- Orders service: allow **admin** to `fulfillOrder` / `cancelOrder` (admin as `fulfilledBy` / `cancelledBy`). Book-now cancel must still restore gatepass stock via existing cancellation path.
- Wire `reactivate` (+ open-orders list if exposed) from service → tRPC.

### B4. Web UI (`apps/web`)

| File / area | Work |
|---|---|
| `app/admin/customers/page.tsx` | Add ⊕ → `/admin/customers/new`; “Show inactive” checkbox; pass `includeInactive` to hook. |
| `app/admin/customers/new/page.tsx` | **New** — form + create mutation + redirect. |
| `app/admin/customers/[id]/page.tsx` | Edit + Deactivate / Reactivate; on Deactivate → fetch open orders → A5 or A6. |
| `app/admin/customers/[id]/edit/page.tsx` | **Optional** — or reuse shared form on detail. |
| `components/admin/customers/customer-form.tsx` | **New** — shared create/edit form. |
| `components/admin/customers/deactivate-customer-dialog.tsx` | **New** — A5 simple confirm **or** A6 resolve-open-orders sheet (per-order Close/Cancel, progress, gated Deactivate). |
| `hooks/use-customers.ts` | `reactivateCustomer*`; `includeInactive`; open-orders query; invalidate customers + orders on resolve/deactivate. |
| `hooks/use-orders.ts` (or admin variant) | Admin fulfil / cancel mutations usable from A6. |

**Do not change** salesman checkout create UX except that inactive customers remain excluded from search.

### B5. Auth / roles

| Action | Admin | Salesman |
|---|---|---|
| List active | ✓ | ✓ |
| List inactive | ✓ | ✗ (always active-only) |
| Create | ✓ `[NEW]` | ✓ |
| Update | ✓ | ✗ |
| Deactivate | ✓ (after open orders resolved) | ✗ |
| Reactivate | ✓ `[NEW]` | ✗ |
| Close (fulfil) order on deactivate | ✓ `[NEW]` admin access | ✓ (existing, own flow) |
| Cancel order on deactivate | ✓ `[NEW]` admin access | ✓ (existing, own orders only) |
| Stats / orders | ✓ | ✓ (existing protected) |

### B6. Edge cases

1. **Deactivate with open pre-orders / open book-now** → **block** until admin **Closes (fulfils)** or **Cancels** each open order in the Resolve sheet (A6). Server returns `409 OPEN_ORDERS` if deactivate is called early.
2. Mid-resolve: admin closes 2 of 3 then taps **Keep active** → customer stays active; resolved orders stay fulfilled/cancelled; remaining open orders unchanged.
3. Concurrent salesman fulfil/cancel while admin has A6 open → refresh open list; progress updates; empty list unlocks Deactivate.
4. Book-now **Cancel** from A6 must use existing gatepass restoration path.
5. Reactivate phone conflict → 409 with clear message.
6. Admin creates with same phone as inactive → OK (unique only among active).
7. Empty search + include inactive → mix of Active / Inactive badges.
8. After deactivate, inactive shop name must still render on historical order cards / due lists for already-placed orders that were closed before deactivate.

### B7. Out of scope

- Hard delete / purge.
- Customer merge / duplicate wizard.
- Assigning customers to a single salesman (shared list stays).
- Changing salesman create-at-checkout flow.

---

## C. Implementation checklist (ordered)

1. Queries: `getCustomerById` include soft-deleted; `searchCustomers(includeInactive)`; `reactivateCustomer`; `listOpenOrdersByCustomerId`.
2. Service: deactivate **OPEN_ORDERS** guard; reactivate; admin-capable order fulfil/cancel.
3. tRPC: `create` → `protectedProcedure`; `list` input; `reactivate`; admin fulfil/cancel (or widen procedures); optional `customers.openOrders`.
4. `use-customers` / orders hooks + cache invalidation.
5. `CustomerForm` + `/admin/customers/new`.
6. List page: ⊕ + Show inactive.
7. Detail page: Edit / Reactivate; **DeactivateCustomerDialog** (A5 + A6 Close/Cancel flow).
8. Manual QA: deactivate with 0 open orders; deactivate with open pre-orders → close some / cancel some → then deactivate; Keep active abort; 409 if API bypasses UI; salesman cannot see inactive after.
9. k6 updates (section D), including open-orders gate.
10. Types check / smoke.

---

## D. k6 updates — pricing + admin customer CRUD

Files: `k6/flows/admin.js`, `k6/flows/salesman.js`, optionally `k6/lib/http.js` (helpers), `k6/lib/checks.js` **[NEW]** for shared assertions.

### D1. Pricing validation (both roles)

Add checks that **fail the iteration check** if pricing fields are missing or invalid (not only HTTP 2xx).

**Products catalog**

```js
// After products list
const products = parseData(productsRes)?.items ?? [];
for (const row of products.slice(0, 5)) {
  for (const v of row.varieties ?? []) {
    check(v, {
      'variety has unitPrice number': (x) => typeof x.unitPrice === 'number' && x.unitPrice >= 0,
    });
  }
}
```

**Orders list / detail**

```js
const orderRow = ordersPayload?.items?.[0];
if (orderRow?.order) {
  check(orderRow.order, {
    'order.totalAmount is number': (o) => typeof o.totalAmount === 'number' && o.totalAmount >= 0,
  });
}
// GET /api/orders/{id}
const detail = parseData(orderDetailRes);
if (detail) {
  check(detail.order, {
    'detail.totalAmount >= 0': (o) => typeof o.totalAmount === 'number' && o.totalAmount >= 0,
  });
  for (const item of detail.items ?? []) {
    check(item, {
      'item.unitPrice number': (i) => typeof i.unitPrice === 'number' && i.unitPrice >= 0,
      'item has imageUrl key': (i) => 'imageUrl' in i,
    });
  }
}
```

**Reports / KPIs**

```js
// daily report — assert salesValue (or whatever field name is shipped)
check(daily, {
  'daily.salesValue number': (d) => d && typeof d.salesValue === 'number',
});
// product-sales rows — totalAmountSold
// customer stats — lifetimeValue
check(stats, {
  'customer.lifetimeValue number': (s) => s && typeof s.lifetimeValue === 'number',
});
```

**Book-now / pre-order response** (salesman)

```js
const placed = parseData(bookNowRes);
if (placed?.order) {
  check(placed.order, {
    'placed order has totalAmount': (o) => typeof o.totalAmount === 'number',
  });
}
```

Snapshot rule (optional stronger check when catalog price known):

```js
// If variety.unitPrice was read before place:
// expect order item unitPrice === catalog unitPrice at place time
```

### D2. Admin customer CRUD flow (`k6/flows/admin.js`)

Replace sparse “5% patch notes” with a structured CRUD slice (still probabilistic so load stays mixed).

**Suggested probabilities**

| Roll | Action | Endpoint |
|---|---|---|
| ≤ 8% | **Create** | `POST /api/customers/` as admin |
| ≤ 16% | **Update** | `PATCH /api/customers/{id}` |
| ≤ 20% | **Deactivate** | `DELETE /api/customers/{id}` |
| ≤ 24% | **Reactivate** | `POST/PATCH …/reactivate` (after picking inactive or create→deactivate chain) |
| else | read-only path (existing dashboards) | |

**Create payload** (unique phone per VU)

```js
const unique = `${__VU}${__ITER}${Date.now()}`.slice(-10);
apiPost(`${base}/api/customers/`, {
  shopName: `Admin Shop ${unique}`,
  contactName: `Admin ${__VU}`,
  phone: `8${unique.padStart(9, '0').slice(-9)}`,
  address: `${unique} Admin Street`,
  notes: 'k6 admin create',
}, { role: 'admin', name: 'customer_admin_create' });
```

**Update** — change address/notes; assert response shopName/phone.

**Deactivate** — prefer customers created in-session (`notes` contains `k6`) to avoid nuking demo data.

- If target has open orders: expect **409** `OPEN_ORDERS` when calling deactivate without resolving — **or** in the happy path: cancel/fulfil open orders as admin first, then deactivate **200**.
- Add a small branch: create customer → place pre-order (salesman VU or admin setup) → admin cancel open order → admin deactivate → assert inactive.

**Reactivate** — only on id just deactivated in same iteration; assert `status === 'active'` and `deletedAt == null`.

**List inactive**

```js
apiGet(`${base}/api/customers/?page=1&pageSize=20&includeInactive=true`, {
  role: 'admin',
  name: 'customers_list_inactive',
});
```

**Negative check (optional)**

```js
// Salesman must not update
apiPatch(..., { role: 'salesman', name: 'customer_update_forbidden' }, [403]);
```

Requires extending `apiPatch` to accept `acceptedStatuses` like `apiPost`/`apiGet`.

### D3. Salesman flow touches

- Keep customer create (25%).
- After products list: variety `unitPrice` checks.
- After book-now: assert `totalAmount` / line `unitPrice`.
- Customers list must **not** require inactive (salesman never passes `includeInactive`).

### D4. Helpers to add

```js
// k6/lib/http.js
export function apiDelete(path, tags = {}, acceptedStatuses = null) { ... }

// k6/lib/pricing.js  [NEW]
export function assertVarietyPrices(productsPayload) { ... }
export function assertOrderMoney(order) { ... }
export function assertOrderDetailMoney(detail) { ... }
```

### D5. Thresholds

Keep existing `checks: ['rate>0.90']`. Pricing field checks increase check volume — if flaky on empty DB, gate assertions with `if (payload)` so empty catalogs don’t fail.

### D6. Dependency order

| k6 change | Requires code shipped? |
|---|---|
| Pricing field checks | ✓ Already shipped |
| Admin customer update / deactivate (no open orders) | ✓ API exists |
| Deactivate blocked by open orders (409) | Needs OPEN_ORDERS guard |
| Admin fulfil/cancel then deactivate | Needs admin order mutations + guard |
| Admin customer create | Needs `protectedProcedure` on create |
| Reactivate + includeInactive | Needs new API + list query |
| Order detail `imageUrl` check | ✓ Just shipped |

Ship API/UI before enabling reactivate/includeInactive/admin-create/open-order-gate checks in CI, or feature-flag those k6 branches with env `K6_CUSTOMER_CRUD=1`.

---

## E. Open decisions (confirm before coding)

1. **Create procedure:** `protectedProcedure` (recommended) vs separate admin-only create + keep salesman create?
2. **Edit UX:** full page `/edit` vs drawer/dialog on detail?
3. **getById** for soft-deleted: always return for any authenticated user, or admin-only?
4. **Deactivate with open orders:** **Decided** — must resolve via **Close (fulfil)** or **Cancel** per order before deactivate; server enforces with `409 OPEN_ORDERS`. Confirm: does “open” include book-now `confirmed` as well as pre-order `scheduled`/`due`? (Plan assumes **yes**.)
5. **Show inactive** label vs “Show deleted” (products wording) — customers use deactivate language?
6. **k6 deactivate:** only k6-tagged rows vs any list item?
7. **Bulk Close all / Cancel all** on A6: ship in v1 or per-order only first?

---

## F. Success criteria

- Admin can create, view, edit, deactivate, and reactivate customers from UI.
- Deactivating a customer with open orders shows Close / Cancel options and **blocks** deactivate until all are resolved.
- Inactive customers hidden from salesman checkout search.
- Phone uniqueness among active customers preserved.
- Lifetime ₹ + order history still work on detail (including inactive).
- k6 validates pricing fields and exercises admin customer CRUD, including the open-orders deactivate gate, without raising error rate above thresholds.
