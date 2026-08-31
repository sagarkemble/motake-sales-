# Motake — Pricing System Wireframe (ASCII)

Mobile-first. Matches live Admin & Salesman chrome.
`[NEW]` = pricing / revenue addition. GatePass stays qty-only.

**Model (proposed)**
- Catalog: `product_varieties.unit_price` (admin sets per variety)
- Accounts: snapshot → `order_items.unit_price` + `line_total`, `orders.total_amount`
- Currency: INR (₹)

---

## End-to-end flow (where pricing appears)

```
 ADMIN                         SALESMAN                        ACCOUNTS
 ─────                         ────────                        ────────
 [Products]                    [Products catalog]
    |                               |
    v                               v
 Add/Edit variety              Add to cart drawer
 + Unit price ₹  [NEW]         + ₹ / variety   [NEW]
    |                               |
    v                               v
 Variety row / product         Cart
 card shows from ₹ [NEW]       + line ₹ + Grand total [NEW]
                                    |
                                    v
                               Checkout 1: Verify products
                               + line ₹ + total [NEW]
                                    |
                                    v
                               Checkout 2: Order type
                               + Amount to collect [NEW]
                                    |
                                    v
                               Checkout 3: Customer
                               + Place order for ₹ [NEW]
                                    |
                                    v
                               Success: Total amount ₹ [NEW]
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
   Admin Orders list         Salesman Orders list      Dashboard KPI
   + ₹ on cards [NEW]        + ₹ on rows [NEW]         Sales value [NEW]
          |                         |                         |
          v                         v                         v
   Order detail              Order detail              Salesman Sales tab
   + line ₹ + total [NEW]    + line ₹ + total [NEW]    Sales value /
                                                       Pre-order value [NEW]
                                                                  |
                                                                  v
                                                       Customer lifetime
                                                       Lifetime value [NEW]

 [NO ₹] GatePass allot / Today / Handover / Verification  (qty only)
```

---

## A. Admin — set catalog price

### A1. Products list  `/admin/products`

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
│         Products            │
├─────────────────────────────┤
│  ⌕  Search products…        │
│  □ Show deleted products    │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │  [img]   │ │  [img]   │  │
│  │ Buffalo  │ │ Desi     │  │
│  │ Milk     │ │ Ghee     │  │
│  │ 3 var.   │ │ 2 var.   │  │
│  │ from ₹28 │ │ from ₹520│  │  ← [NEW]
│  │ [ Edit ] │ │ [ Edit ] │  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │ Paneer   │ │ Cow Milk │  │
│  │ from ₹180│ │ from ₹26 │  │  ← [NEW]
│  └──────────┘ └──────────┘  │
├─────────────────────────────┤
│ Dash│Prod│Sales│Ord│Cust    │  ← live 5 tabs
└─────────────────────────────┘
```

### A2. Edit product + varieties  `/admin/products/[id]`

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
├─────────────────────────────┤
│ ← Edit product              │
│ ┌─────────────────────────┐ │
│ │ Active   Deact · Delete │ │
│ └─────────────────────────┘ │
│ Name:        Buffalo Milk   │
│ Description: Fresh farm…    │
│                             │
│ Varieties          [+ Add]  │
│ ┌─────────────────────────┐ │
│ │ 500 ml                  │ │
│ │ SKU-BM-500 · ml         │ │
│ │ ₹28.00           Active │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 1 Ltr                   │ │
│ │ SKU-BM-1L · L           │ │
│ │ ₹55.00           Active │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 5 Ltr Can               │ │
│ │ SKU-BM-5L · L           │ │
│ │ ₹260.00          Active │ │  ← [NEW]
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Dash│Prod│Sales│Ord│Cust    │
└─────────────────────────────┘
```

### A3. Add / Edit variety dialog

```
┌─────────────────────────────┐
│                             │
│   ┌─────────────────────┐   │
│   │ Add variety         │   │
│   │                     │   │
│   │ Name  [ 500 ml    ] │   │
│   │ SKU   [ SKU-BM-500] │   │
│   │ Unit  [ ml        ] │   │
│   │ Unit price (₹)      │   │  ← [NEW] required
│   │       [ 28.00     ] │   │
│   │                     │   │
│   │ [Cancel] [Save]     │   │
│   └─────────────────────┘   │
│                             │
└─────────────────────────────┘
```

