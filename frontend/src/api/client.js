import axios from 'axios';
import toast from 'react-hot-toast';

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`,
  timeout: 60000,
});

// Global error interceptor — nothing fails silently. Callers that handle
// fallbacks themselves can pass { suppressToast: true } in the request config.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.config?.suppressToast) {
      const message =
        error.response?.data?.message ??
        (error.code === 'ERR_NETWORK' ? 'Backend unreachable — is the API running on port 5000?' : error.message);
      toast.error(message, { id: `api-${error.config?.url}` });
    }
    return Promise.reject(error);
  }
);
