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
The price of one variety on one route. A variety with no route price cannot be sold on that route.
_Avoid_: Unit price (company-wide), rate card

**Book Now**:
An order placed and billed on the spot, deducting stock from the Active GatePass.

**Pre-order**:
An order placed for a later date at the route price of the moment it was placed; billed only when fulfilled.
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

**Bill version**:
One snapshot of a Bill's items and amounts. An admin edit creates a new version; past versions are kept unchanged with who, when and why.
_Avoid_: Revised bill, amended invoice

**Credit Note**:
Issued by Motake when a Bill version is lower than the previous one (return, damage, later discount, overcharge); reduces what the Customer owes.

**Debit Note**:
Issued by Motake when a Bill version is higher than the previous one (undercharge, extra items); increases what the Customer owes.

**Refund**:
Money Motake pays back to a Customer out of their Advance.

**Opening balance**:
A one-time starting Balance entered for a Customer to carry over what was owed before the app; may be Pending or Advance.

**Receipt**:
The message sent to a Customer because a Payment was recorded.
_Avoid_: Bill message, invoice