---

## B. Salesman — sell with price

### B1. Products catalog  `/salesman`

```
┌─────────────────────────────┐
│ ≡   Motake            (R)   │
│     Salesman                │
├─────────────────────────────┤
│  ⌕  Search for a product…   │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │  [img]   │ │  [img]   │  │
│  │ 2 in cart│ │          │  │
│  │ Buffalo  │ │ Desi     │  │
│  │ Milk     │ │ Ghee     │  │
│  │ 3 sizes  │ │ 2 sizes  │  │
│  │ from ₹28 │ │ from ₹520│  │  ← [NEW]
│  │[Add Cart]│ │[Add Cart]│  │
│  └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐  │
│  │ Paneer   │ │ Chaas    │  │
│  │ from ₹180│ │ ₹20      │  │  ← [NEW]
│  └──────────┘ └──────────┘  │
├─────────────────────────────┤
│ Prod │ Cart³ │ Gate │ Ord   │  ← live 4 tabs
└─────────────────────────────┘
```

### B2. Add to cart drawer

```
┌─────────────────────────────┐
│                             │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│   ┌─────────────────────┐   │
│   │ ──                  │   │
│   │ [img] Buffalo Milk  │   │
│   │                     │   │
│   │ 500 ml · ml         │   │
│   │ ₹28.00 / unit  [-2+]│   │  ← [NEW]
│   │                     │   │
│   │ 1 Ltr · L           │   │
│   │ ₹55.00 / unit  [-0+]│   │  ← [NEW]
│   │                     │   │
│   │ 5 Ltr Can · L       │   │
│   │ ₹260.00 / unit [-0+]│   │  ← [NEW]
│   │                     │   │
│   │ Selected    ₹56.00  │   │  ← [NEW]
│   │      [ Done ]       │   │
│   └─────────────────────┘   │
└─────────────────────────────┘
```

### B3. Cart  `/salesman/cart`

```
┌─────────────────────────────┐
│ ≡   Motake            (R)   │
│         Cart                │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ [img] Buffalo Milk      │ │
│ │ 500 ml (ml)             │ │
│ │ ₹28 × 2 = ₹56     [-2+] │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [img] Paneer            │ │
│ │ 200 g (g)               │ │
│ │ ₹180 × 2 = ₹360   [-2+] │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [img] Desi Ghee         │ │
│ │ 500 ml (ml)             │ │
│ │ ₹520 × 1 = ₹520   [-1+] │ │  ← [NEW]
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ Total items · 5         │ │
│ │ Grand total   ₹936.00   │ │  ← [NEW]
│ └─────────────────────────┘ │
│   [ Proceed to order → ]    │
├─────────────────────────────┤
│ Prod │ Cart⁵ │ Gate │ Ord   │
└─────────────────────────────┘
```

### B4. Checkout step 1 — Verify products

```
┌─────────────────────────────┐
│ ≡   Motake · Checkout (R)   │
├─────────────────────────────┤
│     (1)━━━(2)───(3)         │
│                             │
│ Verify products             │
│ Check products & quantities │
│                             │
│ Buffalo Milk · 500 ml       │
│ Qty 2              ₹56      │  ← [NEW]
│                             │
│ Paneer · 200 g              │
│ Qty 2             ₹360      │  ← [NEW]
│                             │
│ Desi Ghee · 500 ml          │
│ Qty 1             ₹520      │  ← [NEW]
│                             │
│ ┌─────────────────────────┐ │
│ │ Total items · 5         │ │
│ │               ₹936.00   │ │  ← [NEW]
│ └─────────────────────────┘ │
│                             │
│   [ Next: Order type → ]    │
├─────────────────────────────┤
│ Prod │ Cart │ Gate │ Ord    │
└─────────────────────────────┘
```

### B5. Checkout step 2 — Order type

