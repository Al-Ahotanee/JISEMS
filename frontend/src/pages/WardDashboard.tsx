import { motion } from 'framer-motion';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, FileText } from 'lucide-react';
import { dashboardApi } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';

type PUDashboardSummary = { id: number; name: string; inec_pu_code: string; registered_voters: number; status: string; submission_id?: number; total_votes_cast?: number };

export default function WardDashboardPage() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['ward-dashboard', id],
    queryFn: () => dashboardApi.getWardDashboard(id!),
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  const dash = data?.data?.data;
  if (!dash) return <div className="text-center text-text-muted py-20">No data</div>;

  const pus = dash.polling_units || [];
  const total = pus.length;
  const reported = pus.filter((p: PUDashboardSummary) => p.submission_id).length;
  const verified = pus.filter((p: PUDashboardSummary) => p.status === 'verified').length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title={`${dash.ward?.name} Ward`} subtitle={`${dash.ward?.lga_name} LGA`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total PUs" value={total} icon={MapPin} color="primary" />
        <StatCard title="Reported" value={reported} icon={FileText} color="accent" />
        <StatCard title="Verified" value={verified} icon={FileText} color="success" />
        <StatCard title="Pending" value={reported - verified} icon={FileText} color="warning" />
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Polling Unit Submissions</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">PU Code</th>
                <th className="table-header">Name</th>
                <th className="table-header text-center">Reg. Voters</th>
                <th className="table-header text-center">Votes Cast</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {pus.map((pu: PUDashboardSummary) => (
                <tr key={pu.id} className="hover:bg-dark-surface-2 transition">
                  <td className="table-cell font-mono text-xs">{pu.inec_pu_code}</td>
                  <td className="table-cell text-text-primary text-sm">{pu.name}</td>
                  <td className="table-cell text-center font-mono">{pu.registered_voters}</td>
                  <td className="table-cell text-center font-mono">{pu.total_votes_cast || '—'}</td>
                  <td className="table-cell text-center">
                    {pu.submission_id ? <StatusBadge status={pu.status} /> : <span className="badge-neutral">Not submitted</span>}
                  </td>
                  <td className="table-cell text-center">
                    {pu.submission_id && (
                      <Link to={`/app/results/${pu.submission_id}`} className="text-accent-500 hover:text-accent-400 text-sm font-medium">View</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
