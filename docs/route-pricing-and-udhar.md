# Route pricing, shop udhar, and WhatsApp bill / receipt

**Audience:** developer implementing this feature.
**Status:** product rules from discussion. Build to this document.
**App today:** one price per variety for the whole company. Customers are one shared list. Orders store the price used at billing. There is no route, no shop balance, and no WhatsApp.

This feature adds three things:

1. A **route** on the GatePass (Kolhapur, Satara, and so on), with its own price for every variety.
2. A **single pending amount per shop**. Payments reduce that amount. They are not matched to a day or a bill.
3. An automatic **WhatsApp bill** when a bill is raised, and an automatic **WhatsApp receipt** when a payment is recorded.

No payment gateway. Staff type the cash they received. The app does not collect money.

---



## 1. Words


| Word         | Meaning                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Route**    | A named price list and shop list. Examples: Kolhapur, Satara.                                                                              |
| **GatePass** | The stock allotment for one salesman. This feature also stores the route on it. Quantities stay as they are today: issued, sold, returned. |
| **Shop**     | One outlet on one route. This is the customer record the salesman bills.                                                                   |
| **Owner**    | The person who may own more than one shop. The app does not keep a separate owner balance.                                                 |
| **Bill**     | One order's amount, at the route price locked onto that order.                                                                             |
| **Pending**  | How much that shop owes Motake right now. One number.                                                                                      |
| **Advance**  | How much Motake owes that shop (cash kept above what was owed). The same balance, below zero.                                              |
| **Receipt**  | WhatsApp message sent because a payment was recorded.                                                                                      |


Pending of ₹10,000 and a payment of ₹2,000 leaves pending of ₹8,000. The payment is not applied to "Monday's milk" or "Tuesday's curd".

---



## 2. Route on the GatePass

Admin chooses the route when allotting a GatePass. That choice stays on that GatePass. It is not edited later.

The salesman follows **only the route on their active GatePass**.

- They see only shops on that route.
- Product rates are that route's rates.
- They cannot place a Book Now order or a pre-order for a shop on another route.

A salesman is not stuck to one route for life. The next GatePass can be a different route, because admin chooses the route again at allotment. Only one GatePass is active at a time (same rule as today). After handover, a new allotment can use another route.

**No active GatePass.** The salesman sees no route shops, cannot bill, and cannot place a pre-order. There is no route, so there is no price list and no shop list.

Admin can see every route and every shop.

---



## 3. Prices

Admin sets a price for each variety **on each route**. The single company-wide variety price goes away.

- Kolhapur milk and Satara milk are two prices.
- The salesman cannot type a different price on a bill.
- A variety with no price on that route cannot be added to the cart. Show a clear reason: this route has no price yet. Do not fall back to another route's price.
- A new variety is not sellable on a route until admin enters that route's price. Creating the variety does not copy a price onto every route.
- Price edits apply to **future bills only**. Orders already placed keep the price stored on them.

The GatePass screen stays quantity-only. Do not show or store money on the GatePass.

---



## 4. Shops

A shop belongs to **exactly one route**.

One owner can have two shops. Example: Shree Dairy on Kolhapur and Shree Dairy on Satara. Those are two shop records.

- Each shop is billed at its own route's rates. The owner does not get one blended rate.
- The same mobile number may be saved on more than one shop. Today's rule "one phone, one shop" must be removed.
- WhatsApp for each shop goes to that shop's number. The message must name the **shop and the route**, so the owner can tell the two shops apart.

**Salesman adds a shop.** It is saved on the route of the active GatePass. The salesman does not pick a route. If there is no active GatePass, they cannot add a shop.

**Admin moves a shop to another route.**

- The shop leaves the old route's list and appears on the new route's list.
- Bills already placed keep the price they were given.
- The next bill uses the new route's price, and only a salesman whose active GatePass is the new route can bill that shop.
- The shop's pending amount moves with the shop. It is not reset and not merged into another shop.

**Salesman on Kolhapur never sees the Satara shop**, even when both shops belong to the same owner and share a phone.

---



## 5. How a bill gets its price

The price is the route price of the **active GatePass** at the moment the order is placed. The app stores that price on the order lines (this snapshot already exists). Later edits to the route price list do not change that order.


| Case                                                              | Price used                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Book Now placed today on a Kolhapur GatePass                      | Kolhapur price at the time of placing                                                             |
| Pre-order placed today on a Kolhapur GatePass, fulfilled tomorrow | Kolhapur price from the day it was **placed**, even if admin changed the Kolhapur price overnight |
| Shop moved from Kolhapur to Satara after an order was placed      | That order stays at the old price. The next order uses Satara                                     |
| Salesman tries to bill a variety with no price on this route      | Sale of that variety is blocked                                                                   |
| Two shops, one owner, two routes                                  | Each bill uses the route of the shop being billed                                                 |


---



## 6. Book Now

All of this happens when the order is placed. The order still deducts GatePass quantity, as today.