```
┌─────────────────────────────┐
│ ≡   Motake · Checkout (R)   │
├─────────────────────────────┤
│     (1)━━━(2)━━━(3)         │
│                             │
│ Order type                  │
│                             │
│ ┌─────────────────────────┐ │
│ │ ● Order                 │ │
│ │ Deliver now, collect    │ │
│ │ payment. Uses gate pass │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ○ Pre-order (tomorrow)  │ │
│ │ Does not use gate pass  │ │
│ └─────────────────────────┘ │
│                             │
│ Amount to collect ₹936.00   │  ← [NEW]
│                             │
│ [ Next: Customer details →] │
├─────────────────────────────┤
│ Prod │ Cart │ Gate │ Ord    │
└─────────────────────────────┘
```

### B6. Checkout step 3 — Customer + Place order

```
┌─────────────────────────────┐
│ ≡   Motake · Checkout (R)   │
├─────────────────────────────┤
│     (1)━━━(2)━━━(3)         │
│                             │
│ Customer details            │
│ [ Open payment scanner ]    │
│                             │
│ Shop name [ Sharma Kirana ] │
│ Phone     [ 98765 43210   ] │
│ Address   [ 12 Market Rd  ] │
│                             │
│ Place order for   ₹936.00   │  ← [NEW]
│                             │
│      [ Place order ]        │
├─────────────────────────────┤
│ Prod │ Cart │ Gate │ Ord    │
└─────────────────────────────┘
```

### B7. Order success

```
┌─────────────────────────────┐
│ ≡   Motake · Checkout (R)   │
├─────────────────────────────┤
│                             │
│           ( ✓ )             │
│      Order placed           │
│                             │
│ ┌─────────────────────────┐ │
│ │ Order ID   BN-A1B2C3    │ │
│ │ Total items         5   │ │
│ │ Total amount  ₹936.00   │ │  ← [NEW]
│ │ Type         Order      │ │
│ │ Time         just now   │ │
│ └─────────────────────────┘ │
│                             │
│   [ View my orders ]        │
│   [ Back to home ]          │
├─────────────────────────────┤
│ Prod │ Cart │ Gate │ Ord    │
└─────────────────────────────┘
```

---

## C. Orders (read path — both roles)

