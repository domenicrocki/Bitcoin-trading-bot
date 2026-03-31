import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ?? error.message ?? "Unknown error";
    console.error("[API Error]", message);
    return Promise.reject(error);
  },
);

export default apiClient;
