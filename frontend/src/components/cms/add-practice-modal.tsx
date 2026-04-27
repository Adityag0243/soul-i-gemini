"use client";

import * as React from "react";
import { X, Upload, Loader2, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CreatePracticeInput, MediaType } from "@/types/practice";

interface AddPracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (practice: CreatePracticeInput) => Promise<void>;
}

export function AddPracticeModal({ isOpen, onClose, onSuccess }: AddPracticeModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState<Partial<CreatePracticeInput>>({
    title: "",
    description: "",
    duration: "", // documentation format "10 min"
    practiceType: "",
    mediaType: "AUDIO",
    tags: "", // documentation format "tag1,tag2"
  });
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert("Please upload a media file");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSuccess({
        ...formData as CreatePracticeInput,
        media: selectedFile,
      });
      onClose();
    } catch (error) {
      console.error("Failed to add practice:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-7 pb-4">
          <h2 className="text-xl font-bold text-zinc-900">Add new practice</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 transition-colors">
            <X className="size-6 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-7 py-2">
          <form id="add-practice-form" onSubmit={handleSubmit} className="space-y-5 pb-8">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-zinc-900">Practice Title</label>
              <Input
                required
                placeholder="Enter practice title"
                className="h-11 bg-zinc-50/50 border-zinc-200 rounded-xl focus-visible:ring-teal-500/20 focus-visible:border-teal-500"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-zinc-900">Description</label>
              <textarea
                required
                placeholder="Enter practice description"
                className="w-full min-h-[100px] p-3.5 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-zinc-900">Duration</label>
                <Input
                  required
                  placeholder="e.g. 10 min"
                  className="h-11 bg-zinc-50/50 border-zinc-200 rounded-xl"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-zinc-900">Practice Type</label>
                <Input
                  required
                  placeholder="e.g. Meditation"
                  className="h-11 bg-zinc-50/50 border-zinc-200 rounded-xl"
                  value={formData.practiceType}
                  onChange={(e) => setFormData({ ...formData, practiceType: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-zinc-900">Media type</label>
              <div className="relative">
                <select
                  className="w-full h-11 px-4 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 appearance-none cursor-pointer text-sm font-medium"
                  value={formData.mediaType}
                  onChange={(e) => setFormData({ ...formData, mediaType: e.target.value as MediaType })}
                >
                  <option value="AUDIO">Audio</option>
                  <option value="VIDEO">Video</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-zinc-900">Upload Media</label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={formData.mediaType === "AUDIO" ? "audio/*" : "video/*"}
                onChange={handleFileChange}
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 hover:border-teal-500 hover:bg-teal-50/10 transition-all cursor-pointer bg-zinc-50/30"
              >
                <div className="p-3 bg-white rounded-full shadow-sm border border-zinc-100">
                  {selectedFile ? (
                    <FileIcon className="size-5 text-teal-600" />
                  ) : (
                    <Upload className="size-5 text-zinc-500" />
                  )}
                </div>
                <p className="text-sm text-zinc-500 font-medium tracking-tight">
                  {selectedFile ? selectedFile.name : "Drag or upload file here"}
                </p>
                {selectedFile && (
                  <p className="text-xs text-zinc-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-zinc-900">Tags(comma-separated)</label>
              <Input
                placeholder="e.g. meditation, morning"
                className="h-11 bg-zinc-50/50 border-zinc-200 rounded-xl"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              />
            </div>
          </form>
        </div>

        <div className="p-7 pt-4 flex gap-4 bg-white border-t border-zinc-50">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="flex-1 h-12 rounded-full font-bold border-zinc-900 text-zinc-900 hover:bg-zinc-50"
          >
            Cancel
          </Button>
          <Button
            form="add-practice-form"
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-12 bg-[#009688] hover:bg-[#00796B] text-white rounded-full font-bold shadow-lg shadow-teal-900/10"
          >
            {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : "Add Practice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
