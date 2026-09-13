import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { disputeApi } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

export default function DisputesListPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['disputes', page, status], queryFn: () => disputeApi.listDisputes({ page, limit: 20, status: status || undefined }) });
  const disputes = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const priorityColor: Record<string, string> = { critical: 'text-red-400 bg-red-500/10', high: 'text-orange-400 bg-orange-500/10', medium: 'text-yellow-400 bg-yellow-500/10', low: 'text-blue-400 bg-blue-500/10' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between"><PageHeader title="Disputes" subtitle="Manage election disputes" /><Link to="/disputes/new" className="btn-accent flex items-center gap-2"><Plus className="w-4 h-4" /> New Dispute</Link></div>
      <div className="glass-card p-4 flex gap-3 items-center">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field py-2 text-sm w-40">
          <option value="">All Status</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
        </select>
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="glass-card overflow-hidden">
          <table className="w-full"><thead><tr><th className="table-header">Title</th><th className="table-header text-center">Category</th><th className="table-header text-center">Priority</th><th className="table-header text-center">Status</th><th className="table-header text-center">Escalation</th><th className="table-header text-center">Date</th></tr></thead>
          <tbody>{disputes.map((d: { id: number; title: string; category: string; priority: string; status: string; escalation_level: string; created_at: string; }) => (
            <tr key={d.id} className="hover:bg-dark-surface-2 cursor-pointer transition" onClick={() => window.location.href = `/disputes/${d.id}`}>
              <td className="table-cell text-text-primary font-medium text-sm">{d.title}</td>
              <td className="table-cell text-center text-sm">{d.category?.replace(/_/g, ' ')}</td>
              <td className="table-cell text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor[d.priority] || ''}`}>{d.priority}</span></td>
              <td className="table-cell text-center"><StatusBadge status={d.status} /></td>
              <td className="table-cell text-center text-sm capitalize">{d.escalation_level}</td>
              <td className="table-cell text-center text-xs text-text-muted">{new Date(d.created_at).toLocaleDateString()}</td>
            </tr>
          ))}{disputes.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-text-muted">No disputes found</td></tr>}</tbody></table>
          {pagination && <div className="flex items-center justify-between p-4 border-t border-dark-border"><span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="btn-outline py-1 px-3 text-sm">Prev</button><button onClick={() => setPage(p => p + 1)} disabled={!pagination.hasNext} className="btn-outline py-1 px-3 text-sm">Next</button></div></div>}
        </div>
      )}
    </motion.div>
  );
}
