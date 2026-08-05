# Motake — Phase 1: Order Management System

**Product Requirements Document (PRD v1.9)**

| Field       | Value  |
| ----------- | ------ |
| **Company** | Motake |

| **Phase** | Phase 1 — Order Management System |
| **Target Delivery** | 15 days (2 weeks) |
| **Document Version** | 1.9 |
| **Status** | Updated per clarification review (v1.9) |
| **Reference** | [prideofcows.com](https://prideofcows.com) (business model & product positioning) |

---

## Table of Contents

1.  [Executive Summary](#1-executive-summary)
2.  [Problem Statement & Goals](#2-problem-statement--goals)
3.  [User Personas & Roles](#3-user-personas--roles)
4.  [Scope](#4-scope)
5.  [GatePass & Order Model — Problem, Approach & Solution](#5-gatepass--order-model--problem-approach--solution)
6.  [Functional Requirements](#6-functional-requirements)
7.  [Non-Functional Requirements](#7-non-functional-requirements)
8.  [Technical Requirements](#8-technical-requirements)
9.  [Data Model (High Level)](#9-data-model-high-level)
10. [Key User Flows](#10-key-user-flows)
11. [KPIs & Analytics Definitions](#11-kpis--analytics-definitions)
12. [Assumptions & Dependencies](#12-assumptions--dependencies)
13. [Out of Scope (Phase 1)](#13-out-of-scope-phase-1)
14. [Milestones & Delivery Plan (15 Days)](#14-milestones--delivery-plan-15-days)
15. [Open Questions](#15-open-questions)
16. [Acceptance Criteria (Phase 1 Sign-off)](#16-acceptance-criteria-phase-1-sign-off)

---

## 1. Executive Summary

Motake requires a **single Next.js application** — mobile-first and **PWA-installable** — to digitize field sales operations: order booking, daily GatePass allotment, shared customer management, and end-of-day reconciliation.

The platform serves two authenticated roles via **Role-Based Access Control (RBAC)** and **Supabase Auth**:

- **Admin** — manages product catalog, allots daily GatePass quantities to salesmen, closes GatePass, orders, customers, and reporting
- **Salesman** — browses products in a Blinkit-style order interface, adds customers, books orders (online required), and views daily dashboard

There is **no native mobile app**, **no monorepo**, **no central warehouse stock tracking**, and **no real-time GPS tracking** in Phase 1. The system tracks **product names and varieties only** — not warehouse inventory quantities. Admin directly allots quantities to each salesman via GatePass. The salesman experience is optimized for smartphones and delivered as an installable PWA. Admin views remain usable on desktop and tablet.

Phase 1 focuses on a **GatePass + Orders model**: Book Now orders deduct from the salesman's daily GatePass; Pre-orders are recorded separately for next-day delivery and **do not affect GatePass quantities**.

---

## 2. Problem Statement & Goals

### 2.1 Problem Statement

Current sales operations likely rely on manual tracking (paper GatePasses, phone calls, spreadsheets), making it difficult to:

- Reconcile issued vs sold vs returned GatePass quantities accurately at end of day
- Record pre-orders separately for next-day delivery without mixing them into daily GatePass math
- Distinguish same-day orders (Book Now) from next-day commitments (Pre-order)
- Share customer records across salesmen witnhout duplicate entry
- Operate in the field with clear online/offline feedback (orders require connectivity)
- Analyze salesman performance at daily and monthly granularity
- Maintain a centralized audit trail of GatePass changes, orders, and customers

### 2.2 Business Goals

| \#  | Goal                                         | Success Metric                                                                          |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| G1  | Daily GatePass allotment and reconciliation  | Admin allots per salesman; Book Now deducts from GatePass; EOD close with sold/returned |
| G2  | Pre-order recording without GatePass impact  | Pre-orders stored as order commitments; fulfilled next day; zero GatePass deduction     |
| G3  | Track order lifecycle timestamps             | Every order records `placed_at` and `fulfilled_at` for reporting and audit              |
| G4  | Shared customer database                     | Any salesman can select any customer; admin governs updates                             |
| G5  | Enable daily & monthly performance reporting | Admin dashboard shows per-salesman and aggregate KPIs                                   |
| G6  | Deliver Phase 1 within 15 days               | All P0 features deployed to production and UAT-approved                                 |

### 2.3 Product Principles

- **Single Next.js project** — one repository, one deployable app (not a monorepo)
- **Feature-based architecture** — routes in `app/`; feature logic colocated under `features/`
- **Mobile-first PWA** — salesman UI built for phones first; installable via web manifest + service worker
- **Blinkit-style for salesman, ops-console for admin** — salesman sees shoppable catalog; admin manages products and GatePass allotment
- **No central stock** — admin allots quantities directly to salesmen; product catalog has names/prices only
- **GatePass for Book Now only** — Pre-orders are separate order records, not inventory deductions
- **PWA-first for field use** — installable, touch-optimized, responsive; order placement requires connectivity
- **Auditability** — every GatePass change, order, and customer change logged to files
- **Day-bound operations** — each business day has GatePass allotment and EOD reconciliation

---

## 3. User Personas & Roles

### 3.1 Role Model

Phase 1 has **exactly two authenticated roles**. Both use **Supabase Auth** with email + password + OTP (email or phone).

| Role         | Description                | Primary UI                                                        |
| ------------ | -------------------------- | ----------------------------------------------------------------- |
| **Admin**    | Operations manager         | Catalog management, GatePass allotment, GatePass closure, reports |
| **Salesman** | Field sales representative | Blinkit-style order portal, customer add, dashboard               |

There is no Super Admin, no customer login, and no native app.

### 3.2 Admin

- Manages product catalog (product names, varieties, prices — **no warehouse stock quantities**)
- Allots daily GatePass quantities directly to each salesman (which product, how much)
- Monitors salesman online/offline status
- Reviews and approves customer update requests; full CRUD on customers
- Reconciles end-of-day GatePass (issued vs sold vs returned for Book Now only)
- Closes GatePass after physical verification
- Views KPI dashboards, orders (including pre-order commitments), and sales history

### 3.3 Salesman

- Browses products in Blinkit-style interface for order placement
- Adds new customers (visible to all salesmen immediately)
- Selects existing customers from shared dropdown when placing orders
- Places Book Now and Pre-order orders (online required)
- Marks own Book Now orders as fulfilled after delivery
- May mark **any due pre-order** as fulfilled and close it (attribution stays with original salesman)
- Views own dashboard: today's orders, pre-orders, GatePass status
- Cannot edit existing customer records directly (must request admin approval)

### 3.4 Customer (Data Entity — No Login)

- Shared across **all salesmen** — not linked to the salesman who created them
- Any salesman can select any customer when placing an order
- Salesman can **create** customers; **updates** require admin approval
- Admin has full CRUD on all customer records

---

## 4. Scope

### 4.1 In Scope (Phase 1 — P0)

| Module                                                              | Role(s)  |
| ------------------------------------------------------------------- | -------- |
| Unified mobile-first Next.js PWA with RBAC (Admin + Salesman views) | Both     |
| Supabase Auth (email + password + OTP)                              | Both     |
| PWA support (installable, app shell caching)                        | Salesman |
| Order lifecycle tracking (`placed_at`, `fulfilled_at`)              | Both     |
| Blinkit-style product browsing & order flow                         | Salesman |
| Admin product catalog management (CRUD, not order UI)               | Admin    |
| GatePass allotment + EOD reconciliation                             | Admin    |
| GatePass lifecycle (Book Now deductions only)                       | Both     |
| Shared customer management (salesman add, admin CRUD/approve)       | Both     |
| Order booking (Book Now + Pre-order)                                | Salesman |
| Salesman dashboard                                                  | Salesman |
| Admin operations dashboard with allotment + pre-order views         | Admin    |
| Salesman management & sales history                                 | Admin    |
| Orders table (today + pre-orders)                                   | Admin    |
| Daily & monthly order counts                                        | Admin    |
| Salesman online/offline status                                      | Admin    |
| File-based logging (no external observability)                      | System   |

### 4.2 In Scope (Phase 1 — P1 / If Time Permits)

| Module                                 | Priority |
| -------------------------------------- | -------- |
| PDF/printable GatePass document        | P1       |
| Export reports (CSV)                   | P1       |
| Customer duplicate detection on create | P1       |

### 4.3 In Scope (Phase 1 — P2 / Last Priority)

| Module                            | Priority                           |
| --------------------------------- | ---------------------------------- |
| Company landing/marketing website | P2 — only after core app is stable |

### 4.4 Explicitly Removed from Phase 1

- Central warehouse stock / inventory pool tracking
- Real-time GPS / location tracking
- Redis caching
- Sentry or external observability tools
- Staging environment
- Order reassignment / status override by admin
- Route management
- Native mobile apps

---

## 5. GatePass & Order Model — Problem, Approach & Solution

This section defines how daily field inventory (GatePass) interacts with Book Now and Pre-order flows. It is the most critical domain logic in Phase 1.

### 5.1 Problem Statement

Motake does **not** track a central warehouse stock pool in the system. The product catalog contains **product names, varieties, and prices only** — not how many units exist in storage.

Each morning, the admin **directly allots** quantities to each salesman: e.g., "Salesman A gets 50 milk and 50 ghee today." This creates that salesman's **GatePass** for the day.

During the day:

- **Book Now** (same-day delivery) — deducts quantity from the salesman's GatePass immediately
- **Pre-order** (next-day delivery) — **does not deduct from GatePass**. The system only **records** that the salesman placed a pre-order: which customer, which products, what quantities. The order is processed (captured) today and delivered to the customer tomorrow
- **Unsold GatePass stock** — physically returned at end of day; admin verifies and closes GatePass

Pre-orders and GatePass are **separate concerns**. Pre-order data lives in the **orders** module for planning and next-day fulfillment — not in GatePass quantity math.

### 5.2 Conceptual Model

```
┌─────────────────────────────────────────────────────────────┐
│              PRODUCT CATALOG (no stock qty)                  │
│         Product names, varieties, prices, images             │
│         e.g., Milk 500ml, Ghee 500ml                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ Admin assigns quantities (no pool check)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         GATEPASS (per salesman per day)                      │
│    Admin allots: SM-01 → 50 milk, 50 ghee                    │
│    Tracks Book Now field sales only                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────────┐
│  BOOK NOW           │         │  PRE-ORDER               │
│  Same-day delivery  │         │  Next-day delivery       │
│  Deducts GatePass   │         │  NO GatePass deduction   │
│  sold_qty += qty    │         │  Order record only       │
│  available_qty -= qty│        │  placed_at today         │
└─────────────────────┘         │  fulfilled_at tomorrow   │
                                └─────────────────────────┘
```

### 5.3 Book Now vs Pre-order — Side by Side

| Aspect           | Book Now                                      | Pre-order                                                      |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Delivery         | Same day                                      | Next day (T+1)                                                 |
| GatePass impact  | **Yes** — deducts `available_qty` immediately | **None** — zero GatePass change                                |
| Stock validation | Block if qty &gt; GatePass `available_qty`    | No GatePass validation                                         |
| What is stored   | Order + GatePass update                       | Order record only (salesman, customer, items, qty)             |
| When processed   | At placement (`placed_at`)                    | At placement (`placed_at`); delivery next day (`fulfilled_at`) |
| EOD GatePass     | Counts toward `sold_qty`                      | **Not included** in GatePass reconciliation                    |
| Fulfillment      | Creating salesman marks fulfilled             | **Any salesman** may mark fulfilled                            |

### 5.4 Walkthrough Example

**Step 1 — Admin allots GatePass (no central stock check):**

Admin assigns to 10 salesmen: 50 milk + 50 ghee each.

| Salesman      | Milk Allotted | Ghee Allotted |
| ------------- | ------------- | ------------- |
| SM-01 … SM-10 | 50 each       | 50 each       |

System creates 10 GatePasses. **No warehouse pool is updated** — admin enters allotment numbers directly.

**Step 2 — During the day, Book Now sales (10 milk + 10 ghee per salesman):**

| Per salesman               | GatePass change                                   |
| -------------------------- | ------------------------------------------------- |
| Book Now: 10 milk, 10 ghee | `sold_qty` += 10 each; `available_qty` -= 10 each |

Total Book Now across 10 salesmen: 100 milk, 100 ghee sold from GatePasses.

**Step 3 — During the day, Pre-orders (5 milk + 5 ghee per salesman):**

| Per salesman              | GatePass change | Order record                                                             |
| ------------------------- | --------------- | ------------------------------------------------------------------------ |
| Pre-order: 5 milk, 5 ghee | **No change**   | Stored: SM-X pre-ordered 5 milk, 5 ghee for Customer Y, deliver tomorrow |

Total pre-orders: 50 milk, 50 ghee — visible in **Pre-order dashboard**, not in GatePass.

**Step 4 — GatePass state per salesman at EOD (Book Now only):**

| Field                        | Milk              | Ghee              |
| ---------------------------- | ----------------- | ----------------- |
| Issued (`issued_qty`)        | 50                | 50                |
| Sold — Book Now (`sold_qty`) | 10                | 10                |
| Available (`available_qty`)  | 40                | 40                |
| Pre-orders                   | _not in GatePass_ | _not in GatePass_ |

**Step 5 — EOD GatePass close (admin):**

| Action                    | Milk                                        | Ghee                  |
| ------------------------- | ------------------------------------------- | --------------------- |
| Admin enters returned qty | 40                                          | 40                    |
| Discrepancy check         | `returned_qty` should equal `available_qty` | Same                  |
| GatePass closed           | Read-only                                   | Next day starts fresh |

**Admin dashboard at EOD:**

| View                                  | Milk | Ghee |
| ------------------------------------- | ---- | ---- |
| Book Now sold today (from GatePass)   | 100  | 100  |
| Pre-orders placed today (from orders) | 50   | 50   |
| Pre-orders due tomorrow               | 50   | 50   |
| GatePass returned (unsold)            | 400  | 400  |

### 5.5 GatePass Item Fields

Each GatePass line item tracks **Book Now activity only**:

| Field           | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `issued_qty`    | Quantity allotted by admin for the day                     |
| `sold_qty`      | Quantity sold via **Book Now** (deducted on order confirm) |
| `returned_qty`  | Quantity physically returned at EOD (admin enters)         |
| `available_qty` | Computed: `issued_qty − sold_qty` (remaining for Book Now) |

**Invariant (during active GatePass day):**

```
issued_qty = sold_qty + available_qty
```

**At EOD:**

```
returned_qty should equal available_qty (discrepancy flagged if not)
```

**Pre-orders do not appear in GatePass fields.** They are tracked entirely via the `orders` and `order_items` tables.

### 5.6 Pre-order Record (Separate from GatePass)

When a salesman places a pre-order, the system stores:

| Field            | Example                                         |
| ---------------- | ----------------------------------------------- |
| `salesman_id`    | SM-03 (creator — permanent for KPIs)            |
| `customer_id`    | Customer Y                                      |
| `type`           | `pre_order`                                     |
| `placed_at`      | Today 2:30 PM                                   |
| `scheduled_date` | Tomorrow                                        |
| `status`         | `confirmed` → `scheduled` → `due` → `fulfilled` |
| Order items      | 5 × Milk 500ml, 5 × Ghee 500ml                  |

Nothing is subtracted from GatePass. The admin and salesmen see these as **commitments for next-day delivery**.

### 5.7 Edge Cases & Handling

| \#    | Edge Case                                                | Handling                                                                                       |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| EC-01 | Salesman Book Now exceeds GatePass `available_qty`       | **Block** order; show remaining qty                                                            |
| EC-02 | Salesman Pre-order for any product/qty                   | **Allow** — no GatePass check; order record only                                               |
| EC-03 | Salesman tries to place order while offline              | **Block** submission; show offline banner                                                      |
| EC-04 | Salesman returns less than `available_qty` at EOD        | Flag **discrepancy**; admin adds notes; GatePass closable with flag                            |
| EC-05 | Salesman returns more than `available_qty`               | **Block** closure until investigated                                                           |
| EC-06 | Book Now cancelled before EOD                            | Restore `sold_qty`; increase `available_qty`                                                   |
| EC-07 | Pre-order cancelled before fulfillment                   | Update order status only; **no GatePass change** (never touched GatePass)                      |
| EC-08 | Pre-order fulfilled next day by any salesman             | Mark `fulfilled`; set `fulfilled_at`; `fulfilled_by` if not creator; **no GatePass deduction** |
| EC-09 | Another salesman delivers pre-order on behalf of creator | Same as EC-08; attribution stays with creator                                                  |
| EC-10 | Admin closes GatePass for some salesmen but not all      | Allowed; unclosed remain `pending_verification`                                                |
| EC-11 | Pre-order placed for product not in today's GatePass     | **Allowed** — pre-orders independent of GatePass allotment                                     |
| EC-12 | Partial return at EOD                                    | Per-item `returned_qty`; each line resolved independently                                      |
| EC-13 | Order marked fulfilled twice                             | Idempotent; `fulfilled_at` set once                                                            |

### 5.8 Pre-order Lifecycle

| Day         | Action                                  | GatePass                                   | Order Record                                               |
| ----------- | --------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Day 0       | Salesman places pre-order               | **No change**                              | Created; `placed_at` set; status `confirmed` → `scheduled` |
| Day 0 (EOD) | Admin closes GatePass                   | Pre-orders **excluded** from GatePass math | Pre-orders visible in admin "due tomorrow" view            |
| Day 1       | Any salesman delivers & marks fulfilled | **No change**                              | `fulfilled_at` set; status `fulfilled`                     |

**Important:** Pre-orders are never reassigned — `salesman_id` stays the creator for KPIs. Any salesman may deliver and mark fulfilled.

### 5.9 Admin Dashboard Requirements

| Widget / View               | Content                                                       |
| --------------------------- | ------------------------------------------------------------- |
| Today's GatePass allotment  | Salesman × Product matrix (issued quantities)                 |
| Live GatePass status        | Per salesman: issued / sold (Book Now) / available / returned |
| EOD GatePass panel          | Sold today, returned, discrepancies — **Book Now only**       |
| Pre-orders placed today     | Aggregate list from orders (not GatePass)                     |
| Pre-orders due tomorrow     | Total commitments by product and salesman                     |
| Book Now vs Pre-order split | Clear separation in all reporting views                       |

### 5.10 Design Decisions & Rationale

| Decision                                | Choice             | Rationale                                                                              |
| --------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Central warehouse stock in system       | **No**             | Admin allots directly; catalog is product metadata only                                |
| Pre-order deducts GatePass              | **No**             | Pre-order is processed today, delivered tomorrow — separate from today's carried stock |
| Pre-order deducts anything at placement | **No**             | Only an order commitment record; no inventory pool to deduct from                      |
| Book Now deducts GatePass immediately   | **Yes**            | Salesman carries physical stock; same-day sale reduces what's on hand                  |
| Pre-order requires GatePass allotment   | **No**             | Salesman can pre-order any catalog product at any qty                                  |
| EOD GatePass includes pre-orders        | **No**             | GatePass reconciles Book Now + returns only                                            |
| Offline order placement                 | Block when offline | Live validation for Book Now GatePass checks                                           |

---

## 6. Functional Requirements

Requirements tagged: **P0** (must-have), **P1** (should-have), **P2** (last priority).

---

### 6.1 Authentication & Authorization (Supabase Auth)

| ID         | Requirement                                                                                           | Priority | Role     |
| ---------- | ----------------------------------------------------------------------------------------------------- | -------- | -------- |
| FR-AUTH-01 | Both admin and salesman shall authenticate via **Supabase Auth**                                      | P0       | Both     |
| FR-AUTH-02 | Login shall support **email + password**                                                              | P0       | Both     |
| FR-AUTH-03 | Login shall support **OTP verification** via email or phone number                                    | P0       | Both     |
| FR-AUTH-04 | Roles (`admin`, `salesman`) shall be stored in Supabase **`app_metadata.role`** (not `user_metadata`) | P0       | System   |
| FR-AUTH-05 | After login, user redirected to role-appropriate route group (`/admin/*` or `/salesman/*`)            | P0       | Both     |
| FR-AUTH-06 | Next.js `proxy.ts` shall validate Supabase session and role before rendering route groups             | P0       | System   |
| FR-AUTH-07 | Salesman shall only access own orders, GatePass, and shared customer list                             | P0       | Salesman |
| FR-AUTH-08 | Admin shall access all operational modules                                                            | P0       | Admin    |
| FR-AUTH-09 | Admin shall create/deactivate salesman accounts via Supabase Admin API + app database                 | P0       | Admin    |
| FR-AUTH-10 | System shall support logout and session invalidation via Supabase Auth                                | P0       | Both     |

---

### 6.2 Profile Management

| ID         | Requirement                                                        | Priority | Role     |
| ---------- | ------------------------------------------------------------------ | -------- | -------- |
| FR-PROF-01 | Salesman shall view profile: ID, name, phone, email, photo         | P0       | Salesman |
| FR-PROF-02 | Admin shall view and manage salesman profiles                      | P0       | Admin    |
| FR-PROF-03 | Each salesman shall have a unique system-generated `salesman_code` | P0       | Both     |

---

### 6.3 Product Catalog

**Admin and salesman see fundamentally different catalog UIs:**

| Role         | Catalog UI                                                                | Purpose                |
| ------------ | ------------------------------------------------------------------------- | ---------------------- |
| **Salesman** | Blinkit-style grid: images, prices, variety picker, add-to-cart           | Order placement        |
| **Admin**    | Management table/form: CRUD products & varieties, images, pricing, status | Catalog administration |

| ID         | Requirement                                                                                                                         | Priority | Role     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| FR-PROD-01 | Admin shall CRUD products: name, description, image, category, status                                                               | P0       | Admin    |
| FR-PROD-02 | Admin shall CRUD product varieties: SKU, name, unit, price, status                                                                  | P0       | Admin    |
| FR-PROD-03 | Admin catalog view shall be a **management interface** (tables, forms, filters) — NOT a shopping/order UI                           | P0       | Admin    |
| FR-PROD-04 | Salesman shall browse products in **Blinkit-style** grid: image, name, price, variety selector, add-to-cart button                  | P0       | Salesman |
| FR-PROD-05 | Salesman shall search/filter products by name and category                                                                          | P0       | Salesman |
| FR-PROD-06 | Salesman catalog shall show GatePass `available_qty` for **Book Now** (disabled/badge when zero); Pre-order not limited by GatePass | P0       | Salesman |
| FR-PROD-07 | Product catalog shall use pagination or infinite scroll                                                                             | P0       | Salesman |
| FR-PROD-08 | Admin shall upload product images (stored in R2)                                                                                    | P0       | Admin    |
| FR-PROD-09 | Admin shall bulk-import products via CSV                                                                                            | P1       | Admin    |

---

### 6.4 GatePass Allotment

There is **no central stock**. Admin assigns quantities directly to salesmen.

| ID        | Requirement                                                                                     | Priority | Role   |
| --------- | ----------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-ALT-01 | Admin shall create daily GatePass by assigning product quantities per salesman                  | P0       | Admin  |
| FR-ALT-02 | Allotment shall specify product variety + quantity — no warehouse pool validation               | P0       | Admin  |
| FR-ALT-03 | Admin dashboard shall show allotment matrix: salesman × product with issued quantities          | P0       | Admin  |
| FR-ALT-04 | Admin shall view all active GatePasses and their status                                         | P0       | Admin  |
| FR-ALT-05 | Allotment creates GatePass with `issued_qty` per item; `available_qty` = `issued_qty` initially | P0       | System |

---

### 6.5 GatePass Management

| ID       | Requirement                                                                                                       | Priority | Role     |
| -------- | ----------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| FR-GP-01 | Each salesman shall have at most one GatePass per business day                                                    | P0       | System   |
| FR-GP-02 | GatePass is created via admin allotment (FR-ALT-01)                                                               | P0       | Admin    |
| FR-GP-03 | GatePass item fields: `issued_qty`, `sold_qty`, `returned_qty`, `available_qty` — **no** `pre_order_qty`          | P0       | System   |
| FR-GP-04 | Salesman shall view own GatePass status on dashboard (Book Now quantities only)                                   | P0       | Salesman |
| FR-GP-05 | **Book Now** orders shall increment `sold_qty` and decrement `available_qty` immediately                          | P0       | System   |
| FR-GP-06 | **Pre-orders shall NOT modify GatePass** in any way                                                               | P0       | System   |
| FR-GP-07 | Admin shall enter `returned_qty` per item at EOD                                                                  | P0       | Admin    |
| FR-GP-08 | System shall flag discrepancy when `returned_qty ≠ available_qty`                                                 | P0       | System   |
| FR-GP-09 | Admin shall close GatePass after verification — reconciles Book Now sold + returns only                           | P0       | Admin    |
| FR-GP-10 | Closed GatePass is read-only; next day starts fresh                                                               | P0       | System   |
| FR-GP-11 | Admin dashboard shall show GatePass status per salesman: `not issued`, `active`, `pending verification`, `closed` | P0       | Admin    |
| FR-GP-12 | Cancelled **Book Now** order shall restore `sold_qty` and `available_qty`                                         | P0       | System   |
| FR-GP-13 | Cancelled **Pre-order** shall update order status only — **no GatePass restore** (GatePass was never changed)     | P0       | System   |
| FR-GP-14 | Printable GatePass document                                                                                       | P1       | Both     |

**GatePass State Machine:**

```
not_issued → active → pending_verification → closed
```

---

### 6.6 Customer Management (Shared)

Customers are **global** — visible to all salesmen. Not linked to the creating salesman.

| ID        | Requirement                                                                                      | Priority | Role     |
| --------- | ------------------------------------------------------------------------------------------------ | -------- | -------- |
| FR-CUS-01 | Salesman shall **create** a customer: shop name, contact name, phone, shop address               | P0       | Salesman |
| FR-CUS-02 | Newly created customer shall be **immediately visible to all salesmen**                          | P0       | System   |
| FR-CUS-03 | Customer records shall **NOT** be linked to the salesman who created them                        | P0       | System   |
| FR-CUS-04 | Salesman shall **not** directly edit existing customer records                                   | P0       | Salesman |
| FR-CUS-05 | Salesman shall submit a **customer update request** (changed fields + reason) for admin approval | P0       | Salesman |
| FR-CUS-06 | Admin shall view pending customer update requests and approve/reject                             | P0       | Admin    |
| FR-CUS-07 | Admin shall perform **full CRUD** on all customer records directly                               | P0       | Admin    |
| FR-CUS-08 | All salesmen shall select customers from a **shared searchable dropdown** on order booking       | P0       | Salesman |
| FR-CUS-09 | Salesman shall add a new customer inline from order booking flow                                 | P0       | Salesman |
| FR-CUS-10 | Admin shall view all customers with search/filter                                                | P0       | Admin    |
| FR-CUS-11 | System shall warn on duplicate phone number when creating customer                               | P1       | Salesman |

**Customer Update Request Flow:**

```
Salesman                    Admin                       System
  │                           │                           │
  │── Submit update request ──┼──────────────────────────►│
  │   (customer_id, changes)  │                           │── Status: pending
  │                           │── Review request ────────►│
  │                           │── Approve / Reject ──────►│
  │                           │                           │── If approved: apply changes
  │◄── Notification ──────────┼───────────────────────────│
```

---

### 6.7 Order Booking

| ID         | Requirement                                                                                                                                   | Priority | Role     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| FR-ORD-01  | Salesman shall add products to cart from Blinkit-style catalog                                                                                | P0       | Salesman |
| FR-ORD-02  | Salesman shall adjust quantity per cart item                                                                                                  | P0       | Salesman |
| FR-ORD-03  | Order screen shall show: items, quantities, prices, subtotal, total                                                                           | P0       | Salesman |
| FR-ORD-04  | Salesman shall select customer from shared dropdown                                                                                           | P0       | Salesman |
| FR-ORD-05  | Two order types: **Book Now** (same-day) and **Pre-order** (next-day)                                                                         | P0       | Salesman |
| FR-ORD-06  | **Book Now** shall deduct from GatePass `available_qty` immediately on confirmation                                                           | P0       | System   |
| FR-ORD-07  | **Pre-order** shall **NOT** deduct from GatePass — stored as order record only                                                                | P0       | System   |
| FR-ORD-08  | System shall block **Book Now** if qty exceeds GatePass `available_qty`                                                                       | P0       | System   |
| FR-ORD-08b | System shall **NOT** block Pre-order based on GatePass quantities                                                                             | P0       | System   |
| FR-ORD-09  | System shall generate unique `order_id` on confirmation                                                                                       | P0       | System   |
| FR-ORD-10  | System shall record `placed_at` timestamp when order is confirmed                                                                             | P0       | System   |
| FR-ORD-11  | Pre-order is assigned to the **creating salesman permanently** — no reassignment                                                              | P0       | System   |
| FR-ORD-12  | Pre-order `salesman_id` (creator) is **permanent** for reporting — never reassigned                                                           | P0       | System   |
| FR-ORD-13  | **Any salesman** may mark a due pre-order as **fulfilled** and close it                                                                       | P0       | Salesman |
| FR-ORD-14  | When a non-creator fulfills a pre-order, system shall record `fulfilled_by` as the delivering salesman                                        | P0       | System   |
| FR-ORD-15  | **Admin shall NOT override order status or reassign orders**                                                                                  | P0       | System   |
| FR-ORD-16  | Creating salesman shall mark own **Book Now** orders as fulfilled; system records `fulfilled_at`                                              | P0       | Salesman |
| FR-ORD-17  | Salesman shall cancel own order before fulfillment (with reason); **Book Now** restores GatePass qty; **Pre-order** cancels order record only | P1       | Salesman |
| FR-ORD-18  | Order confirmation screen with order ID, type, items, customer, and `placed_at`                                                               | P0       | Salesman |
| FR-ORD-19  | Order lists and detail views shall display `placed_at`, `fulfilled_at`, creator, and `fulfilled_by` (if different)                            | P0       | Both     |
| FR-ORD-20  | Order placement shall be **blocked when offline**; cart may be retained locally but submit disabled                                           | P0       | Salesman |

**Order Type Rules:**

| Order Type | Fulfillment    | GatePass Impact                           | Stored As                                          |
| ---------- | -------------- | ----------------------------------------- | -------------------------------------------------- |
| Book Now   | Same day       | `sold_qty` += qty; `available_qty` −= qty | Order + GatePass update                            |
| Pre-order  | Next day (T+1) | **None**                                  | Order record only (salesman, customer, items, qty) |

**Order Status Lifecycle:**

```
Book Now:   confirmed ──(placed_at set)──► fulfilled ──(fulfilled_at set)
Pre-order:  confirmed ──(placed_at set)──► scheduled ──► due ──► fulfilled ──(fulfilled_at set; any salesman)
            ↘ cancelled (Book Now: restores GatePass; Pre-order: order only)
```

| Action            | Who Can Perform       | Notes                                              |
| ----------------- | --------------------- | -------------------------------------------------- |
| Place Book Now    | Any salesman (online) | Creator = `salesman_id`                            |
| Place Pre-order   | Any salesman (online) | Creator = `salesman_id` (permanent)                |
| Fulfill Book Now  | Creating salesman     | Sets `fulfilled_at`                                |
| Fulfill Pre-order | **Any salesman**      | Sets `fulfilled_at`; `fulfilled_by` if not creator |

| Timestamp      | When Set               | Description                                      |
| -------------- | ---------------------- | ------------------------------------------------ |
| `placed_at`    | Order confirmed        | Exact date/time salesman submits the order       |
| `fulfilled_at` | Order marked fulfilled | Exact date/time product is delivered to customer |

No admin override transitions. Status changes happen via salesman actions and system rules only.

---

### 6.8 Salesman Dashboard

| ID       | Requirement                                                                                                                    | Priority | Role     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| FR-SD-01 | Two tabs: **Today's Orders (Book Now)** and **Pre-order Bookings**                                                             | P0       | Salesman |
| FR-SD-02 | Today's orders: order ID, customer name, items summary, `placed_at`, `fulfilled_at`, status                                    | P0       | Salesman |
| FR-SD-03 | **My Pre-orders**: pre-orders placed by this salesman with `placed_at`, scheduled date, status                                 | P0       | Salesman |
| FR-SD-04 | **Due Pre-orders**: all pre-orders due today (any salesman), with customer, items, creator name, and **Mark Fulfilled** action | P0       | Salesman |
| FR-SD-05 | Analytics: **Total Orders Today** count                                                                                        | P0       | Salesman |
| FR-SD-06 | GatePass summary: issued, sold (Book Now), available per product — **no pre-order counts**                                     | P0       | Salesman |
| FR-SD-07 | Quick links: Catalog, Add Customer, Due Pre-orders                                                                             | P0       | Salesman |
| FR-SD-08 | Connectivity indicator: online/offline banner; order actions disabled when offline                                             | P0       | Salesman |

---

### 6.9 Admin Dashboard & KPIs

| ID       | Requirement                                                                             | Priority | Role  |
| -------- | --------------------------------------------------------------------------------------- | -------- | ----- |
| FR-AD-01 | KPI cards: total orders today, pre-orders pending, total sales value, GatePass overview | P0       | Admin |
| FR-AD-02 | GatePass allotment matrix (salesman × product)                                          | P0       | Admin |
| FR-AD-03 | GatePass status overview (issued / sold / available / returned — Book Now only)         | P0       | Admin |
| FR-AD-04 | EOD GatePass panel: sold (Book Now), returned, discrepancies                            | P0       | Admin |
| FR-AD-05 | Pre-order commitments for next day (from orders table, not GatePass)                    | P0       | Admin |
| FR-AD-06 | Monthly order count (aggregate + per salesman)                                          | P0       | Admin |
| FR-AD-07 | Daily order count per salesman                                                          | P0       | Admin |
| FR-AD-08 | Salesman online/offline status list with last seen and reason                           | P0       | Admin |
| FR-AD-09 | Date filter (default: today) and month selector                                         | P0       | Admin |
| FR-AD-10 | Navigation to: Catalog, GatePass, Salesmen, Orders, Customers, Reports                  | P0       | Admin |

---

### 6.10 Salesman Online/Offline Status

| ID         | Requirement                                                                       | Priority | Role     |
| ---------- | --------------------------------------------------------------------------------- | -------- | -------- |
| FR-CONN-01 | Salesman app shall report online/offline status via heartbeat (when app is open)  | P0       | Salesman |
| FR-CONN-02 | Admin shall see each salesman's status: `online` or `offline`                     | P0       | Admin    |
| FR-CONN-03 | Offline status shall show **last seen timestamp**                                 | P0       | Admin    |
| FR-CONN-04 | Offline status shall show **reason** where detectable: `no network`, `app closed` | P0       | Admin    |
| FR-CONN-05 | Salesman UI shall show persistent offline banner when network unavailable         | P0       | Salesman |
| FR-CONN-06 | Place Order and Mark Fulfilled buttons shall be **disabled** when offline         | P0       | Salesman |

---

### 6.11 Connectivity Requirements

| ID        | Requirement                                                                                | Priority | Role     |
| --------- | ------------------------------------------------------------------------------------------ | -------- | -------- |
| FR-OFF-01 | Cart state may persist in localStorage (survives page refresh)                             | P1       | Salesman |
| FR-OFF-02 | Order placement shall require active network connection — **blocked when offline**         | P0       | Salesman |
| FR-OFF-03 | Mark order as fulfilled shall require active network connection — **blocked when offline** | P0       | Salesman |
| FR-OFF-04 | Offline banner shall explain: "You are offline. Connect to place orders."                  | P0       | Salesman |
| FR-OFF-05 | Service worker may cache app shell for faster repeat loads (no offline order queue)        | P1       | System   |

---

### 6.12 Orders Management (Admin — Read Only)

| ID       | Requirement                                                                                                                  | Priority | Role   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| FR-OA-01 | Admin shall view Today's Orders table: order ID, customer, salesman, `placed_at`, `fulfilled_at`, type, items, status, value | P0       | Admin  |
| FR-OA-02 | Admin shall view Pre-order Bookings table with creator, `fulfilled_by`, `placed_at`, scheduled date, and `fulfilled_at`      | P0       | Admin  |
| FR-OA-03 | Admin shall filter/search orders by date, salesman, type, status, customer phone                                             | P0       | Admin  |
| FR-OA-04 | Admin shall view order detail including `placed_at`, `fulfilled_at`, and line items (read-only)                              | P0       | Admin  |
| FR-OA-05 | Admin shall **not** modify order status or reassign orders                                                                   | P0       | System |
| FR-OA-06 | Pre-orders auto-transition to `due` on fulfillment date                                                                      | P0       | System |

---

### 6.13 Salesman Management (Admin)

| ID       | Requirement                                                                             | Priority | Role  |
| -------- | --------------------------------------------------------------------------------------- | -------- | ----- |
| FR-SM-01 | Admin shall list all salesmen: ID, name, phone, status, GatePass status, online/offline | P0       | Admin |
| FR-SM-02 | Admin shall create/edit/deactivate salesman (Supabase Auth account + app record)        | P0       | Admin |
| FR-SM-03 | Admin shall view per-salesman sales history (day-wise)                                  | P0       | Admin |
| FR-SM-04 | Day-wise history: date, allotted, sold, pre-ordered, returned, GatePass status          | P0       | Admin |
| FR-SM-05 | Filter sales history by date range                                                      | P0       | Admin |

---

### 6.14 Sales History & Reporting

| ID       | Requirement                                                                 | Priority | Role  |
| -------- | --------------------------------------------------------------------------- | -------- | ----- |
| FR-RP-01 | Admin shall view daily and monthly sales history                            | P0       | Admin |
| FR-RP-02 | History includes: date, orders, units sold, revenue, per-salesman breakdown | P0       | Admin |
| FR-RP-03 | Product-wise sales summary for date range                                   | P1       | Admin |
| FR-RP-04 | Export daily/monthly report as CSV                                          | P1       | Admin |
| FR-RP-05 | GatePass reconciliation records retained in audit trail                     | P0       | Admin |

---

### 6.15 Company Landing Website (P2 — Last Priority)

| ID        | Requirement                              | Priority |
| --------- | ---------------------------------------- | -------- |
| FR-WEB-01 | Public landing page with Motake branding | P2       |
| FR-WEB-02 | Responsive design                        | P2       |
| FR-WEB-03 | About + contact                          | P2       |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID          | Requirement                                              | Target        |
| ----------- | -------------------------------------------------------- | ------------- |
| NFR-PERF-01 | Salesman catalog page load on 4G                         | ≤ 3 seconds   |
| NFR-PERF-02 | Order confirmation API (online)                          | ≤ 500ms (p95) |
| NFR-PERF-03 | Admin dashboard KPI load                                 | ≤ 2 seconds   |
| NFR-PERF-04 | Customer dropdown search                                 | ≤ 200ms       |
| NFR-PERF-05 | Mark fulfilled API response                              | ≤ 500ms (p95) |
| NFR-PERF-06 | Product catalog supports ≥ 500 varieties with pagination | No UI jank    |

### 7.2 PWA & Connectivity

| ID         | Requirement                                                                                | Target   |
| ---------- | ------------------------------------------------------------------------------------------ | -------- |
| NFR-PWA-01 | Installable PWA on Android Chrome and iOS Safari — primary delivery for salesman field use | Required |
| NFR-PWA-02 | Web app manifest with Motake branding, icons (192, 512), `display: standalone`             | Required |
| NFR-PWA-03 | Service worker caches app shell for faster repeat loads on mobile                          | P0       |
| NFR-PWA-04 | Order placement and fulfillment **blocked when offline**                                   | Required |
| NFR-PWA-05 | Offline banner visible when network unavailable                                            | Required |
| NFR-PWA-06 | Cart may persist in localStorage across refresh (submit still requires online)             | P1       |
| NFR-PWA-07 | Viewport and layout optimized for mobile (360px–428px) as default design target            | Required |
| NFR-PWA-08 | Safe-area and bottom navigation patterns for one-handed phone use (salesman)               | P1       |

### 7.3 Availability

| ID         | Requirement                                                | Target                                    |
| ---------- | ---------------------------------------------------------- | ----------------------------------------- |
| NFR-AVL-01 | Production uptime during business hours (6 AM – 10 PM IST) | ≥ 99.5%                                   |
| NFR-AVL-02 | Supabase PostgreSQL automated backups                      | Daily, 7-day retention (Supabase default) |

### 7.4 Scalability

| ID         | Requirement                | Target          |
| ---------- | -------------------------- | --------------- |
| NFR-SCL-01 | Concurrent active salesmen | ≥ 100 (Phase 1) |
| NFR-SCL-02 | Daily order volume         | ≥ 5,000/day     |
| NFR-SCL-03 | Admin concurrent users     | ≥ 20            |
| NFR-SCL-04 | Shared customer records    | ≥ 10,000        |

### 7.5 Security

| ID         | Requirement                                                          | Target    |
| ---------- | -------------------------------------------------------------------- | --------- |
| NFR-SEC-01 | HTTPS/TLS 1.2+                                                       | Mandatory |
| NFR-SEC-02 | Authentication via Supabase Auth (password + OTP)                    | Mandatory |
| NFR-SEC-03 | RBAC enforced at proxy and API/Server Action layer                   | Mandatory |
| NFR-SEC-04 | Salesman scoped to own orders and GatePass; shared read on customers | Mandatory |
| NFR-SEC-05 | Admin actions audit-logged to file                                   | Mandatory |
| NFR-SEC-06 | Input validation via Zod on all forms and API endpoints              | Mandatory |
| NFR-SEC-07 | Supabase session management with configurable expiry                 | Mandatory |
| NFR-SEC-08 | Row Level Security (RLS) enabled on all public tables                | Mandatory |

### 7.6 Usability

| ID        | Requirement                                                                               | Target   |
| --------- | ----------------------------------------------------------------------------------------- | -------- |
| NFR-UX-01 | Salesman views: **mobile-first** (360px–428px primary), Blinkit-style, thumb-friendly     | Required |
| NFR-UX-02 | Admin views: desktop-first (≥ 1024px), responsive down to tablet; management tables/forms | Required |
| NFR-UX-03 | Touch targets ≥ 44×44px on all salesman views                                             | Required |
| NFR-UX-04 | Confirmation dialogs for order placement and GatePass closure                             | Required |
| NFR-UX-05 | Human-readable error messages                                                             | Required |
| NFR-UX-06 | Clear online/offline connectivity banner on salesman UI                                   | Required |

### 7.7 Compatibility

| ID         | Requirement                                              | Target    |
| ---------- | -------------------------------------------------------- | --------- |
| NFR-CMP-01 | Salesman PWA: Chrome Android 90+, Safari iOS 15+         | Required  |
| NFR-CMP-02 | Admin: Chrome, Firefox, Safari, Edge (latest 2 versions) | Required  |
| NFR-CMP-03 | 100% web-based — no native app dependencies              | Mandatory |

### 7.8 Logging & Observability

| ID         | Requirement                                                                       | Target    |
| ---------- | --------------------------------------------------------------------------------- | --------- |
| NFR-LOG-01 | Structured file logging via npm library (e.g., **pino** or **winston**)           | Required  |
| NFR-LOG-02 | Log levels: error, warn, info, debug                                              | Required  |
| NFR-LOG-03 | Log API requests, GatePass changes, order events (placed, fulfilled), auth events | Required  |
| NFR-LOG-04 | Log rotation (daily files or size-based)                                          | Required  |
| NFR-LOG-05 | **No Sentry, Datadog, or external observability** in Phase 1                      | Mandatory |
| NFR-LOG-06 | Health check endpoint (`/api/health`)                                             | Required  |

### 7.9 Data Retention

| ID         | Requirement      | Target    |
| ---------- | ---------------- | --------- |
| NFR-DTA-01 | Order data       | ≥ 3 years |
| NFR-DTA-02 | GatePass records | ≥ 3 years |
| NFR-DTA-03 | Customer records | ≥ 3 years |
| NFR-DTA-04 | Application logs | ≥ 90 days |

---

## 8. Technical Requirements

### 8.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│         Motake — Single Next.js App (Mobile-First PWA)          │
├─────────────────────────────────────────────────────────────────┤
│  app/ — Route pages only (thin composition layer)                 │
│  Route Groups (RBAC via Supabase Auth + Proxy)                   │
│  ┌──────────────┐  ┌────────────────────┐  ┌─────────────────┐  │
│  │  (auth)/     │  │  (salesman)/       │  │  (admin)/       │  │
│  │  Supabase    │  │  Blinkit catalog   │  │  Catalog CRUD   │  │
│  │              │  │  Cart & orders     │  │  GatePass mgmt  │  │
│  │              │  │  Customers (add)   │  │  Allotment      │  │
│  │              │  │  Dashboard         │  │  GatePass close │  │
│  │              │  │  GatePass (view)   │  │  Orders (view)  │  │
│  │              │  │  Connectivity      │  │  Customers CRUD │  │
│  │              │  │                    │  │  Reports        │  │
│  └──────────────┘  └────────────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  (public)/ — landing page (P2, last priority)               │  │
│  └─────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  features/ — domain modules (components, hooks, actions, utils)   │
│  components/ │ hooks/ │ lib/ (db, supabase, utils)              │
│  PWA: manifest │ service worker (app shell cache)                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / REST
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              API Layer (Next.js Route Handlers + Server Actions)  │
│  Auth(Supabase) │ Orders │ Products │ GatePass │ Customers  │
│  Presence │ Reports │ Salesmen                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Drizzle ORM
               ┌───────────────┴───────────────┐
               ▼                               ▼
        ┌─────────────┐                 ┌─────────────┐
        │  Supabase    │                 │  Cloudflare  │
        │  PostgreSQL  │                 │  R2          │
        └─────────────┘                 └─────────────┘
        ┌─────────────┐
        │  Supabase    │
        │  Auth        │
        └─────────────┘
```

**Single repo. No monorepo. No Redis. No WebSocket. No GPS. No staging environment.**

### 8.2 Project Structure

This is a **single Next.js project** at the repository root — not a monorepo.

```
motake/
├── app/                                  # App Router — pages/routes only (thin)
│   ├── (auth)/                           # Login, OTP, password reset
│   ├── (salesman)/                       # Mobile-first salesman routes
│   │   ├── catalog/
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   └── gatepass/
│   ├── (admin)/                          # Admin ops-console routes
│   │   ├── dashboard/
│   │   ├── catalog/
│   │   ├── gatepass/
│   │   ├── salesmen/
│   │   ├── orders/
│   │   ├── customers/
│   │   └── reports/
│   ├── (public)/                         # Landing (P2)
│   └── api/v1/                           # REST Route Handlers
├── features/                             # Feature modules (domain logic)
│   ├── auth/
│   │   ├── components/                   # Auth-specific UI
│   │   ├── screens/                      # Full-screen auth views
│   │   ├── hooks/
│   │   ├── actions/                      # Server Actions
│   │   └── utils/
│   ├── products/
│   ├── orders/
│   ├── gatepass/
│   ├── customers/
│   ├── salesmen/
│   ├── reports/
│   └── presence/
├── components/                           # Shared/global UI (shadcn, layout, etc.)
├── hooks/                                # Shared React hooks
├── lib/                                  # Shared server/client utilities
│   ├── db/                               # Drizzle ORM (schema, client, migrations)
│   │   ├── schema/
│   │   └── migrations/
│   ├── supabase/                         # Supabase Auth clients
│   └── utils.ts
├── supabase/                             # Supabase CLI config + RLS migrations
├── drizzle.config.ts
├── proxy.ts                              # Supabase session refresh + RBAC
├── public/
│   └── manifest.json                     # PWA manifest
├── package.json
└── tsconfig.json
```

### 8.3 Feature-Based Architecture

| ID         | Requirement                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR-FEAT-01 | **`app/` holds routes only** — page files compose feature screens; no business logic in `app/`                                                      |
| TR-FEAT-02 | **`features/{domain}/` colocates** all domain-specific code: `components/`, `screens/`, `hooks/`, `actions/`, `utils/`                              |
| TR-FEAT-03 | Feature modules map to business domains: `auth`, `products`, `orders`, `gatepass`, `customers`, `salesmen`, `reports`, `presence`                   |
| TR-FEAT-04 | **Shared code lives at root** — cross-feature UI in `components/`, shared hooks in `hooks/`, infra in `lib/`                                        |
| TR-FEAT-05 | Features may import from `components/`, `hooks/`, `lib/` — but **not from other features' internals** (use public exports or shared `lib/` instead) |
| TR-FEAT-06 | Server Actions live in `features/{domain}/actions/`; Route Handlers in `app/api/v1/` may delegate to feature utils                                  |
| TR-FEAT-07 | Drizzle schema and DB client live in `lib/db/` — not inside individual features                                                                     |
| TR-FEAT-08 | Supabase Auth clients live in `lib/supabase/` — feature auth UI/logic in `features/auth/`                                                           |

**Import direction:**

```
app/  →  features/  →  components/ │ hooks/ │ lib/
                ↛  (no cross-feature internal imports)
```

### 8.4 Technology Stack

| Layer              | Technology                           | Rationale                                                        |
| ------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| **Architecture**   | Single Next.js app + feature folders | One repo, one deploy; colocated domain logic                     |
| **Language**       | TypeScript 5.x                       | End-to-end type safety                                           |
| **Framework**      | Next.js 16 (App Router)              | Route groups, Server Actions, PWA                                |
| **Authentication** | **Supabase Auth**                    | Email + password + OTP; `app_metadata.role`                      |
| **PWA**            | Serwist or next-pwa                  | Mobile-first installable app; app shell caching                  |
| **UI**             | shadcn/ui + Tailwind CSS             | Mobile salesman grid + admin management tables                   |
| **State**          | TanStack Query + Zustand             | Server state + local cart persistence                            |
| **Forms**          | React Hook Form + Zod                | Shared validation schemas                                        |
| **Database**       | **Supabase PostgreSQL**              | Managed Postgres; schema via Drizzle, RLS via Supabase           |
| **ORM**            | **Drizzle ORM**                      | Type-safe queries to Supabase Postgres; `drizzle-kit` migrations |
| **File storage**   | **Cloudflare R2**                    | Product images                                                   |
| **Logging**        | **pino** or **winston**              | File-based structured logging                                    |
| **Hosting**        | **Vercel** (production only)         | Direct-to-prod deployment                                        |
| **CI/CD**          | GitHub Actions                       | Lint, typecheck, test, deploy to production                      |

**Explicitly excluded:** Monorepo, Redis, Sentry, staging environment, GPS/maps APIs, WebSocket, Prisma.

### 8.5 Supabase Integration

| ID         | Requirement                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| TR-SUPA-01 | Supabase project with email + password auth enabled                                                  |
| TR-SUPA-02 | OTP via email and phone number enabled                                                               |
| TR-SUPA-03 | User `app_metadata.role` set to `admin` or `salesman` (never `user_metadata`)                        |
| TR-SUPA-04 | `proxy.ts` refreshes session via `getClaims()` and enforces RBAC redirects                           |
| TR-SUPA-05 | Admin creates salesman accounts via Supabase Admin API (`service_role`) + app DB record              |
| TR-SUPA-06 | `@supabase/ssr` + `@supabase/supabase-js` for **Auth only** (not data access)                        |
| TR-SUPA-07 | RLS policies on all public tables; authorization claims from `app_metadata`                          |
| TR-SUPA-08 | RLS policies and auth-related SQL in `supabase/migrations/`; table DDL managed by Drizzle (see §8.9) |

### 8.6 Connectivity & Presence

```
Salesman Browser                         Backend                    Admin View
     │                                      │                            │
     │── navigator.onLine check ───────────►│                            │
     │   (before order/fulfill actions)     │                            │
     │                                      │                            │
     │── POST /presence/heartbeat ─────────►│ (when online, app open)    │
     │                                      │── update last_seen_at ────►│
     │                                      │                            │── online/offline list
     │                                      │                            │
     │── Offline? ──► Block Place Order     │                            │
     │              Block Mark Fulfilled    │                            │
     │              Show offline banner     │                            │
```

| ID         | Requirement                                                                            |
| ---------- | -------------------------------------------------------------------------------------- |
| TR-CONN-01 | Client checks `navigator.onLine` before order submit and fulfill actions               |
| TR-CONN-02 | API returns `503` with clear message if request arrives from stale offline state       |
| TR-CONN-03 | Heartbeat endpoint: `POST /api/v1/presence/heartbeat` — updates salesman online status |
| TR-CONN-04 | Admin loads salesman presence on dashboard page load (no WebSocket)                    |
| TR-CONN-05 | No offline order queue; no IndexedDB sync pipeline                                     |

### 8.7 API Endpoints (Phase 1)

| Method | Endpoint                                | Role     | Description                                                               |
| ------ | --------------------------------------- | -------- | ------------------------------------------------------------------------- |
| POST   | `/api/v1/presence/heartbeat`            | Salesman | Online heartbeat                                                          |
| GET    | `/api/v1/products`                      | Both     | List products (salesman: shoppable; admin: management)                    |
| POST   | `/api/v1/products`                      | Admin    | Create product                                                            |
| PATCH  | `/api/v1/products/:id`                  | Admin    | Update product                                                            |
| POST   | `/api/v1/gatepasses/allot`              | Admin    | Allot quantities → create GatePass                                        |
| GET    | `/api/v1/gatepasses`                    | Both     | List GatePasses (scoped)                                                  |
| PATCH  | `/api/v1/gatepasses/:id/verify`         | Admin    | EOD verify & close                                                        |
| POST   | `/api/v1/customers`                     | Salesman | Create customer                                                           |
| GET    | `/api/v1/customers`                     | Both     | List customers (shared)                                                   |
| PATCH  | `/api/v1/customers/:id`                 | Admin    | Update customer directly                                                  |
| POST   | `/api/v1/customers/:id/update-request`  | Salesman | Submit update request                                                     |
| PATCH  | `/api/v1/customers/update-requests/:id` | Admin    | Approve/reject update request                                             |
| POST   | `/api/v1/orders`                        | Salesman | Create order (online required; sets `placed_at`)                          |
| PATCH  | `/api/v1/orders/:id/fulfill`            | Salesman | Mark order fulfilled. Book Now: creator only. Pre-order: **any salesman** |
| GET    | `/api/v1/orders/due-preorders`          | Salesman | List all pre-orders due today (any creator)                               |
| GET    | `/api/v1/orders`                        | Both     | List orders (scoped)                                                      |
| GET    | `/api/v1/orders/:id`                    | Both     | Order detail                                                              |
| GET    | `/api/v1/salesmen`                      | Admin    | List salesmen + online status                                             |
| POST   | `/api/v1/salesmen`                      | Admin    | Create salesman                                                           |
| GET    | `/api/v1/salesmen/:id/history`          | Admin    | Sales history                                                             |
| GET    | `/api/v1/reports/daily`                 | Admin    | Daily KPIs                                                                |
| GET    | `/api/v1/reports/monthly`               | Admin    | Monthly KPIs                                                              |
| GET    | `/api/health`                           | Public   | Health check                                                              |

### 8.8 Database (Supabase PostgreSQL)

| ID       | Requirement                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| TR-DB-01 | Supabase PostgreSQL as sole database                                                                                   |
| TR-DB-02 | All tables: `created_at`, `updated_at` timestamps                                                                      |
| TR-DB-03 | Soft delete on users, products, customers                                                                              |
| TR-DB-04 | FK constraints enforced                                                                                                |
| TR-DB-05 | Indexes: `orders(salesman_id, placed_at)`, `orders(fulfilled_at)`, `gatepasses(salesman_id, date)`, `customers(phone)` |
| TR-DB-06 | Schema migrations generated by **drizzle-kit**; SQL applied via Supabase CLI (`supabase db push`)                      |
| TR-DB-07 | Seed script for dev with sample products, salesmen, gatepass allotments                                                |
| TR-DB-08 | RLS enabled on every table in `public` schema                                                                          |
| TR-DB-09 | All application database reads/writes go through **Drizzle ORM** — no Supabase Data API for app queries                |
| TR-DB-10 | Drizzle connects via `DATABASE_URL` (Supabase Postgres connection string)                                              |

### 8.9 Drizzle ORM Integration

| ID            | Requirement                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| TR-DRIZZLE-01 | **Drizzle ORM** is the sole data-access layer for Route Handlers, Server Actions, and background jobs |
| TR-DRIZZLE-02 | Table schemas defined in `lib/db/schema/` using Drizzle `pgTable` definitions                         |
| TR-DRIZZLE-03 | Shared Drizzle client exported from `lib/db/`; instantiated once per request on the server            |
| TR-DRIZZLE-04 | **drizzle-kit** used to generate SQL migrations from schema changes                                   |
| TR-DRIZZLE-05 | Generated migration SQL stored in `lib/db/migrations/` and applied to Supabase PostgreSQL             |
| TR-DRIZZLE-06 | Drizzle schema and Supabase RLS policies kept in sync — RLS defined in `supabase/migrations/`         |
| TR-DRIZZLE-07 | Application-level RBAC enforced in API routes and Server Actions; RLS provides defense-in-depth       |
| TR-DRIZZLE-08 | Zod schemas for API validation derived from or aligned with Drizzle schema types                      |
| TR-DRIZZLE-09 | No Prisma — Drizzle is the only ORM in Phase 1                                                        |

### 8.10 Authorization Matrix

| Resource               | Salesman                                           | Admin                          |
| ---------------------- | -------------------------------------------------- | ------------------------------ |
| Own profile            | Read                                               | —                              |
| All salesmen           | —                                                  | CRUD                           |
| Products (catalog)     | Read (Blinkit UI)                                  | CRUD (management UI)           |
| GatePass allotment     | —                                                  | Create, Read, Verify, Close    |
| Customers              | Create, Read; Update via request                   | Full CRUD + approve requests   |
| Own orders (Book Now)  | Create, Read, Fulfill (creator only), Cancel (own) | —                              |
| Pre-orders (all due)   | Read, **Fulfill (any salesman)**                   | Read only                      |
| All orders             | —                                                  | Read only (no status override) |
| Own GatePass           | Read                                               | —                              |
| All GatePasses         | —                                                  | Read, Verify, Close            |
| Reports/KPIs           | Own summary                                        | Full access                    |
| Salesman online status | Heartbeat (own)                                    | Read (all)                     |

### 8.11 DevOps

| ID        | Requirement                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| TR-DEV-01 | **Production only** — no staging environment in Phase 1                             |
| TR-DEV-02 | Environment: `development` (local), `production` (Vercel + Supabase prod)           |
| TR-DEV-03 | Local dev uses Supabase local stack (`supabase start`) or linked remote dev project |
| TR-DEV-04 | CI: lint → typecheck → test → build on PR                                           |
| TR-DEV-05 | CD: merge to `main` → deploy to production                                          |
| TR-DEV-06 | Secrets via Vercel env vars and Supabase dashboard                                  |
| TR-DEV-07 | Production URL: `app.motake.com`                                                    |
| TR-DEV-08 | Database migrations (Drizzle + Supabase) run as part of production deployment       |

### 8.12 Testing Requirements

| ID        | Requirement                                                                               | Priority |
| --------- | ----------------------------------------------------------------------------------------- | -------- |
| TR-TST-01 | Unit tests: GatePass logic (allotment, EOD resolution, Book Now deductions)               | P0       |
| TR-TST-02 | Unit tests: order lifecycle (`placed_at`, `fulfilled_at`)                                 | P0       |
| TR-TST-03 | Integration tests: Book Now gatepass deduct, pre-order no gatepass impact, GatePass close | P0       |
| TR-TST-04 | RBAC tests: role isolation via middleware                                                 | P0       |
| TR-TST-05 | E2E: salesman place order → mark fulfilled → admin sees timestamps                        | P1       |
| TR-TST-06 | Manual UAT checklist                                                                      | P0       |

---

## 9. Data Model (High Level)

### 9.1 Entity Relationships

```
┌──────────┐     ┌──────────┐
│  Admin   │     │ Salesman │
└──────────┘     └────┬─────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌─────────┐ ┌──────────┐
    │ GatePass │ │  Order  │ │ Customer │
    └────┬─────┘ └────┬────┘ │ (shared) │
         │            │      └──────────┘
         ▼            ▼
  ┌────────────┐ ┌──────────┐
  │ GatePass   │ │  Order   │
  │ Line Item  │ │ Line Item│
  └────────────┘ └────┬─────┘
                      ▼
              ┌───────────────┐
              │Product Variety│────► Product (no categories, no prices)
              └───────────────┘
```

### 9.2 Key Tables

| Table               | Key Fields                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`          | id (FK → auth.users), role, phone, email, name, status                                                                                         |
| `salesmen`          | id (FK → profiles), salesman_code                                                                                                              |
| `products`          | id, name, description, image_url, status                                                                                                       |
| `product_varieties` | id, product_id, sku, name, unit, status                                                                                                        |
| `customers`         | id, shop_name, contact_name, phone, address, notes, created_by                                                                                 |
| `orders`            | id, order_code, type, status, salesman_id, customer_id, total_quantity, scheduled_date, placed_at, fulfilled_at, fulfilled_by, idempotency_key |
| `order_items`       | id, order_id, variety_id, quantity                                                                                                             |
| `gatepasses`        | id, salesman_id, business_date, status, issued_by, closed_by, closed_at, has_discrepancy, notes                                                |
| `gatepass_items`    | id, gatepass_id, variety_id, issued_qty, sold_qty, returned_qty, available_qty (generated)                                                     |
| `audit_logs`        | id, actor_id, action, entity_type, entity_id, payload, created_at                                                                              |

**Phase 1 exclusions (data model):** No price or monetary fields anywhere. No `categories` table — products are a flat catalog filtered by name search only. No `customer_update_requests` (admin direct CRUD). No presence/online-status fields on salesmen.

---

## 10. Key User Flows

### 10.1 Login (Supabase Auth) & Role Routing

```
User → Supabase sign-in (email/password or OTP) → proxy.ts checks app_metadata.role
  → admin  → /admin/dashboard
  → salesman → /salesman/dashboard
```

### 10.2 Admin Allots GatePass

```
Admin                          System
  │                              │
  │── Select salesman SM-01      │
  │── Assign: 50 milk, 50 ghee   │
  │── Confirm ──────────────────►│
  │                              │── Create GatePass (no pool check)
  │                              │── issued_qty set; available_qty = issued_qty
  │◄── Allotment summary ────────│
```

### 10.3 Salesman Places Pre-order (No GatePass Impact)

```
Salesman                         System
  │                                │
  │── Add 5 milk to cart           │
  │── Select Pre-order ───────────►│
  │                                │── NO GatePass change
  │                                │── Create order record; placed_at = now()
  │                                │── scheduled_date = tomorrow
  │◄── Confirmation ───────────────│
```

### 10.4 Salesman Places Book Now Order (Online)

```
Salesman                         System
  │                                │
  │── Browse Blinkit catalog ─────►│
  │── Add 10 milk to cart          │
  │── Select customer (dropdown)   │
  │── Book Now ───────────────────►│
  │                                │── Check: available_qty ≥ 10 ✓
  │                                │── sold_qty += 10, available_qty -= 10
  │                                │── Create order; set placed_at = now()
  │◄── Confirmation ───────────────│
```

### 10.5 Salesman Marks Order Fulfilled

```
Salesman                         System
  │                                │
  │── Deliver product to customer  │
  │── Open order detail            │
  │── Mark as Fulfilled ──────────►│
  │                                │── Validate: online, pre-order due, not already fulfilled
  │                                │── Set fulfilled_at = now()
  │                                │── Set fulfilled_by = current salesman (if ≠ creator)
  │                                │── Set status = fulfilled
  │◄── Confirmation ───────────────│
```

### 10.6 Offline Block Flow

```
Salesman (offline)               UI
  │                                │
  │── Browse catalog (cached)      │
  │── Build cart (localStorage)    │
  │── Tap Place Order ────────────►│── Button disabled
  │                                │── Banner: "You are offline. Connect to place orders."
  │── Network restored ───────────►│── Banner clears; buttons enabled
  │── Place Order (online) ───────►│── Success; placed_at recorded
```

### 10.6 EOD GatePass Resolution

```
Admin                            System
  │                                │
  │── Open GatePass for SM-01 ────►│
  │◄── issued: 50, sold: 10,      │
  │    available: 40             │
  │── Enter returned_qty: 40 ─────►│
  │── Close GatePass ─────────────►│
  │                                │── Pre-orders NOT in GatePass math
  │                                │── Flag if returned ≠ available
  │                                │── GatePass → closed
```

### 10.7 Customer Update Request

```
Salesman                         Admin                        System
  │                                │                            │
  │── View customer ───────────────┼───────────────────────────►│
  │── Request update (new phone) ──┼───────────────────────────►│
  │                                │                            │── Status: pending
  │                                │── Review request ─────────►│
  │                                │── Approve ────────────────►│
  │                                │                            │── Apply new phone
  │◄── Update applied ─────────────┼────────────────────────────│
```

### 10.8 Any Salesman Fulfills Pre-order

```
Salesman A (creator)             Salesman B (any)              System
  │                                │                            │
  │── Day 0: Pre-order created ────┼───────────────────────────►│
  │                                │                            │── salesman_id = A
  │── Day 1: A unavailable         │                            │
  │                                │── Opens Due Pre-orders ───►│
  │                                │── Mark Fulfilled ─────────►│
  │                                │                            │── fulfilled_at = now()
  │                                │                            │── fulfilled_by = B
  │                                │                            │── status = fulfilled
  │                                │                            │── salesman_id still = A
  │                                │◄── Confirmation ───────────│
```

---

## 11. KPIs & Analytics Definitions

| KPI                            | Definition                                 | Formula                                                    | Granularity |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------------- | ----------- |
| Total Allotted Today           | Quantities allotted to all salesmen        | `SUM(gatepass_items.issued_qty)` for today                 | Daily       |
| Total Sold Today (Book Now)    | Book Now orders confirmed today            | `COUNT(orders) WHERE type=book_now AND placed_at=today`    | Daily       |
| Total Fulfilled Today          | Orders delivered today                     | `COUNT(orders) WHERE fulfilled_at=today`                   | Daily       |
| Avg Time to Fulfill            | Placed to fulfilled duration               | `AVG(fulfilled_at − placed_at)`                            | Daily       |
| Total Pre-ordered Today        | Pre-orders placed today                    | `SUM(order_items.qty) WHERE type=pre_order AND date=today` | Daily       |
| Pre-orders Pending Fulfillment | Pre-orders due next day                    | `COUNT(orders) WHERE type=pre_order AND status=scheduled`  | Daily       |
| Total Returned Today           | Unsold stock returned at EOD               | `SUM(gatepass_items.returned_qty)` for closed GatePasses   | Daily       |
| Orders per Salesman (Daily)    | Per-salesman order count                   | `COUNT(orders) GROUP BY salesman_id`                       | Daily       |
| Monthly Order Count            | Total orders in month                      | `COUNT(orders) WHERE month=X`                              | Monthly     |
| GatePass Closure Rate          | % closed same day                          | `closed / issued × 100`                                    | Daily       |
| Salesmen Online                | Salesmen with heartbeat in last 2 min      | Real-time count                                            | Real-time   |
| Stock Discrepancy Count        | GatePasses closed with flagged discrepancy | `COUNT(gatepasses) WHERE has_discrepancy=true`             | Daily       |

---

## 12. Assumptions & Dependencies

### 12.1 Assumptions

| \#  | Assumption                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- |
| A1  | Salesmen use smartphones with mobile data; access via PWA (no native app)                       |
| A2  | Business day: \~5 AM – 9 PM IST                                                                 |
| A3  | Pre-order fulfillment is T+1 (next day)                                                         |
| A4  | Products and pricing managed by admin only                                                      |
| A5  | Payment collected offline (cash/UPI on ground) — no payment gateway                             |
| A6  | Customers are shared globally; not owned by individual salesmen                                 |
| A7  | Pre-orders permanently attributed to creating salesman                                          |
| A8  | Any salesman may fulfill and close a due pre-order; order KPIs stay under the creating salesman |
| A9  | No real-time GPS tracking in Phase 1                                                            |
| A10 | No staging environment — test locally, deploy to production                                     |
| A11 | Initial catalog: ≤ 100 products / 500 varieties                                                 |
| A12 | Pre-orders never affect GatePass quantities — order records only                                |
| A13 | No central warehouse inventory tracked in system                                                |

### 12.2 Dependencies

| \#  | Dependency                                                    | Owner            | Needed By |
| --- | ------------------------------------------------------------- | ---------------- | --------- |
| D1  | Product catalog data (names, varieties, prices, images)       | Motake ops       | Day 3     |
| D2  | Salesman roster with emails/phones                            | Motake HR/ops    | Day 2     |
| D3  | Supabase project setup (Auth, API keys, OTP config)           | Dev team         | Day 1     |
| D4  | Supabase PostgreSQL + Drizzle ORM setup + migrations pipeline | Dev team         | Day 1     |
| D5  | Cloudflare R2 bucket for product images                       | Dev team         | Day 2     |
| D6  | Domain `app.motake.com` + Vercel project                      | Motake IT / Dev  | Day 10    |
| D7  | Motake branding (logo, colors, PWA icons)                     | Motake marketing | Day 2     |

---

## 13. Out of Scope (Phase 1)

| Item                                 | Rationale                                     | Target       |
| ------------------------------------ | --------------------------------------------- | ------------ |
| Monorepo / multi-package workspace   | Single Next.js app at repo root               | N/A          |
| Native mobile apps                   | PWA sufficient                                | Phase 2      |
| Real-time GPS / location tracking    | Explicitly removed                            | Phase 2+     |
| Redis caching                        | Not needed yet                                | Phase 2      |
| Sentry / external observability      | File logging only                             | Phase 2      |
| Staging environment                  | Direct to production                          | Phase 2      |
| Order reassignment / status override | Pre-orders stay with creator                  | N/A          |
| Route management                     | Removed in v1.1                               | Phase 2      |
| Super Admin role                     | Admin + Salesman only                         | N/A          |
| Customer login / portal              | Data entity only                              | Phase 2+     |
| Payment gateway                      | Cash on delivery                              | Phase 2      |
| Warehouse / central stock tracking   | No inventory pool in system                   | Phase 2+     |
| Company landing website              | P2 last priority                              | Phase 1 tail |
| Offline order queue / sync           | Orders blocked when offline; no sync pipeline | N/A          |
| WebSocket / real-time push           | Polling/page-load sufficient                  | Phase 2      |

---

## 14. Milestones & Delivery Plan (15 Days)

| Day       | Milestone                | Deliverables                                                                                                                                                                              |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1–2**   | Foundation               | Single Next.js app scaffold, `features/` + `lib/db/` structure, Supabase Auth + RBAC proxy, Drizzle schema + migrations, PWA manifest + service worker, pino logging, CI/CD to production |
| **3–4**   | Catalog + Allotment      | Admin catalog CRUD, GatePass allotment, salesman Blinkit-style catalog                                                                                                                    |
| **5–6**   | Orders + GatePass        | Cart, Book Now (GatePass deduct) + Pre-order (record only), order API                                                                                                                     |
| **7–8**   | GatePass EOD + Customers | EOD close (Book Now + returns), shared customer CRUD, update request flow                                                                                                                 |
| **9–10**  | Dashboards               | Salesman dashboard, admin allotment/GatePass/pre-order dashboard, orders tables                                                                                                           |
| **11–12** | Presence + polish        | Online/offline heartbeat, connectivity blocking, order fulfill flow, UI polish                                                                                                            |
| **13**    | Salesman mgmt + reports  | Salesman management, sales history, daily/monthly reports                                                                                                                                 |
| **14**    | QA + UAT                 | GatePass + pre-order edge cases, order lifecycle testing, RBAC testing, UAT with Motake ops                                                                                               |
| **15**    | Production launch        | Deploy to `app.motake.com`, admin training, go-live                                                                                                                                       |

**P2 (post-launch):** Company landing page under `(public)/`.

---

## 15. Open Questions

| \#   | Question                                                               | Impact                               | Decision By |
| ---- | ---------------------------------------------------------------------- | ------------------------------------ | ----------- |
| OQ-1 | Pre-order T+1: calendar day or next business day?                      | Scheduling logic                     | Day 2       |
| OQ-2 | GatePass discrepancy: block closure or allow with flag?                | EOD UX                               | Day 7       |
| OQ-3 | Block new-day allotment if previous GatePass unclosed?                 | GatePass policy                      | Day 5       |
| OQ-4 | Customer update: salesman request + admin approve, or admin-only edit? | **Likely: both** (per clarification) | Day 4       |
| OQ-5 | Maximum allotment per salesman per product?                            | Validation                           | Day 3       |

---

## 16. Acceptance Criteria (Phase 1 Sign-off)

### Salesman Portal (`/salesman/*`)

- [ ] Login via Supabase Auth (email + password or OTP)

- [ ] Blinkit-style product catalog with add-to-cart

- [ ] Catalog shows GatePass available quantity per product

- [ ] Can add new customer (visible to all salesmen)

- [ ] Can select any customer from shared dropdown on order screen

- [ ] Can submit customer update request (not direct edit)

- [ ] Can place Book Now order when **online** (records `placed_at`)

- [ ] Can place Pre-order when **online** — **no GatePass deduction** (records order only)

- [ ] Can mark own **Book Now** orders as fulfilled

- [ ] Can view **Due Pre-orders** (all salesmen) and mark any due pre-order as fulfilled

- [ ] Pre-order fulfillment records `fulfilled_by` when completed by a different salesman

- [ ] Order placement **blocked when offline** with clear banner

- [ ] Dashboard shows today's orders and pre-orders with `placed_at` and `fulfilled_at`

- [ ] PWA installable on mobile (Android Chrome, iOS Safari)

- [ ] Salesman UI usable on 360px–428px viewports without horizontal scroll

### Admin Portal (`/admin/*`)

- [ ] Login via Supabase Auth (email + password or OTP)

- [ ] Product catalog management UI (CRUD — not shopping interface)

- [ ] GatePass allotment to salesmen (direct assignment — no central stock pool)

- [ ] Allotment dashboard shows per-salesman breakdown

- [ ] EOD GatePass verification and closure (Book Now sold + returns only)

- [ ] Dashboard shows: GatePass sold today, pre-orders pending (from orders), returns

- [ ] Full CRUD on customers + approve/reject update requests

- [ ] View orders with `placed_at` and `fulfilled_at` (read-only, no status override)

- [ ] View salesman online/offline status with reasons

- [ ] Daily and monthly reports

### GatePass & Order Integrity

- [ ] Admin allots GatePass directly — no central stock pool exists

- [ ] Book Now blocked when GatePass `available_qty` insufficient

- [ ] Pre-order never changes GatePass quantities (order record only)

- [ ] EOD GatePass reconciles Book Now sold + returns — pre-orders excluded

- [ ] Discrepancies flagged on GatePass close

- [ ] Order blocked when offline; no offline sync queue exists

### System

- [ ] RBAC enforced: salesman cannot access `/admin/*`

- [ ] No order reassignment capability exists

- [ ] Pre-orders attributed to creating salesman; any salesman can fulfill due pre-orders

- [ ] File logging operational (pino/winston)

- [ ] Deployed to production at `app.motake.com`

- [ ] No staging, no Redis, no GPS, no Sentry

---

## Appendix A: Change Log

| Version | Changes                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0    | Initial PRD: dual apps, GPS, routes, per-salesman customers                                                                                                                                       |
| v1.1    | Single app + RBAC, PWA, no routes, shared customers (per-salesman), no GPS mentioned yet                                                                                                          |
| v1.2    | Blinkit vs catalog mgmt UI split; Clerk auth; shared customers; three-tier stock model; no order reassignment; offline-first orders; file logging; Neon + R2; GPS removed; production-only DevOps |
| v1.3    | Order lifecycle tracking (`placed_at`, `fulfilled_at`); offline order sync removed — orders blocked when offline; presence/heartbeat only; fulfill API added                                      |
| v1.4    | Any salesman may mark due pre-orders as fulfilled; `fulfilled_by` tracked; Due Pre-orders view                                                                                                    |
| v1.5    | No central stock; GatePass direct allotment only; Pre-orders are order records with zero GatePass impact; Book Now deducts GatePass only                                                          |
| v1.6    | Migrated auth from Clerk → Supabase Auth; database from Neon → Supabase PostgreSQL; RLS required; roles in `app_metadata`; Next.js 16 `proxy.ts` for session + RBAC                               |
| v1.7    | Drizzle ORM as sole data-access layer; Supabase client for Auth only; drizzle-kit migrations; Prisma excluded                                                                                     |
| v1.8    | Single Next.js project (no monorepo); feature-based folder architecture (`app/` + `features/`); mobile-first PWA; Drizzle in `lib/db/`                                                            |
| v1.9    | **This version.** DB: no price/monetary fields; no categories table — quantity and status tracking only                                                                                           |

---

_End of PRD v1.9_
