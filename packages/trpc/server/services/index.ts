import AdminBillService from "@repo/services/admin-bills";
import AuthService from "@repo/services/auth";
import BillService from "@repo/services/bills";
import CustomerLedgerService from "@repo/services/customer-ledger";
import CustomerMessageService from "@repo/services/customer-messages";
import CustomerService from "@repo/services/customers";
import DocumentService from "@repo/services/documents";
import GatepassService from "@repo/services/gatepass";
import GstService from "@repo/services/gst";
import OrderService from "@repo/services/orders";
import PaymentService from "@repo/services/payments";
import ProductService from "@repo/services/products";
import RefundService from "@repo/services/refunds";
import ReportService from "@repo/services/reports";
import RouteService from "@repo/services/routes";
import SalesmanService from "@repo/services/salesman";
import SettingsService from "@repo/services/settings";
import VarietyTaxPeriodService from "@repo/services/variety-tax-periods";
import WhatsAppTokenService, { notificationClientConfig } from "@repo/services/whatsapp-token";

import { createCustomerMessageGateway } from "../notification/customer-message-gateway";
import { createNotificationTokenGateway } from "../notification/token-gateway";

export const authService = new AuthService();
export const billService = new BillService();
export const customerLedgerService = new CustomerLedgerService();
export const customerService = new CustomerService();
export const documentService = new DocumentService();
// Spec J: hands each committed money event's WhatsApp messages to the notification app with the
// internal key; null gateway (no NOTIFICATION_URL) logs and skips them. Its GST reads use a
// GstService with no listeners.
export const customerMessageService = new CustomerMessageService({
  notification: createCustomerMessageGateway(notificationClientConfig()),
  documents: documentService,
  gst: new GstService(documentService),
});
// Spec G's Correct and Cancel take Spec I's month and IRN lock hook by default.
export const adminBillService = new AdminBillService(customerMessageService.adminBillListener);
export const gstService = new GstService(
  documentService,
  customerMessageService.gstListener,
  customerMessageService.adminBillListener,
);
export const gatepassService = new GatepassService();
export const orderService = new OrderService(customerMessageService.checkoutListener);
export const paymentService = new PaymentService(
  customerMessageService.checkoutListener,
  customerMessageService.adminPaymentListener,
);
export const productService = new ProductService();
export const refundService = new RefundService(customerMessageService.adminPaymentListener);
export const reportService = new ReportService();
export const routeService = new RouteService();
export const salesmanService = new SalesmanService();
export const settingsService = new SettingsService();
export const varietyTaxPeriodService = new VarietyTaxPeriodService();
// Spec J-0: reaches the notification app through the typed client with the internal key.
export const whatsAppTokenService = new WhatsAppTokenService({
  notification: createNotificationTokenGateway(notificationClientConfig()),
});