1. Bill total is added to the shop's pending.
2. Staff enter the cash received. Zero is allowed. The whole bill can stay pending.
3. If the cash is more than what is needed to clear the pending, staff choose: return the extra, or keep it as advance (section 8).
4. WhatsApp the bill to the shop.
5. If any cash is kept, WhatsApp a receipt as well.

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

- Store the route and the route price on the order.
- Do **not** add the amount to pending.
- Do **not** send the WhatsApp bill.
- Do **not** record a payment.
- Do **not** deduct GatePass quantity (same as today).

**When it is fulfilled**

- Only a salesman whose **active GatePass route is the same route as the pre-order** can fulfill it.
- A salesman on Satara today cannot fulfill a Kolhapur pre-order, including the salesman who placed it if their GatePass today is not Kolhapur.
- Use the price stored at placement. Do not re-price.
- Then treat it like a bill being raised: add the total to pending, record cash received (zero allowed), WhatsApp the bill, and WhatsApp a receipt if cash was kept.
- Fulfillment still does not deduct GatePass quantity.

**Example.** Monday, Kolhapur GatePass, pre-order 10 kg basundi at Monday's Kolhapur rate of ₹200/kg. Total ₹2,000 is stored on the order. Pending does not change. No WhatsApp.

Tuesday the Kolhapur rate is ₹220. A salesman with a Kolhapur GatePass fulfills it. The bill is still ₹2,000. That ₹2,000 is added to pending. The bill WhatsApp goes out now.

If Tuesday's GatePass is Satara, that salesman does not see this pre-order as something they can fulfill.

---



## 8. Pending, payment, change, and advance

There is **one balance per shop**.

- Above zero: the shop owes Motake (pending).
- Zero: nothing owed either way.
- Below zero: advance. The shop has credit with Motake.

The balance is not per owner and not per bill. Kolhapur shop can owe ₹2,000 while the Satara shop of the same owner owes nothing.

### 8.1 Payment with no new purchase

Salesman and admin can both record this, for a shop they are allowed to see (salesman: shops on the active GatePass route; admin: any shop).

Cash received is subtracted from pending. A receipt is sent. No bill message.

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



### 8.4 Next bill when the shop already has advance

Add the new bill to the balance, then apply cash.

**Example.** Balance is −₹2,000 (credit). New bill is ₹5,000. Before cash, pending is ₹3,000. If they pay nothing, pending stays ₹3,000. If they pay ₹3,000, pending is ₹0. If they pay ₹4,000, section 8.3 applies to the extra ₹1,000.

### 8.5 Cancelling an order that was already added to pending

Remove **that order's bill total** from the balance. Do not try to undo a specific payment, because payments are not tied to bills.

**Example.** Bill ₹3,000 was added. Customer later paid ₹2,000. Pending is ₹1,000. The ₹3,000 order is cancelled.

- Balance becomes ₹1,000 − ₹3,000 = −₹2,000 (credit), because the ₹2,000 payment stays.
- Do not delete the payment.
- Send no automatic "cancel" WhatsApp unless a later feature adds one. This feature does not.

A pre-order cancelled **before fulfill** does not change the balance, because it was never added.

### 8.6 What does not change the balance

- Placing a pre-order
- Editing a route price
- Moving a shop to another route
- GatePass allotment, sale quantity, or handover
- A failed WhatsApp send

---



## 9. WhatsApp

Send automatically. Staff do not have to press Send for the normal case. Staff can resend if a send failed or the customer did not get it.

A failed send does **not** undo the order or the payment. The sale stands. Show that the message was not sent, and allow retry.

If the shop has no usable phone, skip the send, and show why. The order or payment still saves.

### 9.1 Bill message

Send when:

- a Book Now order is placed, or
- a pre-order is fulfilled.

Do not send when a pre-order is only placed.

The message identifies the shop, the route, the order, the line items with the prices charged, the bill total, and the shop's pending after this bill is added (before or after the payment on that same step — the receipt covers the payment). Minimum the customer must be able to see: which shop, what was billed, and for how much.

### 9.2 Receipt message

Send when a payment is recorded and the amount **kept** is greater than zero. That includes a partial payment and a payment with no new purchase.

Do not send a receipt when cash received is zero.

The message identifies the shop, the route, the amount kept, cash returned if any, and the pending or advance after the payment.

**Example.** Pending was ₹10,000. Payment kept is ₹2,000. Receipt says ₹2,000 received, ₹8,000 still pending, and the shop name. It does not list milk vs curd as cleared.

Two messages can go out for one Book Now checkout: the bill, and the receipt if they paid something.

---



## 10. Who can do what


