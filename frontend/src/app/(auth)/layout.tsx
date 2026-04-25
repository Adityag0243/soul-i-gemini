import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-auth-gradient p-6">
      <div className="w-full max-w-[420px] animate-in fade-in zoom-in duration-700">
        {children}
      </div>
    </div>
  );
}
