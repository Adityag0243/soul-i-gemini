"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authService } from "@/services/auth-service";
import { useAuth } from "@/context/AuthContext";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(email, password);
      // Redirection is handled in AuthContext after successful login
    } catch (error: any) {
      console.error("Login failed", error);
      setError(error.response?.data?.message || "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] p-6 sm:p-10 flex flex-col items-center border border-gray-50 w-full">
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

      <h1 className="text-xl font-extrabold text-gray-900 mb-0.5 tracking-tight">Welcome Back</h1>
      <p className="text-gray-400 text-[13px] mb-6 text-center">Sign in to access your admin dashboard</p>

      {error && (
        <div className="w-full p-3 mb-4 text-xs font-medium text-red-500 bg-red-50 border border-red-100 rounded-xl text-center animate-in fade-in slide-in-from-top-1 duration-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full space-y-4">
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
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 px-4 rounded-xl border-gray-100 focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all bg-white text-gray-700 placeholder:text-gray-300 text-sm"
            required
          />
        </div>

        <div className="flex items-center justify-between px-0.5">
          <label className="flex items-center space-x-2 cursor-pointer group">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer"
              checked={rememberMe}
              onChange={() => setRememberMe(!rememberMe)}
            />
            <span className="text-[12px] font-semibold text-gray-400 group-hover:text-gray-500 transition-colors">Remember me</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-[12px] font-bold text-brand hover:text-brand/80 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          className="cursor-pointer w-full h-11 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/10 transition-all text-sm border-none active:scale-[0.98]"
          disabled={isLoading}
        >
          {isLoading ? "Signing In..." : "Sign In"}
        </Button>
      </form>

      <div className="w-full flex items-center my-6">
        <div className="flex-1 h-px bg-gray-100"></div>
        <span className="px-4 text-[11px] font-semibold text-gray-600 whitespace-nowrap">Don't have an account?</span>
        <div className="flex-1 h-px bg-gray-100"></div>
      </div>

      <Link href="/register" className="w-full">
        <Button
          variant="outline"
          className="w-full h-11 border-2 border-brand text-brand hover:bg-brand/5 font-bold rounded-xl transition-all text-sm active:scale-[0.98] cursor-pointer"
        >
          Create Account
        </Button>
      </Link>
    </div>
  );
}
