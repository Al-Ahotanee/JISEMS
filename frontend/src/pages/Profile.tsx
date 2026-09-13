import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import { User, Camera, Lock, Save, MapPin, Clock } from 'lucide-react';
import { RootState } from '../store';
import { usersApi } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user } = useSelector((state: RootState) => state.auth);
  if (!user) return null;

  const [form, setForm] = useState({ first_name: user.first_name || '', last_name: user.last_name || '', phone: user.phone || '' });
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });

  const updateMut = useMutation({
    mutationFn: (data: typeof form) => usersApi.updateProfile(data),
    onSuccess: () => toast.success('Profile updated'),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Update failed');
    },
  });

  const changePwMut = useMutation({
    mutationFn: (data: Omit<typeof pwForm, 'confirm'>) => usersApi.changePassword(data),
    onSuccess: () => { toast.success('Password changed'); setPwForm({ current_password: '', new_password: '', confirm: '' }); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Change failed');
    },
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="My Profile" subtitle="Manage your account settings" />

      {/* Avatar + Info */}
      <div className="glass-card-accent p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center text-2xl font-bold text-white">
          {user.first_name?.[0]}{user.last_name?.[0]}
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-text-primary">{user.first_name} {user.last_name}</h2>
          <p className="text-text-muted text-sm capitalize">{user.role?.replace(/_/g, ' ')}</p>
          <p className="text-text-muted text-xs mt-1">{user.email}</p>
        </div>
      </div>

      {/* Edit Form */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4 flex items-center gap-2"><User className="w-5 h-5 text-accent-500" /> Profile Info</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label-text">First Name</label><input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="input-field" /></div>
            <div><label className="label-text">Last Name</label><input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="label-text">Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input-field" /></div>
          <div className="bg-dark-surface-2 rounded-lg p-3 space-y-1 text-sm">
            <p className="text-text-muted flex items-center gap-2"><MapPin className="w-3 h-3" /> Role: <span className="text-text-primary capitalize">{user.role?.replace(/_/g, ' ')}</span></p>
            {user.lga_id && <p className="text-text-muted">LGA ID: {user.lga_id}</p>}
            {user.ward_id && <p className="text-text-muted">Ward ID: {user.ward_id}</p>}
          </div>
          <button onClick={() => updateMut.mutate(form)} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" /> Save Changes</button>
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-accent-500" /> Change Password</h3>
        <div className="space-y-4">
          <div><label className="label-text">Current Password</label><input type="password" value={pwForm.current_password} onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })} className="input-field" /></div>
          <div><label className="label-text">New Password</label><input type="password" value={pwForm.new_password} onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })} className="input-field" /></div>
          <div><label className="label-text">Confirm New Password</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} className="input-field" /></div>
          <button onClick={() => {
            if (pwForm.new_password !== pwForm.confirm) return toast.error('Passwords do not match');
            changePwMut.mutate({ current_password: pwForm.current_password, new_password: pwForm.new_password });
          }} className="btn-primary flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</button>
        </div>
      </div>
    </motion.div>
  );
}
