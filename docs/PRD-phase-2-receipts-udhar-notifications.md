# Motake — Phase 2: Receipts, Udhar, Change & Alerts

**Product Requirements Document**

| Field | Value |
| --- | --- |
| **Company** | Motake |
| **Phase** | Phase 2 — Settlement, digital receipts & operational alerts |
| **Status** | Draft for developer handoff |
| **Baseline** | Phase 1 live: GatePass, Book Now / Pre-order, shared customers, Admin + Salesman |
| **Audience** | Product + Engineering (functional / non-functional only) |

---

## 1. Purpose

Phase 1 records orders and GatePass quantities but does **not** settle money in the app. Field staff still collect money offline; there is no outstanding balance (udhar), no digital receipt to the customer’s phone, and no proactive alert when a pre-order needs attention.

Phase 2 extends Motake so Admin and Salesman can:

1. Send order receipts to the customer’s phone (SMS and WhatsApp)
2. Record flexible credit (udhar) and track customer dues
3. Calculate how much cash to return when the customer overpays
4. Receive in-app and web alerts for pre-order events (with a clear modal when something needs action)

**No payment integration** — Motake does not collect money through a payment gateway, UPI auto-pay, or in-app charge. Staff only **record** what was collected / left as due.

**GatePass remains as shipped in Phase 1** — this PRD does not redefine allotment, sell-down, or end-of-day handover.

---

## 2. Goals

| # | Goal | Success looks like |
| --- | --- | --- |
| G1 | Digital receipt on the right moment | Customer gets SMS/WhatsApp receipt when a regular order is placed, and when a pre-order is fulfilled |
| G2 | Flexible udhar, not fixed EMIs | Staff can take part payment now and leave any remaining amount as due; later payments of any amount reduce due |
| G3 | Dues visible where work happens | Salesman sees due when selecting a customer in cart; Admin sees all customer dues |
| G4 | Clear cash change | At collection, staff enter amount received and instantly see amount to return |
| G5 | Pre-order awareness | Staff get in-app and web notifications for pre-order events; urgent ones surface via a modal |
| G6 | Reminder on outstanding due | Customers with due can be reminded (manual and/or scheduled) |

---

## 3. Roles (unchanged)

| Role | Phase 2 additions |
| --- | --- |
| **Admin** | Customer dues overview; receipt send / resend; due reminders oversight; pre-order / ops notifications on web |
| **Salesman** | Record collected amount / udhar at checkout (manual entry only); see due on customer select; calculate change; send receipt; fulfill pre-order (triggers receipt); in-app pre-order alerts |
| **Customer** | Still **no login** — receives SMS/WhatsApp only; identified by shop + phone on the customer record |

---

## 4. Scope

### 4.1 In scope

| Feature | From notes | Summary |
| --- | --- | --- |
| **Receipt via phone** | §2 | SMS + WhatsApp; Send Receipt control; status “sent” |
| **Udhar system** | §4 | Flexible pay; reminders; Admin due list; due on cart customer select |
| **Change / return amount** | Notes | “How much to return to customer” when staff record amount received |
| **In-app notification → Pre-order** | §5 | Alerts tied to pre-order lifecycle |
| **Web notification** | §6 | Same events reachable for Admin (and Salesman when on web) |
| **Short polling → Modal** | Notes | App periodically checks for new alert-worthy events and can open a modal |

### 4.2 Out of scope (this phase)

- Customer mobile app / customer login
- Fixed installment / EMI schedule (explicitly rejected in notes — use flexible pay)
- **Payment integration** — payment gateway, UPI auto-collection, in-app charge, payment QR / payment scanner, card/net-banking capture
- Redesign of GatePass allotment or handover
- In-app chat between Admin and Salesman (unless later confirmed; notes point to **alerts + modal**, not chat)
- Warehouse / central stock
- Multi-currency

### 4.3 Depends on Phase 1 (do not rebuild)

- Shared customer with phone
- Book Now vs Pre-order lifecycle and statuses
- Salesman cart → checkout → place order
- Pre-order fulfill action
- Admin orders & customer screens
- GatePass day flow

---

## 5. Domain language (use consistently)

| Term | Meaning |
| --- | --- |
| **Order (Book Now)** | Same-day order; receipt trigger = when **placed** |
| **Pre-order** | Next-day commitment; receipt trigger = when **fulfilled** |
| **Receipt** | Message to customer phone summarizing the completed sale (items/total/order code as product decides) |
| **Udhar / Due** | Outstanding amount the customer still owes Motake |
| **Flexible pay** | Any positive amount ≤ remaining due (or any amount toward bill at sale) — not fixed equal installments |
| **Amount received** | Amount staff record as collected from the customer now (manual entry; not charged in-app) |
| **Amount to return** | Amount received − amount applied to this sale / due (change) |
| **Send Receipt** | Staff control to send or resend the phone receipt |
| **Reminder** | Message or prompt about outstanding due |

---

## 6. Functional Requirements

### 6.1 Receipt via phone (SMS & WhatsApp)

