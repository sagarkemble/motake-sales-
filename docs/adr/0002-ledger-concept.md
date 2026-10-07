# Customer money is kept as an append-only ledger; the Balance is derived from it

Every money event for a Customer is written as a new ledger entry and never erased. The Balance shown in the app is the sum of those entries (with a stored copy updated in the same step for fast reads). We chose this over a single editable balance number because cancellations, returns, bill edits, disputes and per-salesman cash reports all need the history; a single number cannot explain itself or be recomputed after a bug.

All amounts are in Indian Rupees (₹). Bills are GST documents (details: see GST below).

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

A Bill is always debited in **full**. A payment is credited **separately**. The unpaid part is not its own entry — it is just what remains in the Balance.

## Bill versions, Credit Note and Debit Note

A Bill can be edited after it is raised — **by admin only, with a reason, with no time limit** (subject to the GST deadline below). Every edit creates a new **Bill version**. Past versions are kept as they were, each with who edited, when, why, and the full items and amounts at that version. The Bill's original date and time never change.

Because Bills are GST invoices, an issued Bill's amount is never silently overwritten in the books. Each edit automatically produces the matching note for the difference:

**Credit Note** — issued by Motake when the new version is **lower** than the previous one. It **reduces** what the Customer owes (credit entry).
Reasons: goods returned, goods damaged / spoiled, discount after billing, overcharge, fewer items delivered than billed.

**Debit Note** — issued by Motake when the new version is **higher** than the previous one. It **increases** what the Customer owes (debit entry).
Reasons: undercharge, extra items delivered after the Bill, price error in Motake's disfavour.

Definitions follow Indian GST (CGST Act, s.34): both are issued by the seller and reference the original Bill.

Rules:

- Notes are never raised by hand; they only come from a Bill edit. The Customer sees one Bill, "₹1,900 (edited v2, reason)", with its version history.
- A Bill can be edited down to ₹0 but not below. A cancelled Bill cannot be edited.
- GST deadline: a Credit Note must be issued by 30 November after the end of the Bill's financial year (or the annual-return date, if earlier). Debit Notes have no limit. Verify with the client's CA.
- Items removed or returned through an edit do **not** go back onto any GatePass. Stock is not tracked for returns.

## Entry types

| Entry | Side | Created when |
| --- | --- | --- |
| Opening balance | Debit (owed) or Credit (advance) | Seeded from client data, or set once by admin for a new Customer |
| Bill | Debit | Book Now placed; Pre-order fulfilled |
| Payment | Credit | Cash kept (at checkout or with no purchase). Only the amount **kept** is entered; change handed back is never an entry |
| Bill cancelled | Credit | A billed order is cancelled. Equals the current version's full amount |
| Credit Note | Credit | Admin edits a Bill to a lower amount |
| Debit Note | Debit | Admin edits a Bill to a higher amount |
| Refund | Debit | Admin records Motake paying the Customer back out of Advance, with mode (cash / bank / UPI) and optional reference |

Entries are never deleted or overwritten. Each stores who made it, when, and (for salesmen) the Active GatePass, if any.

## Who can change the ledger

Critical actions that reverse or adjust money are **admin only, with a reason**.

| Action | Ledger effect | Salesman | Admin |
| --- | --- | --- | --- |
| Place Book Now | Bill | Yes, on Active GatePass route | No |
| Fulfil Pre-order | Bill | Yes, matching route | Yes |
| Record cash at checkout | Payment | Yes | Yes (when fulfilling) |
| Record payment with no purchase | Payment | Yes, Customer on Active GatePass route | Yes, any Customer |
| Choose return-change vs keep-as-advance | Payment amount | Yes, on own payment | Yes, on own payment |
| Edit a Bill (new version) | Credit Note / Debit Note | No | Yes, with reason |
| Cancel a billed order | Bill cancelled | No | Yes, with reason |
| Refund Advance | Refund | No | Yes, with mode |
| Set Opening balance | Opening balance | No | Yes, once per Customer |
| Edit / fix a recorded Payment | — | No | See open questions |

