"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      setIsSubmitted(true);
    } catch (error) {
      console.error("Password reset request failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] p-6 sm:p-10 flex flex-col items-center border border-gray-50 w-full animate-in fade-in zoom-in duration-700">
        <div className="mb-6">
          <Image 
            src="/logo.png" 
            alt="Souli Logo" 
            width={70} 
            height={70} 
            priority 
            className="h-auto w-auto object-contain" 
          />
        </div>

        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">Check Your Email</h1>
        <p className="text-gray-400 text-[13px] mb-1 text-center">
          We&apos;ve sent password reset instructions to
        </p>
        <p className="text-brand font-bold text-[13px] mb-6 text-center">{email}</p>

        <div className="bg-cyan-50/50 border border-cyan-100 rounded-xl p-4 mb-8 w-full">
          <p className="text-gray-500 text-[12px] leading-relaxed text-center">
            Please check your inbox and click the reset link. The link will expire in 1 hour.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          className="cursor-pointer w-full h-11 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/10 transition-all text-sm border-none active:scale-[0.98] mb-6"
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : "Resend Email"}
        </Button>

        <Link 
          href="/login" 
          className="flex items-center space-x-1 text-brand font-bold text-[12px] hover:text-brand/80 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Sign In</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] p-6 sm:p-10 flex flex-col items-center border border-gray-50 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-6 transform hover:scale-105 transition-transform duration-300">
        <Image 
          src="/logo.png" 
          alt="Souli Logo" 
          width={70} 
          height={70} 
          priority 
          className="h-auto w-auto object-contain" 
        />
      </div>

      <h1 className="text-xl font-extrabold text-gray-900 mb-1 tracking-tight">Forgot Password?</h1>
      <p className="text-gray-400 text-[13px] mb-8 text-center">No worries, we&apos;ll send you reset instructions</p>

      <form onSubmit={handleSubmit} className="w-full space-y-6">
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

        <Button
          type="submit"
          className="cursor-pointer w-full h-11 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/10 transition-all text-sm border-none active:scale-[0.98] mb-4"
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>

      <div className="mt-8">
        <Link 
          href="/login" 
          className="flex items-center space-x-1 text-brand font-bold text-[12px] hover:text-brand/80 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Sign In</span>
        </Link>
      </div>
    </div>
  );
}