| ID | Requirement |
| --- | --- |
| FR-R1 | Staff can send a digital receipt to the customer’s registered phone via **SMS** and **WhatsApp**. |
| FR-R2 | For a **regular Order (Book Now)**, the system offers / allows receipt send when the order is **placed**. |
| FR-R3 | For a **Pre-order**, the system offers / allows receipt send when the pre-order is **fulfilled** (not at initial place). |
| FR-R4 | A clear **Send Receipt** action is available on the relevant order / pre-order screen for Admin and Salesman (as role permissions allow). |
| FR-R5 | After a successful send, the UI shows confirmation such as **SMS sent** / **WhatsApp sent** (per channel used). |
| FR-R6 | Staff can see whether a receipt was already sent for that order and can **resend** if needed. |
| FR-R7 | If the customer has no usable phone number, the system blocks send and explains why. |
| FR-R8 | Receipt content must identify the shop/customer, order code, key line items or summary, and amount relevant to that event. |
| FR-R9 | Failed sends are visible to staff with a simple retry path. |

**Happy paths**

1. Order placed → Send Receipt → customer receives message → status shows sent  
2. Pre-order placed → … → Fulfilled → Send Receipt → customer receives message → status shows sent  

---

### 6.2 Udhar (credit) system

| ID | Requirement |
| --- | --- |
| FR-U1 | At sale / collection, staff can **manually record** that the customer paid **part of the bill now** and leaves the rest as **due (udhar)**. No in-app payment capture. |
| FR-U2 | The product supports **flexible pay only** — any allowed amount toward the bill or existing due. Fixed equal installments are **not** required and must not be the primary model. |
| FR-U3 | Example behaviour (illustrative): bill ₹5000; customer pays ₹1000 now → due ₹4000; later pays ₹2000 then ₹2000 until due is cleared. |
| FR-U4 | Each recorded collection against due reduces the customer’s outstanding balance and is visible in history for that customer. |
| FR-U5 | **Admin** can view **Customer Due** — which customers owe money and how much (list + per-customer detail). |
| FR-U6 | **Salesman flow:** Cart → select customer → system shows that customer’s current **Due** before / while completing the sale. |
| FR-U7 | Staff can manually record a collection that applies only to existing due (customer pays old balance without a new order), if product allows from Admin and/or Salesman screens. |
| FR-U8 | Due cannot go negative through normal entry; overpayment is handled via change rules (§6.3) or explicit adjustment policy. |
| FR-U9 | **Reminder:** staff can trigger a due reminder to the customer; product may also support scheduled reminders for open dues (see open questions). |
| FR-U10 | Soft-deactivated or blocked customers with open due remain visible in Admin due views until settled or written off per policy. |

---

### 6.3 How much to return to customer (change)

| ID | Requirement |
| --- | --- |
| FR-C1 | When recording collection, staff can enter **amount received from customer**. |
| FR-C2 | The system calculates and displays **how much to return to the customer** (change). |
| FR-C3 | Change calculation respects what is applied to this bill vs what remains as udhar (e.g. bill 5000, apply 1000 now, customer hands 2000 → return 1000, due 4000 — exact rules to be confirmed in open questions). |
| FR-C4 | If amount received is less than the amount intended to collect now, the system warns and does not invent incorrect “return” amounts. |
| FR-C5 | This is **manual cash-change helper** only — not GatePass stock “return” (unsold bottles) and not a payment gateway. Labels must not confuse these. |

---

### 6.4 Notifications — in-app (pre-order) & web

| ID | Requirement |
| --- | --- |
| FR-N1 | **In-app notifications** inform staff about **pre-order** events that need attention (at minimum: pre-order becoming due / ready to fulfill; optionally new pre-order placed — confirm list in open questions). |
| FR-N2 | **Web notifications** deliver the same class of alerts when the user is using Motake in the browser (Admin desktop and Salesman web/PWA as applicable). |
| FR-N3 | Notifications are readable in a simple list / inbox: title, short body, time, related pre-order/order reference. |
| FR-N4 | User can mark a notification as read / dismiss it. |
| FR-N5 | Tapping a notification opens the relevant pre-order / order context. |

---

### 6.5 Short polling → Modal

| ID | Requirement |
| --- | --- |
| FR-M1 | While the app is open, Motake **periodically checks** for new alert-worthy events (especially pre-order related). |
| FR-M2 | When a high-priority event arrives (e.g. pre-order due that needs action), the app can show a **modal** so the user cannot miss it. |
| FR-M3 | Modal includes a short message and a clear primary action (e.g. View pre-order / Dismiss). |
| FR-M4 | Modal does not spam: same event should not repeatedly interrupt after dismiss/read unless product defines a snooze rule. |

---

### 6.6 Cross-cutting product rules

