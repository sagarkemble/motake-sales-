# Customer money is kept as an append-only ledger; the Balance is derived from it

Every money event for a Customer is written as a new ledger entry and never erased. The Balance shown in the app is the sum of those entries (with a stored copy updated in the same step for fast reads). We chose this over a single editable balance number because cancellations, returns, bill edits, disputes and per-salesman cash reports all need the history; a single number cannot explain itself or be recomputed after a bug.

All amounts are in Indian Rupees (₹). Bills are GST documents (see GST below).

## Scope

- The ledger is Motake's book of **Customers only**. No vendor / supplier transactions.
- One ledger per Customer. Not per Bill.

## Debit, Credit, Balance

Standard accounting for a customer (debtor) account in the seller's books:

| Side | Meaning for the Customer's Balance | Examples |
| --- | --- | --- |
| **Debit** | Increases what the Customer owes Motake | Bill raised, Debit Note, Refund paid out, Opening balance owed |
| **Credit** | Decreases what the Customer owes Motake | Payment received, Credit Note, Opening balance in advance |

**Balance = total Debits − total Credits.**

- Balance > 0 → **Pending** (Customer owes Motake).
- Balance = 0 → settled.
- Balance < 0 → **Advance** (Motake owes the Customer; used against future Bills).

A Bill is always debited in **full** (tax included). A payment is credited **separately**. The unpaid part is not its own entry — it is just what remains in the Balance.

## Bill editing and history

A Bill can be edited after it is raised — **by admin only, with a reason, until Admin records that month's completed GSTR-1 filing**. Editing is for fixing a **wrong entry** on the Bill.

- The **Bill** always holds the latest items and amounts.
- **Bill history** holds one row per version, including the first. A Bill never edited has exactly one history row.
- Each history row keeps the full items and amounts of that version, who made it, when, and the reason.
- The Bill's original date, time and number never change.
- At month end, Admin records the externally completed GSTR-1 filing using a form with month, filing date, reference/acknowledgement, filer and optional notes. Submission locks Bills in that month; later corrections use Credit/Debit Notes.
- **Edit that changes neither amount nor statutory tax facts** (e.g. a non-statutory description at the same price): Bill + History only. No Note or ledger entry. Still send the updated Bill on WhatsApp after commit.
- **Edit that changes the amount**: the system automatically creates a linked **Debit Note** (amount up) or **Credit Note** (amount down) for the difference, using the admin's required edit reason. Amount **down** uses a **GST Credit Note** when tax reversal is legally eligible under the configured deadline; otherwise a **Commercial Credit Note**.
- **Edit with the same total but changed statutory facts** (HSN, taxable value, exemption, GST rate, tax split or place of supply): the system automatically creates the required paired tax-correction Notes. Net Balance may stay unchanged while GST changes.
- The Bill, Bill History, Notes, GST effects and ledger entries are saved together. Only after they commit may the latest Bill be sent.
- A cancelled Bill cannot be edited. A Bill cannot be edited below ₹0.
- Items removed through an edit do **not** go back onto any GatePass. Stock is not tracked for returns.

Example:

```
Bill                      Bill history                                  Ledger
id  amount                bill_id  version  amount  reason              entry          amount   linked to
1   20,000   (latest)     1        1        10,000  (raised)            Bill           +10,000  Bill 1
                          1        2        20,000  wrong qty entered   Debit Note     +10,000  Bill 1
```

## Credit Note and Debit Note

Created through either of two admin-only flows:

1. **Automatic internal Note from a Bill edit:** admin edits a Bill with a required reason; if its amount changes, the system creates the matching linked Note for the difference.
2. **Independent Note:** admin explicitly creates a Note with a reason for something that happened after a correct Bill (return, damage, later discount, later extra charge).

Both are proper numbered Notes linked to the original Bill and their ledger entry. Definitions follow Indian GST (CGST Act, s.34): both are issued by the seller and reference the original Bill.

**Credit Note** — the Bill charged **more** than it should have. It **reduces** what the Customer owes (credit entry).
Reasons: goods returned, goods damaged / spoiled, discount after billing, overcharge.

**Debit Note** — the Bill charged **less** than it should have. It **increases** what the Customer owes (debit entry).
Reasons: undercharge, extra items delivered after the Bill.

Rules:

