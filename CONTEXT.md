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
The field-sales person who sells against an Active GatePass. Deactivate pauses the account and can be undone. Delete is for good: refused while they hold an Active GatePass; their login email becomes `delete+{email}` (`delete+2+{email}` … if taken) so the email can be used for a new Salesman, and a deleted Salesman is never reactivated. Their GatePasses, orders and money records stay.

**Salesman code**:
The generated unique key of a Salesman: the first three letters of the name, the last four phone digits and the day they were added (`RAV-4321-261031`), with `-2`, `-3` … if already taken. Made once when the Salesman is added and never changed, even when name or phone change. Admin does not type or edit it.

**Product**:
The named group a Variety belongs to (for example milk). Not billed by itself. Always has an image: a Product cannot be created or saved without one, and its image can be replaced but not removed.
*Avoid*: treating Product name as a SKU

**Variety**:
One sellable pack of a Product: a name plus a size in a unit, shown as "Toned Milk 500 ml". The name may be empty, so the Variety reads as its size alone ("500 g"). The unit comes from the units list in Settings (ml, L, g, kg, and any Admin adds); units are never renamed or removed.
*Avoid*: pack word (pouch, cup) as the unit, size typed into the name

**Variety SKU**:
The generated unique key of a variety. Admin does not type or edit it.
*Avoid*: Admin-typed SKU, product code

**GatePass**:
One salesman's stock allotment for a business date, tied to exactly one route chosen at allotment. Holds quantities only, never money.
*Avoid*: Allotment, issue slip

**Active GatePass**:
The single GatePass a salesman is currently selling against; its route decides which customers and prices they see. The salesman app does not list Customers off that Route. Server still refuses Book Now, place Pre-order, and field Payment for a Customer not on that Route. If the GatePass is closed or handed over, there is no Active GatePass; salesman Book Now, place Pre-order, and field Payment refuse and show that. Salesman fulfil needs a new Active GatePass on that Route; Admin fulfil does not.

**Customer**:
One outlet on exactly one route, in one City; the record a salesman bills. Shop photo is optional. A real-world owner with outlets on two routes is two Customers.
*Avoid*: Shop, outlet, client

**City**:
The town a Customer is in, under one Indian state. Admin keeps the list in Settings > Cities; Admin or a salesman can also add a missing city from the Customer form. Unique by name within its state in any letter case; never edited or deleted. Every Customer added or edited picks one; Customers from before cities have none until an Admin edit sets it. Not printed on Documents.
*Avoid*: free-typed city, Route as a city

**Deactivated Customer**:
A Customer an Admin has switched off. Its Balance, Ledger and papers stay readable and its profile can still be updated (including Move to Route); every other write (Book Now, Pre-order, fulfil, Payment, Bill, Note, Opening balance) is refused. Deactivation is refused while the Customer has an open Pre-order; the Pre-order must be fulfilled or cancelled first.
*Avoid*: Deleted Customer, archived Customer

**Owner**:
The person behind one or more Customers. Not a record; carries no balance of its own.

**Route price**:
The current tax-exclusive price of one variety on one Route. There is no company-wide variety price. A missing Route price cannot be sold; removing the price unsells that variety on that Route. Old amounts live only on order snapshots.
*Avoid*: Unit price (company-wide), rate card, dated Route price list

**Book Now**:
An order placed and billed on the spot, deducting stock from the Active GatePass. It remembers that GatePass so cancel can restore stock only there. The salesman app sends Variety SKU and qty only; the server snapshots Route price and tax. Qty is a positive integer count of that Variety SKU (packs), not a free-typed kg or L. Short stock or a bad line refuses the whole Bill; the app shows what was short. No partial basket.

**Pre-order**:
An order placed for a later date at the route price of the moment it was placed; belongs to the route, not to a salesman or GatePass, and is billed only when fulfilled using the GST classification and rate snapshotted at placement. Scheduled date is today or later. Place creates no Bill, no number, no Payment, no stock change and no Ledger row; fulfil issues the Bill and its `MB/{FY}/{seq}` number. Fulfil uses the Route state copied onto the Pre-order when it was placed. Salesman or Admin uses the same fulfil procedure; Admin has no GatePass. Fulfil before the scheduled date, or after another fulfil, is refused and shown; first writer wins.
*Avoid*: Booking, advance order

### Money

**Bill**:
A single order's latest billed state at its locked Route prices, including tax. Numbered `MB/{FY}/{seq}` (Motake Bill) when it is issued: at Book Now (by a salesman or the office), or at Pre-order fulfil. An unfulfilled Pre-order has no Bill. Bill History preserves the original and every later version. Admin Corrects, Cancels, or Raises a Note from the Bill paper; those actions are not inline on the items table. Line Correct is refused after that Bill-date month is filed.
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
Cash, bank or UPI money kept by Motake against a Customer's Balance. Never applied to a specific Bill. Numbered `MP/{FY}/{seq}`. A salesman records field Payment only on the Active GatePass Route. Admin records a Payment with no purchase from Ledger Add. Admin may Correct kept amount, mode, and reference with a reason; Payment history is kept on `payment_events`. Correct may take kept to ₹0; that is not a delete. More money from the shop is a new Payment.

