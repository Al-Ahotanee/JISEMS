import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { collationApi, dashboardApi } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

type PUDashboardSummary = { id: number; name: string; status: string; submission_id?: number; total_votes_cast?: number };

export default function WardCollationPage() {
  const { id } = useParams();
  const [pin, setPin] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['ward-dashboard', id], queryFn: () => dashboardApi.getWardDashboard(id!) });
  const dash = data?.data?.data;
  const pus = dash?.polling_units || [];
  const verified = pus.filter((p: PUDashboardSummary) => p.status === 'verified');
  const total = pus.length;

  const submitMut = useMutation({
    mutationFn: () => collationApi.submitWardCollation({ election_id: dash?.election?.id || 1, ward_id: parseInt(id!), pin }),
    onSuccess: () => toast.success('Ward collation submitted!'),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Submission failed');
    },
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
      <PageHeader title={`${dash?.ward?.name} Ward Collation`} subtitle={`${dash?.ward?.lga_name} LGA`} />

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center"><p className="text-2xl font-bold text-text-primary font-mono">{total}</p><p className="text-text-muted text-xs">Total PUs</p></div>
        <div className="glass-card p-4 text-center"><p className="text-2xl font-bold text-green-400 font-mono">{verified.length}</p><p className="text-text-muted text-xs">Verified</p></div>
        <div className="glass-card p-4 text-center"><p className="text-2xl font-bold text-yellow-400 font-mono">{total - verified.length}</p><p className="text-text-muted text-xs">Pending</p></div>
      </div>

      {verified.length < total && (
        <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-500/10 p-3 rounded-lg">
          <AlertTriangle className="w-5 h-5" /> Not all PUs are verified. Only {verified.length} of {total} PUs included.
        </div>
      )}

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">PU Submissions</h3>
        <table className="w-full">
          <thead><tr><th className="table-header">PU</th><th className="table-header text-center">Votes</th><th className="table-header text-center">Status</th></tr></thead>
          <tbody>{pus.map((pu: PUDashboardSummary) => (
            <tr key={pu.id}><td className="table-cell text-sm">{pu.name}</td><td className="table-cell text-center font-mono">{pu.total_votes_cast || '—'}</td><td className="table-cell text-center">{pu.submission_id ? <StatusBadge status={pu.status} /> : <span className="text-text-muted text-xs">Not submitted</span>}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Submit Ward Collation</h3>
        <div><label className="label-text">PIN (Digital Signature)</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="input-field" placeholder="Enter PIN" maxLength={6} /></div>
        <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending || verified.length === 0} className="btn-accent w-full mt-4 flex items-center justify-center gap-2">
          {submitMut.isPending ? <div className="w-5 h-5 border-2 border-dark-bg/30 border-t-dark-bg rounded-full animate-spin" /> : <><Shield className="w-5 h-5" /> Submit Ward Collation</>}
        </button>
      </div>
    </motion.div>
  );
}
