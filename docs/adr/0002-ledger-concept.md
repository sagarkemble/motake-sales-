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
| **Credit** | Decreases what the Customer owes Motake | Payment received, Credit Note, Bill cancelled, Opening balance in advance |

**Balance = total Debits − total Credits.**

- Balance > 0 → **Pending** (Customer owes Motake).
- Balance = 0 → settled.
- Balance < 0 → **Advance** (Motake owes the Customer; used against future Bills).

A Bill is always debited in **full** (tax included). A payment is credited **separately**. The unpaid part is not its own entry — it is just what remains in the Balance.

## Bill editing and history

A Bill can be edited after it is raised — **by admin only, with a reason, until its GST period is marked filed**. Editing is for fixing a **wrong entry** on the Bill.

- The **Bill** always holds the latest items and amounts.
- **Bill history** holds one row per version, including the first. A Bill never edited has exactly one history row.
- Each history row keeps the full items and amounts of that version, who made it, when, and the reason.
- The Bill's original date, time and number never change.
- Once admin/CA marks the Bill's GST period as filed, the Bill is locked. Later value or tax corrections use a Credit/Debit Note.
- **Edit that does not change the amount** (e.g. wrong variety name at the same price): Bill + history only. No ledger entry.
- **Edit that changes the amount**: admin must explicitly create a linked **Debit Note** (amount up) or **Credit Note** (amount down) for the difference and enter a note/reason. The app never generates it automatically. The Bill edit and linked Note are saved together; the Note is what moves the Balance.
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

Created **explicitly by admin only, with a note/reason**, against a Bill or its ledger entry. The system never creates one automatically. Admin may create one while correcting an amount-changing Bill edit, or separately for something that happened after a correct Bill (return, damage, later discount, later extra charge). Definitions follow Indian GST (CGST Act, s.34): both are issued by the seller and reference the original Bill.

**Credit Note** — the Bill charged **more** than it should have. It **reduces** what the Customer owes (credit entry).
Reasons: goods returned, goods damaged / spoiled, discount after billing, overcharge.

**Debit Note** — the Bill charged **less** than it should have. It **increases** what the Customer owes (debit entry).
Reasons: undercharge, extra items delivered after the Bill.

Rules:

- Each note has its own number series, date, amount, tax split and reason.
- Total Credit Notes on a Bill cannot exceed that Bill's amount. No notes on a cancelled Bill.
- If the same Bill or ledger entry already has another Credit/Debit Note, the app warns that the change may be counted twice. Admin can ignore the warning and continue.
- A **GST Credit Note** reverses the applicable tax and reduces Motake's GST liability.
- A **Commercial Credit Note** (the “without GST” option) reduces the Customer's Balance but not Motake's GST liability; Motake bears the tax already paid.
- Tax-adjustment deadline: a GST Credit Note must be reported by 30 November after the end of the Bill's financial year (or the annual-return date, if earlier). After that, a Credit Note may still be issued but cannot reduce GST liability, so the app treats it as a Commercial Credit Note. Debit Notes have no equivalent limit. Verify filing details with the client's CA.
- A reduction on the next Bill is recorded now as a Commercial Credit Note, creating Advance. That Advance is then applied to the next Bill; an old adjustment is never disguised as a discount on a new taxable sale.

## Entry types

| Entry | Side | Created when |
| --- | --- | --- |
| Opening balance | Debit (owed) or Credit (advance) | Seeded from client data, or set once by admin for a new Customer |
| Bill | Debit | Book Now placed; Pre-order fulfilled |
| Payment | Credit | Cash kept (at checkout or with no purchase). Only the amount **kept** is entered; change handed back is never an entry |
| Bill cancelled | Credit | Admin cancels a billed order. Equals the Bill's current amount |
| Credit Note | Credit | Admin explicitly raises a GST or Commercial Credit Note, including while editing a Bill down |
| Debit Note | Debit | Admin explicitly raises one, including while editing a Bill up |
| Payment adjusted | Debit (amount lowered) or Credit (amount raised) | Admin fixes a wrongly recorded Payment; linked to that Payment |
| Refund | Debit | Admin records Motake paying the Customer back out of Advance, with mode (cash / bank / UPI) and optional reference |

Entries are never deleted or overwritten. Each stores who made it, when, and (for salesmen) the Active GatePass, if any.

## Who can change the ledger

Critical actions that reverse or adjust money are **admin only, with a reason**.

| Action | Ledger effect | Salesman | Admin |
| --- | --- | --- | --- |
| Place Book Now | Bill | Yes, on Active GatePass route | No |
| Fulfil Pre-order | Bill | Yes, Active GatePass on the Pre-order's route | Yes |
| Record cash at checkout | Payment | Yes | Yes (when fulfilling) |
| Record payment with no purchase | Payment | Yes, Customer on Active GatePass route | Yes, any Customer |
| Choose return-change vs keep-as-advance | Payment amount | Yes, on own payment | Yes, on own payment |
| Edit a Bill | None if amount unchanged; explicitly linked Credit / Debit Note if amount changes | No | Yes, with reason |
| Raise Credit Note / Debit Note | Credit Note / Debit Note | No | Yes, with reason |
| Cancel a billed order | Bill cancelled | No | Yes, with reason |
| Cancel an unfulfilled Pre-order | None | Yes, own | Yes |
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

