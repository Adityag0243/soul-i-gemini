import { LoginForm } from "@/components/features/auth/login-form";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Souli Admin",
  description: "Sign in to access your Souli admin dashboard",
};

export default function LoginPage() {
  return <LoginForm />;
}
