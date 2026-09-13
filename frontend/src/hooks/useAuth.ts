import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../store';
import { setCredentials, logout as logoutAction } from '../store/authSlice';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { user, isAuthenticated, accessToken, isLoading } = useSelector((state: RootState) => state.auth);

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password });
      if (response.data.success) {
        dispatch(setCredentials(response.data.data));
        toast.success('Login successful!');
        return response.data.data;
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // Ignore logout API errors
    } finally {
      dispatch(logoutAction());
      navigate('/login');
      toast.success('Logged out successfully');
    }
  };

  const hasRole = (...roles: string[]) => {
    return user ? roles.includes(user.role) : false;
  };

  const canAccess = (requiredRoles: string[]) => {
    return user ? requiredRoles.includes(user.role) : false;
  };

  return {
    user,
    isAuthenticated,
    accessToken,
    isLoading,
    login,
    logout,
    hasRole,
    canAccess,
  };
};