- Each note has its own number series, date, amount, tax split and reason.
- A GST Note selects the affected Bill lines and quantities; HSN, taxable value and tax are calculated from those lines.
- A return/damage Note also records the affected quantity, return/damage date and reason. Batch and inventory tracking remain out of scope.
- Total Credit Notes cannot exceed the remaining uncredited lines/value after prior Notes.
- If the same Bill or ledger entry already has another Credit/Debit Note, the app warns that the change may be counted twice. Admin can ignore the warning and continue.
- A **GST Credit Note** reverses the applicable tax and reduces Motake's GST liability.
- A **Commercial Credit Note** (the “without GST” option) reduces the Customer's Balance but not Motake's GST liability; Motake bears the tax already paid.
- **GST Credit Note deadline:** **CA confirmed.** Motake admin settings hold one deadline **per financial year** (typically set once per year; may be updated the next year if the CA advises). Default guidance until configured: 30 November after the Bill's financial year end, or the annual-return date if earlier. Changes are audited. After that date for a Bill, automatic and manual reductions that would reverse GST must issue a **Commercial Credit Note** instead (Customer Balance only; GST already paid stays payable). Debit Notes have no equivalent deadline.
- A reduction on the next Bill is recorded now as a Commercial Credit Note, creating Advance. That Advance is then applied to the next Bill; an old adjustment is never disguised as a discount on a new taxable sale.

## Entry types

| Entry | Side | Created when |
| --- | --- | --- |
| Opening balance | Debit (owed) or Credit (advance) | Seeded at migration with cutoff date and signed source; before go-live wrong seed may be replaced by direct DB correction; after go-live corrections append via controlled DB script only |
| Bill | Debit | Book Now placed; Pre-order fulfilled |
| Payment | Credit | Cash, bank or UPI Payment kept (at checkout or with no purchase). For cash, only the amount **kept** is entered; change handed back is never an entry |
| Credit Note | Credit | System creates one from an admin Bill reduction, or admin raises one independently |
| Debit Note | Debit | System creates one from an admin Bill increase, or admin raises one independently |
| Payment adjusted | Debit (amount lowered) or Credit (amount raised) | Admin fixes a wrongly recorded Payment; linked to that Payment and posted on the correction date |
| Refund | Debit | After an external Refund completes, Admin records Motake paying the Customer back out of Advance, with mode (cash / bank / UPI) and optional reference |

Entries are never deleted or overwritten. Each stores who made it, when, and (for salesmen) the Active GatePass, if any.

## Who can change the ledger

Critical actions that reverse or adjust money are **admin only, with a reason**.

| Action | Ledger effect | Salesman | Admin |
| --- | --- | --- | --- |
| Place Book Now | Bill | Yes, on Active GatePass route | No |
| Fulfil Pre-order | Bill | Yes, Active GatePass on the Pre-order's route | Yes |
| Record Payment at checkout | Payment | Yes | Yes (when fulfilling) |
| Record Payment with no purchase | Payment | Yes, Customer on Active GatePass route | Yes, any Customer |
| Choose return-change vs keep-as-advance | Payment amount | Yes, on own payment | Yes, on own payment |
| Edit a Bill | History only if amount/statutory facts are unchanged; otherwise automatic linked Notes | No | Yes, with reason |
| Raise Credit Note / Debit Note | Credit Note / Debit Note | No | Yes, with reason |
| Cancel a billed order | Credit Note for remaining eligible/uncredited value | No | Yes, with reason |
| Cancel an unfulfilled Pre-order | None | No | Yes, with reason |
| Refund Advance | Refund | No | Yes, with mode |
| Set Opening balance | Opening balance | No | Yes, once per Customer |
| Fix a wrongly recorded Payment | Payment adjusted | No | Yes, with reason; Payment history kept |

## What the user sees

The owner sees one number per Customer, not debit/credit columns:

- ABC starts at **₹0**.
- Buys ₹10,000, pays ₹5,000 → **₹5,000 pending**.
- Later pays ₹7,000 → ₹5,000 clears the pending, ₹2,000 is extra → **₹2,000 advance** (shown as −₹2,000 or "Advance ₹2,000").
- Next Bill of ₹3,000 → advance is used first → **₹1,000 pending**.

The ledger (all entries) and each Bill's history are available on the Customer's detail screen for disputes.

## Customer flows and edge cases

Each line: what happens → ledger entries → resulting Balance → messages. Bill amounts include GST.

