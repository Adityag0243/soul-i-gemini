"use client";

import React, { useState, useRef, useEffect } from "react";
import { User as UserIcon, LogOut, MoreHorizontal, Settings } from "lucide-react";
import { User } from "@/types/auth";
import { LogoutModal } from "./logout-modal";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth-service";
import { useAuth } from "@/context/AuthContext";

interface UserFooterProps {
  user: User;
}

export function UserFooter({ user }: UserFooterProps) {
  const { logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    logout();
  };

  return (
    <div className="relative w-full" ref={menuRef}>
      {/* Popover Menu */}
      {isMenuOpen && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 w-full bg-white rounded-2xl shadow-[0_15px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 z-50">
          <div className="p-1.5">
            <button 
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 rounded-xl transition-colors text-left group"
              onClick={() => setIsMenuOpen(false)}
            >
              <UserIcon className="size-5 text-gray-500 group-hover:text-[#008080] transition-colors" />
              <span className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Profile Settings</span>
            </button>
            <div className="h-px bg-gray-50 mx-2" />
            <button 
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 rounded-xl transition-colors text-left group"
              onClick={() => {
                setIsMenuOpen(false);
                setIsLogoutModalOpen(true);
              }}
            >
              <LogOut className="size-5 text-red-500 group-hover:text-red-600 transition-colors" />
              <span className="text-sm font-bold text-red-500 group-hover:text-red-600 transition-colors">Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* User Info Bar */}
      <div 
        className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white transition-all cursor-pointer group border border-transparent hover:border-teal-50 hover:shadow-sm"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <div className="size-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm shrink-0 group-hover:border-teal-50 transition-all">
          <UserIcon className="size-6 text-gray-400 group-hover:text-gray-500" />
        </div>
        
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-bold text-gray-900 truncate leading-tight group-hover:text-[#008080] transition-colors">
            {user.name || "User"}
          </span>
          <span className="text-[11px] font-medium text-gray-400 truncate">
            {user.email}
          </span>
        </div>
        
        <div className="size-8 rounded-full border border-gray-100 flex items-center justify-center hover:bg-gray-50 transition-colors shrink-0">
          <MoreHorizontal className="size-5 text-gray-400 group-hover:text-gray-600" />
        </div>
      </div>

      <LogoutModal 
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
