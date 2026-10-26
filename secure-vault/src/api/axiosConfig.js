import axios from 'axios';

// 1. Base API instance create karna
const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Tumhara backend URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// 2. Request Interceptor: Har API call se pehle token attach karna
api.interceptors.request.use(
  (config) => {
    // LocalStorage se token nikalo
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    // Agar token hai, toh usko headers mein daal do (Bouncer ke liye)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response, // If the request succeeds, just return it
  async (error) => {
    const originalRequest = error.config;

    // Check if the error is 401 Unauthorized, we haven't already retried, and it's not the login route
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login') {
      originalRequest._retry = true; // Mark as retried to prevent infinite loops

      try {
        // Determine which storage is holding the session
        const storage = localStorage.getItem('refreshToken') ? localStorage : sessionStorage;
        const refreshToken = storage.getItem('refreshToken');

        if (!refreshToken) throw new Error("No refresh token available");

        // Request a new access token
        const refreshResponse = await axios.post('http://localhost:5000/api/auth/refresh-token', { refreshToken });
        
        // Update the new access token in storage
        storage.setItem('token', refreshResponse.data.token);

        // Update the failed request with the new token and fire it again
        originalRequest.headers.Authorization = `Bearer ${refreshResponse.data.token}`;
        return api(originalRequest);

      } catch (refreshError) {
        // If the refresh token is also expired or invalid, clear everything and kick to login
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;