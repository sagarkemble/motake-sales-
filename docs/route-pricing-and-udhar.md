# Route pricing, Customer Balance, GST, and WhatsApp Bill / Receipt

**Audience:** developer implementing this feature.
**Status:** product rules from discussion. Build to this document subject to the authority order below.
**App today:** one price per variety for the whole company. Customers are one shared list. Orders store the price used at billing. There is no Route, no Customer Balance, and no WhatsApp.

## Authority and terminology

1. `CONTEXT.md` owns domain terminology.
2. ADR-0003 owns the decision that Route replaces the company-wide variety price and the shared Customer list.
3. ADR-0002 owns Balance, ledger, Bill, Bill History, Payment, Credit/Debit Note, Refund, GST, e-invoicing and money-storage rules.
4. This document owns Route, GatePass, Customer visibility, ordering and end-to-end product behaviour.
5. **Customer** is the canonical term; do not use “shop” in code or product copy.
6. Motake operates under **Regular GST** (not Composition; **CA confirmed**). E-invoicing is configured **per Customer** from the seeded Customer list, not org-wide. Statutory seller details and the CA checklist live in ADR-0002.

This feature adds:

1. A **route** on the GatePass (Kolhapur, Satara, and so on), with its own price for every variety.
2. A **single Balance per Customer**, derived from an append-only ledger. Payments reduce that Balance and are not matched to a day or Bill.
3. An automatic **WhatsApp bill** when a bill is raised, and an automatic **WhatsApp receipt** when a payment is recorded.
4. GST-aware Bills, Bill History, Credit/Debit Notes, Refunds and Opening Balance Adjustments as defined by ADR-0002.

No payment gateway. Staff manually record cash, bank or UPI Payments received outside the app. The app does not collect money.

---



## 1. Words


| Word         | Meaning                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Route**    | A named price list and Customer list whose state determines place of supply. Examples: Kolhapur, Satara.                                  |
| **GatePass** | The stock allotment for one salesman. This feature also stores the route on it. Quantities stay as they are today: issued, sold, returned. |
| **Customer** | One outlet on exactly one Route. This is the record the salesman bills.                                                                     |
| **Owner**    | The person who may own more than one Customer. The app does not keep a separate Owner Balance.                                             |
| **Bill**     | One order's latest billed state, including GST, with every version retained in Bill History.                                               |
| **Balance**  | Debits minus Credits for one Customer.                                                                                                      |
| **Pending**  | A positive Balance: the Customer owes Motake.                                                                                              |
| **Advance**  | A negative Balance: Motake owes the Customer.                                                                                              |
| **Receipt**  | WhatsApp message sent because a payment was recorded.                                                                                      |


Pending of ₹10,000 and a payment of ₹2,000 leaves pending of ₹8,000. The payment is not applied to "Monday's milk" or "Tuesday's curd".

---



## 2. Route on the GatePass

Admin chooses the route when allotting a GatePass. That choice stays on that GatePass. It is not edited later.

The salesman follows **only the route on their active GatePass**.

- They see only Customers on that Route.
- Product rates are that route's rates.
- They cannot place a Book Now order or a Pre-order for a Customer on another Route.

A salesman is not stuck to one Route for life. The next GatePass can use a different Route because Admin chooses again at allotment. Only one GatePass is active per salesman at a time. After handover, a new allotment can use another Route.

**No active GatePass.** The salesman sees no Route Customers, cannot bill, place a Pre-order, add a Customer or record a field Payment. There is no Route, price list or Customer list.

Admin can see every Route and every Customer.

Different salesmen may each have a separate active GatePass on the same Route on the same day. They share Route visibility and Pre-orders on that Route (upcoming, due and overdue), but each GatePass keeps its own stock quantities and handover. One salesman still has only one active GatePass at a time.

Every Route has a state. That Route state always determines place of supply for its Bills. Admin may update the state; the change applies to orders started afterward, while existing orders and historical Bills keep their snapshots.

A used Route is never hard-deleted. Admin may deactivate it only when it has no active GatePass and no open Pre-order. Historical records continue referencing it.

---



## 3. Prices

Admin sets a price for each variety **on each route**. The single company-wide variety price goes away.

