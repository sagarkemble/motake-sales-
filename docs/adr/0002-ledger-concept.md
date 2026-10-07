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

A Bill can be edited after it is raised — **by admin only, with a reason, with no time limit**. Editing does **not** create a Credit or Debit Note.

- The **Bill** always holds the latest items and amounts.
- **Bill history** holds one row per version, including the first. A Bill never edited has exactly one history row.
- Each history row keeps the full items and amounts of that version, who made it, when, and the reason.
- The Bill's original date, time and number never change.
- A cancelled Bill cannot be edited. A Bill cannot be edited below ₹0.
- Items removed through an edit do **not** go back onto any GatePass. Stock is not tracked for returns.

Example:

```
Bill                      Bill history
id  amount                bill_id  version  amount  reason
1   20,000   (latest)     1        1        10,000  (raised)
                          1        2        20,000  extra crates delivered
```

How the edit reaches the Balance: see open questions.

## Credit Note and Debit Note

Raised **by admin only, by hand, with a reason**, against a Bill. Independent of Bill editing. Definitions follow Indian GST (CGST Act, s.34): both are issued by the seller and reference the original Bill.

**Credit Note** — the Bill charged **more** than it should have. It **reduces** what the Customer owes (credit entry).
Reasons: goods returned, goods damaged / spoiled, discount after billing, overcharge.

**Debit Note** — the Bill charged **less** than it should have. It **increases** what the Customer owes (debit entry).
Reasons: undercharge, extra items delivered after the Bill.

Rules:

- Each note has its own number series, date, amount, tax split and reason. The original Bill is untouched.
- Total Credit Notes on a Bill cannot exceed that Bill's amount. No notes on a cancelled Bill.
- GST deadline: a Credit Note must be issued by 30 November after the end of the Bill's financial year (or the annual-return date, if earlier). Debit Notes have no limit. Verify with the client's CA.

## Entry types

| Entry | Side | Created when |
| --- | --- | --- |
| Opening balance | Debit (owed) or Credit (advance) | Seeded from client data, or set once by admin for a new Customer |
| Bill | Debit | Book Now placed; Pre-order fulfilled |
| Payment | Credit | Cash kept (at checkout or with no purchase). Only the amount **kept** is entered; change handed back is never an entry |
| Bill cancelled | Credit | Admin cancels a billed order. Equals the Bill's current amount |
| Credit Note | Credit | Admin raises one against a Bill |
| Debit Note | Debit | Admin raises one against a Bill |
| Refund | Debit | Admin records Motake paying the Customer back out of Advance, with mode (cash / bank / UPI) and optional reference |

Entries are never deleted or overwritten. Each stores who made it, when, and (for salesmen) the Active GatePass, if any.

## Who can change the ledger

Critical actions that reverse or adjust money are **admin only, with a reason**.

| Action | Ledger effect | Salesman | Admin |
| --- | --- | --- | --- |
| Place Book Now | Bill | Yes, on Active GatePass route | No |
| Fulfil Pre-order | Bill | Yes, see open questions | Yes |
| Record cash at checkout | Payment | Yes | Yes (when fulfilling) |
| Record payment with no purchase | Payment | Yes, Customer on Active GatePass route | Yes, any Customer |
| Choose return-change vs keep-as-advance | Payment amount | Yes, on own payment | Yes, on own payment |
| Edit a Bill | See open questions | No | Yes, with reason |
| Raise Credit Note / Debit Note | Credit Note / Debit Note | No | Yes, with reason |
| Cancel a billed order | Bill cancelled | No | Yes, with reason |
| Cancel an unfulfilled Pre-order | None | Yes, own | Yes |
| Refund Advance | Refund | No | Yes, with mode |
| Set Opening balance | Opening balance | No | Yes, once per Customer |
| Fix a wrongly recorded Payment | — | No | See open questions |

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

13. **Placed.** Price locked on the order (tax calculated at fulfil on the locked price). No ledger entry, no Balance change, no message.
14. **Cancelled before fulfil.** By its salesman or admin. No ledger entry (nothing was billed).
15. **Fulfilled after a price change.** Billed at the locked price, not today's price. Bill entry dated at fulfil time.
16. **Fulfilled by admin.** Same as checkout. Payment, if any, carries no GatePass.

### After the Bill (admin only)

17. **Order cancelled, nothing paid.** Bill +3,000, Bill cancelled −3,000 → back to previous Balance. No message.
18. **Order cancelled after part payment.** Bill +3,000, Payment −2,000, Bill cancelled −3,000 → −₹2,000 (advance). The Payment stays. No message.
19. **Bill edited.** Bill ₹10,000 → ₹20,000 with reason. Bill shows ₹20,000; history shows both versions. Effect on Balance: see open questions.
20. **Edited twice.** ₹10,000 → ₹20,000 → ₹18,000. Bill shows ₹18,000; history has three rows.
21. **Goods returned / damaged after full payment.** Paid ₹10,000 (₹0), ₹2,000 returned → admin raises Credit Note −2,000 → −₹2,000 advance → account-update message. Then either:
    - used against the next Bill, or
    - refunded → Refund +2,000 → ₹0.
22. **Undercharged.** Admin raises Debit Note for the difference → Balance up.
23. **Credit Notes exceed the Bill, or Bill is cancelled.** Refused.
24. **Credit Note after the GST deadline.** See open questions.

### Mistakes and retries

25. **Same checkout submitted twice (bad network).** Second submit is ignored; one Bill, one Payment.
26. **Cash counted short / typo in cash received.** See open questions. The Bill must not be edited to cover a cash mistake: the goods and tax were correct, only the Payment was wrong.

### Customer record changes

27. **Customer moved to another route.** Ledger and Balance move with the Customer unchanged. Blocked while the Customer has open Pre-orders.
28. **Two Customers, same phone.** Separate ledgers and Balances; messages name the Customer and route.
29. **Opening balance.** First entry in the ledger. Seeded from client data, or set once by admin for a Customer added later.

### Things that never touch the ledger

Placing a Pre-order, editing a route price, moving a Customer, GatePass allot / sale quantity / handover, a WhatsApp send failing, change handed back.

## Messages

- **Bill** — when a Bill is raised (Book Now placed, Pre-order fulfilled).
- **Receipt** — when a Payment with amount kept > ₹0 is recorded.
- **Account update** — when a Bill edit, Credit / Debit Note or Refund changes the Balance; shows the change, reason and new Balance.
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

- Motake supplies within Maharashtra only: every Bill charges **CGST + SGST**, never IGST.
- Motake's GSTIN is held in admin settings. A Customer may have a GSTIN (optional); it is printed on their Bills when present.
- Each **variety** has an HSN code and a GST rate, company-wide (not per route). Exempt items (e.g. milk) have rate 0.
- **Route prices exclude tax.** The Bill adds GST per line on top of the route price. The Bill total, Pending and Payments are all tax-inclusive.
- One checkout produces **one document** covering exempt and taxable items together (invoice-cum-bill of supply).
- Numbering: one server-generated series per financial year, sequential and unique, max 16 characters (e.g. `MTK/26-27/000123`). Credit Notes and Debit Notes each have their own series.

## Open questions

- Bill edit → Balance: how the change in a Bill's amount reaches the ledger.
- Credit / Debit Note vs Bill edit: when admin should use which.
- Wrong cash amount on a Payment (flow 26): how it is fixed.
- Credit Note after the GST deadline (flow 24): block, or allow.
- Pre-order fulfilment: who may fulfil (route / GatePass link).
- E-invoicing: whether Motake's turnover requires it.
