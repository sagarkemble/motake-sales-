# Motake — Developer Scope Document

**Purpose:** This document lists exactly what you need to build — pages, features, and backend work — for the Admin and Salesman sides of the Motake app.

---

## What Is Already Done vs What You Build

Roughly **30% of the work is already complete**. You are **not** starting from scratch. Your job is to **implement the features** listed in this document on top of the foundation provided below.

### Provided to you (already done)

| Area | What you receive |
| --- | --- |
| **Requirements** | Full requirement gathering and analysis — what to build and why |
| **UI / UX design** | High-level user flows and screen design direction |
| **Reference images** | UI mockups for admin and salesman screens (shared separately) |
| **Database design** | Schema and table structure — shared with you before development |
| **API routes** | High-level API route list and contracts — shared with you |
| **Component structure** | Which components to build vs which shared/common components to reuse |
| **Project setup** | Base monorepo with **Turborepo** already configured |
| **TypeScript** | TS config and workspace setup inside the monorepo |
| **Frontend base** | Next.js app scaffold, routing structure, auth hooks, layout shell |
| **Backend base** | API layer scaffold, server setup |
| **Drizzle ORM** | Already configured with database connection and migrations folder |
| **Shared packages** | Common UI components, types, and utilities (structure shared with you) |

### Your responsibility (what you implement)

| Area | What you build |
| --- | --- |
| **Feature pages** | All admin and salesman pages listed in this document |
| **Feature logic** | Business rules — GatePass, orders, pre-orders, customer flows |
| **UI implementation** | Build screens to match reference images and flows |
| **API implementation** | Wire up the provided route structure with real logic |
| **Forms & validation** | Connect UI to backend with Zod validation |
| **Integration** | Connect frontend ↔ backend ↔ database for each task |

**In short:** Architecture, design, database, API outline, and project scaffold are provided. **You implement the features.**

**Full reference:** Will be provided.

**UI reference:** Screen reference images will be provided.

---

## Project Summary

Motake is a **single Next.js mobile-first PWA** for field sales operations.

| Role | Who | What they do |
| --- | --- | --- |
| **Admin** | Operations manager | Manage products, salesmen, customers, GatePass, orders, reports |
| **Salesman** | Field sales rep | Browse products, place orders, manage customers, view GatePass |

**Auth:** Supabase Auth (email + password + OTP). Role stored in `app_metadata.role` (`admin` or `salesman`).

**Tech:** Next.js 15, TypeScript, Supabase PostgreSQL, Tailwind + shadcn/ui, TanStack Query, Zod validation.

---

## Critical Business Rules (Read First)

These rules affect almost every page you build:

| Topic | Rule |
| --- | --- |
| **Book Now (Order)** | Same-day delivery. **Deducts** from salesman's daily GatePass immediately. |
| **Pre-Order** | Next-day delivery. **Does NOT touch GatePass** — only creates an order record. |
| **GatePass** | Admin allots product quantities to each salesman each morning. Tracks issued / sold / available / returned. |
| **Customers** | Shared across all salesmen. Salesman can add new customers. Admin has full CRUD on all customers. |
| **Admin orders** | Admin can **view only** — cannot change order status or reassign. |

---

# ADMIN — 4 Tasks

---

## Admin Task 1: Products Page

**Route:** `/admin/catalog` (or similar)

**Goal:** Admin manages the product catalog. This is a **management UI** (tables/forms) — not a shopping UI.

### What to build on this page

| Feature | Details |
| --- | --- |
| **List products** | Table with name, category, status, image thumbnail. Search and filter. |
| **Create product** | Form: name, description, category, image upload (R2), status (active/inactive). |
| **Edit product** | Update all product fields. |
| **Delete / deactivate** | Soft delete (mark inactive). |
| **Manage varieties** | Each product has varieties (SKU, name, unit). CRUD per variety. |
| **Mobile-friendly UI** | Responsive layout — usable on tablet and phone. |

### Backend work

