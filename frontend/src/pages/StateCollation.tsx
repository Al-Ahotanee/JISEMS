import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Shield, AlertTriangle } from 'lucide-react';
import { collationApi, dashboardApi } from '../services/api';
import { CandidateResult, LGADashboardSummary } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function StateCollationPage() {
  const [pin, setPin] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['state-dashboard'], queryFn: () => dashboardApi.getStateDashboard() });
  const dash = data?.data?.data;
  const lgas = dash?.lgas || [];

  const submitMut = useMutation({
    mutationFn: () => collationApi.submitStateCollation({ election_id: dash?.election?.id || 1, pin }),
    onSuccess: () => toast.success('State collation submitted!'),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
      <PageHeader title="State Collation" subtitle="Final aggregate results for Jigawa State" />
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">LGA Collation Status</h3>
        <table className="w-full"><thead><tr><th className="table-header">LGA</th><th className="table-header text-center">PUs</th><th className="table-header text-center">Reported</th><th className="table-header text-center">Progress</th>
          {dash?.candidates?.slice(0, 4).map((c: CandidateResult) => <th key={c.candidate_id} className="table-header text-center">{c.party_code}</th>)}</tr></thead>
          <tbody>{lgas.map((l: LGADashboardSummary) => (
            <tr key={l.lga_id}><td className="table-cell font-medium text-text-primary text-sm">{l.lga_name}</td>
              <td className="table-cell text-center font-mono">{l.total_polling_units}</td><td className="table-cell text-center font-mono">{l.reported_polling_units}</td>
              <td className="table-cell text-center"><div className="flex items-center gap-2 justify-center"><div className="w-16 h-2 bg-dark-surface-3 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full" style={{ width: `${l.reporting_percentage}%` }} /></div><span className="text-xs">{l.reporting_percentage}%</span></div></td>
              {l.candidates?.slice(0, 4).map((c: CandidateResult) => <td key={c.candidate_id} className="table-header text-center font-mono">{Number(c.total_votes).toLocaleString()}</td>)}</tr>
          ))}</tbody></table>
      </div>
      {dash?.candidates && (
        <div className="glass-card p-6">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Final Totals</h3>
          {dash.candidates.map((c: CandidateResult) => (
            <div key={c.candidate_id} className="flex items-center justify-between py-2 border-b border-dark-border last:border-0">
              <span className="text-text-primary">{c.full_name} ({c.party_code})</span>
              <span className="font-mono text-accent-500 font-bold">{Number(c.total_votes).toLocaleString()} ({c.vote_percentage}%)</span>
            </div>
          ))}
        </div>
      )}
      <div className="glass-card p-6">
        <label className="label-text">PIN (Digital Signature)</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="input-field mb-4" maxLength={6} />
        <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending} className="btn-accent w-full flex items-center justify-center gap-2"><Shield className="w-5 h-5" /> Submit State Collation</button>
      </div>
    </motion.div>
  );
}