- Route prices exclude GST.
- Kolhapur milk and Satara milk are two prices.
- A Route price must be greater than zero. Free samples are a separate future flow.
- The salesman cannot type a different price on a bill.
- A variety with no price on that route cannot be added to the cart. Show a clear reason: this route has no price yet. Do not fall back to another route's price.
- A new variety is not sellable on a route until admin enters that route's price. Creating the variety does not copy a price onto every route.
- The server snapshots the Route price when an item first enters an order. Later price-list edits do not reprice that order, including while its cart/draft remains open. The client never supplies or overrides the price.
- Each variety has effective-dated HSN, exemption status and GST rates. Effective periods cannot overlap. Bill and Note lines snapshot the facts effective for that event.
- Money is stored as integer paise and displayed with two decimal places. Never calculate money with floating-point rupees.
- Use half-up rounding: each line's tax is rounded to paise and the final Bill to the nearest rupee, with a visible round-off component. Credit/Debit Notes reverse the original line's exact remaining paise so repeated partial Notes cannot drift.

The GatePass screen stays quantity-only. Do not show or store money on the GatePass.

---



## 4. Customers

A Customer belongs to **exactly one Route**.

One Owner can have two Customers. Example: Shree Dairy on Kolhapur and Shree Dairy on Satara. Those are two Customer records.

- Each Customer is billed at its own Route's rates. The Owner does not get one blended rate.
- The same mobile number may be saved on more than one Customer. Today's rule “one phone, one Customer” must be removed.
- Phone never identifies a Customer by itself. Selection and every mutation use Customer ID; search results show name, Route and address.
- For WhatsApp, an Indian mobile number is normalized to `+91`. A missing or malformed number makes the notification skipped, but does not block saving the Customer or completing a financial action.
- WhatsApp for each Customer goes to that Customer's number. The message must name the **Customer and Route**, so the Owner can tell two Customers apart.
- A Customer may have an optional **GSTIN**. A valid GSTIN marks a registered business Customer; absence of GSTIN marks a normal (B2C) Customer for statutory messaging and e-invoice treatment.
- **E-invoicing required** is a per-Customer Admin setting (`yes` | `no`), not a company-wide switch. Use it to decide whether that Customer's Bills need an IRN and signed QR before the final Bill PDF and Bill WhatsApp go out. Default: `no` when the Customer has no GSTIN; when a GSTIN is present, default to `yes`. Admin may override either way at any time (including `no` for a GSTIN Customer). A normal Customer without GSTIN may still receive a taxable Bill; IRN is simply not required for them. At migration, **E-invoicing required** for each Customer comes from the seeded Customer list (CA-guided); it is not inferred automatically at runtime.

**Salesman adds a Customer.** It is saved on the Route of the active GatePass. The salesman does not pick a Route. If there is no active GatePass, they cannot add a Customer.

**Admin moves a Customer to another Route.**

- Moving is blocked while the Customer has any open Pre-order.
- The Customer leaves the old Route's list and appears on the new Route's list.
- Bills already placed keep the price they were given.
- The next Bill uses the new Route's price, and only a salesman whose active GatePass is on the new Route can bill that Customer.
- The Customer's Balance moves with the Customer. It is not reset or merged into another Customer.

**Salesman on Kolhapur never sees the Satara Customer**, even when both Customers belong to the same Owner and share a phone.

---



## 5. How a bill gets its price

The tax-exclusive price is the Route price of the **active GatePass** at the moment the order is placed. The app stores that price on the order lines. Later Route-price edits do not change that order.

The Route state is snapshotted as place of supply when the order starts and always determines the tax split. A Route in Motake's state uses CGST + SGST; a Route in another state uses IGST. Updating the Route state affects only orders started afterward.

One Customer-facing Bill concept is used. Internally, a taxable or mixed Bill is a Tax Invoice; a fully exempt Bill is a Bill of Supply.

The Bill row always contains the latest data. Bill History contains the original and every later version. Admin alone may edit a Bill, with a reason, until its GST period is filed:

- Amount and statutory tax fields unchanged: add Bill History only. Still send the updated Bill on WhatsApp after commit (no Note or ledger entry).
- Amount or statutory tax fields changed: save the Bill version and automatically create the necessary numbered Credit/Debit Note and ledger entry in the same transaction.
- A same-total edit that changes HSN, taxable value, exemption, rate, tax split or place of supply still creates tax corrections.
- After filing, the Bill is locked. Admin may create independent GST/Commercial Credit Notes or Debit Notes.