- CRUD APIs for `products` and `product_varieties`
- Image upload to Cloudflare R2
- Zod validation on all inputs
- Admin-only access (RBAC)

---

## Admin Task 2: Salesman Page

**Route:** `/admin/salesmen` (list) and `/admin/salesmen/[id]` (detail)

**Goal:** Admin manages salesmen, views their sales history, allots GatePass, and finalises GatePass after physical stock check.

### Salesman List Page

| Feature | Details |
| --- | --- |
| **List all salesmen** | ID, name, phone, status, GatePass status |
| **Create salesman** | Create Supabase Auth account + app DB record. Assign role `salesman`. |
| **Edit / deactivate** | Update profile, deactivate account |

### Salesman Detail Page


#### Tab 1: Sales (default — open first)

| Section | What to show |
| --- | --- |
| **Salesman info** | Name, ID, phone, status |
| **4 KPI cards** | e.g. Total orders today, Total sales value, Pre-orders pending, GatePass sold today |
| **Sales graph** | Chart of sales over time (daily/weekly) |
| **Recent orders table** | Columns: Customer name, Booking type (Order / Pre-Order), Total quantity, Booking date |
| **Order detail** | Tap/click row → open bottom sheet or modal with full item list (product + quantity), customer details, timestamps |

| Button | Action |
| --- | --- |
| **View Full Sales Analytics** | **New Page** - Navigate to full sales history for this salesman (date range filter) |

**Sales history (full view):** Day-wise breakdown — date, allotted, sold, pre-ordered, returned, GatePass status. Filter by date range.

#### Tab 2: GatePass

| Feature | Details |
| --- | --- |
| **Today's GatePass only** | Show current day's allotment — no GatePass history on this tab |
| **Allot items** | Admin assigns product + quantity to this salesman for today. Creates GatePass with `issued_qty` per item. |
| **Live status per product** | Issued qty, sold qty (Book Now only), available qty, returned qty |
| **Enter returned qty** | At end of day, admin enters physical returned quantity per product |
| **Discrepancy flag** | If returned ≠ available, show warning |
| **Finalise button** | Closes GatePass after physical verification. GatePass becomes read-only. |

| Button | Action |
| --- | --- |
| **Finalise** | Admin confirms physical stock check → close GatePass for the day |

**GatePass states:** `not_issued` → `active` → `pending_verification` → `closed`

**Important:** Pre-orders are **never** part of GatePass math. GatePass tracks Book Now sales only.

### Backend work

- CRUD APIs for salesmen (linked to Supabase Auth)
- GatePass allotment API (`POST /gatepasses/allot`)
- GatePass verify/close API (`PATCH /gatepasses/:id/verify`)
- Sales history and KPI aggregation APIs

---

## Admin Task 3: Orders & Dashboard

**Routes:** `/admin/dashboard` and `/admin/orders`

**Goal:** Admin sees business overview on dashboard and manages order visibility for planning next-day delivery.

### Admin Dashboard

| Widget | What to show |
| --- | --- |
| **KPI cards** | Total orders today, pre-orders pending, total sales value, GatePass overview |
| **GatePass allotment matrix** | Salesman × product grid with issued quantities |
| **GatePass status** | Per salesman: issued / sold / available / returned (Book Now only) |
| **EOD GatePass panel** | Sold today, returned, discrepancies |
| **Pre-orders placed today** | List from orders table (not GatePass) |
| **Pre-orders due tomorrow** | Commitments by product and salesman — for next-day prep |
| **Daily order count** | Per salesman |
| **Monthly order count** | Aggregate + per salesman |
| **Quick actions** | Links to Catalog, GatePass, Salesmen, Orders, Customers, Reports |
| **Date filter** | Default: today. Month selector for reports |

### Orders Page

**Route:** `/admin/orders`

**Layout:** Two tabs — **Pre-Orders** and **Orders**.

**Admin cannot:** Change order status, reassign orders, or override salesman actions. View only.

---

#### Tab 1: Pre-Orders

