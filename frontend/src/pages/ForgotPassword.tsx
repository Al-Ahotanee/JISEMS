import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, ArrowLeft, Check } from 'lucide-react';
import { authApi } from '../services/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email');
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSent(true);
      toast.success('Reset link sent!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to send reset link');
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
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-accent-700" />
              </div>
              <h2 className="font-display text-xl font-semibold text-text-primary mb-2">Check Your Email</h2>
              <p className="text-text-muted text-sm mb-6">We've sent a password reset link to {email}</p>
              <Link to="/login" className="btn-outline inline-flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Back to Login</Link>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-text-primary mb-2">Reset Password</h2>
              <p className="text-text-muted text-sm mb-6">Enter your email to receive a reset link</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label-text">Email</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-11" placeholder="your@email.com" />
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="btn-primary w-full py-3">
                  {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : 'Send Reset Link'}
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
