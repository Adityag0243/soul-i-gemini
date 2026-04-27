import apiClient from "@/lib/axios";
import { AuthResponse, User } from "@/types/auth";

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/admin/auth/login", {
      email,
      password,
    });
    
    if (response.data.success) {
      // Store user info in local storage as requested
      localStorage.setItem("user_info", JSON.stringify(response.data.data.user));
    }
    
    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/admin/auth/logout");
    } catch (error) {
      console.error("Logout API failed:", error);
    } finally {
      localStorage.removeItem("user_info");
    }
  },

  getUserInfo(): User | null {
    if (typeof window !== "undefined") {
      const userInfo = localStorage.getItem("user_info");
      return userInfo ? JSON.parse(userInfo) : null;
    }
    return null;
  },

  isAdmin(user: User | null): boolean {
    if (!user) return false;
    return user.roles.some((role) => role.code === "ADMIN");
  },

  async refreshToken(): Promise<void> {
    await apiClient.post("/admin/auth/token/refresh");
  }
};
