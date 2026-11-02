-- Spec J (#45): the 18 notification_templates rows for the v2 WhatsApp templates (9 templates x
-- en / mr) on the Motake Dairy WABA, as the developer inserts them by hand (db-decisions/0014).
--
-- Run it only after Meta shows every one of the 18 templates as APPROVED: rows go in verified, and
-- K refuses nothing it would otherwise send. Idempotent: an existing (provider, template_id,
-- language, version) row is left as it is, so re-running inserts nothing.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/notification-templates-v2.sql
--
-- template_variables must equal the value names in packages/services/customer-messages/model.ts
-- (customerMessageTemplates), in blank order. document_type `pdf` = the template has a DOCUMENT
-- header. notification_templates has no body column: the wording lives in Meta; the approved
-- bodies are kept below for reference ({{n}} is the n-th value).
--
-- motake_bill_v2 (en) + PDF header:
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Bill No.: {{3}}
--   Bill Date: {{4}}
--   Bill Amount: {{5}}
--   {{6}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_bill_v2 (mr) + PDF header:
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   बिल क्रमांक: {{3}}
--   बिल दिनांक: {{4}}
--   बिलाची रक्कम: {{5}}
--   {{6}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_receipt_v2 (en) + PDF header:
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Receipt No.: {{3}}
--   Amount Received: {{4}} ({{5}})
--   {{6}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_receipt_v2 (mr) + PDF header:
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   पावती क्रमांक: {{3}}
--   मिळालेली रक्कम: {{4}} ({{5}})
--   {{6}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_bill_corrected_v2 (en):
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Bill No.: {{3}}
--   Status: Bill Corrected
--   Reason: {{4}}
--   Balance Adjustment: {{5}}
--   {{6}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_bill_corrected_v2 (mr):
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   बिल क्रमांक: {{3}}
--   स्थिती: बिल दुरुस्त केले
--   कारण: {{4}}
--   बाकी रकमेतील बदल: {{5}}
--   {{6}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_payment_corrected_v2 (en):
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Receipt No.: {{3}}
--   Status: Payment Corrected
--   Previous Amount: {{4}}
--   Corrected Amount: {{5}}
--   Difference: {{6}}
--   Reason: {{7}}
--   {{8}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_payment_corrected_v2 (mr):
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   पावती क्रमांक: {{3}}
--   स्थिती: पेमेंट दुरुस्त केले
--   आधीची रक्कम: {{4}}
--   दुरुस्त रक्कम: {{5}}
--   फरक: {{6}}
--   कारण: {{7}}
--   {{8}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_refund_v2 (en):
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Refund No.: {{3}}
--   Refund Amount: {{4}} ({{5}})
--   {{6}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_refund_v2 (mr):
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   रिफंड क्रमांक: {{3}}
--   परत केलेली रक्कम: {{4}} ({{5}})
--   {{6}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_cancellation_v2 (en):
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Bill No.: {{3}}
--   Status: Bill Cancelled
--   Reason: {{4}}
--   Amount Reversed: {{5}}
--   {{6}}
--   Previously retained payments are not reversed.
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_cancellation_v2 (mr):
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   बिल क्रमांक: {{3}}
--   स्थिती: बिल रद्द केले
--   कारण: {{4}}
--   रद्द केलेली बिल रक्कम: {{5}}
--   {{6}}
--   आधी जमा केलेली पेमेंट रक्कम रद्द केलेली नाही.
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_gst_credit_note_v2 (en) + PDF header:
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Credit Note No.: {{3}}
--   Against Bill No.: {{4}}
--   Reason: {{5}}
--   Credit Amount: {{6}} (Including GST)
--   {{7}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_gst_credit_note_v2 (mr) + PDF header:
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   क्रेडिट नोट क्रमांक: {{3}}
--   संबंधित बिल क्रमांक: {{4}}
--   कारण: {{5}}
--   क्रेडिट रक्कम: {{6}} (GST सहित)
--   {{7}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_gst_debit_note_v2 (en) + PDF header:
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Debit Note No.: {{3}}
--   Against Bill No.: {{4}}
--   Reason: {{5}}
--   Additional Amount: {{6}} (Including GST)
--   {{7}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_gst_debit_note_v2 (mr) + PDF header:
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   डेबिट नोट क्रमांक: {{3}}
--   संबंधित बिल क्रमांक: {{4}}
--   कारण: {{5}}
--   अतिरिक्त रक्कम: {{6}} (GST सहित)
--   {{7}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏
-- motake_note_update_v2 (en):
--   🥛 Motake Dairy Farm
--   Customer: {{1}}
--   Route: {{2}}
--   Note No.: {{3}}
--   Against Bill No.: {{4}}
--   Status: {{5}}
--   Reason: {{6}}
--   Balance Adjustment: {{7}}
--   {{8}}
--   Thank you for your business with Motake Dairy Farm! 🙏
-- motake_note_update_v2 (mr):
--   🥛 मोटके डेअरी फार्म
--   ग्राहक: {{1}}
--   मार्ग: {{2}}
--   नोट क्रमांक: {{3}}
--   संबंधित बिल क्रमांक: {{4}}
--   स्थिती: {{5}}
--   कारण: {{6}}
--   बाकी रकमेतील बदल: {{7}}
--   {{8}}
--   मोटके डेअरी फार्मसोबत व्यवसाय केल्याबद्दल धन्यवाद! 🙏

INSERT INTO notification_templates
  (provider, template_id, language, version, template_variables, document_type, verified)
VALUES
  ('whatsapp', 'motake_bill_v2', 'en', 1, '["customer", "route_name", "bill_number", "bill_date", "bill_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_bill_v2', 'mr', 1, '["customer", "route_name", "bill_number", "bill_date", "bill_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_receipt_v2', 'en', 1, '["customer", "route_name", "receipt_number", "amount_received", "payment_mode", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_receipt_v2', 'mr', 1, '["customer", "route_name", "receipt_number", "amount_received", "payment_mode", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_bill_corrected_v2', 'en', 1, '["customer", "route_name", "bill_number", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_bill_corrected_v2', 'mr', 1, '["customer", "route_name", "bill_number", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_payment_corrected_v2', 'en', 1, '["customer", "route_name", "receipt_number", "previous_amount", "corrected_amount", "difference", "reason", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_payment_corrected_v2', 'mr', 1, '["customer", "route_name", "receipt_number", "previous_amount", "corrected_amount", "difference", "reason", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_refund_v2', 'en', 1, '["customer", "route_name", "refund_number", "refund_amount", "refund_mode", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_refund_v2', 'mr', 1, '["customer", "route_name", "refund_number", "refund_amount", "refund_mode", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_cancellation_v2', 'en', 1, '["customer", "route_name", "bill_number", "reason", "amount_reversed", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_cancellation_v2', 'mr', 1, '["customer", "route_name", "bill_number", "reason", "amount_reversed", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_gst_credit_note_v2', 'en', 1, '["customer", "route_name", "note_number", "bill_number", "reason", "credit_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_gst_credit_note_v2', 'mr', 1, '["customer", "route_name", "note_number", "bill_number", "reason", "credit_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_gst_debit_note_v2', 'en', 1, '["customer", "route_name", "note_number", "bill_number", "reason", "additional_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_gst_debit_note_v2', 'mr', 1, '["customer", "route_name", "note_number", "bill_number", "reason", "additional_amount", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_note_update_v2', 'en', 1, '["customer", "route_name", "note_number", "bill_number", "status", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'none', true),
  ('whatsapp', 'motake_note_update_v2', 'mr', 1, '["customer", "route_name", "note_number", "bill_number", "status", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'none', true)
ON CONFLICT (provider, template_id, language, version) DO NOTHING;

-- 2026-11-02: motake_note_update_v2 gained a DOCUMENT header in Meta (same body), so every Note
-- message carries the Note PDF. A change is a new version (db-decisions/0014): insert these only
-- after Meta shows motake_note_update_v2 APPROVED again in en and mr, together with the deploy
-- that attaches the PDF; the highest version wins, so version 1 is no longer used.
INSERT INTO notification_templates
  (provider, template_id, language, version, template_variables, document_type, verified)
VALUES
  ('whatsapp', 'motake_note_update_v2', 'en', 2, '["customer", "route_name", "note_number", "bill_number", "status", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'pdf', true),
  ('whatsapp', 'motake_note_update_v2', 'mr', 2, '["customer", "route_name", "note_number", "bill_number", "status", "reason", "balance_adjustment", "balance_line"]'::jsonb, 'pdf', true)
ON CONFLICT (provider, template_id, language, version) DO NOTHING;
