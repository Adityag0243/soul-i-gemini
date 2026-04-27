import { Plus, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CMSHeaderProps {
  title: string;
  subtitle: string;
  onAddPractice?: () => void;
  onBulkUpload?: () => void;
}

export function CMSHeader({ title, subtitle, onAddPractice, onBulkUpload }: CMSHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 leading-tight">{title}</h1>
        <p className="text-zinc-500 font-medium">{subtitle}</p>
      </div>
      
      <div className="flex items-center gap-4">
        <Button 
          variant="outline"
          onClick={onBulkUpload}
          className="border-[#009688] text-[#009688] hover:bg-teal-50 px-6 h-12 rounded-full font-bold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
        >
          <FileUp className="size-5" />
          Bulk Upload
        </Button>
        <Button 
          onClick={onAddPractice}
          className="bg-[#009688] hover:bg-[#00796B] text-white px-6 h-12 rounded-full font-bold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="size-5" />
          Add Practice
        </Button>
      </div>
    </div>
  );
}
