import type { Metadata } from "next";
import { LoginView } from "~/components/auth/login-view";

export const metadata: Metadata = {
  title: "Sign in Motake",
  description: "Sign in to your Motake account",
};

export default function LoginPage() {
  return <LoginView />;
}