**Ledger**:
The append-only record of every money event for one Customer; the Balance is derived from it. Admin sees that Ledger as one table (Bill, Payment, Credit Note, Debit Note, Refund, Opening balance). Opening / Current total / Closing sit at the foot of the table. Clicking a row opens that record. Admin adds Bill, Payment, Refund, Opening balance, and independent Note from Add on that Ledger. There is no second Admin money page and no separate Balance panel.
*Avoid*: Khata (in code), account statement; a separate Admin money list

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
An admin fix to a wrongly recorded Payment (kept amount, mode, or reference), kept with the Payment's history. Never done by editing a Bill. It is not a Ledger row of its own: the Payment row shows the net kept amount, and the Ledger totals count it the same way.

**GST**:
Tax added on top of the Route price per Bill line. Actual delivery state determines CGST + SGST versus IGST; the Route supplies the default state. Bills, Pending and Payments are tax-inclusive.

**E-invoicing**:
Not done in Motake. No Bill waits for an IRN: every Tax Invoice PDF is drawn and sent at once. IRNs, signed QRs and portal cancellations are not recorded; the old columns stay unused (`docs/adr/0004-no-e-invoicing.md`).
*Avoid*: IRN pending, Enter IRN, portal cancellation, Draft PDF

**GSTR-1 filing**:
Admin's record that Motake's monthly GSTR-1 for one calendar month is done on the government portal. A month is filed only once it is over: from the 1st of the next month, with a filing date on or after that day. One filing per month. Filer is the signed-in Admin. Correcting ack, filing date, or notes does not unlock the month. There is no unfile.
*Avoid*: generating GSTR-1 from the app; a second filing for the same month

**Filed month**:
A calendar month that has a GSTR-1 filing. Bills whose Bill date falls in that month cannot be line-Corrected; Notes still work. Bill date is Book Now day or Pre-order fulfil day, in Asia/Kolkata.

**Paisa**:
The integer unit used to store all money exactly: ₹1.00 is stored as 100 paise. Rupee decimals are only a display format.

**Refund**:
Money Motake pays back to a Customer out of their Advance. It cannot exceed Advance. Numbered `MR/{FY}/{seq}`. Admin may rewrite a recorded Refund with a reason; Refund history is kept. Salesman cannot. Correct may take the amount to ₹0; that is not a delete.

**Refund adjustment**:
An admin fix to a wrongly recorded Refund (amount, mode, or reference), kept with the Refund's history and a required reason. Never done by editing a Bill. A bigger Refund still cannot exceed Advance. It is not a Ledger row of its own: the Refund row shows the net amount, and the Ledger totals count it the same way.

**Opening balance**:
A one-time starting Balance entered for a Customer to carry over what was owed before the app; may be Pending or Advance. Admin sets it once from the Ledger and does not Correct it afterwards.

**Receipt**:
The WhatsApp sent because a Payment was kept above ₹0. Names Customer and Route, kept amount, mode, and Balance after that Payment. Carries the Payment receipt Document, which also shows cash returned if any.
*Avoid*: Bill message, invoice

**Account update**:
The WhatsApp sent when Balance changed because of a Bill edit, Credit/Debit Note, Payment adjustment, or Refund. Names the change, reason, and new Balance. Not used when a Bill is cancelled.
*Avoid*: sending this together with the cancellation message

**Cancellation message**:
The dedicated WhatsApp when a Motake Bill is cancelled. Bill number, reason, reversed amount, new Balance. No cancelled Bill PDF.

**Statutory Note message**:
The WhatsApp of a GST Credit Note or GST Debit Note to a GSTIN Customer, with the Note PDF. A Commercial Credit Note is account update only. A Customer without GSTIN never gets this message.

### Settings

**Seller master**:
Motake's legal name, address, GSTIN, phone, email, and state in Admin Settings (one org). Each Bill and Note snapshots these at issue. Changing Settings does not rewrite old documents.
*Avoid*: storing seller on the Customer; live reprint of old Bills from current Settings

**Financial year**:
1 April to 31 March. Label `YY-YY` (e.g. `26-27` = 1 Apr 2026 – 31 Mar 2027). The Bill date (fulfil day for a Pre-order) picks the year.
*Avoid*: calendar year; place date for Pre-order FY

**Document prefix**:
The series token for that document type in that financial year (`MB`, `MC`, `MD`, `MP`, `MR` unless Admin set another). Frozen after the first number of that series in that year until the next financial year. GST and Commercial Credit Notes share `MC`.
*Avoid*: unfreezing a used prefix mid-year; a second Credit Note series

**GST Credit Note deadline**:
One date per financial year. After it, a reduction that would reverse GST on a Bill of that year must be a Commercial Credit Note. Debit Notes have no deadline. Until set, 30 November after that year ends.

### Messages and documents

**Message template**:
A provider-approved message shape (for example a WhatsApp template) with named blanks, in one language and one version. Every Customer message is sent through one; no free text is ever sent. Developers add rows by hand; the app only reads them.
*Avoid*: free-text message, editing a template in place (add a new version instead)

**Template version**:
A numbered revision of one Message template for one provider and language. A message always uses the highest version; if that version is not verified by the provider, the message is refused.
*Avoid*: falling back to an older verified version

**Preferred language**:
The language a Customer receives messages in: Marathi or English, chosen when the Customer is added (Marathi unless chosen otherwise) and never changed afterwards. Documents are always English.

**Document**:
A PDF of a Bill (Tax Invoice or Bill of Supply), Note, or Payment receipt, drawn from a fixed layout kept in the app. Stored privately; never reachable by a public link. Its file name is `Motake <paper> <number>.pdf` with `/` replaced by `-`, e.g. `Motake Bill MB-26-27-000123.pdf`.
*Avoid*: invoice PDF, public Bill link
*Avoid*: merging a second file; loading salesmen or GatePasses from this workbook