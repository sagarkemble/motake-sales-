# Motake business user flows

**Status:** frozen 2026-10-20. Do not reopen this flow write-up here; change via a new ADR.

Motake is a dairy distributor’s field-sales app: office allots milk stock to a salesman for a route, he bills shops at that route’s prices, and each shop has **one running balance** with Motake.

## The big picture

- Motake sells through **salesmen** on named **routes** (e.g. Kolhapur, Satara).
- Each shop on a route is a **Customer**. Same owner, two routes = two customers, two balances.
- Prices are **per route**, not company-wide. If a product has no price on that route, it cannot be sold there.
- Stock for the day sits on a **GatePass** (allotment slip). Money sits on the customer **Ledger**. Stock and money never mix.

## Setup (office / admin)

- Create **routes**, **varieties** (products), **salesmen**, and **customers**.
- Put each customer on **exactly one route**.
- Set **route prices** (tax-exclusive). Tax is added at billing.
- Each route has a default **delivery state** (needed for GST: same-state vs other-state).
- Optionally mark a customer as needing **e-invoicing** (government IRN).

## Daily stock allotment

- Admin allots stock to a salesman for **one business date** and **one route**. That allotment is the **GatePass**.
- GatePass holds **quantities only**, never rupees.
- While selling, the salesman has one **Active GatePass**. That’s the only route they can sell/pay against.
- If the GatePass is **closed** or **handed over**, selling, pre-orders, and field payments stop until they get a new one.
- Admin can fulfil pre-orders **without** a GatePass. Salesmen cannot.

## Salesman on the road — Book Now (sell today)

- Salesman opens the app, sees only customers and prices for the **Active GatePass route**.
- They pick a shop, pick products and pack counts, tap **Book Now**.
- Stock comes off **that GatePass**. Whole basket succeeds or whole basket fails (no partial bill if something is short).
- App sends only product + qty. Server stamps **price + tax** from the route at that moment.
- A **Bill** number is created (`MB/...`). That amount is added to the shop’s **balance** (they owe Motake more).

## Pre-order (sell for a later date)

- Shop orders for a **future date**. Price locked **today**, not on delivery day.
- Bill number is given **immediately**. No stock taken, no payment, no ledger change yet.
- On/after the scheduled date, salesman (with a GatePass on that route) or admin **fulfils** it.
- Fulfilment bills it, takes stock (salesman only), and posts money to the ledger. Same bill number kept.
- Cannot fulfil early, and cannot fulfil twice.

## Collecting money

- Money is never “against this bill”. It always goes to the shop’s **one running balance**.
- Salesman can record **cash / bank / UPI** only for shops on the Active GatePass route.
- Admin can record a payment anytime from the **Ledger**, even with no sale.
- After payment: if balance is still positive, shop still **owes**. If it goes negative, Motake holds **advance**.

## The customer ledger (the shop’s khata)

- One table of everything: bills, payments, credit/debit notes, refunds, opening balance.
- **Balance** = sum of that table. Not per bill.
- Admin uses this page for money work. No second money screen.
- Click a row → that bill/payment/note opens.
- First time for an old shop: admin can set a one-time **opening balance**, then never edit it.

## After a bill — admin paper actions

- Admin opens the **bill paper** to Correct, Cancel, or Raise a Note. Not by editing the items table inline.
- **Correct** (change lines) is blocked after that month’s GSTR-1 is marked filed, and after IRN is recorded.
- History keeps every old version; the bill itself always shows the **latest**.

## When a bill amount changes

- Admin **lowers** a billed amount → **Credit Note** (shop owes less).
- Admin **raises** it → **Debit Note** (shop owes more).
- Admin can also raise a note **on its own** (return, damage, extra items, later discount) without rewriting the bill.
- Two credit-note flavours: **GST** (also reduces Motake’s tax) vs **commercial** (shop’s balance drops, Motake still bears the tax).

## Cancel, refund, payment mistakes

- Cancel a billed sale: stock can go back **only** to the GatePass that was used (Book Now). Pre-orders belong to the route, not a salesman, until fulfilled.
- If the bill had a government IRN, admin first records **portal cancellation**, then cancels in Motake. Number is kept.
- After the month is filed: don’t cancel that IRN bill — **raise a note** instead.
- **Refund** = Motake pays cash back **only from advance**. Cannot refund more than Motake owes. Salesman cannot refund.
- Wrong payment/refund: admin **adjusts** it with a reason. History kept. Taking amount to ₹0 is not a delete.

## GST and e-invoicing (office)

- Tax sits on top of route price. Same-state vs other-state comes from **actual delivery state** (route default unless changed).
- All taxable goods on a bill → **Tax Invoice**. Only exempt goods → **Bill of Supply**.
- If the shop needs e-invoicing: Tax Invoice needs **IRN + signed QR** before the final PDF / WhatsApp bill. Sale, ledger, and payment already happened; only the **final paper** waits. Bill of Supply does not wait.
- Admin records IRN details (can correct them later). That does **not** unlock line-item correct.
- Admin marks **GSTR-1 filed** for a calendar month once. That month’s bills cannot be line-corrected anymore. Notes still work. Cannot unfile.

## What each person actually does in a day

### Admin

- Maintain routes, prices, people, shops.
- Allot GatePasses.
- Watch ledgers, take office payments, refunds, opening balances.
- Correct/cancel bills, raise notes, record IRN, mark GST filed.

### Salesman

- Work one Active GatePass / one route.
- Book Now, take pre-orders, collect field payments.
- Fulfil due pre-orders for that route (needs a live GatePass).
- Cannot refund, cannot edit old payments, cannot sell off-route.