| ID | Requirement |
| --- | --- |
| FR-X1 | All money amounts display in **INR (₹)** consistently with Phase 1. |
| FR-X2 | Actions that change due, send receipts, or record collections are attributable to the logged-in Admin or Salesman for audit. |
| FR-X3 | Salesman only records collections / sends receipts for customers and orders they are allowed to work with under existing Phase 1 visibility rules (extend consistently; do not silently broaden data access without product sign-off). |
| FR-X4 | Offline: if the device is offline, collection recording and receipt send must fail gracefully with a clear message (order placement already requires online in Phase 1 — keep that principle). |
| FR-X5 | Motake must **not** integrate a payment provider or charge the customer inside the app in this phase. |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-1 | Reliability | Receipt and reminder sends either succeed with visible confirmation or fail with a clear, retryable error — no silent failure. |
| NFR-2 | Timeliness | After place / fulfill (or manual Send Receipt), send attempt starts promptly so the customer receives the message without long unexplained delay. |
| NFR-3 | Accuracy | Due balances and “amount to return” must match recorded collections; no drift between list totals and customer detail. |
| NFR-4 | Usability | Salesman flows stay field-friendly on phone: few taps, large tap targets, clear ₹ figures; Admin due and notification views usable on desktop. |
| NFR-5 | Clarity | Labels distinguish **stock return (GatePass)** vs **cash return (change)** vs **udhar due**. |
| NFR-6 | Auditability | Admin can reconstruct who recorded a collection, who sent a receipt, and when a due changed. |
| NFR-7 | Privacy | Customer phone and message content used only for Motake operational messaging (receipts / reminders); no unrelated marketing in this phase. |
| NFR-8 | Continuity | Existing GatePass, catalog, and order placement behaviour must keep working; Phase 2 adds settlement layers without breaking Phase 1 happy paths. |
| NFR-9 | Alert hygiene | Polling + modal must not degrade app feel (excessive popups, constant interruptions). |
| NFR-10 | Accessibility | Critical amounts (due, change, totals) remain readable; errors are text-visible, not colour-only. |
| NFR-11 | Consistency | Same domain terms as Phase 1 (Book Now, Pre-order, Fulfilled, GatePass, customer shop name). |

---

## 8. Key user flows (functional)

### 8.1 Book Now + receipt

1. Salesman completes cart → selects customer (sees **Due** if any)  
2. Places Order  
3. Manually records amount collected now / udhar / both; sees **amount to return** if overpaid  
4. Uses **Send Receipt** (or automatic prompt) → SMS/WhatsApp → status **sent**

### 8.2 Pre-order + receipt

1. Pre-order placed (no receipt required at place)  
2. On due day, staff get **in-app / web** alert; optional **modal**  
3. Staff fulfill pre-order  
4. **Send Receipt** → customer notified → status **sent**

### 8.3 Flexible udhar payoff

1. Customer has due from earlier bill  
2. Admin or Salesman manually records flexible collection (any allowed amount)  
3. Due decreases; history updates  
4. Optional **Reminder** if still outstanding  

### 8.4 Admin oversight

1. Admin opens **Customer Due**  
2. Sees who owes what; drills into customer  
3. Can review collection history, trigger reminder, resend receipt on related orders  

---

## 9. Acceptance criteria (sign-off)

- [ ] Book Now: after place, staff can send SMS and/or WhatsApp receipt; UI shows sent status  
- [ ] Pre-order: after fulfill, staff can send SMS and/or WhatsApp receipt; UI shows sent status  
- [ ] Partial collection creates correct due; later flexible collections clear due without forcing equal installments  
- [ ] Admin **Customer Due** lists outstanding balances accurately  
- [ ] Salesman selecting a customer in cart sees current due  
- [ ] Entering amount received shows correct **amount to return**  
- [ ] Pre-order events create in-app and web notifications  
- [ ] New high-priority events can surface via modal while app is open, without endless repeat spam  
- [ ] Reminder can be sent for open due  
- [ ] GatePass day flow still works unchanged for allot → sell → handover  
- [ ] No payment gateway / UPI auto-pay / in-app charge is part of the delivered scope  

---

## 10. Open questions (product decisions before build)

| # | Question | Why it matters |
| --- | --- | --- |
| Q1 | Auto-send receipt on place/fulfill, or **manual Send Receipt only**, or auto + manual resend? | Notes show both a button and “SMS sent” after status |
| Q2 | SMS only, WhatsApp only, or user chooses channel each time / both? | Cost and customer preference |
| Q3 | Exact change + udhar math when customer overpays while leaving a due | Avoid wrong cash return |
| Q4 | Who may write off / adjust due (Admin only?) | Fraud / audit |
| Q5 | Reminder: manual only vs daily/weekly auto for open dues | Ops load |
| Q6 | Exact pre-order events that notify (due only vs also new place / cancel) | Alert volume |
| Q7 | Modal priority rules and snooze | Avoid interrupting every sale |
| Q8 | Can any salesman fulfill / receipt any due pre-order, or only the owner? | Phase 1 list vs ownership mismatch |

---

## 11. Handoff notes for developers

- Implement against **existing** Motake roles, order types, and customer phone — extend, don’t invent parallel CRM.  
- Prefer the domain terms in §5 in all UI copy.  
- **Do not** add payment gateway / UPI pay / payment-scanner integration; only manual collection + udhar recording.  
- Resolve **Open Questions** with product before locking UX.  
- This document intentionally omits implementation detail (APIs, providers, schema). Those belong in a separate tech design after FR/NFR sign-off.
