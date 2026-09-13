import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Search, Filter } from 'lucide-react';
import { resultsApi } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

export default function ResultsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['results', page, status, search],
    queryFn: () => resultsApi.listResults({ page, limit: 20, status: status || undefined, search: search || undefined }),
  });

  const results = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Result Submissions" subtitle="View and manage all result submissions" />

      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="text" placeholder="Search by UID..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-10 py-2 text-sm" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input-field py-2 text-sm w-40">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner size="lg" /> : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">UID</th>
                  <th className="table-header">Polling Unit</th>
                  <th className="table-header">Ward</th>
                  <th className="table-header">LGA</th>
                  <th className="table-header text-center">Votes</th>
                  <th className="table-header text-center">Status</th>
                  <th className="table-header text-center">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r: { id: number; submission_uid: string; polling_unit_name?: string; polling_unit_id: number; ward_name: string; lga_name: string; total_votes_cast: number; status: string; created_at: string; }) => (
                  <tr key={r.id} className="hover:bg-dark-surface-2 cursor-pointer transition" onClick={() => navigate(`/app/results/${r.id}`)}>
                    <td className="table-cell font-mono text-xs text-accent-500">{r.submission_uid}</td>
                    <td className="table-cell text-text-primary text-sm">{r.polling_unit_name || r.polling_unit_id}</td>
                    <td className="table-cell text-sm">{r.ward_name}</td>
                    <td className="table-cell text-sm">{r.lga_name}</td>
                    <td className="table-cell text-center font-mono">{r.total_votes_cast}</td>
                    <td className="table-cell text-center"><StatusBadge status={r.status} /></td>
                    <td className="table-cell text-center text-xs text-text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-text-muted">No submissions found</td></tr>}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div className="flex items-center justify-between p-4 border-t border-dark-border">
              <span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="btn-outline py-1 px-3 text-sm">Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.hasNext} className="btn-outline py-1 px-3 text-sm">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
