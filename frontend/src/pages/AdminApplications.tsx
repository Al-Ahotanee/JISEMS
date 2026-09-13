import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, CheckCircle, XCircle, Eye } from 'lucide-react';
import { adminApi } from '../services/api';
import { RegistrationApplication } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function AdminApplicationsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedApp, setSelectedApp] = useState<RegistrationApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['applications', page, statusFilter], queryFn: () => adminApi.listApplications({ page, limit: 20, status: statusFilter }) });

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => adminApi.reviewApplication(id, { status, review_notes: reviewNotes }),
    onSuccess: (res: any) => { queryClient.invalidateQueries({ queryKey: ['applications'] }); setSelectedApp(null); setReviewNotes(''); toast.success(`Application ${res?.data?.data?.tempPassword ? `approved. Temp password: ${res.data.data.tempPassword}` : 'processed'}`); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  const apps = (data?.data?.data || []) as RegistrationApplication[];
  const pagination = data?.data?.pagination;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Registration Applications" subtitle="Review and approve agent registrations" />
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`py-1.5 px-4 rounded-lg text-sm capitalize transition ${statusFilter === s ? 'bg-primary-500 text-white' : 'bg-dark-surface-2 text-text-muted hover:text-text-primary'}`}>{s}</button>
        ))}
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="glass-card overflow-hidden">
          <table className="w-full"><thead><tr><th className="table-header">Name</th><th className="table-header">Email</th><th className="table-header text-center">Role</th><th className="table-header text-center">LGA</th><th className="table-header text-center">Status</th><th className="table-header text-center">Actions</th></tr></thead>
            <tbody>{apps.map((a) => (
              <tr key={a.id} className="hover:bg-dark-surface-2 transition">
                <td className="table-cell text-text-primary text-sm">{a.first_name} {a.last_name}</td><td className="table-cell text-sm">{a.email}</td>
                <td className="table-cell text-center text-xs capitalize">{a.requested_role?.replace(/_/g, ' ')}</td><td className="table-cell text-center text-sm">{a.lga_name || '—'}</td>
                <td className="table-cell text-center"><StatusBadge status={a.status} /></td>
                <td className="table-cell text-center">
                  {a.status === 'pending' && (
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setSelectedApp(a)} className="text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded text-xs"><Eye className="w-3 h-3 inline" /> Review</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}{apps.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-text-muted">No applications</td></tr>}</tbody>
          </table>
          {pagination && <div className="flex items-center justify-between p-4 border-t border-dark-border"><span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="btn-outline py-1 px-3 text-sm">Prev</button><button onClick={() => setPage(p => p + 1)} disabled={!pagination.hasNext} className="btn-outline py-1 px-3 text-sm">Next</button></div></div>}
        </div>
      )}

      {selectedApp && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedApp(null)}>
          <div className="glass-card-accent p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold text-text-primary mb-4">Review Application</h3>
            <div className="space-y-2 text-sm mb-4">
              <p><span className="text-text-muted">Name:</span> {selectedApp.first_name} {selectedApp.last_name}</p>
              <p><span className="text-text-muted">Email:</span> {selectedApp.email}</p><p><span className="text-text-muted">Phone:</span> {selectedApp.phone}</p>
              <p><span className="text-text-muted">Role:</span> <span className="capitalize">{selectedApp.requested_role?.replace(/_/g, ' ')}</span></p>
              <p><span className="text-text-muted">LGA:</span> {selectedApp.lga_name || '—'}</p><p><span className="text-text-muted">Ward:</span> {selectedApp.ward_name || '—'}</p>
              {selectedApp.nin && <p><span className="text-text-muted">NIN:</span> {selectedApp.nin}</p>}
            </div>
            <div className="mb-4"><label className="label-text">Review Notes</label><textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} className="input-field" rows={3} placeholder="Optional notes..." /></div>
            <div className="flex gap-3">
              <button onClick={() => reviewMut.mutate({ id: selectedApp.id, status: 'approved' })} className="btn-primary flex-1 flex items-center justify-center gap-1"><CheckCircle className="w-4 h-4" /> Approve</button>
              <button onClick={() => reviewMut.mutate({ id: selectedApp.id, status: 'rejected' })} className="bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg flex-1 flex items-center justify-center gap-1 hover:bg-red-500/20 transition"><XCircle className="w-4 h-4" /> Reject</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
