# Hindi is not a message language; Hindi Customers move to Marathi

Motake now sends Customer messages only in Marathi or English, so `message_language` becomes `('mr', 'en')`. This affects `customers.preferred_language` and `notification_templates.language`. Migration `0007_remove_hindi` does four things in order:

- It moves every Hindi Customer to Marathi.
- It points each sent Hindi `notifications` row at the Marathi template row with the same provider, template name and version. A notification's template is `onDelete restrict`, so it cannot be left on a deleted row.
- It deletes the Hindi template rows that are no longer referenced. A referenced Hindi row with no Marathi twin is relabelled Marathi instead, so the migration never fails on old data.
- It recreates the enum. It renames nothing: each column goes to text, the old type is dropped, the new one is created, and the columns are cast back. The `preferred_language` default is dropped and set again around the cast.

A message that went out in Hindi now shows the Marathi template row. Its own `template_values` are kept as they were sent. Hindi templates in Meta are retired by hand. `scripts/notification-templates-v2.sql` now inserts 18 rows (9 templates × en / mr).

**Considered:**

- Keeping `hi` in the enum and only hiding it in the app. The value would stay writable through the API and the message wording, so Hindi would not really be gone.
- Moving Hindi Customers to English. The user chose Marathi, the default language.
