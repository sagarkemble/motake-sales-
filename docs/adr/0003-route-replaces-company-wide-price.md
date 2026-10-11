# Route replaces the company-wide price and the shared Customer list

The live app prices every variety once for the whole company and shows every salesman the same Customer list. Motake actually sells different prices and different outlets per area, and a salesman may work a different area on the next GatePass. We are replacing that model with **Route**: the unit that owns a Customer list, a price per variety, and the default delivery state.

Admin chooses the Route when allotting a GatePass. That choice stays on that GatePass and is the only Route the salesman can sell. A Customer belongs to exactly one Route. A real-world owner with outlets on two Routes is two Customers. The same phone may appear on more than one Customer.

We rejected a company-wide price with optional Route overlays (salesmen would still see the wrong default, and a missing overlay is ambiguous). We rejected permanently assigning a salesman to a Route (the next GatePass can be a different area). We rejected one Customer shared across Routes with a price picked at checkout (Balance, visibility and WhatsApp are per outlet, not per owner).

Ledger, GST, e-invoicing and money storage stay in ADR-0002. WhatsApp transport stays in ADR-0001. This decision does not implement those, and does not reopen them.