## What the user sees

The owner sees one number per Customer, not debit/credit columns:

- ABC starts at **₹0**.
- Buys ₹10,000, pays ₹5,000 → **₹5,000 pending**.
- Later pays ₹7,000 → ₹5,000 clears the pending, ₹2,000 is extra → **₹2,000 advance** (shown as −₹2,000 or "Advance ₹2,000").
- Next Bill of ₹3,000 → advance is used first → **₹1,000 pending**.

The ledger (all entries) and each Bill's version history are available on the Customer's detail screen for disputes.

## Customer flows and edge cases

Each line: what happens → ledger entries → resulting Balance → messages.

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

13. **Placed.** Price locked on the order. No ledger entry, no Balance change, no message.
14. **Cancelled before fulfil.** No ledger entry (nothing was billed).
15. **Fulfilled after a price change.** Billed at the locked price, not today's price. Bill entry dated at fulfil time.
16. **Fulfilled by admin.** Same as checkout. Payment, if any, carries no GatePass.

### After the Bill (admin only)

17. **Order cancelled, nothing paid.** Bill +3,000, Bill cancelled −3,000 → back to previous Balance. No message.
18. **Order cancelled after part payment.** Bill +3,000, Payment −2,000, Bill cancelled −3,000 → −₹2,000 (advance). The Payment stays. No message.
19. **Goods returned / damaged after full payment.** Paid ₹10,000 (₹0), ₹2,000 returned → admin edits Bill to ₹8,000 (v2) → Credit Note −2,000 → −₹2,000 advance → account-update message. Then either:
    - used against the next Bill, or
    - refunded → Refund +2,000 → ₹0.
20. **Discount after billing.** Bill ₹2,000 edited to ₹1,900 (v2) → Credit Note −100.
21. **Items removed (customer took fewer).** Bill edited without those items → Credit Note for their value. Stock not returned to GatePass.
22. **Undercharged / extra items added later.** Bill edited up → Debit Note for the difference.
23. **Edit would push the Bill below ₹0, or Bill is cancelled.** Refused.
24. **Edit after the GST Credit Note deadline.** See open questions.
25. **Edited twice.** v1 ₹2,000 → v2 ₹1,900 (Credit Note −100) → v3 ₹2,100 (Debit Note +200). Each note is the difference from the previous version.

### Mistakes and retries

26. **Same checkout submitted twice (bad network).** Second submit is ignored; one Bill, one Payment.
27. **Cash counted short / typo in cash received.** See open questions. The Bill must not be edited to cover a cash mistake: the goods and tax were correct, only the Payment was wrong.

### Customer record changes

28. **Customer moved to another route.** Ledger and Balance move with the Customer unchanged. Blocked while the Customer has open Pre-orders.
29. **Two Customers, same phone.** Separate ledgers and Balances; messages name the Customer and route.
30. **Opening balance.** First entry in the ledger. Seeded from client data, or set once by admin for a Customer added later.

### Things that never touch the ledger

Placing a Pre-order, editing a route price, moving a Customer, GatePass allot / sale quantity / handover, a WhatsApp send failing, change handed back.

## Messages

- **Bill** — when a Bill is raised (Book Now placed, Pre-order fulfilled).
- **Receipt** — when a Payment with amount kept > ₹0 is recorded.
- **Account update** — when a Bill edit (Credit / Debit Note) or Refund changes the Balance; shows the change, reason and new Balance.
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

Bills are GST documents. Field-level design (GSTIN, HSN, rates, invoice numbering, exempt vs taxable items) is pending — see open questions.

## Open questions

- Wrong cash amount on a Payment (flow 27): how is it fixed now that Payment correction is removed?
- Bill edit after the GST Credit Note deadline (flow 24): block, or allow?
- GST details: see grilling round 4.
