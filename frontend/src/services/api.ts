import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  LoginRequest, RegisterRequest,
  LGA, Ward, PollingUnit,
  Election, Candidate,
  SubmitResultRequest, CollationRequest,
  RaiseDisputeRequest, ResolveDisputeRequest,
  NotificationPreference, PushSubscriptionRequest,
  ChangePasswordRequest, ReviewApplicationRequest,
  ApiParams, User
} from '../types';

// ==================== AXIOS INSTANCE ====================

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==================== REQUEST INTERCEPTOR ====================

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('jisems_access_token') || localStorage.getItem('gsem_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ==================== RESPONSE INTERCEPTOR ====================

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') ||
                           originalRequest?.url?.includes('/auth/register') ||
                           originalRequest?.url?.includes('/auth/refresh') ||
                           originalRequest?.url?.includes('/auth/forgot-password');

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('jisems_refresh_token') || localStorage.getItem('gsem_refresh_token');

      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('jisems_access_token');
        localStorage.removeItem('jisems_refresh_token');
        localStorage.removeItem('jisems_user');
        localStorage.removeItem('gsem_access_token');
        localStorage.removeItem('gsem_refresh_token');
        localStorage.removeItem('gsem_user');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      try {
        const response = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = response.data.data;

        localStorage.setItem('jisems_access_token', accessToken);
        localStorage.setItem('jisems_refresh_token', newRefreshToken);
        localStorage.setItem('gsem_access_token', accessToken);
        localStorage.setItem('gsem_refresh_token', newRefreshToken);

        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('jisems_access_token');
        localStorage.removeItem('jisems_refresh_token');
        localStorage.removeItem('jisems_user');
        localStorage.removeItem('gsem_access_token');
        localStorage.removeItem('gsem_refresh_token');
        localStorage.removeItem('gsem_user');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ==================== AUTH API ====================

export const authApi = {
  login(data: LoginRequest) { return api.post('/auth/login', data); },
  register(data: RegisterRequest) { return api.post('/auth/register', data); },
  refreshToken(refreshToken: string) { return api.post('/auth/refresh', { refreshToken }); },
  logout() { return api.post('/auth/logout'); },
  forgotPassword(data: { email: string }) { return api.post('/auth/forgot-password', data); },
  resetPassword(data: { token: string; password: string }) { return api.post('/auth/reset-password', data); },
  verifyEmail(token: string) { return api.post('/auth/verify-email', undefined, { params: { token } }); },
  getMe() { return api.get('/auth/me'); },
};

// ==================== GEO API ====================

export const geoApi = {
  getLGAs() { return api.get('/geo/lgas'); },
  createLGA(data: Omit<LGA, 'id'>) { return api.post('/geo/lgas', data); },
  updateLGA(id: number, data: Partial<LGA>) { return api.put(`/geo/lgas/${id}`, data); },
  deleteLGA(id: number) { return api.delete(`/geo/lgas/${id}`); },

  getWards(params?: ApiParams) { return api.get('/geo/wards', { params }); },
  createWard(data: Omit<Ward, 'id'>) { return api.post('/geo/wards', data); },
  updateWard(id: number, data: Partial<Ward>) { return api.put(`/geo/wards/${id}`, data); },
  deleteWard(id: number) { return api.delete(`/geo/wards/${id}`); },

  getPollingUnits(params?: ApiParams) { return api.get('/geo/polling-units', { params }); },
  getPollingUnit(id: number) { return api.get(`/geo/polling-units/${id}`); },
  createPollingUnit(data: Omit<PollingUnit, 'id'>) { return api.post('/geo/polling-units', data); },
  updatePollingUnit(id: number, data: Partial<PollingUnit>) { return api.put(`/geo/polling-units/${id}`, data); },
  deletePollingUnit(id: number) { return api.delete(`/geo/polling-units/${id}`); },
};

// ==================== ELECTION API ====================

export const electionApi = {
  listElections(params?: ApiParams) { return api.get('/elections', { params }); },
  getElection(id: string | number) { return api.get(`/elections/${id}`); },
  createElection(data: Partial<Election>) { return api.post('/elections', data); },
  updateElection(id: string | number, data: Partial<Election>) { return api.put(`/elections/${id}`, data); },
  listCandidates(electionId: string | number) { return api.get(`/elections/${electionId}/candidates`); },
  createCandidate(electionId: string | number, data: any) { return api.post(`/elections/${electionId}/candidates`, data); },
  updateCandidate(electionId: string | number, candidateId: string | number, data: any) { return api.put(`/elections/${electionId}/candidates/${candidateId}`, data); },
  deleteCandidate(electionId: string | number, candidateId: string | number) { return api.delete(`/elections/${electionId}/candidates/${candidateId}`); },
};

// ==================== RESULTS API ====================

export const resultsApi = {
  submitResult(formData: FormData) {
    return api.post('/results', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  },
  listResults(params?: ApiParams) { return api.get('/results', { params }); },
  getResult(id: string | number) { return api.get(`/results/${id}`); },
  verifyResult(id: number) { return api.put(`/results/${id}/verify`); },
  rejectResult(id: number, data?: { reason: string }) { return api.put(`/results/${id}/reject`, data); },
  flagResult(id: number, data?: { reason: string; flag_type: string }) { return api.put(`/results/${id}/flag`, data); },
};

// ==================== COLLATION API ====================

export const collationApi = {
  submitWardCollation(data: CollationRequest) { return api.post('/collation/ward', data); },
  submitLGACollation(data: CollationRequest) { return api.post('/collation/lga', data); },
  submitStateCollation(data: CollationRequest) { return api.post('/collation/state', data); },
  getCollationSummary(electionId: number, params?: ApiParams) { return api.get('/collation/summary', { params: { election_id: electionId, ...params } }); },
};

// ==================== DASHBOARD API ====================

export const dashboardApi = {
  getStateDashboard(params?: ApiParams) { return api.get('/dashboard/state', { params }); },
  getLGADashboard(id: string | number, params?: ApiParams) { return api.get(`/dashboard/lga/${id}`, { params }); },
  getWardDashboard(id: string | number, params?: ApiParams) { return api.get(`/dashboard/ward/${id}`, { params }); },
  getAnomalies(params?: ApiParams) { return api.get('/dashboard/anomalies', { params }); },
  getTimeline(params?: ApiParams) { return api.get('/dashboard/timeline', { params }); },
};

// ==================== PUBLIC API ====================

export const publicApi = {
  getSituationRoom(params?: ApiParams) { return api.get('/public/situation-room', { params }); },
  getSituationRoomLGA(lgaId: number, params?: ApiParams) { return api.get(`/public/situation-room/lga/${lgaId}`, { params }); },
  getSituationRoomWard(wardId: number, params?: ApiParams) { return api.get(`/public/situation-room/ward/${wardId}`, { params }); },
  getEmbedData(electionId: number) { return api.get(`/public/embed/${electionId}`); },
  getPublicElections() { return api.get('/public/elections'); },
  getMerkleLedger(params?: ApiParams) { return api.get('/public/merkle-ledger', { params }); },
};

// ==================== ANOMALY API ====================

export const anomalyApi = {
  listAnomalies(params?: ApiParams) { return api.get('/anomalies', { params }); },
  resolveAnomaly(id: number, status: string) { return api.patch(`/anomalies/${id}/resolve`, { status }); },
  getBenfordAudit(params?: ApiParams) { return api.get('/anomalies/benford', { params }); },
};

// ==================== DISPUTE API ====================

export const disputeApi = {
  raiseDispute(data: RaiseDisputeRequest) { return api.post('/disputes', data); },
  listDisputes(params?: ApiParams) { return api.get('/disputes', { params }); },
  getDispute(id: string | number) { return api.get(`/disputes/${id}`); },
  addComment(disputeId: string | number, data: { comment: string }) { return api.post(`/disputes/${disputeId}/comments`, data); },
  addEvidence(disputeId: string | number, formData: FormData) {
    return api.post(`/disputes/${disputeId}/evidence`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  },
  resolveDispute(id: string | number, data: ResolveDisputeRequest) { return api.put(`/disputes/${id}/resolve`, data); },
  escalateDispute(id: string | number) { return api.put(`/disputes/${id}/escalate`); },
};

// ==================== REPORT API ====================

export const reportsApi = {
  downloadPDF(params?: ApiParams) { return api.get('/reports/pdf', { params, responseType: 'blob', timeout: 120000 }); },
  downloadExcel(params?: ApiParams) { return api.get('/reports/excel', { params, responseType: 'blob', timeout: 120000 }); },
  downloadCSV(params?: ApiParams) { return api.get('/reports/csv', { params, responseType: 'blob', timeout: 120000 }); },
};

// ==================== NOTIFICATION API ====================

export const notificationsApi = {
  listNotifications(params?: ApiParams) { return api.get('/notifications', { params }); },
  getUnreadCount() { return api.get('/notifications/unread-count'); },
  markAsRead(id: number) { return api.put(`/notifications/${id}/read`); },
  markAllAsRead() { return api.put('/notifications/read-all'); },
  getPreferences() { return api.get('/notifications/preferences'); },
  updatePreferences(preferences: NotificationPreference[]) { return api.put('/notifications/preferences', { preferences }); },
};

// ==================== PUSH API ====================

export const pushApi = {
  subscribe(subscription: PushSubscriptionRequest) { return api.post('/push/subscribe', subscription); },
  unsubscribe(endpoint: string) { return api.post('/push/unsubscribe', { endpoint }); },
  getVapidKey() { return api.get('/push/vapid-key'); },
};

// ==================== USER API ====================

export const usersApi = {
  updateProfile(data: Partial<User>) { return api.put('/users/profile', data); },
  uploadPhoto(formData: FormData) { return api.post('/users/profile/photo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  changePassword(data: ChangePasswordRequest) { return api.put('/users/password', data); },
};

// ==================== ADMIN API ====================

export const adminApi = {
  listUsers(params?: ApiParams) { return api.get('/admin/users', { params }); },
  getUser(id: number) { return api.get(`/admin/users/${id}`); },
  createUser(data: Partial<User>) { return api.post('/admin/users', data); },
  updateUser(id: number, data: Partial<User>) { return api.put(`/admin/users/${id}`, data); },
  deleteUser(id: number) { return api.delete(`/admin/users/${id}`); },
  listApplications(params?: ApiParams) { return api.get('/admin/applications', { params }); },
  reviewApplication(id: number, data: ReviewApplicationRequest) { return api.put(`/admin/applications/${id}/review`, data); },
  listAuditLogs(params?: ApiParams) { return api.get('/admin/audit-logs', { params }); },
  getSystemConfig() { return api.get('/admin/config'); },
  updateSystemConfig(config: Record<string, string | boolean | number>) { return api.put('/admin/config', config); },
  getDashboardStats() { return api.get('/admin/dashboard-stats'); },
};

// ==================== PRIVACY API ====================

export const privacyApi = {
  exportMyData() { return api.get('/privacy/export', { responseType: 'blob', timeout: 120000 }); },
  requestErasure() { return api.post('/privacy/erasure'); },
};

export default api;

