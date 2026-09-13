import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Scroll, Search, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { adminApi } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, resourceFilter],
    queryFn: () => adminApi.listAuditLogs({ page, limit: 50, action: actionFilter || undefined, resource_type: resourceFilter || undefined }),
  });

  const logs = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const actionColors: Record<string, string> = {
    create: 'text-green-400 bg-green-500/10',
    update: 'text-blue-400 bg-blue-500/10',
    delete: 'text-red-400 bg-red-500/10',
    login: 'text-accent-500 bg-accent-500/10',
    verify: 'text-primary-300 bg-primary-500/10',
    reject: 'text-orange-400 bg-orange-500/10',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Immutable record of all system actions" />

      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }} className="input-field py-2 text-sm w-40">
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
          <option value="verify">Verify</option>
          <option value="reject">Reject</option>
          <option value="submit">Submit</option>
          <option value="escalate">Escalate</option>
        </select>
        <select value={resourceFilter} onChange={e => { setResourceFilter(e.target.value); setPage(1); }} className="input-field py-2 text-sm w-40">
          <option value="">All Resources</option>
          <option value="user">User</option>
          <option value="result_submission">Submission</option>
          <option value="dispute">Dispute</option>
          <option value="election">Election</option>
          <option value="collation">Collation</option>
          <option value="application">Application</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header w-8"></th>
                  <th className="table-header">User</th>
                  <th className="table-header text-center">Action</th>
                  <th className="table-header text-center">Resource</th>
                  <th className="table-header text-center">Resource ID</th>
                  <th className="table-header text-center">IP Address</th>
                  <th className="table-header text-center">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: { id: number; action: string; resource_type: string; resource_id?: number; user_name?: string; user_email?: string; ip_address?: string; created_at: string; old_value?: unknown; new_value?: unknown; }) => (
                  <>
                    <tr key={log.id} className="hover:bg-dark-surface-2 cursor-pointer transition" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="table-cell">
                        {(log.old_value || log.new_value) ? (
                          expandedId === log.id ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />
                        ) : null}
                      </td>
                      <td className="table-cell text-text-primary text-sm">{log.user_name || log.user_email || '—'}</td>
                      <td className="table-cell text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${actionColors[log.action] || 'text-text-muted bg-dark-surface-3'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="table-cell text-center text-sm text-text-muted">{log.resource_type?.replace(/_/g, ' ')}</td>
                      <td className="table-cell text-center font-mono text-xs">{log.resource_id || '—'}</td>
                      <td className="table-cell text-center text-xs text-text-muted">{log.ip_address || '—'}</td>
                      <td className="table-cell text-center text-xs text-text-muted">{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                    {expandedId === log.id && (log.old_value || log.new_value) && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={7} className="px-4 py-3 bg-dark-surface-2">
                          <div className="grid md:grid-cols-2 gap-4 text-xs">
                            {log.old_value !== undefined && log.old_value !== null && (
                              <div>
                                <p className="text-red-400 font-medium mb-1">Old Value</p>
                                <pre className="bg-dark-bg rounded-lg p-2 overflow-auto max-h-32 text-text-muted font-mono">
                                  {typeof log.old_value === 'string' ? (log.old_value as string) : JSON.stringify(log.old_value as any, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_value !== undefined && log.new_value !== null && (
                              <div>
                                <p className="text-green-400 font-medium mb-1">New Value</p>
                                <pre className="bg-dark-bg rounded-lg p-2 overflow-auto max-h-32 text-text-muted font-mono">
                                  {typeof log.new_value === 'string' ? (log.new_value as string) : JSON.stringify(log.new_value as any, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-text-muted">No audit logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pagination && (
            <div className="flex items-center justify-between p-4 border-t border-dark-border">
              <span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)</span>
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
