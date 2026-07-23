import axios from "axios";
import { clearSession, getStoredToken } from "./session";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000",
});

// Automatically attach JWT token to every request
API.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (process.env.NODE_ENV !== "production" &&
        process.env.REACT_APP_AUTH_DEBUG === "true") {
      console.debug("API authentication:", {
        tokenExists: Boolean(token),
        method: config.method?.toUpperCase(),
        url: config.url,
      });
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      if (typeof config.headers.delete === "function") {
        config.headers.delete("Content-Type");
      } else {
        delete config.headers["Content-Type"];
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession();
      const publicAuthRequest = ["/api/auth/login", "/api/auth/register"]
        .some((path) => error.config?.url?.includes(path));
      if (!publicAuthRequest && !["/login", "/register"].includes(window.location.pathname)) {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default API;
