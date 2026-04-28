"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      <div className="bg-white rounded-[2rem] w-full max-w-[360px] p-8 shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
        <div className="flex justify-end mb-2 -mr-2">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors group">
            <X className="size-5 text-gray-400 group-hover:text-gray-600" />
          </button>
        </div>
        
        <div className="flex flex-col items-center text-center">
          <div className="size-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
            <LogOut className="size-8 text-red-500" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign Out</h2>
          <p className="text-gray-500 text-sm mb-8">Are you sure you want to log out of your admin account?</p>
          
          <div className="flex flex-col w-full gap-3">
            <Button 
              onClick={onConfirm}
              className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl border-none shadow-lg shadow-red-100 active:scale-[0.98] transition-all"
            >
              Logout
            </Button>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="w-full h-12 text-gray-400 font-bold rounded-xl hover:bg-gray-50"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
