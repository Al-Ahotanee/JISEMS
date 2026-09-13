import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { MapPin, Vote, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { CandidateResult, LGADashboardSummary, Anomaly } from '../types';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

const COLORS = ['#1a5632', '#f5c842', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function StateDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['state-dashboard'],
    queryFn: () => dashboardApi.getStateDashboard(),
    refetchInterval: 30000,
  });

  const { data: timelineData } = useQuery({
    queryKey: ['timeline'],
    queryFn: () => dashboardApi.getTimeline(),
    refetchInterval: 30000,
  });

  const { data: anomalyData } = useQuery({
    queryKey: ['anomalies'],
    queryFn: () => dashboardApi.getAnomalies(),
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  const dash = data?.data?.data;
  if (!dash) return <div className="text-text-muted text-center py-20">No data available</div>;

  const candidateChartData = dash.candidates?.map((c: CandidateResult) => ({
    name: c.party_code,
    votes: c.total_votes,
    fullName: c.full_name,
  }));

  const lgaPieData = dash.lgas?.map((l: LGADashboardSummary) => ({
    name: l.lga_name,
    value: l.reported_polling_units,
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="State Dashboard" subtitle={`${dash.election?.title || '2027 Gubernatorial Election'} — Live Results`} />

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total PUs" value={dash.total_polling_units} icon={MapPin} color="primary" />
        <StatCard title="Reported" value={dash.reported_polling_units} icon={BarChart3} color="accent" subtitle={`${((dash.reported_polling_units / dash.total_polling_units) * 100).toFixed(1)}%`} />
        <StatCard title="Votes Cast" value={dash.total_votes_cast} icon={Vote} color="success" />
        <StatCard title="Turnout" value={parseFloat(dash.turnout_percentage)} icon={TrendingUp} color="warning" subtitle="%" />
      </div>

      {/* Candidate Standings */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Candidate Standings</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={candidateChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,86,50,0.1)" />
              <XAxis type="number" stroke="#7aab90" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#7aab90" fontSize={12} width={60} />
              <Tooltip contentStyle={{ background: '#132018', border: '1px solid rgba(26,86,50,0.3)', borderRadius: '8px', color: '#e8f5ee' }} />
              <Bar dataKey="votes" fill="#1a5632" radius={[0, 4, 4, 0]}>
                {candidateChartData?.map((_: unknown, idx: number) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Candidate list */}
        <div className="mt-4 space-y-2">
          {dash.candidates?.map((c: CandidateResult, i: number) => (
            <div key={c.candidate_id} className="flex items-center justify-between py-2 border-b border-dark-border last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-text-primary font-medium">{c.full_name}</span>
                <span className="text-text-muted text-sm">({c.party_code})</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-accent-500 font-semibold">{Number(c.total_votes).toLocaleString()}</span>
                <span className="text-text-muted text-sm">{c.vote_percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LGA Breakdown Table */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">LGA Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">LGA</th>
                <th className="table-header text-center">PUs</th>
                <th className="table-header text-center">Reported</th>
                <th className="table-header text-center">Progress</th>
                {dash.candidates?.slice(0, 4).map((c: CandidateResult) => (
                  <th key={c.candidate_id} className="table-header text-center">{c.party_code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dash.lgas?.map((lga: LGADashboardSummary) => (
                <tr key={lga.lga_id} className="hover:bg-dark-surface-2 cursor-pointer transition" onClick={() => navigate(`/app/dashboard/lga/${lga.lga_id}`)}>
                  <td className="table-cell font-medium text-text-primary">{lga.lga_name}</td>
                  <td className="table-cell text-center font-mono">{lga.total_polling_units}</td>
                  <td className="table-cell text-center font-mono">{lga.reported_polling_units}</td>
                  <td className="table-cell text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-2 bg-dark-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${lga.reporting_percentage}%` }} />
                      </div>
                      <span className="text-xs text-text-muted">{lga.reporting_percentage}%</span>
                    </div>
                  </td>
                  {lga.candidates?.slice(0, 4).map((c: CandidateResult) => (
                    <td key={c.candidate_id} className="table-cell text-center font-mono">{Number(c.total_votes).toLocaleString()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline & Anomalies */}
      <div className="grid md:grid-cols-2 gap-6">
        {timelineData?.data?.data && (
          <div className="glass-card p-6">
            <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Submission Timeline (24h)</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData.data.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,86,50,0.1)" />
                  <XAxis dataKey="hour" stroke="#7aab90" fontSize={10} tickFormatter={(v: string) => v.split(' ')[1] || v} />
                  <YAxis stroke="#7aab90" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#132018', border: '1px solid rgba(26,86,50,0.3)', borderRadius: '8px', color: '#e8f5ee' }} />
                  <Area type="monotone" dataKey="count" stroke="#f5c842" fill="#f5c842" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {anomalyData?.data?.data && anomalyData.data.data.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="font-display text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" /> Anomalies
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {anomalyData.data.data.slice(0, 10).map((a: Anomaly, i: number) => (
                <div key={i} className="p-3 bg-dark-surface-2 rounded-lg border border-red-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{a.polling_unit_name}</span>
                    <StatusBadge status={a.severity} />
                  </div>
                  <p className="text-xs text-text-muted mt-1">{a.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