Lists **all pre-orders** in a table (rows and columns). Admin uses this to plan next-day delivery.

**List table columns (each row = one pre-order):**

| Column | Details |
| --- | --- |
| **Order ID** | Unique order identifier |
| **Customer** | Customer name + contact (shop name, phone) |
| **Products & quantities** | Each product with its quantity (e.g. Milk × 5, Ghee × 3) |
| **Total quantity** | Sum of all item quantities in the order |
| **Status** | e.g. confirmed, scheduled, due, fulfilled, cancelled |
| **Booking date** | When the pre-order was placed (`placed_at`) |
| **Scheduled delivery date** | Next-day delivery date |

**Click any row** → open detail view (modal, bottom sheet, or detail page) showing:

| Field | Details |
| --- | --- |
| **Order ID** | Full order identifier |
| **Status** | Current order status |
| **Salesman (creator)** | Salesman who placed the pre-order — permanent for reporting |
| **Customer** | Full customer details — shop name, contact name, phone, address |
| **Order items** | Product name, variety, quantity, unit price, line total |
| **Total quantity** | Sum of all product quantities |
| **Booking date** | `placed_at` — when pre-order was captured |
| **Scheduled delivery date** | When delivery is due |
| **Delivered date** | `fulfilled_at` — when order was completed (if fulfilled) |
| **Delivered by** | Salesman who fulfilled/completed the order (`fulfilled_by`; may differ from creator) |

**Filters (optional):** Date, status, salesman, customer phone/search.

---

#### Tab 2: Book Now (Instant Orders)

Lists **all Book Now / instant orders** — same-day orders that deducted from GatePass. Shows customer-wise order history.

**List table columns (each row = one Book Now order):**

| Column | Details |
| --- | --- |
| **Order ID** | Unique order identifier |
| **Customer** | Customer name + contact |
| **Products & quantities** | Each product with its quantity |
| **Total quantity** | Sum of all item quantities |
| **Status** | e.g. confirmed, fulfilled, cancelled |
| **Salesman** | Salesman who placed the order |
| **Order date** | `placed_at` |
| **Delivered date** | `fulfilled_at` (if completed) |

**Click any row** → open detail view showing:

| Field | Details |
| --- | --- |
| **Order ID** | Full order identifier |
| **Status** | Current order status |
| **Salesman** | Salesman who sold the order |
| **Customer** | Full customer details — shop name, contact name, phone, address |
| **Order items** | Product name, variety, quantity, unit price, line total |
| **Total quantity** | Sum of all product quantities |
| **Order date** | `placed_at` |
| **Delivered date** | `fulfilled_at` — when order was fulfilled |
| **Delivered by** | Salesman who marked the order fulfilled |
| **Order value** | Total amount |

**Filters (optional):** Date range, salesman, status, customer phone/search.

**Note:** Past order history is visible here — admin can browse all completed and active Book Now orders, grouped/listable by customer via search or filter.

---

### Backend work

- Dashboard KPI aggregation APIs (`/reports/daily`, `/reports/monthly`)
- `GET /orders?type=pre_order` — all pre-orders for Tab 1
- `GET /orders?type=book_now` — all instant orders for Tab 2
- `GET /orders/:id` — full order detail (items, customer, salesman, `fulfilled_by`, timestamps)
- GatePass overview APIs
- Pre-order due-tomorrow query (for dashboard widget)

---

## Admin Task 4: Customers Page

**Routes:** `/admin/customers` (list) and `/admin/customers/[id]` (detail)

**Goal:** Admin manages the shared customer database — add, list, view detail, update, and see each customer's order history.

**Note:** Customers are **shared across all salesmen**. Any salesman can select any customer when placing an order. Admin has full edit access; salesmen can only add new customers (not edit existing ones).

### Customer List Page

| Feature | Details |
| --- | --- |
| **List all customers** | Table: shop name, contact name, phone, address, status. Search and filter by name or phone. |
| **Add customer** | Form: shop name, contact name, phone, shop address, notes (optional). |
| **Click row** | Navigate to customer detail page |