### Checkout (Book Now, or Pre-order fulfil)

1. **Pays in full.** Bill ₹2,000, cash ₹2,000 → Bill +2,000, Payment −2,000 → ₹0 → Bill + Receipt.
2. **Pays part.** Bill ₹10,000, cash ₹5,000 → Bill +10,000, Payment −5,000 → ₹5,000 pending → Bill + Receipt.
3. **Pays nothing.** Bill ₹3,000, cash ₹0 → Bill +3,000 → ₹3,000 pending → Bill only (no Receipt at ₹0).
4. **Old pending + new bill + part pay.** Pending ₹7,000, Bill ₹3,000, cash ₹2,000 → Bill first (₹10,000), then Payment → ₹8,000 pending. The ₹2,000 is not tied to today's Bill.
5. **Overpays, change returned.** Pending ₹1,000, cash ₹1,200, staff choose *return* → Payment −1,000 only (only ₹1,000 is credited) → ₹0. Receipt shows ₹1,200 received, ₹1,000 kept, ₹200 returned.
6. **Overpays, kept as advance.** Same cash, staff choose *advance* → Payment −1,200 → −₹200 (advance).
7. **Bill while in advance.** Advance ₹2,000, Bill ₹5,000 → ₹3,000 pending before cash. Paying ₹4,000 then triggers flow 5/6 for the extra ₹1,000.
8. **Bill exactly equals advance.** Advance ₹3,000, Bill ₹3,000, cash ₹0 → ₹0. Bill sent, no Receipt.

### Payment with no purchase

9. **Clears part of old pending.** Pending ₹10,000, pays ₹2,000 → Payment −2,000 → ₹8,000. Receipt only. No Bill named as "cleared".
10. **Pays more than pending.** Same choice as flows 5/6.
11. **Pays while already in advance.** Advance grows. Allowed; Receipt shows new advance.
12. **Customer deactivated with pending.** Still payable (by admin) until ₹0. Salesman no longer sees the Customer.

### Pre-order

13. **Placed.** Linked to the route, not to a GatePass or salesman. Route price and Route state (place of supply) locked at placement. No ledger entry, no Balance change, no message.
14. **Cancelled before fulfil.** Admin cancels with a reason. No ledger entry (nothing was billed).
15a. **Fulfilled by one of several salesmen on the route.** Any salesman with an Active GatePass on that route, on or after the scheduled date, can fulfil. Once one does, every other salesman on the route sees it as fulfilled.
15. **Fulfilled after a price, Route-state or GST-rate change.** Uses the locked Route price and locked Route state from placement; GST rate effective on the fulfilment/Bill date. Bill entry is dated at fulfilment.
16. **Fulfilled by admin.** Same as checkout. Payment, if any, carries no GatePass.

### After the Bill (admin only)

17. **Voided before delivery.** Admin cancels with reason → system reverses the remaining uncredited Bill value. If the originating GatePass is still active, its quantities are restored; otherwise stock is unchanged. Send the dedicated cancellation message and any applicable statutory Note, but no generic account-update message.
18. **Goods fully returned.** Admin creates the eligible GST Credit Note for remaining affected lines. GatePass stock is unchanged.
18a. **Commercial write-off / discount.** Admin creates a Commercial Credit Note; Balance decreases but GST remains payable.
18b. **Cancellation after part Payment.** The Payment stays. Reversing the remaining Bill value can make the Balance an Advance.
19. **Bill edited, amount up.** Wrong qty, ₹10,000 → ₹20,000 → system creates Debit Note +10,000 linked to the Bill → Balance +₹10,000 → account-update message.
19a. **Bill edited, amount and statutory facts unchanged.** Non-statutory description corrected at the same price/tax → History only. No ledger entry. Updated Bill on WhatsApp after commit.
19b. **Bill edited, total unchanged but tax facts changed.** Paired tax-correction Notes reverse the old statutory line and apply the new one. Net Balance may remain unchanged.
20. **Edited twice.** ₹10,000 → ₹20,000 (automatic Debit Note +10,000) → ₹18,000 (automatic Credit Note −2,000). Bill shows ₹18,000; history has three rows.
21. **Goods returned / damaged after full payment.** Paid ₹10,000 (₹0), ₹2,000 returned → admin raises Credit Note −2,000 → −₹2,000 advance → account-update message. Then either:
    - used against the next Bill, or
    - refunded → Refund +2,000 → ₹0.