Bill, Credit Note and Debit Note numbers are assigned inside the successful transaction. Once assigned, a number is never reused; cancelled documents retain their numbers. Use separate configurable prefixes per financial year before the first document of that year, for example Bill `MB/26-27/000001`, Credit Note `MC/26-27/000001`, Debit Note `MD/26-27/000001` (`MB` = Motake Bill, `MC` = Motake Credit, `MD` = Motake Debit). GST and Commercial Credit Notes share the Credit Note series; classification is stored on the Note.

At month end, Admin records the externally completed **monthly** GSTR-1 filing through a form containing the filing month, filing date, reference/acknowledgement, filer and optional notes. Submitting that form locks direct Bill edits for that month. Later corrections use Notes.


| Case                                                              | Price used                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Book Now placed today on a Kolhapur GatePass                      | Kolhapur price at the time of placing                                                             |
| Pre-order placed today on a Kolhapur GatePass, fulfilled tomorrow | Kolhapur price from the day it was **placed**, even if admin changed the Kolhapur price overnight |
| Customer moved from Kolhapur to Satara after an order was placed  | That order stays at the old price. The next order uses Satara                                     |
| Salesman tries to bill a variety with no price on this route      | Sale of that variety is blocked                                                                   |
| Two Customers, one Owner, two Routes                              | Each Bill uses the Route of the Customer being billed                                             |


---



## 6. Book Now

All of this happens atomically when the order is placed. The order still deducts GatePass quantity, as today.

1. Validate the active GatePass, Customer Route, snapshotted Route prices and stock. Do not reprice from the current price list.
2. Calculate GST, round-off and the final tax-inclusive total.
3. Create the Bill, Bill History version 1 and Bill ledger debit.
4. Staff enter the payment received. Zero is allowed. The whole Bill can stay Pending. Payment methods are cash, bank and UPI; bank/UPI may have a reference.
5. If cash exceeds the amount required to clear Pending, staff choose: return the extra or keep it as Advance.
6. Update the cached Balance in the same transaction.
7. Determine and snapshot which Bill and Receipt notifications this checkout requires, including their recipient, rendered text, attachment and business document version.
8. Only after Bill History, Notes, GST and ledger resolution commits, hand the required notifications to the decoupled notification boundary. A committed requirement must not be lost if the application crashes before provider delivery; the exact durable-handoff architecture is deferred.
9. If any Payment is kept, send a Receipt after the Bill. A Bill delivery failure does not prevent the Receipt attempt.
10. If the Customer requires e-invoicing, stock, ledger, Balance and Payment still commit in this transaction. Only the **final** Bill PDF and Bill WhatsApp wait until Admin records IRN and signed QR (see §9.6). Receipt WhatsApp still sends when Payment is kept.

Checkout is idempotent. A retry caused by poor connectivity returns the original result and never creates another Bill, stock deduction, Payment or message.

**Example.** Pending was ₹0. Milk bill is ₹3,000. Customer pays ₹1,000.

- Pending becomes ₹2,000.
- Bill message shows this milk bill.
- Receipt shows ₹1,000 received and ₹2,000 still pending.

**Example.** Pending was already ₹7,000 from earlier days. Today's curd bill is ₹3,000. Customer pays ₹2,000.

- Add the bill first: pending ₹10,000.
- Then apply ₹2,000: pending ₹8,000.
- The ₹2,000 is not tied to the curd bill.

---



## 7. Pre-order

**When it is placed**

- Store the route, the route price and the Route state (place of supply) on the order at **placement**.
- The scheduled date may be any future date, but not today.
- Do **not** add the amount to pending.
- Do **not** send the WhatsApp bill.
- Do **not** record a payment.
- Do **not** deduct GatePass quantity (same as today).

**Visibility before fulfil**

- Salesmen on the Route see future Pre-orders as **upcoming** (read-only). Fulfil stays disabled until the scheduled date.

**When it is fulfilled**

