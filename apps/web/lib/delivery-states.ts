import type { RouterInputs } from "@repo/trpc/client";

export type DeliveryState = RouterInputs["routes"]["create"]["deliveryState"];

// The Route delivery-state picker. The server owns the list (INDIAN_STATES in the services
// package) and refuses anything else; the web app does not depend on the services package, so the
// names are repeated here and the two checks below fail the build if the lists drift apart.
export const DELIVERY_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const satisfies readonly DeliveryState[];

type MissingDeliveryState = Exclude<DeliveryState, (typeof DELIVERY_STATES)[number]>;
const everyDeliveryStateListed: [MissingDeliveryState] extends [never] ? true : never = true;
void everyDeliveryStateListed;
