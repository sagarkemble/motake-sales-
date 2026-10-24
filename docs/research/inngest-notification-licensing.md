# Inngest for Motake’s own WhatsApp messages

Checked 11 Oct 2026. Plain reading of Inngest’s license. Not legal advice.

Motake alone owns and runs this software. No other company uses it. Motake will not offer the notification system to any other company. Customers only receive a WhatsApp message.

## Glossary

- **Inngest** — a helper that keeps a send-job and tries again if WhatsApp fails. Motake would use it only after a bill, payment, note, or cancellation is already saved.
- **Inngest’s paid service** — Inngest runs that helper on their computers. Motake pays them. Message text and phone numbers sit on their computers unless Motake stores those itself and sends only a reference number.
- **Run it ourselves** — Motake installs the Inngest program on Motake’s own computers.
- **Library** — the small Inngest piece added to Motake’s app. Free for a private commercial app. Does not require Motake to publish its code.
- **Server** — the larger Inngest program that stores and retries jobs. Stricter rules.
- **Strict server license** — you may run that server for yourself. If you let other companies use that server as their job system, you must publish the code of the system you used to offer it.
- **Publish the code** — give the program’s source to the public so others can copy and run it.

## Answer

For Motake’s own customers, this does not force Motake to publish Motake’s code.

**Pay Inngest.** Motake adds the free library. Motake’s code stays private. The limit is their contract: they can stop the service. This is an outside company running the retry helper.

**Run it on Motake’s computers.** The strict license allows Motake to run the unchanged program for itself. Motake is not giving that program, or the notification system, to any other company, so the “publish your code” rule does not apply. Inngest has not written that promise in its own words. The company that wrote the same license says a private app that only uses the tool is fine. That statement is theirs, not Inngest’s.

Still true either way:

- Inngest does not promise help if Motake runs the server itself.
- Newer copies of the server stay under the strict license for three years after Inngest publishes them. Motake does not need to wait, because Motake is running it privately, not handing it out.

This stays true only while Motake keeps the software and the notification system to itself. Giving either to another company brings the strict license back into play.

## Sources

- Library license: [Apache-2.0](https://github.com/inngest/inngest-js/blob/main/packages/inngest/LICENSE.md)
- Server license: [strict license plus a free license after three years](https://github.com/inngest/inngest/blob/main/LICENSE.md)
- Inngest’s own summary: [README](https://github.com/inngest/inngest/blob/main/README.md)
- Paid-service stop and suspension rights: [terms](https://www.inngest.com/terms)
- No promised help for a server Motake runs: [self-hosting](https://www.inngest.com/docs/self-hosting)
- Same license, private-app reading, from the original author: [MongoDB FAQ](https://www.mongodb.com/legal/licensing/server-side-public-license/faq)