### Customer Detail Page

| Section | What to show |
| --- | --- |
| **Customer info** | Shop name, contact name, phone, address, notes, created date |
| **Edit customer** | Admin can update all customer fields directly |
| **Deactivate / delete** | Soft delete or mark inactive |
| **Order history** | All past orders for this customer — Book Now and Pre-Orders |

**Order history table columns:**

| Column | Details |
| --- | --- |
| **Order ID** | Unique identifier |
| **Order type** | Book Now / Pre-Order |
| **Products & quantities** | Items with qty |
| **Total quantity** | Sum of all items |
| **Status** | Order status |
| **Salesman** | Who placed the order |
| **Order date** | `placed_at` |
| **Delivered date** | `fulfilled_at` (if completed) |

**Click any order row** → detail modal/page with full order info (items, salesman, delivered by, timestamps).

### Backend work

- `GET /customers` — list with search/filter
- `POST /customers` — create customer (admin)
- `GET /customers/:id` — customer detail + order history
- `PATCH /customers/:id` — update customer
- Admin-only access (RBAC)

---

# SALESMAN — 4 Tasks

---

## Salesman Task 1: Products Page

**Route:** `/salesman/catalog`

**Goal:** Blinkit-style product browsing for placing orders.

### What to build on this page

| Feature | Details |
| --- | --- |
| **Product grid** | Image, name, price, variety selector |
| **Available quantity** | Show GatePass `available_qty` for Book Now. Badge or disable when zero. |
| **Add to cart** | Button per product — adds selected variety + quantity to cart |
| **Search / filter** | By product name and category |
| **Pagination** | Infinite scroll or paginated grid (500+ varieties supported) |

**Note:** Pre-orders are not limited by GatePass quantity — salesman can pre-order any catalog product.

### Backend work

- `GET /products` — list with varieties and GatePass available qty for logged-in salesman
- Cart stored client-side (localStorage) until checkout

---

## Salesman Task 2: Cart & Order Page

**Route:** `/salesman/cart` (and checkout flow)

**Goal:** 3-step order process — cart → customer → order type → confirm.

### Step 1: Review cart

| Feature | Details |
| --- | --- |
| **Cart items** | Product name, variety, quantity, unit price, line total |
| **Adjust quantity** | Increase/decrease per item |
| **Remove item** | Remove from cart |
| **Subtotal / total** | Price summary |

### Step 2: Customer details

| Feature | Details |
| --- | --- |
| **Select existing customer** | Searchable dropdown — shared across all salesmen |
| **Add new customer** | Inline form: shop name, contact name, phone, address. Visible to all salesmen immediately. |

### Step 3: Order type & confirm

| Feature | Details |
| --- | --- |
| **Order type selector** | **Order (Book Now)** — same day, deducts GatePass. **Pre-Order** — next day, no GatePass change. |
| **Validation** | Book Now blocked if qty > GatePass available. Pre-order always allowed. |
| **Confirmation screen** | Order ID, type, items, customer, `placed_at` timestamp |

### Backend work

- `POST /orders` — create order, deduct GatePass for Book Now only
- `POST /customers` — create customer
- `GET /customers` — searchable list

---

## Salesman Task 3: GatePass Page

**Route:** `/salesman/gatepass`

**Goal:** Salesman sees today's GatePass and past GatePass history.

### Today's GatePass section

| Field | Description |
| --- | --- |
| **Date** | Today's business date |
| **Total items allotted** | Sum of `issued_qty` |
| **Items sold** | Sum of `sold_qty` (Book Now only) |
| **Items remaining** | Sum of `available_qty` |
| **Per product breakdown** | Product name, issued, sold, available |

### GatePass History section

| Feature | Details |
| --- | --- |
| **Past GatePasses list** | Date, total allotted, total sold, status (closed) |
| **Detail view** | Tap any history row → see full item breakdown for that day |

**Note:** Pre-order quantities do **not** appear in GatePass.

### Backend work

