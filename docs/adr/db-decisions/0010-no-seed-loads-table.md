# Go-live data is inserted and checked by hand; there is no seed_loads table

Drop `seed_loads`. No xlsx loader, no second-load lock, no workbook metadata in Postgres. Routes, Customers, prices, tax periods, and opening balances are written into their own tables and verified manually.
