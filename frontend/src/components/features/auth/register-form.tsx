"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    if (!agreeTerms) {
      alert("Please agree to the Terms of Service");
      return;
    }

    setIsLoading(true);
    try {
      await authService.signup({ name, email, password });
      router.push("/admin"); // Redirect to dashboard
    } catch (error) {
      console.error("Signup failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] p-6 sm:p-10 flex flex-col items-center border border-gray-50 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
        <Image
          src="/logo.png"
          alt="Souli Logo"
          width={70}
          height={70}
          priority
          className="h-auto w-auto object-contain"
        />
      </div>

      <h1 className="text-xl font-extrabold text-gray-900 mb-0.5 tracking-tight">Create Account</h1>
      <p className="text-gray-400 text-[13px] mb-6 text-center">Join Souli to manage your meditation platform</p>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-gray-800 block ml-0.5" htmlFor="name">
            Full Name
          </label>
          <Input
            id="name"
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 px-4 rounded-xl border-gray-100 focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all bg-white text-gray-700 placeholder:text-gray-300 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-gray-800 block ml-0.5" htmlFor="email">
            Email Address
          </label>
          <Input
            id="email"
            type="email"
            placeholder="admin@souli.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 px-4 rounded-xl border-gray-100 focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all bg-white text-gray-700 placeholder:text-gray-300 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-gray-800 block ml-0.5" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            type="password"
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 px-4 rounded-xl border-gray-100 focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all bg-white text-gray-700 placeholder:text-gray-300 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-bold text-gray-800 block ml-0.5" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 px-4 rounded-xl border-gray-100 focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all bg-white text-gray-700 placeholder:text-gray-300 text-sm"
            required
          />
        </div>

        <div className="flex items-start space-x-2 px-0.5 py-1">
          <input
            type="checkbox"
            id="terms"
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer"
            checked={agreeTerms}
            onChange={() => setAgreeTerms(!agreeTerms)}
          />
          <label htmlFor="terms" className="text-[11px] font-semibold text-gray-400 cursor-pointer hover:text-gray-500 transition-colors leading-tight pt-1">
            I agree to the Terms of Service and Privacy Policy
          </label>
        </div>

        <Button
          type="submit"
          className="cursor-pointer w-full h-11 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/10 transition-all text-sm border-none active:scale-[0.98]"
          disabled={isLoading}
        >
          {isLoading ? "Creating Account..." : "Create Account"}
        </Button>
      </form>

      <div className="w-full flex items-center my-6">
        <div className="flex-1 h-px bg-gray-100"></div>
        <span className="px-4 text-[11px] font-semibold text-gray-600 whitespace-nowrap">Already have an account?</span>
        <div className="flex-1 h-px bg-gray-100"></div>
      </div>

      <Link href="/login" className="w-full">
        <Button
          variant="outline"
          className="w-full h-11 border-2 border-brand text-brand hover:bg-brand/5 font-bold rounded-xl transition-all text-sm active:scale-[0.98] cursor-pointer"
        >
          Sign In
        </Button>
      </Link>
    </div>
  );
}