- `GET /gatepasses` — today's GatePass + history for logged-in salesman
- Read-only for salesman (admin manages allotment and closure)

---

## Salesman Task 4: Pre-Orders Page

**Route:** `/salesman/pre-orders` (or tab on dashboard)

**Goal:** Manage pre-orders — view upcoming, view own completed, mark due pre-orders as fulfilled.

### Upcoming pre-orders (all salesmen)

| Feature | Details |
| --- | --- |
| **List all due/upcoming pre-orders** | Includes other salesmen's pre-orders too |
| **Columns** | Customer, items, creator salesman, scheduled date, status |
| **Mark as completed** | For status "Booked"/"Due" — any salesman can mark fulfilled |
| **Detail view** | Tap row → full order detail (items, qty, customer, timestamps) |

### Completed pre-orders (own only)

| Feature | Details |
| --- | --- |
| **List own fulfilled pre-orders** | Only pre-orders placed by this salesman |
| **Detail view** | Items, customer, `placed_at`, `fulfilled_at`, `fulfilled_by` |

### Rules

| Rule | Detail |
| --- | --- |
| Creator stays fixed | `salesman_id` never changes — used for KPIs |
| Any salesman can fulfill | Sets `fulfilled_by` if different from creator |
| No GatePass impact | Fulfilling pre-order does not touch GatePass |

### Backend work

- `GET /orders/due-preorders` — all pre-orders due today
- `GET /orders?type=pre_order` — filtered lists
- `PATCH /orders/:id/fulfill` — mark fulfilled, set `fulfilled_at`

---

# SALESMAN DASHBOARD (Home)

**Route:** `/salesman/dashboard`

This is the salesman's home screen. Build alongside the 4 tasks above.

| Section | What to show |
| --- | --- |
| **Tab: Today's Orders** | Book Now orders — ID, customer, items, `placed_at`, `fulfilled_at`, status. Mark own orders fulfilled. |
| **Tab: Pre-order Bookings** | My pre-orders + due pre-orders from all salesmen |
| **KPI** | Total orders today count |
| **GatePass summary** | Issued, sold, available per product (no pre-order counts) |
| **Quick links** | Catalog, Add Customer, Due Pre-orders |

---

# OUT OF SCOPE (Do Not Build in Phase 1)

- Native mobile apps (iOS/Android) — PWA only
- Customer login / customer-facing app
- Central warehouse inventory tracking
- GPS / location tracking
- Salesman online/offline status tracking (presence, heartbeat, last seen)
- Admin changing order status or reassigning orders
- GatePass history tab on admin salesman detail (only Sales + GatePass tabs)
- Overview and Orders tabs on admin salesman detail (removed per scope)
- Company marketing website (lowest priority)
- Redis, Sentry, staging environment

---

# DELIVERABLE CHECKLIST

## Admin

- [ ] Products page — CRUD + varieties + image upload + backend
- [ ] Salesman list — CRUD
- [ ] Salesman detail — Sales tab (info, KPIs, graph, recent orders, order detail modal)
- [ ] Salesman detail — GatePass tab (allot, live status, finalise button)
- [ ] Admin dashboard — KPIs, GatePass matrix, pre-orders, quick actions
- [ ] Orders page — Pre-Orders tab + Book Now tab, list tables, order detail on click, filters
- [ ] Customers page — list, add, detail, edit, order history per customer

## Salesman

- [ ] Products page — Blinkit grid, available qty, add to cart
- [ ] Cart page — 3-step flow (cart → customer → order type → confirm)
- [ ] GatePass page — today + history with detail
- [ ] Pre-orders page — upcoming (all) + completed (own) + mark fulfilled
- [ ] Dashboard — today's orders, pre-orders, GatePass summary

## Shared / System

- [ ] Supabase Auth login (email + password + OTP) with role routing
- [ ] RBAC — admin vs salesman route protection
- [ ] Book Now deducts GatePass; Pre-order does not
- [ ] PWA — manifest, service worker, installable on mobile

---