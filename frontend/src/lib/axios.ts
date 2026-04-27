import axios from "axios";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.NEXT_PUBLIC_API_KEY,
  },
});

// Response interceptor for handling token expiration
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If the error is 401 and we haven't tried to refresh yet
    // Also ensure we don't attempt to refresh if the request was for login or already a refresh request
    if (
      error.response?.status === 401 && 
      !originalRequest._retry && 
      !originalRequest.url?.includes("/login") && 
      !originalRequest.url?.includes("/refresh")
    ) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh the tokens
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/auth/token/refresh`,
          {},
          { 
            withCredentials: true,
            headers: {
                "x-api-key": process.env.NEXT_PUBLIC_API_KEY,
            }
          }
        );

        // If refresh is successful, retry the original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // If refresh fails, clear local storage and redirect to login
        if (typeof window !== "undefined") {
          localStorage.removeItem("user_info");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
