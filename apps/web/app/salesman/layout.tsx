import { SalesmanShell } from "~/components/salesman/salesman-shell";

export default function SalesmanLayout({ children }: { children: React.ReactNode }) {
  return <SalesmanShell>{children}</SalesmanShell>;
}
