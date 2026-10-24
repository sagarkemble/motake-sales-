# Route replaces the company-wide price and the shared Customer list

The live app prices every variety once for the whole company and shows every salesman the same Customer list. Motake actually sells different prices and different outlets per area, and a salesman may work a different area on the next GatePass. We are replacing that model with **Route**: the unit that owns a Customer list, a price per variety, and the default delivery state.

Admin chooses the Route when allotting a GatePass. That choice stays on that GatePass and is the only Route the salesman can sell. A Customer belongs to exactly one Route. A real-world owner with outlets on two Routes is two Customers. The same phone may appear on more than one Customer.

A Route is identified by a generated **Route code** (stable key) and a **name** (label). Status `active` / `inactive` is a simple toggle. A separate **soft-delete** flag hides the Route; the row is never physically removed.

Variety `unit_price` goes away. A Route price is one current amount per (Route, variety); edits overwrite that row. There is no dated Route price list and no inactive/zero price — no row means unsellable. Order lines snapshot the amount when the item is added.

Customer holds a live Route (Admin may move it). GatePass holds the Route chosen at allotment and never changes it. Book Now stores its originating GatePass. A Pre-order is owned by `route_id`; `salesman_id` is who placed it. Each Bill freezes Route id, name, code, delivery state and line prices so a later rename or state change does not rewrite the document.

Go-live data comes from the seed: real Routes, each Customer assigned to one Route, Route prices typed per (Route, variety), opening balances. Today’s company-wide `unit_price` is not copied. Historical orders and GatePasses from the current app are not backfilled with a Route. Cutover happens with no active GatePass; any open Pre-order that is kept gets the Customer’s seeded Route. The unique-phone rule is removed.

We rejected a company-wide price with optional Route overlays (salesmen would still see the wrong default, and a missing overlay is ambiguous). We rejected permanently assigning a salesman to a Route (the next GatePass can be a different area). We rejected one Customer shared across Routes with a price picked at checkout (Balance, visibility and WhatsApp are per outlet, not per owner).

The billed `orders` row *is* the Bill (Book Now immediately; Pre-order only after fulfil). New money is integer paise. Ledger, Notes and Bill History tables stay in ADR-0002 for a later spec. WhatsApp transport stays in ADR-0001. This decision does not implement those, and does not reopen them.

Route CRUD and Route prices live in a new `packages/services/routes` + tRPC `routes.*` (Admin). GatePass allotment stays on the existing gatepass service and requires `routeId`. Salesman APIs do not take a Route; they filter by the Active GatePass Route.