| Action                                                 | Salesman                                                           | Admin                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- |
| Create and rename routes                               | No                                                                 | Yes                                                 |
| Set variety price per route                            | No                                                                 | Yes                                                 |
| Choose the route while allotting a GatePass            | No                                                                 | Yes                                                 |
| Change the route on a GatePass already allotted        | No                                                                 | No                                                  |
| See shops                                              | Active GatePass route only                                         | All routes                                          |
| Add a shop                                             | Yes, onto the active GatePass route                                | Yes, and must set the route                         |
| Move a shop to another route                           | No                                                                 | Yes                                                 |
| Place Book Now / pre-order                             | Yes, on the active route, with a GatePass                          | No (unchanged: salesman places orders)              |
| Fulfill a pre-order                                    | Yes, only if the active GatePass route matches the pre-order route | No                                                  |
| Record a payment with no new purchase                  | Yes, for a shop on the active route                                | Yes, for any shop                                   |
| Choose return vs advance when cash is over the pending | Yes, on a payment they are recording                               | Yes, on a payment they are recording                |
| See a shop's pending                                   | On shops they can see, including while billing that shop           | All shops, including a list of shops that owe money |


Deactivating a shop does not erase its pending. Admin can still see it and record a payment until the balance is zero. A salesman sees the shop only when it is active and on their GatePass route.

---



## 11. Scenarios

1. **Normal Kolhapur day.** Admin allots a GatePass and selects Kolhapur. Salesman sees Kolhapur shops and Kolhapur rates. Book Now for milk deducts GatePass stock, adds the bill to that shop's pending, and sends the bill on WhatsApp.
2. **Partial payment on the spot.** Bill ₹3,000, cash ₹1,000. Pending increases by ₹2,000 net. Bill WhatsApp and receipt WhatsApp both go out.
3. **Nothing paid.** Cash ₹0. The full bill stays in pending. Bill WhatsApp goes out. No receipt.
4. **Old due, no purchase.** Pending ₹10,000. Payment ₹2,000. Pending ₹8,000. Receipt only. Not matched to any old bill.
5. **Three days, one pot.** Day 1 milk, day 2 curd, day 3 another item. Pending is the sum of whatever was not paid. A single payment reduces the sum.
6. **Overpay, return cash.** Pending ₹1,000, cash ₹1,200, staff choose return. Pending ₹0. Receipt shows ₹200 to return.
7. **Overpay, keep advance.** Same cash, staff choose advance. Balance −₹200. The next bill uses that credit first.
8. **Same owner, two shops.** Kolhapur shop and Satara shop, same phone. Kolhapur GatePass shows only the Kolhapur shop at Kolhapur rates. Messages name the shop and route.
9. **New shop in the field.** Salesman on Kolhapur adds a shop. It is a Kolhapur shop. Admin can move it to Satara later. Old bills keep Kolhapur prices. New bills use Satara prices. Pending stays on that shop.
10. **Pre-order price lock.** Placed Monday at Monday's rate. Fulfilled Tuesday after a rate change. Charged at Monday's rate. Pending and bill WhatsApp happen on Tuesday, not Monday.
11. **Wrong route cannot fulfill.** Pre-order is Kolhapur. Today's GatePass is Satara. Fulfill is refused.
12. **No GatePass.** No shops, no billing, no pre-order, no field payment.
13. **Missing route price.** That variety cannot be sold on that route until admin sets the price.
14. **Rate change after billing.** Tomorrow's Kolhapur price is different. Yesterday's orders and their pending are unchanged.
15. **Second GatePass the same day.** After the first is handed over, admin allots another and may pick a different route. The new pass shows that route's shops and prices. The previous pass's orders keep the prices already stored.
16. **Cancel after a partial payment.** The bill amount is removed from the balance. The payment record stays. The balance can become advance.
17. **Cancel a pre-order before fulfill.** Balance unchanged. No bill was sent.
18. **WhatsApp fails.** Order and payment remain. Screen shows not sent. Staff can resend.
19. **No phone on the shop.** Order and payment remain. Nothing is sent. Screen says the shop has no phone.
20. **Salesman cannot override a price.** The bill uses the route list only.

---



## 12. Not in this feature

- Payment gateway, UPI collect, or card charge
- Clearing a chosen old bill, or fixed installments
- One combined pending for an owner across shops
- SMS (WhatsApp only)
- Due reminders and pre-order alert popups
- A WhatsApp message for a cancellation
- Money fields on the GatePass

---



## 13. Done when

- Allotting a GatePass requires a route. The salesman app is limited to that route's shops and prices.
- Each route has its own variety prices. A missing price blocks that variety. A salesman cannot change the price.
- Two shops may share a phone. Each keeps its own route, prices, and pending.
- A shop added by a salesman lands on the current GatePass route. Admin can move it. Past order prices stay stored.
- Book Now updates pending at place. Pre-order updates pending only at fulfill, at the placement price, and only if today's GatePass route matches.
- With no active GatePass, the salesman cannot bill, pre-order, or take a field payment.
- A payment of any amount reduces the shop's single pending figure and is not applied to a specific bill.
- Cash above pending is either returned or kept as advance, by a choice on that payment.
- Bill WhatsApp goes out on Book Now place and on pre-order fulfill. Receipt WhatsApp goes out when cash is kept, including a payment with no new sale.
- A failed or skipped WhatsApp send does not roll back the order or the payment.