- Fulfil only **on or after** the scheduled date, never before.
- Any salesman with an active GatePass on that Route may fulfil it; the Pre-order is not owned by a salesman or GatePass.
- Admin may also fulfil it.
- A salesman on Satara today cannot fulfill a Kolhapur pre-order, including the salesman who placed it if their GatePass today is not Kolhapur.
- Use the price and Route state stored at placement. Do not re-price or re-derive place of supply at fulfil.
- Use the effective GST classification/rate on the fulfilment date.
- Then treat it like a Bill being raised: debit the total, record an optional cash/bank/UPI Payment, WhatsApp the Bill, and WhatsApp a Receipt if an amount was kept.
- Fulfillment still does not deduct GatePass quantity.
- Upcoming, due and overdue Pre-orders stay visible on that Route until fulfilled or cancelled. Upcoming ones are read-only until the scheduled date; due and overdue show the appropriate banner.
- Concurrent fulfilment is first-writer-wins and idempotent. Every other salesman then sees it as fulfilled.
- Admin alone may cancel an unfulfilled Pre-order, with a reason.

**Example.** Monday, Kolhapur GatePass, Pre-order 10 kg basundi at Monday's tax-exclusive Kolhapur rate of ₹200/kg. The ₹2,000 subtotal is stored. Pending does not change. No WhatsApp.

Tuesday the Kolhapur rate is ₹220. A salesman with a Kolhapur GatePass fulfils it. The subtotal remains ₹2,000; GST effective Tuesday is added to produce the final Bill total. That total is debited to the ledger and the Bill WhatsApp goes out.

If Tuesday's GatePass is Satara, that salesman does not see this pre-order as something they can fulfill.

---



## 8. Pending, payment, change, and advance

There is **one Balance per Customer**, derived from an append-only ledger.

- Above zero: the Customer owes Motake (Pending).
- Zero: nothing owed either way.
- Below zero: Advance. Motake owes the Customer.

The Balance is not per Owner and not per Bill. A Kolhapur Customer can owe ₹2,000 while the Satara Customer of the same Owner owes nothing.

Every ledger-changing operation serializes changes for that Customer, adds ledger entries and updates the cached Balance in one transaction. The Balance cache must always reconcile to Debits minus Credits.

### 8.1 Payment with no new purchase

Salesman and Admin can both record this for a Customer they are allowed to see (salesman: Customers on the active GatePass Route; Admin: any Customer).

A salesman requires an active GatePass on the Customer's Route. Admin does not require a GatePass. Cash, bank and UPI are supported. The kept Payment is credited to the Balance. A Receipt is sent. No Bill message.

**Example.** Pending ₹10,000 across three days (milk, curd, and another item). Customer pays ₹2,000 and buys nothing.

- Pending becomes ₹8,000.
- Receipt: received ₹2,000, still pending ₹8,000.
- No line that says which day's bill was cleared.



### 8.2 Cash is less than or equal to pending

The whole cash amount reduces pending. Nothing is returned. Nothing becomes advance.

### 8.3 Cash is more than pending

Staff choose on that payment:

- **Return the extra.** Pending becomes zero. The receipt shows cash received, amount kept, cash to return, and pending ₹0. Only the amount kept is a payment.
- **Keep as advance.** Pending goes below zero by the extra amount. The receipt shows the new credit.

**Example.** Pending ₹1,000. Customer hands ₹1,200.

- Return: keep ₹1,000, return ₹200, pending ₹0.
- Advance: keep ₹1,200, pending becomes −₹200 (₹200 credit).



### 8.4 Next Bill when the Customer already has Advance

Add the new bill to the balance, then apply cash.

**Example.** Balance is −₹2,000 (credit). New bill is ₹5,000. Before cash, pending is ₹3,000. If they pay nothing, pending stays ₹3,000. If they pay ₹3,000, pending is ₹0. If they pay ₹4,000, section 8.3 applies to the extra ₹1,000.

### 8.5 Cancelling an order that was already added to pending

Admin alone may cancel, with a reason. Cancellation never deletes or reverses a Payment.

Admin selects the reason:

- **Voided before delivery:** reverse the remaining uncredited Bill value using a **GST Credit Note** when tax reversal is legally eligible, otherwise a **Commercial Credit Note** after the configured GST Credit Note deadline (see ADR-0002). Exempt-only remaining value reverses without tax. Restore quantities to the originating GatePass only if that GatePass is still active; otherwise stock is unchanged.
- **Goods fully returned:** create the eligible GST Credit Note for remaining affected lines; GatePass stock is unchanged.
- **Commercial write-off/discount:** create a Commercial Credit Note; GST remains payable.

Cancellation reverses only the remaining uncredited lines/value after previous Credit Notes. It never over-credits the Customer.

