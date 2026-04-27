import { ForgotPasswordForm } from "@/components/features/auth/forgot-password-form";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Souli Admin",
  description: "Reset your Souli admin password",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
