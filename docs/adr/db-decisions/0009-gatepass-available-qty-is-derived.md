# GatePass sellable qty is issued minus sold; do not store available_qty

Drop `gatepass_items.available_qty` (the generated `issued_qty - sold_qty` column). Book Now and UI compute `issued_qty - sold_qty`. `returned_qty` stays for handover / EOD and is not part of that formula.
