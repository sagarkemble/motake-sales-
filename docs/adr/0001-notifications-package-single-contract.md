# Notifications go through one package with a channel-agnostic contract

Bill and Receipt messages (and any future email/SMS) are sent only through a separate notifications package. Callers hand it one generic request — channel (`whatsapp` | `email` | `sms`), provider, and a generic payload — and the package alone knows how to call each provider's API. Domain code never calls WhatsApp or any provider directly, so swapping or adding a provider doesn't touch ordering or payment code.
