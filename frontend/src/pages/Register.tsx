import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Shield, UserPlus, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authApi, geoApi } from '../services/api';
import { LGA, Ward, PollingUnit, RegisterRequest } from '../types';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  first_name: z.string().trim().min(2, 'First name required'),
  last_name: z.string().trim().min(2, 'Last name required'),
  email: z.string().trim().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  password: z.string().min(8, 'Min 8 characters'),
  confirm_password: z.string(),
  requested_role: z.string().min(1, 'Select a role'),
  lga_id: z.string().optional(),
  ward_id: z.string().optional(),
  polling_unit_id: z.string().optional(),
  nin: z.string().trim().optional().or(z.literal('')),
}).superRefine((d, ctx) => {
  if (!d.email && !d.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide an email or phone number', path: ['email'] });
  }
  if (d.password !== d.confirm_password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Passwords do not match', path: ['confirm_password'] });
  }
  if (['lga_coordinator', 'ward_officer', 'pu_agent'].includes(d.requested_role) && !d.lga_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select an LGA', path: ['lga_id'] });
  }
  if (['ward_officer', 'pu_agent'].includes(d.requested_role) && !d.ward_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a ward', path: ['ward_id'] });
  }
  if (d.requested_role === 'pu_agent' && !d.polling_unit_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a polling unit', path: ['polling_unit_id'] });
  }
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const selectedRole = watch('requested_role');
  const selectedLGA = watch('lga_id');
  const selectedWard = watch('ward_id');

  const { data: lgaData } = useQuery({ queryKey: ['lgas'], queryFn: () => geoApi.getLGAs() });
  const { data: wardData } = useQuery({
    queryKey: ['wards', selectedLGA],
    queryFn: () => geoApi.getWards({ lga_id: selectedLGA }),
    enabled: !!selectedLGA,
  });
  const { data: puData } = useQuery({
    queryKey: ['pus', selectedWard],
    queryFn: () => geoApi.getPollingUnits({ ward_id: selectedWard }),
    enabled: !!selectedWard && selectedRole === 'pu_agent',
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      await authApi.register({
        ...data,
        lga_id: data.lga_id ? parseInt(data.lga_id) : undefined,
        ward_id: data.ward_id ? parseInt(data.ward_id) : undefined,
        polling_unit_id: data.polling_unit_id ? parseInt(data.polling_unit_id) : undefined,
      } as RegisterRequest);
      setSubmitted(true);
      toast.success('Application submitted!');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const needsLGA = ['lga_coordinator', 'ward_officer', 'pu_agent'].includes(selectedRole);
  const needsWard = ['ward_officer', 'pu_agent'].includes(selectedRole);
  const needsPU = selectedRole === 'pu_agent';

  if (submitted) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="surface-elevated p-10 max-w-md text-center">
          <div className="w-16 h-16 bg-accent-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-accent-700" />
          </div>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-3">Application Submitted!</h2>
          <p className="text-text-muted mb-6">Your registration is being reviewed. You will be notified once approved.</p>
          <Link to="/login" className="btn-primary inline-block">Back to Login</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 atlas-grid" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(49,89,138,0.13) 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary-700" />
            <h1 className="font-display text-3xl font-semibold text-primary-800">GSEM</h1>
          </div>
          <p className="text-text-muted text-sm">Agent Registration</p>
        </div>

        <div className="surface-elevated p-8 sm:p-9">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text">First Name</label>
                <input {...register('first_name')} className="input-field" placeholder="Ibrahim" />
                {errors.first_name && <p className="text-red-400 text-xs mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="label-text">Last Name</label>
                <input {...register('last_name')} className="input-field" placeholder="Pantami" />
                {errors.last_name && <p className="text-red-400 text-xs mt-1">{errors.last_name.message}</p>}
              </div>
            </div>

            <div>
              <label className="label-text">Email <span className="text-text-muted font-normal">(or phone)</span></label>
              <input {...register('email')} type="email" className="input-field" placeholder="agent@example.com" autoComplete="email" />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label-text">Phone <span className="text-text-muted font-normal">(or email)</span></label>
              <input {...register('phone')} type="tel" className="input-field" placeholder="+234 800 000 0000" autoComplete="tel" />
              {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="label-text">Role</label>
              <div className="relative">
                <select {...register('requested_role')} className="input-field appearance-none pr-10">
                  <option value="">Select role...</option>
                  <option value="pu_agent">Polling Unit Agent</option>
                  <option value="ward_officer">Ward Officer</option>
                  <option value="lga_coordinator">LGA Coordinator</option>
                  <option value="observer">Observer</option>
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
              {errors.requested_role && <p className="text-red-400 text-xs mt-1">{errors.requested_role.message}</p>}
            </div>

            {needsLGA && (
              <div>
                <label className="label-text">LGA</label>
                <select {...register('lga_id')} className="input-field appearance-none">
                  <option value="">Select LGA...</option>
                  {lgaData?.data?.data?.map((lga: LGA) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}
                </select>
                {errors.lga_id && <p className="text-red-400 text-xs mt-1">{errors.lga_id.message}</p>}
              </div>
            )}

            {needsWard && selectedLGA && (
              <div>
                <label className="label-text">Ward</label>
                <select {...register('ward_id')} className="input-field appearance-none">
                  <option value="">Select Ward...</option>
                  {wardData?.data?.data?.map((w: Ward) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {errors.ward_id && <p className="text-red-400 text-xs mt-1">{errors.ward_id.message}</p>}
              </div>
            )}

            {needsPU && selectedWard && (
              <div>
                <label className="label-text">Polling Unit</label>
                <select {...register('polling_unit_id')} className="input-field appearance-none">
                  <option value="">Select PU...</option>
                  {puData?.data?.data?.map((pu: PollingUnit) => <option key={pu.id} value={pu.id}>{pu.name} ({pu.inec_pu_code})</option>)}
                </select>
                {errors.polling_unit_id && <p className="text-red-400 text-xs mt-1">{errors.polling_unit_id.message}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text">Password</label>
                <input {...register('password')} type="password" className="input-field" placeholder="Min 8 chars" />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>
              <div>
                <label className="label-text">Confirm Password</label>
                <input {...register('confirm_password')} type="password" className="input-field" />
                {errors.confirm_password && <p className="text-red-400 text-xs mt-1">{errors.confirm_password.message}</p>}
              </div>
            </div>

            <div>
              <label className="label-text">NIN (optional)</label>
              <input {...register('nin')} className="input-field" placeholder="National ID Number" />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-5 h-5" /> Submit Application</>}
            </button>
          </form>

          <p className="text-center text-text-muted text-sm mt-4">
            Already registered? <Link to="/login" className="text-primary-700 hover:text-primary-900 font-bold">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
