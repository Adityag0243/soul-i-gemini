import { RegisterForm } from "@/components/features/auth/register-form";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | Souli Admin",
  description: "Create a new Souli admin account",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
