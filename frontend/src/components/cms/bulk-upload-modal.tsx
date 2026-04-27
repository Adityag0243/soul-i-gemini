"use client";

import * as React from "react";
import { X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { practiceService } from "@/services/practice-service";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);

  if (!isOpen) return null;

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      await practiceService.bulkUploadPractices(file);
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Bulk upload failed:", error);
      alert("Bulk upload failed. Please check the file format.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />
      <div className="bg-white w-full max-w-[520px] rounded-[3rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 overflow-hidden">
        <div className="relative p-10 flex flex-col items-center">
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-2 rounded-full hover:bg-gray-100 transition-colors group"
          >
            <X className="size-6 text-gray-400 group-hover:text-gray-600" />
          </button>

          <h2 className="text-2xl font-extrabold text-zinc-900 mb-4 w-full text-left pr-10">Bulk Upload Practices</h2>
          
          <p className="text-zinc-500 font-medium text-sm leading-relaxed mb-8 w-full text-left">
            Upload a PDF CSV or JSON file containing multiple practices. The file should include columns for title, description, type, duration, mediaType, and tags.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv,.json,.pdf"
            className="hidden"
          />

          <div 
            className={cn(
              "w-full h-52 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group mb-10",
              isDragging 
                ? "border-teal-500 bg-teal-50/50 scale-[1.02]" 
                : "border-teal-100 bg-teal-50/20 hover:bg-teal-50/40",
              isUploading && "pointer-events-none opacity-60"
            )}
            onClick={triggerFileSelect}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="size-16 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform">
              {isUploading ? (
                <Loader2 className="size-8 text-white animate-spin" />
              ) : (
                <Upload className="size-8 text-white" />
              )}
            </div>
            <div className="text-center">
              <p className="text-[#009688] font-bold text-lg">
                {isUploading ? "Uploading practices..." : "Click to upload or drag and drop"}
              </p>
              <p className="text-zinc-400 font-semibold text-xs mt-1">PDF or JSON or CSV files</p>
            </div>
          </div>

          <Button
            onClick={onClose}
            disabled={isUploading}
            variant="outline"
            className="w-full h-14 rounded-full font-extrabold border-zinc-200 text-zinc-900 hover:bg-zinc-50 text-base shadow-sm active:scale-[0.98] transition-all cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
