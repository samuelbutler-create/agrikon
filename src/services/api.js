import axios from 'axios';
import { store } from '../app/store';
import { logout } from '../features/auth/authSlice';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const isValidAuthToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return false;
  const parts = trimmed.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const isLikelyJwtError = (error) => {
  if (error?.response?.status !== 422) return false;
  const msg = String(error.response?.data?.msg || error.response?.data?.message || '').toLowerCase();
  return msg.includes('token') ||
    msg.includes('authorization') ||
    msg.includes('header') ||
    msg.includes('signature') ||
    msg.includes('segments') ||
    msg.includes('invalid');
};

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // Get token from Redux store (single source of truth)
    const token = store.getState().auth.token;
    if (isValidAuthToken(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (token) {
      store.dispatch(logout());
    }
    // Don't set Content-Type for FormData - let browser handle it
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isLikelyJwtError(error)) {
      // Clear bad auth state so optional endpoints can proceed without a token.
      store.dispatch(logout());

      const originalRequest = error.config || {};
      const hasAuthHeader = !!originalRequest.headers?.Authorization;
      const isGet = String(originalRequest.method || '').toLowerCase() === 'get';

      if (hasAuthHeader && isGet && !originalRequest._retryWithoutAuth) {
        const retryConfig = {
          ...originalRequest,
          headers: { ...originalRequest.headers },
          _retryWithoutAuth: true,
        };
        delete retryConfig.headers.Authorization;
        return api.request(retryConfig);
      }
    }
    if (error.response?.status === 401) {
      // Dispatch logout action to clean up Redux state AND localStorage
      store.dispatch(logout());
      
      // Only redirect if not already on login/register page
      if (!window.location.pathname.includes('/login') && 
          !window.location.pathname.includes('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;