13. **Placed.** Linked to the route, not to a GatePass or salesman. Price locked on the order (tax calculated at fulfil on the locked price). No ledger entry, no Balance change, no message.
14. **Cancelled before fulfil.** By its salesman or admin. No ledger entry (nothing was billed).
15a. **Fulfilled by one of several salesmen on the route.** Any salesman with an Active GatePass on that route, on or after the scheduled date, can fulfil. Once one does, every other salesman on the route sees it as fulfilled.
15. **Fulfilled after a price change.** Billed at the locked price, not today's price. Bill entry dated at fulfil time.
16. **Fulfilled by admin.** Same as checkout. Payment, if any, carries no GatePass.

### After the Bill (admin only)

17. **Order cancelled, nothing paid.** Bill +3,000, Bill cancelled −3,000 → back to previous Balance. No message.
18. **Order cancelled after part payment.** Bill +3,000, Payment −2,000, Bill cancelled −3,000 → −₹2,000 (advance). The Payment stays. No message.
19. **Bill edited, amount up.** Wrong qty, ₹10,000 → ₹20,000 → admin explicitly creates Debit Note +10,000 linked to the Bill → Balance +₹10,000 → account-update message.
19a. **Bill edited, amount unchanged.** Wrong variety name, same price → history row only. No ledger entry, no message.
20. **Edited twice.** ₹10,000 → ₹20,000 (admin creates Debit Note +10,000) → ₹18,000 (admin creates Credit Note −2,000). Bill shows ₹18,000; history has three rows.
21. **Goods returned / damaged after full payment.** Paid ₹10,000 (₹0), ₹2,000 returned → admin raises Credit Note −2,000 → −₹2,000 advance → account-update message. Then either:
    - used against the next Bill, or
    - refunded → Refund +2,000 → ₹0.
22. **Undercharged.** Admin raises Debit Note for the difference → Balance up.
22a. **Edit and hand-raised note on the same Bill.** Warning shown; admin can ignore it.
23. **Credit Notes exceed the Bill, or Bill is cancelled.** Refused.
24. **Credit Note after the GST deadline.** Only a Commercial Credit Note is allowed (Balance reduces but Motake bears the tax), or a reduction on the next Bill.

### Mistakes and retries

25. **Same checkout submitted twice (bad network).** Second submit is ignored; one Bill, one Payment.
26. **Cash counted short / typo in cash received.** Receipt said ₹2,000, Motake counts ₹1,900 → admin edits the Payment to ₹1,900 with reason → Payment adjusted +100 (debit) → Customer owes ₹100 more → account-update message. Payment history keeps both amounts. The Bill is never edited to cover a cash mistake.

### Customer record changes

27. **Customer moved to another route.** Ledger and Balance move with the Customer unchanged. Blocked while the Customer has open Pre-orders.
28. **Two Customers, same phone.** Separate ledgers and Balances; messages name the Customer and route.
29. **Opening balance.** First entry in the ledger. Seeded from client data, or set once by admin for a Customer added later.

### Things that never touch the ledger

Placing a Pre-order, editing a route price, moving a Customer, GatePass allot / sale quantity / handover, a WhatsApp send failing, change handed back.

## Messages

- **Bill** — when a Bill is raised (Book Now placed, Pre-order fulfilled).
- **Receipt** — when a Payment with amount kept > ₹0 is recorded.
- **Account update** — when a Bill edit, Credit / Debit Note, Payment adjustment or Refund changes the Balance; shows the change, reason and new Balance.
- Bill cancellation sends nothing.

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

- **Intra-state and inter-state** are both supported. Place of supply is the Customer's state:
  - Customer in Motake's state (Maharashtra) → **CGST + SGST** (rate split in half).
  - Customer in another state → **IGST** (full rate).
- Motake's GSTIN and state are held in admin settings. Place of supply is inferred from the Customer's Route state. A Customer has an optional GSTIN; it is printed on their Bills when present.
- Each **variety** has an HSN code and a GST rate, company-wide (not per route). Exempt items (e.g. milk) have rate 0.
- **Route prices exclude tax.** The Bill adds GST per line on top of the route price. The Bill total, Pending and Payments are all tax-inclusive.
- One checkout produces **one document** covering exempt and taxable items together (invoice-cum-bill of supply).
- Money and tax calculations use whole paise internally (integer minor units), never floating-point rupees. Each line's tax is rounded to the nearest paisa. The Bill total is rounded to the nearest rupee with a visible "round off" line.
- Every displayed money amount has exactly two decimal places (for example, `₹1,234.00`).
- Numbering: one server-generated series per financial year, sequential and unique, max 16 characters (e.g. `MTK/26-27/000123`). Credit Notes and Debit Notes each have their own series.

## Open questions

- Bill edit and ledger architecture: whether an issued Bill and its ledger posting remain separate records.
- Credit/Debit Note link target: Bill only, or Bill plus a ledger entry.
- E-invoicing: **blocking decision before implementation**. Confirm whether Motake's turnover and B2B sales require IRN/QR generation.
