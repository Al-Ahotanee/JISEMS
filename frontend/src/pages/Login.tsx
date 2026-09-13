import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Shield, Vote } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../store/authSlice';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
}).superRefine((d, ctx) => {
  if (!d.email && !d.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter your email or phone number', path: ['email'] });
  }
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const identifier = data.email || data.phone || '';
      const payload = identifier.includes('@') ? { email: identifier, password: data.password } : { phone: identifier, password: data.password };
      const response = await authApi.login(payload);
      if (response.data.success) {
        dispatch(setCredentials(response.data.data));
        toast.success('Welcome back!');
        navigate('/app/dashboard');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 atlas-grid">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-200/35 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-yellow-200/30 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(49,89,138,0.16) 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 bg-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-900/15">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-display text-4xl font-semibold text-primary-800">JISEMS</h1>
          </div>
          <p className="text-text-muted text-sm">Jigawa State Election Monitor</p>
          <p className="text-primary-600 text-xs mt-1 font-bold tracking-[.08em] uppercase">
            Counting Every Vote. Protecting Every Voice in The New World.
          </p>
        </div>

        {/* Login Card */}
        <div className="surface-elevated p-8 sm:p-9">
          <h2 className="font-display text-xl font-semibold text-text-primary mb-6">Sign In</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label-text">Email or phone number</label>
              <input
                {...register('email')}
                type="text"
                className="input-field"
                placeholder="admin@gsem.ng or +234 800 000 0000"
                autoComplete="username"
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              <input {...register('phone')} type="hidden" />
            </div>

            <div>
              <label className="label-text">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-11"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-text-muted">
                <input type="checkbox" className="w-4 h-4 bg-dark-surface-2 border-dark-border rounded" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm text-primary-700 hover:text-primary-900 font-bold transition">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Vote className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-muted text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-700 hover:text-primary-900 font-bold transition">
                Register as an agent
              </Link>
            </p>
          </div>
        </div>

        {/* Public Situation Room link */}
        <div className="text-center mt-6">
          <Link
            to="/situation-room"
            className="text-primary-700 hover:text-primary-900 text-sm font-bold transition flex items-center justify-center gap-2"
          >
            <Vote className="w-4 h-4" />
            View Live Situation Room
          </Link>
        </div>

        <p className="text-center text-text-muted/50 text-xs mt-8">
          Powered by JISEMS — Jigawa State Election Monitor © 2027
        </p>
      </motion.div>
    </div>
  );
}