22. **Undercharged.** Admin raises Debit Note for the difference → Balance up.
22a. **Edit and hand-raised note on the same Bill.** Warning shown; admin can ignore it.
23. **Credit Notes exceed the remaining uncredited lines/value, or Bill is cancelled.** Refused.
24. **Credit Note after the GST deadline.** Only a Commercial Credit Note is allowed (Balance reduces but Motake bears the tax), or a reduction on the next Bill.

### Mistakes and retries

25. **Same checkout submitted twice (bad network).** Second submit is ignored; one Bill, one Payment.
26. **Cash counted short / typo in Payment.** Receipt said ₹2,000, correct amount is ₹1,900 → Admin corrects the Payment with reason → Payment adjusted +100 (debit) on the correction date → Customer owes ₹100 more → account-update message. Payment History and disclosure show previous ₹2,000, corrected ₹1,900, difference ₹100 and reason. Exact display format is deferred. The Bill is never edited to cover a Payment mistake.

### Customer record changes

27. **Customer moved to another route.** Ledger and Balance move with the Customer unchanged. Blocked while the Customer has open Pre-orders.
28. **Two Customers, same phone.** Separate ledgers and Balances; messages name the Customer and route.
29. **Opening balance.** First entry in the ledger. Seeded from client data, or set once by admin for a Customer added later.

### Things that never touch the ledger

Placing a Pre-order, editing a route price, moving a Customer, GatePass allot / sale quantity / handover, a WhatsApp send failing, change handed back.

## Messages

- There is no Customer portal, downloadable document view or “Updated Bill View.”
- **Bill** — when a Bill is raised (Book Now placed, Pre-order fulfilled).
- **Receipt** — when a Payment with amount kept > ₹0 is recorded.
- **Account update** — WhatsApp message when a Bill edit, Credit / Debit Note, Payment adjustment or Refund changes the Balance; shows the change, reason and new Balance. Cancellation uses its dedicated message instead.
- After a Bill edit, send the latest Bill only after Bill History, Notes, GST effects and ledger entries commit. A Balance-changing edit also sends the account update and, for a GSTIN Customer, the statutory Note.
- A Bill message shows Balance after the Bill debit but before any same-checkout Payment. Its Receipt shows the final Balance after Payment.
- A Customer with GSTIN also receives the statutory Credit/Debit Note. A Customer without GSTIN receives the account update only.
- Credit/Debit Notes and Bill History remain available to Admin/CA.
- Bill cancellation sends a dedicated message with the reason, reversed amount and resulting Balance. If it creates a statutory Note for a GSTIN Customer, that Note is also delivered.

```
Customer buys items worth ₹10,000
        |
  Bill raised  ──► ledger: Bill +10,000
        |
Customer hands ₹5,000
        |
Salesman records cash received ₹5,000
        |
  Payment kept ──► ledger: Payment −5,000   → Balance ₹5,000 pending
        |
WhatsApp: Bill + Receipt (₹5,000 received, ₹5,000 pending)
```

## GST

- One Customer-facing **Bill** concept is used:
  - Taxable or mixed supply → internal legal type **Tax Invoice**.
  - Entirely exempt supply → internal legal type **Bill of Supply**.
- **Intra-state and inter-state** are both supported. The snapshotted Route state always determines place of supply:
  - Route in Motake's state (Maharashtra) → **CGST + SGST** (rate split in half).
  - Route in another state → **IGST** (full rate).