### C1. Admin orders list  `/admin/orders`

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
├─────────────────────────────┤
│ [ Pre-Orders ] [ Orders ]   │
│                             │
│ ┌─────────────────────────┐ │
│ │ BN-A1B2C3    Confirmed  │ │
│ │ Sharma Kirana           │ │
│ │ Salesman Ramesh · 6 qty │ │
│ │               ₹1,140    │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ BN-D4E5F6    Fulfilled  │ │
│ │ Patel Dairy             │ │
│ │ Salesman Anita · 3 qty  │ │
│ │                 ₹840    │ │  ← [NEW]
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Dash│Prod│Sales│Ord│Cust    │
└─────────────────────────────┘
```

### C2. Order detail (admin dialog / salesman drawer)

```
┌─────────────────────────────┐
│ BN-A1B2C3      Confirmed    │
│                             │
│ Sharma Kirana               │
│ Ravi · 98765 43210          │
│ 12 Market Road              │
│                             │
│ Salesman        Ramesh      │
│ Total quantity       6      │
│ Total amount   ₹1,140.00    │  ← [NEW]
│                             │
│ Items                       │
│ Buffalo Milk 500ml  4  ₹112 │  ← [NEW]
│ Paneer 200g         2  ₹360 │  ← [NEW]
│ Ghee 500ml          1  ₹520 │  ← [NEW]
│                             │
│ (line = snapshotted price)  │
└─────────────────────────────┘
```

### C3. Salesman orders list  `/salesman/orders`

```
┌─────────────────────────────┐
│ ≡   Motake            (R)   │
├─────────────────────────────┤
│ [ Orders ] [ Pre-orders ]   │
│                             │
│ ┌─────────────────────────┐ │
│ │ Sharma Kirana Confirmed │ │
│ │ BN-A1B2C3 · 10:42 · 5   │ │
│ │               ₹936.00   │ │  ← [NEW]
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Patel Dairy   Fulfilled │ │
│ │ BN-D4E5F6 · 09:15 · 3   │ │
│ │               ₹840.00   │ │  ← [NEW]
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Prod │ Cart │ Gate │ Ord    │
└─────────────────────────────┘
```

---

## D. KPIs (revenue alongside existing)

### D1. Admin dashboard  `/admin`

```
┌─────────────────────────────┐
│ ≡   Motake Admin      (A)   │
├─────────────────────────────┤
│ Hello, Priya                │
│ Today's business…           │
│                             │
│ Today's orders              │
│ ┌──────────┐ ┌──────────┐   │
│ │ Orders   │ │ Pre-ord. │   │
│ │   42     │ │   18     │   │
│ └──────────┘ └──────────┘   │
│ ┌──────────┐ ┌──────────┐   │
│ │ Fulfilled│ │ Sales    │   │
│ │   31     │ │ value    │   │  ← [NEW]
│ │          │ │ ₹48,260  │   │
│ └──────────┘ └──────────┘   │
│                             │
│ Today's gate passes         │
│ Issued · Sold · Returned ·  │
│ Discrepancies   (qty only)  │
│                             │
│ Quick actions …             │
├─────────────────────────────┤
│ Dash│Prod│Sales│Ord│Cust    │
└─────────────────────────────┘
```

### D2. Admin · Salesman detail · Sales tab

```
┌─────────────────────────────┐
│ ← Ramesh Kumar              │
│ SM-014 · Active             │
│ [Sales][Gate Pass][Verify]  │
│ Last 30 days                │
│                             │
│ ┌──────────┐ ┌──────────┐   │
│ │ Items    │ │ Sales    │   │
│ │ sold 412 │ │ value    │   │  ← [NEW]
│ │          │ │ ₹86,420  │   │
│ └──────────┘ └──────────┘   │
│ ┌──────────┐ ┌──────────┐   │
│ │ Allotted │ │ Returned │   │
│ │   520    │ │    48    │   │
│ └──────────┘ └──────────┘   │
│ ┌──────────┐ ┌──────────┐   │
│ │ Pre-ord. │ │ Pre-order│   │
│ │ qty   64 │ │ value    │   │  ← [NEW]
│ │          │ │ ₹21,300  │   │
│ └──────────┘ └──────────┘   │
│ Active days 22 · Sell-thru  │
│ 79%                         │
│ Sales history …             │
└─────────────────────────────┘
```

### D3. Admin · Customer detail · Lifetime

```
┌─────────────────────────────┐
│ ← Sharma Kirana             │
│ Ravi · Active               │
│                             │
│ Lifetime stats              │
│ ┌──────────┐ ┌──────────┐   │
│ │ Items    │ │ Total    │   │
│ │ sold 186 │ │ orders 42│   │
│ └──────────┘ └──────────┘   │
│ ┌─────────────────────────┐ │
│ │ Lifetime value ₹34,820  │ │  ← [NEW]
│ └─────────────────────────┘ │
│ Last order  24 Aug 2026     │
│                             │
│ Order history               │
│ BN-A1B2C3 · 6 qty · ₹1,140  │  ← [NEW]
└─────────────────────────────┘
```

---

## E. No pricing (unchanged)

```
 Admin GatePass allot   `/gatepass`     qty steppers only
 Admin Salesman Gate Pass tab           Issued/Sold/Left qty
 Admin Verification tab                 pending verify/close
 Salesman Gate Pass Today/History       Given/Sold/Left qty
 Salesman / Admin Account               profile only
```

---

## Business rules (wireframe)

1. Admin sets **unit price per variety** (required, ≥ 0 or > 0 — confirm).
2. Catalog / cart / checkout show **live** catalog ₹ until Place order.
3. On Place order (Book Now or Pre-order): snapshot unit price → line_total → order.total_amount.
4. Past orders never change when catalog price is edited later.
5. GatePass math stays quantity-only; revenue KPIs live on Dashboard / Sales / Customers / Orders.

---

## Open decisions (before coding)

1. Dashboard Sales value = Book Now today only, or + fulfilled pre-orders today?
2. Allow ₹0 varieties?
3. Cart always uses live catalog price at checkout (recommended)?
4. INR only for v1?
