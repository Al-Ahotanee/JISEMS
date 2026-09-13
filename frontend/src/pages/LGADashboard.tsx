import { motion } from 'framer-motion';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, BarChart3, Vote } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { CandidateResult, WardDashboardSummary } from '../types';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#1a5632', '#f5c842', '#3b82f6', '#ef4444'];

export default function LGADashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['lga-dashboard', id],
    queryFn: () => dashboardApi.getLGADashboard(id!),
    refetchInterval: 30000,
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  const dash = data?.data?.data;
  if (!dash) return <div className="text-center text-text-muted py-20">No data</div>;

  const totalPUs = dash.wards?.reduce((s: number, w: WardDashboardSummary) => s + w.total_polling_units, 0) || 0;
  const reported = dash.wards?.reduce((s: number, w: WardDashboardSummary) => s + w.reported_polling_units, 0) || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title={`${dash.lga?.name} LGA`} subtitle="LGA Dashboard" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Wards" value={dash.wards?.length || 0} icon={MapPin} color="primary" />
        <StatCard title="Total PUs" value={totalPUs} icon={MapPin} color="accent" />
        <StatCard title="Reported" value={reported} icon={BarChart3} color="success" />
        <StatCard title="Progress" value={totalPUs > 0 ? Math.round((reported / totalPUs) * 100) : 0} icon={Vote} color="warning" subtitle="%" />
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Candidate Results</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dash.candidates?.map((c: CandidateResult) => ({ name: c.party_code, votes: Number(c.total_votes) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,86,50,0.1)" />
              <XAxis dataKey="name" stroke="#7aab90" fontSize={12} />
              <YAxis stroke="#7aab90" fontSize={12} />
              <Tooltip contentStyle={{ background: '#132018', border: '1px solid rgba(26,86,50,0.3)', borderRadius: '8px', color: '#e8f5ee' }} />
              <Bar dataKey="votes" radius={[4, 4, 0, 0]}>{dash.candidates?.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Wards</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="table-header">Ward</th><th className="table-header text-center">PUs</th><th className="table-header text-center">Reported</th><th className="table-header text-center">Progress</th></tr></thead>
            <tbody>
              {dash.wards?.map((w: WardDashboardSummary) => (
                <tr key={w.ward_id} className="hover:bg-dark-surface-2 cursor-pointer transition" onClick={() => navigate(`/app/dashboard/ward/${w.ward_id}`)}>
                  <td className="table-cell font-medium text-text-primary">{w.ward_name}</td>
                  <td className="table-cell text-center font-mono">{w.total_polling_units}</td>
                  <td className="table-cell text-center font-mono">{w.reported_polling_units}</td>
                  <td className="table-cell text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-2 bg-dark-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${w.reporting_percentage}%` }} />
                      </div>
                      <span className="text-xs text-text-muted">{w.reporting_percentage}%</span>
                    </div>
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