**Example.** Bill ₹3,000 was added. Customer later paid ₹2,000. Pending is ₹1,000. The ₹3,000 order is cancelled.

- Balance becomes ₹1,000 − ₹3,000 = −₹2,000 (credit), because the ₹2,000 payment stays.
- Do not delete the payment.
- Send the cancellation message. If cancellation generates a statutory Note for a GSTIN Customer, send that Note as well; do not also send the generic account-update message.

A pre-order cancelled **before fulfill** does not change the balance, because it was never added.

### 8.6 Bill edits, Notes, adjustments, and refunds

- Admin may independently create a GST Credit Note, Commercial Credit Note or Debit Note with affected lines and a required reason. A return/damage Note also requires quantity, return/damage date and reason; batch/inventory tracking remains out of scope.
- Automatic and independent Notes have their own sequential number, tax split and ledger entry.
- A possible duplicate Note shows a warning; Admin may continue with a reason.
- An incorrect issued Note is never edited or deleted. Admin reverses it with an opposite Note, then creates the correct Note.
- A GST Credit Note reverses eligible tax. A Commercial Credit Note reduces Balance while Motake bears the original GST.
- A reduction intended for the next Bill is recorded now as a Commercial Credit Note, creating Advance that the next Bill consumes.
- Admin may correct a Payment with a reason. Payment History keeps every version; only the delta is posted on the correction date. The disclosure shows previous amount, corrected amount, difference and reason; exact presentation is deferred.
- Admin may record a Refund up to the available Advance using cash, bank or UPI, with an optional reference, only after that external Refund has actually completed. The app does not model a processing Refund.
- Opening Balance is seeded once per Customer at migration with a cutoff date and signed source data. Before go-live, a wrong seed may be replaced by direct database correction. After go-live, the append-only ledger rule applies: correct mistakes only through a controlled database script that appends a correcting ledger entry (no in-app Opening Balance Adjustment UI for now). No separate approval workflow; record source, reason and acting Admin.

### 8.7 What does not change the balance

- Placing a pre-order
- Editing a route price
- Moving a Customer to another Route
- GatePass allotment, sale quantity, or handover
- A failed WhatsApp send

---



## 9. WhatsApp

Send automatically. Staff do not have to press Send for the normal case. Staff can resend if a send failed or the customer did not get it.

Ordering, billing, Payment and ledger code own the business trigger and provider-neutral content but never call WhatsApp or a provider directly. They use the transport-only notification boundary defined by ADR-0001. Provider choice and the notification component's package/service, queue, outbox, worker, persistence and retry architecture are deferred until implementation planning immediately before development.

A failed send does **not** undo the order or the payment. The sale stands. Show that the message was not sent, and allow retry.

Every WhatsApp text is bilingual: Marathi first, then English. This rule applies to the WhatsApp text only; Bill and Note PDFs keep their own document formats.

The new features send required messages to all Customers without checking or recording WhatsApp consent. Consent tracking and opt-out are future scope.

The automatic instruction snapshots the normalized recipient, rendered text, attachment and business document/version when the business action completes. If the Customer has no usable phone, mark the notification `skipped` and show why; the order or Payment still saves. Correcting the phone does not send automatically. Staff may then request a resend, which uses the corrected current phone while retaining the applicable immutable business document.

### 9.1 Bill message

Send when:

- a Book Now order is placed, or
- a pre-order is fulfilled.

Do not send when a pre-order is only placed.

The message identifies the Customer, Route, Bill, line items, tax, final total and Balance **after the Bill debit but before any Payment recorded in the same checkout**. It contains concise bilingual text and the Bill PDF.

After a Bill edit, send the updated Bill only after Bill History, automatic Notes, GST and ledger changes have all committed. Suppress any older Bill version still waiting to send. If an older version was already sent, it remains in history but cannot be manually resent; offer **Send latest Bill** instead.

### 9.2 Receipt message

Send when a payment is recorded and the amount **kept** is greater than zero. That includes a partial payment and a payment with no new purchase.

Do not send a Receipt when the kept Payment amount is zero.

The bilingual text identifies the Customer, Route, amount kept, cash returned if any, and the final Pending or Advance **after the Payment**. A Receipt has no PDF.

