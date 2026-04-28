import apiClient from "@/lib/axios";
import { 
  Practice, 
  PracticeListResponse, 
  CreatePracticeInput,
  PracticeSummary
} from "@/types/practice";

export const practiceService = {
  async getPractices(): Promise<PracticeListResponse> {
    const response = await apiClient.get<PracticeListResponse>("/admin/content-management");
    return response.data;
  },

  async createPractice(input: CreatePracticeInput): Promise<any> {
    const formData = new FormData();
    formData.append("title", input.title);
    formData.append("description", input.description);
    formData.append("duration", input.duration);
    formData.append("practiceType", input.practiceType);
    formData.append("mediaType", input.mediaType);
    formData.append("tags", input.tags);
    formData.append("media", input.media);

    const response = await apiClient.post("/admin/content-management/practices", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    
    return response.data;
  },

  async bulkUploadPractices(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("sheet", file); // Must be 'sheet' exactly

    const response = await apiClient.post("/admin/content-management/practices/bulk-upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    
    return response.data;
  },

  async deletePractice(id: string): Promise<void> {
    await apiClient.delete(`/admin/content-management/practices/${id}`);
  },
};
