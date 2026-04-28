"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}

export function DeleteConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title 
}: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
            <AlertCircle className="size-8 text-red-500" />
          </div>
          
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Delete Practice?</h2>
          <p className="text-zinc-500 font-medium px-4">
            Are you sure you want to delete <span className="text-zinc-900 font-bold">"{title}"</span>? This action cannot be undone.
          </p>

          <div className="flex gap-4 w-full mt-8">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 h-12 rounded-full font-bold border-zinc-900 text-zinc-900 hover:bg-zinc-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold shadow-lg shadow-red-900/10"
            >
              {isDeleting ? <Loader2 className="size-5 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
