# Motake Sales

Field sales for a dairy distributor: admin allots stock to salesmen on a route each day, salesmen bill customers at that route's prices, and each customer carries one running balance with Motake.

## Language

### Selling

**Route**:
A named area (e.g. Kolhapur, Satara) with its own Customer list, price per variety and default delivery state. Staff see the name; the generated Route code is the stable key.
*Avoid*: Area, beat, zone

**Route code**:
The generated unique key of a Route (`rt-{slug}-{nnn}`). Never edited. Name is the label.

**Salesman**:
The field-sales person who sells against an Active GatePass.

**Salesman code**:
The generated unique key of a Salesman. Admin does not type or edit it.

**Variety SKU**:
The generated unique key of a variety. Admin does not type or edit it.
*Avoid*: Admin-typed SKU, product code

**GatePass**:
One salesman's stock allotment for a business date, tied to exactly one route chosen at allotment. Holds quantities only, never money.
*Avoid*: Allotment, issue slip

**Active GatePass**:
The single GatePass a salesman is currently selling against; its route decides which customers and prices they see.

**Customer**:
One outlet on exactly one route; the record a salesman bills. A real-world owner with outlets on two routes is two Customers.
*Avoid*: Shop, outlet, client

**Owner**:
The person behind one or more Customers. Not a record; carries no balance of its own.

**Route price**:
The current tax-exclusive price of one variety on one Route. There is no company-wide variety price. A missing Route price cannot be sold; removing the price unsells that variety on that Route. Old amounts live only on order snapshots.
*Avoid*: Unit price (company-wide), rate card, dated Route price list

**Book Now**:
An order placed and billed on the spot, deducting stock from the Active GatePass. It remembers that GatePass so cancel can restore stock only there.

**Pre-order**:
An order placed for a later date at the route price of the moment it was placed; belongs to the route, not to a salesman or GatePass, and is billed only when fulfilled using the GST classification and rate snapshotted at placement.
*Avoid*: Booking, advance order

### Money

**Bill**:
A single order's latest billed state at its locked Route prices, including tax. Bill History preserves the original and every later version.
*Avoid*: Invoice

**Tax Invoice**:
The internal legal type for a Bill containing any taxable supply.

**Bill of Supply**:
The internal legal type for a Bill containing only exempt supply.

**Balance**:
The single running amount between one Customer and Motake. Not per bill, not per owner.

**Pending**:
A Balance above zero: the Customer owes Motake.
*Avoid*: Due, outstanding, udhar (in code)

**Advance**:
A Balance below zero: Motake owes the Customer, from cash kept above what was owed or a Credit Note.
*Avoid*: Deposit; using "advance" for a part-payment at checkout

**Payment**:
Cash, bank or UPI money kept by Motake against a Customer's Balance. Never applied to a specific Bill.

**Ledger**:
The append-only record of every money event for one Customer; the Balance is derived from it.
*Avoid*: Khata (in code), account statement

**Debit**:
A ledger entry that increases what the Customer owes (Bill, Debit Note, Refund).

**Credit**:
A ledger entry that decreases what the Customer owes (Payment, Credit Note).
*Avoid*: using "credit" to mean Advance

**Bill history**:
Every version of a Bill's items and amounts, including the first, with who changed it, when and why. The Bill itself always shows the latest version.
*Avoid*: Revised bill, amended invoice

**Credit Note**:
Reduces what the Customer owes. Generated automatically when an admin lowers a Bill, or raised independently by admin for a return, damage or later discount.

**GST Credit Note**:
A Credit Note that also reverses applicable tax and reduces Motake's GST liability.

**Commercial Credit Note**:
A Credit Note that reduces the Customer's Balance without reducing Motake's GST liability; Motake bears the tax.
*Avoid*: Credit Note without GST

**Debit Note**:
Increases what the Customer owes. Generated automatically when an admin raises a Bill, or raised independently by admin for an undercharge or extra items.

**Payment adjustment**:
An admin fix to a wrongly recorded Payment amount (miscount, typo), kept with the Payment's history. Never done by editing a Bill.

**GST**:
Tax added on top of the Route price per Bill line. Actual delivery state determines CGST + SGST versus IGST; the Route supplies the default state. Bills, Pending and Payments are tax-inclusive.

**E-invoicing required**:
A per-Customer Admin setting. When yes, that Customer's Bills need an IRN and signed QR before the final Bill is delivered.
*Avoid*: org-wide e-invoice mode

**IRN pending**:
A Bill whose sale has committed but whose final Tax Invoice PDF and Bill WhatsApp wait for Admin-recorded IRN and signed QR.

**Paisa**:
The integer unit used to store all money exactly: ₹1.00 is stored as 100 paise. Rupee decimals are only a display format.

**Refund**:
Money Motake pays back to a Customer out of their Advance.

**Opening balance**:
A one-time starting Balance entered for a Customer to carry over what was owed before the app; may be Pending or Advance.

**Receipt**:
The message sent to a Customer because a cash, bank or UPI Payment was recorded.
*Avoid*: Bill message, invoice