# Motake Sales

Field sales for a dairy distributor: admin allots stock to salesmen on a route each day, salesmen bill customers at that route's prices, and each customer carries one running balance with Motake.

## Language

### Selling

**Route**:
A named area (e.g. Kolhapur, Satara) with its own customer list and its own price per variety.
_Avoid_: Area, beat, zone

**GatePass**:
One salesman's stock allotment for a business date, tied to exactly one route chosen at allotment. Holds quantities only, never money.
_Avoid_: Allotment, issue slip

**Active GatePass**:
The single GatePass a salesman is currently selling against; its route decides which customers and prices they see.

**Customer**:
One outlet on exactly one route; the record a salesman bills. A real-world owner with outlets on two routes is two Customers.
_Avoid_: Shop, outlet, client

**Owner**:
The person behind one or more Customers. Not a record; carries no balance of its own.

**Route price**:
The tax-exclusive price of one variety on one route. A variety with no route price cannot be sold on that route.
_Avoid_: Unit price (company-wide), rate card

**Book Now**:
An order placed and billed on the spot, deducting stock from the Active GatePass.

**Pre-order**:
An order placed for a later date at the route price of the moment it was placed; belongs to the route, not to a salesman or GatePass, and is billed only when fulfilled.
_Avoid_: Booking, advance order

### Money

**Bill**:
The amount of one order at the route prices locked onto it, raised when a Book Now is placed or a Pre-order is fulfilled.
_Avoid_: Invoice

**Balance**:
The single running amount between one Customer and Motake. Not per bill, not per owner.

**Pending**:
A Balance above zero: the Customer owes Motake.
_Avoid_: Due, outstanding, udhar (in code)

**Advance**:
A Balance below zero: Motake owes the Customer, from cash kept above what was owed or a Credit Note.
_Avoid_: Deposit; using "advance" for a part-payment at checkout

**Payment**:
Cash kept by Motake against a Customer's Balance. Never applied to a specific Bill.

**Ledger**:
The append-only record of every money event for one Customer; the Balance is derived from it.
_Avoid_: Khata (in code), account statement

**Debit**:
A ledger entry that increases what the Customer owes (Bill, Debit Note, Refund).

**Credit**:
A ledger entry that decreases what the Customer owes (Payment, Credit Note, Bill cancelled).
_Avoid_: using "credit" to mean Advance

**Bill history**:
Every version of a Bill's items and amounts, including the first, with who changed it, when and why. The Bill itself always shows the latest version.
_Avoid_: Revised bill, amended invoice

**Credit Note**:
Reduces what the Customer owes. Generated automatically when an admin lowers a Bill, or raised independently by admin for a return, damage or later discount.

**GST Credit Note**:
A Credit Note that also reverses applicable tax and reduces Motake's GST liability.

**Commercial Credit Note**:
A Credit Note that reduces the Customer's Balance without reducing Motake's GST liability; Motake bears the tax.
_Avoid_: Credit Note without GST

**Debit Note**:
Increases what the Customer owes. Generated automatically when an admin raises a Bill, or raised independently by admin for an undercharge or extra items.

**Payment adjustment**:
An admin fix to a wrongly recorded Payment amount (miscount, typo), kept with the Payment's history. Never done by editing a Bill.

**GST**:
Tax added on top of the Route price per line of a Bill, at the variety's rate: CGST + SGST when the Route is in Motake's state, IGST otherwise. Bills, Pending and Payments are tax-inclusive.

**Paisa**:
The integer unit used to store all money exactly: ₹1.00 is stored as 100 paise. Rupee decimals are only a display format.

**Refund**:
Money Motake pays back to a Customer out of their Advance.

**Opening balance**:
A one-time starting Balance entered for a Customer to carry over what was owed before the app; may be Pending or Advance.

**Receipt**:
The message sent to a Customer because a Payment was recorded.
_Avoid_: Bill message, invoice
