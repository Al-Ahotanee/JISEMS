import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, ArrowUp, Send, Paperclip, User, Clock, ShieldAlert, Search, XCircle, CheckSquare } from 'lucide-react';
import { disputeApi } from '../services/api';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function DisputeDetailPage() {
  const { id } = useParams();
  const { user } = useSelector((state: RootState) => state.auth);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['dispute', id], queryFn: () => disputeApi.getDispute(id!) });
  const dispute = data?.data?.data;

  const addCommentMut = useMutation({
    mutationFn: (commentText: string) => disputeApi.addComment(id!, { comment: commentText }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dispute', id] }); setComment(''); toast.success('Comment added'); }
  });

  const resolveMut = useMutation({
    mutationFn: ({ notes, status }: { notes: string; status?: string }) =>
      disputeApi.resolveDispute(id!, { resolution_notes: notes, status: status || 'resolved' }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['dispute', id] });
      toast.success(`Dispute status updated to ${vars.status || 'resolved'}`);
    }
  });

  const escalateMut = useMutation({
    mutationFn: () => disputeApi.escalateDispute(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dispute', id] }); toast.success('Dispute escalated'); }
  });

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  if (!dispute) return <div className="text-center text-text-muted py-20">Dispute not found</div>;

  const canResolve = user && ['ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'].includes(user.role);
  const priorityColor: Record<string, string> = { critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-blue-400' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={dispute.title} subtitle={`Dispute #${dispute.id}`} />
        <div className="flex items-center gap-2">
          <StatusBadge status={dispute.status} />
          {canResolve && dispute.status !== 'resolved' && dispute.status !== 'dismissed' && (
            <div className="flex flex-wrap gap-2">
              {dispute.status !== 'security_alerted' && (
                <button
                  onClick={() => resolveMut.mutate({ notes: 'Rapid Security Response Alerted and Dispatched', status: 'security_alerted' })}
                  className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Trigger Security Escalation & Alert Field Units"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  <span>Alert Security</span>
                </button>
              )}
              {dispute.status !== 'investigating' && (
                <button
                  onClick={() => resolveMut.mutate({ notes: 'Electoral Investigation Unit Assigned', status: 'investigating' })}
                  className="px-3 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Dispatch Investigation Team"
                >
                  <Search className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Dispatch Investigation</span>
                </button>
              )}
              <button
                onClick={() => resolveMut.mutate({ notes: 'Dispute thoroughly investigated and officially resolved', status: 'resolved' })}
                className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Resolve</span>
              </button>
              <button
                onClick={() => resolveMut.mutate({ notes: 'Reviewed and dismissed as unfounded / resolved at PU', status: 'dismissed' })}
                className="px-3 py-1.5 rounded-xl bg-dark-surface-2 border border-dark-border text-text-muted hover:text-text-primary text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>
              <button
                onClick={() => escalateMut.mutate()}
                className="btn-outline py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Escalate</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SLA Workflow Status Pipeline */}
      <div className="glass-card p-5">
        <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary-500" />
          Rapid Incident SLA Tracking Workflow
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: 'open', label: '1. Incident Logged', active: true },
            { key: 'security_alerted', label: '2. Security Alerted', active: ['security_alerted', 'investigating', 'resolved', 'dismissed'].includes(dispute.status) },
            { key: 'investigating', label: '3. Investigation Dispatched', active: ['investigating', 'resolved', 'dismissed'].includes(dispute.status) },
            { key: 'resolved', label: '4. Resolution & Sign-off', active: ['resolved', 'dismissed'].includes(dispute.status) },
          ].map(step => (
            <div
              key={step.key}
              className={`p-3 rounded-xl border text-center transition-all ${
                step.active
                  ? 'bg-primary-500/10 border-primary-500/40 text-primary-300 font-bold'
                  : 'bg-dark-surface-2/40 border-dark-border/40 text-text-muted opacity-50'
              }`}
            >
              <div className="text-[11px] font-mono">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="glass-card p-4"><p className="text-text-muted text-xs">Category</p><p className="text-text-primary font-medium capitalize">{dispute.category?.replace(/_/g, ' ')}</p></div>
        <div className="glass-card p-4"><p className="text-text-muted text-xs">Priority</p><p className={`font-medium capitalize ${priorityColor[dispute.priority] || ''}`}>{dispute.priority}</p></div>
        <div className="glass-card p-4"><p className="text-text-muted text-xs">Escalation</p><p className="text-text-primary font-medium capitalize">{dispute.escalation_level}</p></div>
      </div>

      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-3">Description</h3>
        <p className="text-text-secondary">{dispute.description}</p>
        <div className="mt-4 text-sm text-text-muted flex flex-wrap gap-4">
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> Raised by: {dispute.raiser_name}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(dispute.created_at).toLocaleString()}</span>
          {dispute.submission_uid && <Link to={`/results/${dispute.submission_id}`} className="text-accent-500 hover:underline">Submission: {dispute.submission_uid}</Link>}
        </div>
        {dispute.resolution_notes && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-green-400 text-sm font-medium">Resolution Notes</p>
            <p className="text-text-secondary text-sm mt-1">{dispute.resolution_notes}</p>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Comments ({dispute.comments?.length || 0})</h3>
        <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
          {dispute.comments?.map((c: { id: number; user_name: string; user_role?: string; created_at: string; comment: string; }) => (
            <div key={c.id} className="bg-dark-surface-2 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-text-primary text-sm font-medium">{c.user_name}</span>
                <span className="text-xs px-1.5 py-0.5 bg-primary-500/20 text-primary-300 rounded">{c.user_role?.replace(/_/g, ' ')}</span>
                <span className="text-text-muted text-xs ml-auto">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="text-text-secondary text-sm">{c.comment}</p>
            </div>
          ))}
          {!dispute.comments?.length && <p className="text-text-muted text-center py-4">No comments yet</p>}
        </div>
        <div className="flex gap-2">
          <input type="text" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." className="input-field flex-1 py-2"
            onKeyDown={e => { if (e.key === 'Enter' && comment.trim()) addCommentMut.mutate(comment); }} />
          <button onClick={() => { if (comment.trim()) addCommentMut.mutate(comment); }} className="btn-primary px-4"><Send className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Evidence */}
      {dispute.evidence?.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Evidence</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {dispute.evidence.map((e: { id: number; file_url: string; description?: string; uploader_name: string; }) => (
              <a key={e.id} href={e.file_url} target="_blank" rel="noopener noreferrer" className="bg-dark-surface-2 rounded-lg p-3 hover:bg-dark-surface-3 transition">
                <Paperclip className="w-5 h-5 text-accent-500 mb-1" />
                <p className="text-text-primary text-xs truncate">{e.description || 'Evidence file'}</p>
                <p className="text-text-muted text-xs">{e.uploader_name}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      <Link to="/disputes" className="btn-outline inline-block">← Back to Disputes</Link>
    </motion.div>
  );
}
