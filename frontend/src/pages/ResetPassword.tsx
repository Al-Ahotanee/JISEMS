import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Lock, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return toast.error('This reset link is missing its token');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirmation) return toast.error('Passwords do not match');

    setIsLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      setCompleted(true);
      toast.success('Password reset successfully');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Unable to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 atlas-grid" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(49,89,138,0.13) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Shield className="w-10 h-10 text-primary-700 mx-auto mb-2" />
          <h1 className="font-display text-3xl font-semibold text-primary-800">GSEM</h1>
        </div>
        <div className="surface-elevated p-8 sm:p-9">
          {completed ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-accent-700" />
              </div>
              <h2 className="font-display text-xl font-semibold text-text-primary mb-2">Password Updated</h2>
              <p className="text-text-muted text-sm mb-6">Your password has been reset. Sign in with your new credentials.</p>
              <button type="button" onClick={() => navigate('/login')} className="btn-primary inline-flex items-center gap-2">
                Continue to Login
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-text-primary mb-2">Create a New Password</h2>
              <p className="text-text-muted text-sm mb-6">Use at least eight characters. Existing sessions will be signed out for your protection.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label-text" htmlFor="reset-password">New password</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="input-field pl-11" placeholder="At least 8 characters" />
                  </div>
                </div>
                <div>
                  <label className="label-text" htmlFor="reset-password-confirmation">Confirm password</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input id="reset-password-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="input-field pl-11" placeholder="Repeat your password" />
                  </div>
                </div>
                <button type="submit" disabled={isLoading || !token} className="btn-primary w-full py-3">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Reset Password'}
                </button>
              </form>
              <Link to="/login" className="text-text-muted text-sm flex items-center justify-center gap-1 mt-4 hover:text-text-primary transition">
                <ArrowLeft className="w-4 h-4" /> Back to Login
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
