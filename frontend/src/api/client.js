import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized on protected routes, redirect to login
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

export const codeApi = {
  analyze: (payload) => api.post('/code/analyze', payload),
};

export const testRunsApi = {
  getAll: () => api.get('/test-runs'),
  getById: (id) => api.get(`/test-runs/${id}`),
  getBugs: (id) => api.get(`/test-runs/${id}/bugs`),
  create: (payload) => api.post('/test-runs', payload),
};

export const bugsApi = {
  getAll: (params) => api.get('/bugs', { params }),
  updateStatus: (id, status) => api.patch(`/bugs/${id}/status`, { status }),
  update: (id, payload) => api.put(`/bugs/${id}`, payload),
};

export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (payload) => api.post('/users', payload),
  update: (id, payload) => api.put(`/users/${id}`, payload),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role }),
  remove: (id) => api.delete(`/users/${id}`),
};

export const forgeApi = {
  generate: (payload) => api.post('/automation/generate', payload),
  run: (payload) => api.post('/automation/run', payload),
  smartLogin: (payload) => api.post('/automation/smart-login', payload),
  parse: (instructions) => api.post('/automation/parse', { instructions }),
  smartRun: (payload) => api.post('/automation/smart-run', payload),
  status: (runId) => api.get(`/automation/runs/${runId}`),
};

export const notesApi = {
  getAll: () => api.get('/notes'),
  getById: (id) => api.get(`/notes/${id}`),
  create: (note) => api.post('/notes', note),
  update: (id, note) => api.put(`/notes/${id}`, note),
  delete: (id) => api.delete(`/notes/${id}`),
  toggleShare: (id) => api.patch(`/notes/${id}/share`),
};

export const chatApi = {
  getHistory: (roomId) => api.get(`/chat/history/${roomId}`),
  uploadMedia: (formData) => api.post('/chat/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteMessage: (id) => api.delete(`/chat/messages/${id}`),
  getRooms: () => api.get('/chat/rooms'),
  createGroup: (payload) => api.post('/chat/rooms', payload),
  getOrCreateDm: (userId) => api.post('/chat/rooms/dm', { userId }),
  addMembers: (slug, memberIds) => api.post(`/chat/rooms/${slug}/members`, { memberIds }),
  removeMember: (slug, userId) => api.delete(`/chat/rooms/${slug}/members/${userId}`),
  deleteRoom: (slug) => api.delete(`/chat/rooms/${slug}`),
};

export const aiTestApi = {
  health: () => api.get('/ai-test/health'),
  generate: (payload) => api.post('/ai-test/generate', payload, { responseType: 'text' }),
  heal: (payload) => api.post('/ai-test/heal', payload, { responseType: 'text' }),
  execute: (payload) => api.post('/ai-test/execute', payload, { responseType: 'text' }),
  fix: (payload) => api.post('/ai-test/fix', payload, { responseType: 'text' }),
};

export default api;