**Example.** Pending was ₹10,000. Payment kept is ₹2,000. Receipt says ₹2,000 received, ₹8,000 still Pending, and the Customer name. It does not list milk vs curd as cleared.

Two messages can go out for one Book Now checkout: the bill, and the receipt if they paid something.

### 9.3 Account update and statutory Notes

- Send a bilingual text-only account-update message after a Bill edit, Credit/Debit Note, Payment adjustment or Refund changes the Balance, except when cancellation sends its dedicated message.
- A GSTIN Customer also receives the statutory Credit/Debit Note.
- A Customer without GSTIN receives the account update only.
- A statutory Note notification contains concise bilingual text and the Note PDF.
- A Balance-changing Bill edit therefore sends the updated Bill and account update, plus the statutory Note for a GSTIN Customer.
- Credit/Debit Notes and Bill History remain available to Admin/CA.

### 9.4 Cancellation

Bill cancellation sends a dedicated bilingual message containing the Customer, Route, Bill number, cancellation reason, reversed amount and resulting Pending or Advance. It does not attach the cancelled Bill PDF and does not also send the generic account-update message. If cancellation generates a statutory Note for a GSTIN Customer, send that Note and its PDF separately.

### 9.5 Status and resend

- Show `pending`, `sent`, `failed` or `skipped` on the related Bill, Payment or Note. Admin can also see the Customer's notification history.
- Retry failed delivery automatically. Exact retry timing and limits are deferred to implementation planning.
- Admin may resend for any Customer. A salesman may resend only for a Customer visible through their Active GatePass Route.
- Manual resend is available for `failed`, `skipped`, and `sent` messages the Customer reports not receiving. It deliberately creates another delivery without repeating any financial operation.
- Do not manually duplicate a `pending` notification.
- Receipts and Notes resend their original immutable document/version. An obsolete Bill version cannot be resent; send the latest Bill instead.

### 9.6 E-invoicing (IRN and signed QR)

Applies only when the Customer's **E-invoicing required** setting is `yes`. There is no org-wide e-invoice mode.

- The sale (stock, Bill, ledger, Balance, Payment) commits immediately. Status **IRN pending** means the final Tax Invoice PDF and Bill WhatsApp are withheld until IRN data exists.
- Admin downloads a clearly marked **Draft — IRN pending** Bill (and any export needed for manual entry on the government e-invoice portal). It must not be presented to the Customer as the final Tax Invoice.
- Admin completes portal reporting outside the app, then enters **IRN**, acknowledgement number, acknowledgement date and **signed QR** (data and/or image). Only Admin may enter or update IRN fields. Provide an **IRN pending** worklist.
- Before IRN is recorded, Admin may correct the Bill and regenerate the draft/export, with Bill History preserved. After IRN is recorded, direct Bill edits are locked; corrections use Credit/Debit Notes or the legally permitted portal cancellation flow.
- **Cancellation on the portal** is manual. Admin performs the allowed portal action first and records its acknowledgement in the app. After the permitted cancellation window, use Notes instead of treating the IRN Bill as directly editable.
- When **E-invoicing required** is `no`, checkout and WhatsApp follow the normal Bill flow with no IRN step.

---



## 10. Who can do what


| Action                                                 | Salesman                                                           | Admin                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- |
| Create and rename routes                               | No                                                                 | Yes                                                 |
| Set variety price per route                            | No                                                                 | Yes                                                 |
| Choose the route while allotting a GatePass            | No                                                                 | Yes                                                 |
| Change the route on a GatePass already allotted        | No                                                                 | No                                                  |
| See Customers                                          | Active GatePass Route only                                         | All Routes                                          |
| Add a Customer                                         | Yes, onto the active GatePass Route                                | Yes, and must set the Route                         |
| Move a Customer to another Route                       | No                                                                 | Yes                                                 |
| Place Book Now / pre-order                             | Yes, on the active route, with a GatePass                          | No (unchanged: salesman places orders)              |
| Fulfill a pre-order                                    | Yes, if the active GatePass Route matches                           | Yes                                                 |
| Cancel an unfulfilled pre-order                        | No                                                                 | Yes, with reason                                    |
| Edit a Bill / create Notes / cancel a billed order     | No                                                                 | Yes, with reason                                    |
| Refund Advance / adjust Opening Balance or Payment     | No                                                                 | Yes                                                 |
| Record a Payment with no new purchase                  | Yes, for a Customer on the active Route                            | Yes, for any Customer                               |
| Choose return vs advance when cash is over the pending | Yes, on a payment they are recording                               | Yes, on a payment they are recording                |
| See a Customer's Balance                               | On Customers they can see, including while billing                 | All Customers                                       |


