import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Shield, AlertTriangle } from 'lucide-react';
import { collationApi, dashboardApi } from '../services/api';
import { WardDashboardSummary } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function LGACollationPage() {
  const { id } = useParams();
  const [pin, setPin] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['lga-dashboard', id], queryFn: () => dashboardApi.getLGADashboard(id!) });
  const dash = data?.data?.data;
  const wards = dash?.wards || [];
  const allReported = wards.every((w: WardDashboardSummary) => w.reported_polling_units === w.total_polling_units);

  const submitMut = useMutation({
    mutationFn: () => collationApi.submitLGACollation({ election_id: dash?.election?.id || 1, lga_id: parseInt(id!), pin }),
    onSuccess: () => toast.success('LGA collation submitted!'),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6">
      <PageHeader title={`${dash?.lga?.name} LGA Collation`} subtitle="Aggregate ward results" />
      {!allReported && <div className="flex items-center gap-2 text-yellow-400 text-sm bg-yellow-500/10 p-3 rounded-lg"><AlertTriangle className="w-5 h-5" /> Not all wards complete.</div>}
      <div className="glass-card p-6">
        <table className="w-full"><thead><tr><th className="table-header">Ward</th><th className="table-header text-center">PUs</th><th className="table-header text-center">Reported</th><th className="table-header text-center">Progress</th></tr></thead>
          <tbody>{wards.map((w: WardDashboardSummary) => (
            <tr key={w.ward_id}><td className="table-cell text-sm">{w.ward_name}</td><td className="table-cell text-center font-mono">{w.total_polling_units}</td><td className="table-cell text-center font-mono">{w.reported_polling_units}</td>
              <td className="table-cell text-center"><div className="flex items-center gap-2 justify-center"><div className="w-16 h-2 bg-dark-surface-3 rounded-full overflow-hidden"><div className="h-full bg-primary-500 rounded-full" style={{ width: `${w.reporting_percentage}%` }} /></div><span className="text-xs text-text-muted">{w.reporting_percentage}%</span></div></td></tr>
          ))}</tbody></table>
      </div>
      <div className="glass-card p-6">
        <label className="label-text">PIN</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="input-field mb-4" maxLength={6} />
        <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending} className="btn-accent w-full flex items-center justify-center gap-2"><Shield className="w-5 h-5" /> Submit LGA Collation</button>
      </div>
    </motion.div>
  );
}