- **Seller (CA-confirmed master data):** MOTAKE MILK AND MILK PRODUCT; GAT NO 6, MOTAKE MALA, NANDANI ROAD, JAMBHALI-416121; GSTIN **27EHCPP4509Q1ZP** (Maharashtra); contact phone 9822418224; email akashpatil8090@gmail.com. Held in admin settings for Bills and Notes; update only when the business re-registers or the CA instructs a change.
- Admin may update a Route's state; orders already started and historical Bills retain their snapshots. A Customer has an optional GSTIN; it is printed on Bills when present.
- Each **variety** has effective-dated HSN, exemption status and GST rates, company-wide (not per Route). Effective periods cannot overlap. Bill and Note lines snapshot the effective facts.
- **Route prices exclude tax.** The Bill adds GST per line on top of the route price. The Bill total, Pending and Payments are all tax-inclusive.
- Route prices must be greater than zero. The server snapshots the Route price when an item enters an order; later price-list edits never reprice that order and the client never supplies a price.
- Money and tax calculations use whole paise internally (integer minor units), never floating-point rupees. Use half-up rounding: each line's tax to paise and final Bill to the nearest rupee, with a visible round-off component. Notes reverse the original line's exact remaining paise.
- Every displayed money amount has exactly two decimal places (for example, `₹1,234.00`).
- **Regular GST** is assumed (not Composition). Numbering: separate server-generated series per document type and financial year, sequential and unique, max 16 characters (e.g. Bill `MB/26-27/000001`, Credit Note `MC/26-27/000001`, Debit Note `MD/26-27/000001`). Prefixes are configurable before the first document of the year. GST and Commercial Credit Notes share the Credit Note series. Numbers are assigned inside the successful transaction; once assigned they are never reused, and cancelled documents retain them.
- After a GSTR-1 filing form locks its month, Admin may still create an eligible GST Credit Note, a Commercial Credit Note, or a Debit Note independently; these do not rewrite the filed Bill.

## E-invoicing (IRN)

- **Per Customer**, Admin sets **E-invoicing required** (`yes` | `no`). GSTIN marks a registered business Customer; absence of GSTIN marks normal B2C. IRN and signed QR are required before final Bill PDF/WhatsApp only when that Customer's setting is `yes`. Admin may override either way, including `no` for a GSTIN Customer. Normal Customers without GSTIN do not require IRN even on taxable Bills. Seeding supplies the initial value per Customer from a CA-guided list.
- Sale commits immediately (ledger, Balance, Payment). IRN pending withholds final Bill delivery until Admin records IRN, acknowledgement fields and signed QR after manual portal reporting. Draft Bill download and pre-IRN correction are allowed; after IRN, direct Bill edits are locked.
- After IRN is recorded, **Credit/Debit Notes only** (plus the locked product rules) for value or tax corrections; adhere to the configured Credit Note deadline and normal GST timelines. Portal cancellation remains manual; record portal acknowledgement. Manual government portal reporting plus Admin IRN entry in the app is **CA accepted**. End-to-end product rules live in `docs/route-pricing-and-udhar.md` §9.6.

## CA confirmation (statutory product rules)

**Status: confirmed by CA** for the rules below. Implementation still needs seeded Customers, varieties, Routes, and opening balances.

| Area | CA answer |
| --- | --- |
| GST scheme | **Regular GST** (not Composition) |
| E-invoicing / IRN | Per locked product rules; e-invoicing applies where required; **Admin may mark individual GSTIN Customers as not requiring e-invoicing**; manual portal + Admin IRN entry accepted |
| Place of supply | Route state drives CGST+SGST vs IGST; inter-state allowed; Pre-order locks Route state at placement |
| Product taxation | HSN/rates/exemption as seeded; Tax Invoice vs Bill of Supply; tax-exclusive route prices, tax-inclusive totals, half-up rounding |
| Credit/Debit Notes | GST vs Commercial rules as documented; **Credit Note deadline configurable per FY in admin settings**; shared Credit Note series; partial/multiple Notes allowed |
| GSTR-1 | **Monthly** filing; month lock after filing form; Bill text-only edits may WhatsApp updated Bill |
| Cancellations / voids | GST/Commercial Note paths; cancellation messaging; Payments preserved |
| B2B / B2C | Optional Customer GSTIN; B2C without IRN; statutory Note for GSTIN, account update otherwise |
| Opening balance | Per-Customer migration at cutoff with signed source |
| Numbering | Separate Bill / Credit / Debit series per FY (`MB` / `MC` / `MD` pattern) |
| Payments / refunds | Manual cash/bank/UPI; Payment adjustment entries; Refund after payout |
| WhatsApp | Customer copies acceptable; consent/opt-out not in app (operational risk accepted) |
| Law-specific extras | **No** dairy/industry-specific GST rules beyond standard GST; e-invoice applicability handled **per Customer** (not a separate turnover toggle in app); Credit Note deadline **configurable**; GSTR-1 **monthly** |

## Remaining before build (data, not CA)

- Seed **Customer** list including **E-invoicing required** per row.
- Seed varieties (HSN, rates), Routes (state), route prices, opening balances.
- Set **GST Credit Note deadline** in admin for the active financial year(s).