Deactivating a Customer is blocked while it has any open Pre-order. Deactivation does not erase its Balance. Admin can still see it and record a Payment or Refund. A salesman sees the Customer only when it is active and on their GatePass Route.

Deactivation may leave Pending or Advance. Admin can collect a Payment or issue a Refund after deactivation.

---



## 11. Scenarios

1. **Normal Kolhapur day.** Admin allots a GatePass and selects Kolhapur. Salesman sees Kolhapur Customers and rates. Book Now for milk deducts GatePass stock, debits that Customer's ledger, and sends the Bill on WhatsApp.
2. **Partial payment on the spot.** Bill ₹3,000, cash ₹1,000. Pending increases by ₹2,000 net. Bill WhatsApp and receipt WhatsApp both go out.
3. **Nothing paid.** Cash ₹0. The full bill stays in pending. Bill WhatsApp goes out. No receipt.
4. **Old due, no purchase.** Pending ₹10,000. Payment ₹2,000. Pending ₹8,000. Receipt only. Not matched to any old bill.
5. **Three days, one pot.** Day 1 milk, day 2 curd, day 3 another item. Pending is the sum of whatever was not paid. A single payment reduces the sum.
6. **Overpay, return cash.** Pending ₹1,000, cash ₹1,200, staff choose return. Pending ₹0. Receipt shows ₹200 to return.
7. **Overpay, keep advance.** Same cash, staff choose advance. Balance −₹200. The next bill uses that credit first.
8. **Same Owner, two Customers.** Kolhapur and Satara Customers share a phone. Kolhapur GatePass shows only the Kolhapur Customer at Kolhapur rates. Messages name the Customer and Route.
9. **New Customer in the field.** Salesman on Kolhapur adds a Customer onto Kolhapur. Admin can move it to Satara after its open Pre-orders close. Old Bills keep Kolhapur snapshots; future Bills use Satara. Balance stays with the Customer.
10. **Pre-order price lock.** Placed Monday at Monday's rate. Fulfilled Tuesday after a rate change. Charged at Monday's rate. Pending and bill WhatsApp happen on Tuesday, not Monday.
11. **Wrong route cannot fulfill.** Pre-order is Kolhapur. Today's GatePass is Satara. Fulfill is refused.
12. **No GatePass.** No Customers, billing, Pre-order, field Payment or field-created Customer.
13. **Missing route price.** That variety cannot be sold on that route until admin sets the price.
14. **Rate change after billing.** Tomorrow's Kolhapur price is different. Yesterday's orders and their pending are unchanged.
15. **Second GatePass the same day.** After the first is handed over, Admin allots another and may pick a different Route. The new pass shows that Route's Customers and prices. Previous orders keep their snapshots.
16. **Cancel after a partial Payment.** Admin reverses the remaining uncredited Bill value. The Payment stays and the Balance can become Advance.
17. **Cancel an unfulfilled Pre-order.** Admin cancels with a reason. Balance stays unchanged and no Bill was sent.
18. **WhatsApp fails.** Order and Payment remain. Screen shows failed. Delivery retries automatically, and authorized staff can resend without duplicating financial records.
19. **No phone on the Customer.** Order and Payment remain. The notification is skipped and the screen explains why. After correcting the phone, authorized staff may resend.
20. **Salesman cannot override a price.** The bill uses the route list only.
21. **Duplicate checkout.** A retry returns the original Bill and Payment; nothing is posted twice.
22. **Concurrent Pre-order fulfilment.** The first valid fulfilment wins; everyone else sees fulfilled.
23. **Bill edit up.** Latest Bill and History update; automatic Debit Note increases Balance by the difference; latest Bill is sent after commit.
24. **Bill edit down.** Latest Bill and History update; automatic GST or Commercial Credit Note reduces Balance.
25. **Same total, tax changed.** History updates and paired tax corrections change GST while net Balance stays unchanged.
26. **Earlier Credit Note then cancellation.** Cancellation reverses only remaining uncredited value.
27. **Wrong Note.** Opposite Note reverses it; correct Note is issued. Nothing is deleted.
28. **Filed Bill.** Direct edit is blocked; Admin creates an independent Note.
29. **Intra/interstate.** Snapshotted Route state determines CGST+SGST versus IGST.
30. **Shared phone.** Search shows Customer name, Route and address; Customer ID selects the record.
31. **Overdue Pre-order.** It remains visible with an overdue banner to all active salesmen on that Route.
32. **Price list changes while an order is open.** The order keeps its server-snapshotted price; the salesman never supplies a price and checkout does not reprice it.
33. **Month filed.** Admin records the GSTR-1 filing form; direct Bill edits for that month are blocked.
34. **Payment corrected later.** The correction date carries the delta; disclosure shows old amount, corrected amount, difference and reason.
35. **Return/damage Note.** Affected lines, quantity, date and reason are recorded; GatePass stock remains unchanged.

