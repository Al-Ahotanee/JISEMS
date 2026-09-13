import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User } from '../types';

const storedToken = localStorage.getItem('gsem_access_token');
const storedRefresh = localStorage.getItem('gsem_refresh_token');
const storedUser = localStorage.getItem('gsem_user');

const initialState: AuthState = {
  user: storedUser ? JSON.parse(storedUser) : null,
  accessToken: storedToken,
  refreshToken: storedRefresh,
  isAuthenticated: !!storedToken,
  isLoading: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User; accessToken: string; refreshToken: string }>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.isLoading = false;
      localStorage.setItem('gsem_access_token', action.payload.accessToken);
      localStorage.setItem('gsem_refresh_token', action.payload.refreshToken);
      localStorage.setItem('gsem_user', JSON.stringify(action.payload.user));
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        localStorage.setItem('gsem_user', JSON.stringify(state.user));
      }
    },
    setTokens: (state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      localStorage.setItem('gsem_access_token', action.payload.accessToken);
      localStorage.setItem('gsem_refresh_token', action.payload.refreshToken);
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      localStorage.removeItem('gsem_access_token');
      localStorage.removeItem('gsem_refresh_token');
      localStorage.removeItem('gsem_user');
    },
  },
});

export const { setCredentials, updateUser, setTokens, setLoading, logout } = authSlice.actions;
export default authSlice.reducer;
