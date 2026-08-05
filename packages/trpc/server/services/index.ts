import AuthService from "@repo/services/auth";
import CustomerService from "@repo/services/customers";
import GatepassService from "@repo/services/gatepass";
import OrderService from "@repo/services/orders";
import ProductService from "@repo/services/products";
import ReportService from "@repo/services/reports";
import SalesmanService from "@repo/services/salesman";

export const authService = new AuthService();
export const customerService = new CustomerService();
export const gatepassService = new GatepassService();
export const orderService = new OrderService();
export const productService = new ProductService();
export const reportService = new ReportService();
export const salesmanService = new SalesmanService();
