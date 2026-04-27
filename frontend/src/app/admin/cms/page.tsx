"use client";

import * as React from "react";
import { CMSHeader } from "@/components/cms/cms-header";
import { StatCard } from "@/components/shared/stat-card";
import { PracticeCard } from "@/components/cms/practice-card";
import { AddPracticeModal } from "@/components/cms/add-practice-modal";
import { DeleteConfirmationModal } from "@/components/cms/delete-confirmation-modal";
import { BulkUploadModal } from "@/components/cms/bulk-upload-modal";
import { practiceService } from "@/services/practice-service";
import { Practice, PracticeSummary, CreatePracticeInput } from "@/types/practice";
import { Loader2 } from "lucide-react";

export default function CMSPage() {
  const [practices, setPractices] = React.useState<Practice[]>([]);
  const [stats, setStats] = React.useState<PracticeSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
  const [deletingPractice, setDeletingPractice] = React.useState<Practice | null>(null);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await practiceService.getPractices();
      setPractices(response.data.practices);
      setStats(response.data.summary);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddPractice = async (input: CreatePracticeInput) => {
    await practiceService.createPractice(input);
    await fetchData();
  };

  const handleConfirmDelete = async () => {
    if (deletingPractice) {
      await practiceService.deletePractice(deletingPractice.id);
      await fetchData();
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <CMSHeader
        title="Content Management"
        subtitle="Manage practices for the mobile app"
        onAddPractice={() => setIsModalOpen(true)}
        onBulkUpload={() => setIsBulkModalOpen(true)}
      />

      {isLoading && !practices.length ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-10 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          <div className="flex gap-10 mb-12">
            <StatCard label="Total Practices" value={stats?.totalPractices ?? 0} />
            <StatCard label="Audio Content" value={stats?.audioContent ?? 0} />
            <StatCard label="Video Content" value={stats?.videoContent ?? 0} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 leading-tight">All Practices</h2>
            <p className="text-zinc-500 font-medium tracking-tight">Manage practices for the mobile app</p>
          </div>

          <div className="flex flex-col gap-6">
            {practices.map((practice) => (
              <PracticeCard
                key={practice.id}
                title={practice.title}
                category={practice.practiceType}
                duration={practice.durationLabel}
                type={practice.mediaType.toLowerCase() as "audio" | "video"}
                description={practice.description}
                tags={practice.tags}
                onDelete={() => setDeletingPractice(practice)}
              />
            ))}
          </div>
        </>
      )}

      <AddPracticeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleAddPractice}
      />

      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
      />

      <DeleteConfirmationModal
        isOpen={!!deletingPractice}
        title={deletingPractice?.title ?? ""}
        onClose={() => setDeletingPractice(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}