---



## 12. Not in this feature

- Payment gateway, UPI collect, or card charge
- Clearing a chosen old bill, or fixed installments
- One combined Balance for an Owner across Customers
- SMS (WhatsApp only)
- Email
- WhatsApp consent tracking or opt-out
- Due reminders and pre-order alert popups
- Money fields on the GatePass
- Automatic stock restoration after the originating GatePass is no longer active
- Automatic e-invoice portal integration (manual download + Admin IRN entry only in this feature)
- Composition GST scheme (product assumes Regular GST; validate separately if ever needed)

---



## 13. Done when

- Allotting a GatePass requires a Route. The salesman app is limited to that Route's Customers and prices.
- Each route has its own variety prices. A missing price blocks that variety. A salesman cannot change the price.
- Two Customers may share a phone. Each keeps its own Route, prices and Balance; selection uses Customer ID plus identifying context.
- A Customer added by a salesman lands on the current GatePass Route. Admin can move it after open Pre-orders close. Past order snapshots stay stored.
- Book Now updates pending at place. Pre-order updates pending only at fulfill, at the placement price, and only if today's GatePass route matches.
- With no active GatePass, the salesman cannot bill, pre-order, or take a field payment.
- A Payment reduces the Customer's single Balance and is not applied to a specific Bill.
- Cash above pending is either returned or kept as advance, by a choice on that payment.
- Bill WhatsApp goes out on Book Now place and on pre-order fulfill. Receipt WhatsApp goes out when cash is kept, including a payment with no new sale.
- A failed or skipped WhatsApp send does not roll back the order or the payment.
- Required WhatsApp text is Marathi first and English second; Bill and statutory Note PDFs keep their own formats.
- Bill precedes Receipt, but Bill delivery failure does not block the Receipt attempt.
- Staff can see notification status and resend within their Customer permissions without repeating financial actions; obsolete Bill versions are never resent.
- Bill cancellation sends its dedicated message and any applicable statutory Note, but no generic account-update message.
- All money uses integer paise; Route prices exclude GST.
- Bill lines snapshot effective HSN, exemption, GST rate, tax components and Route state.
- Bill History contains every version; amount/statutory edits create linked Notes and ledger entries atomically.
- GSTIN Customers receive statutory Notes; other Customers receive account updates.
- Pre-orders are Route-owned, support any future date, appear as upcoming on the Route before they are due, and can be fulfilled on or after the scheduled date by any active salesman on that Route or Admin.
- Cancellation is Admin-only, preserves Payments, reverses only remaining value and restores stock only when the originating GatePass remains active.
- Duplicate checkout, fulfilment, Payment, edit, Note, Refund and retry operations cannot double-post.
- Per-Customer **E-invoicing required** (seeded list + Admin override) controls IRN pending vs final Bill/WhatsApp.
- History-only Bill edits still send the updated Bill on WhatsApp.
- Pre-orders lock Route state (place of supply) at placement; GST rate at fulfil.
- IRN pending Bills allow draft download, Admin IRN/QR entry, draft correction before IRN, and lock direct edits after IRN.
- Route state always determines the tax split and is snapshotted when the order starts; later Route-state edits affect future orders only.
- Route prices are positive and server-snapshotted when items enter an order; later price-list edits never reprice it.
- GSTR-1 filing submission locks direct Bill edits for its month.
- Used Routes are deactivated rather than deleted, and only after active GatePasses and open Pre-orders close.
- Customer deactivation is blocked while open Pre-orders exist.

