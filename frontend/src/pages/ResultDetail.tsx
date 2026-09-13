import { motion } from 'framer-motion';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { CheckCircle, XCircle, Flag, AlertTriangle, MapPin, Clock, User, Shield, Printer } from 'lucide-react';
import { resultsApi } from '../services/api';
import { RootState } from '../store';
import { VoteData } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function ResultDetailPage() {
  const { id } = useParams();
  const { user } = useSelector((state: RootState) => state.auth);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['result', id],
    queryFn: () => resultsApi.getResult(id!),
  });

  const result = data?.data?.data;
  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  if (!result) return <div className="text-center text-text-muted py-20">Result not found</div>;

  const canVerify = user && ['ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'].includes(user.role);

  const handleAction = async (action: string, reason?: string) => {
    try {
      if (action === 'verify') await resultsApi.verifyResult(result.id);
      if (action === 'reject') await resultsApi.rejectResult(result.id, { reason: reason || 'Rejected by reviewer' });
      if (action === 'flag') await resultsApi.flagResult(result.id, { reason: reason || 'Flagged for review', flag_type: 'manual' });
      toast.success(`Result ${action}${action === 'flag' ? 'ged' : action === 'reject' ? 'ed' : 'ied'}`);
      refetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || `Failed to ${action}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 no-print">
        <PageHeader title={`Submission ${result.submission_uid}`} subtitle={`${result.polling_unit_name || ''}`} />
        <div className="flex items-center gap-2">
          <StatusBadge status={result.status} />
          {canVerify && result.status === 'pending' && (
            <div className="flex gap-2">
              <button onClick={() => handleAction('verify')} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Verify</button>
              <button onClick={() => handleAction('reject')} className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 hover:bg-red-500/20 transition"><XCircle className="w-4 h-4" /> Reject</button>
              <button onClick={() => handleAction('flag')} className="bg-orange-500/10 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 hover:bg-orange-500/20 transition"><Flag className="w-4 h-4" /> Flag</button>
            </div>
          )}
        </div>
      </div>

      <div className="hidden print-only print:block text-center mb-8 pb-4 border-b border-gray-300">
        <h1 className="text-2xl font-bold uppercase tracking-wider mb-2">Jigawa State Election Monitor</h1>
        <h2 className="text-xl font-semibold">Official Result Slip</h2>
        <p className="mt-2 text-sm text-gray-600">Submission ID: {result.submission_uid}</p>
        <p className="text-sm text-gray-600">Polling Unit: {result.polling_unit_name} ({result.inec_pu_code})</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Images */}
        <div className="glass-card p-6">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">EC8A Result Sheet</h3>
          {result.images?.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {result.images.map((img: { image_url: string }, i: number) => (
                <a key={i} href={img.image_url} target="_blank" rel="noopener noreferrer">
                  <img src={img.image_url} alt={`EC8A ${i + 1}`} className="w-full h-40 object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in" />
                </a>
              ))}
            </div>
          ) : <p className="text-text-muted">No images uploaded</p>}
        </div>

        {/* Vote Data */}
        <div className="glass-card p-6">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Vote Data</h3>
          <div className="space-y-2 mb-4">
            {result.vote_data?.map((v: VoteData & { full_name?: string }) => (
              <div key={v.candidate_id} className="flex items-center justify-between py-2 border-b border-dark-border last:border-0">
                <div>
                  <span className="text-text-primary text-sm">{v.full_name || v.candidate_name}</span>
                  <span className="text-text-muted text-xs ml-2">({v.party_code})</span>
                </div>
                <span className="font-mono text-accent-500 font-bold">{v.votes?.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="bg-dark-surface-2 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Accredited:</span><span className="font-mono">{result.accredited_voters}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Valid Votes:</span><span className="font-mono">{result.total_valid_votes}</span></div>
            <div className="flex justify-between"><span className="text-text-muted">Rejected:</span><span className="font-mono">{result.rejected_votes}</span></div>
            <div className="flex justify-between font-bold"><span>Total Cast:</span><span className="font-mono text-accent-500">{result.total_votes_cast}</span></div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="glass-card p-6">
        <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Submission Details</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2 text-text-muted"><MapPin className="w-4 h-4" /> PU: {result.polling_unit_name} ({result.inec_pu_code})</div>
          <div className="flex items-center gap-2 text-text-muted"><User className="w-4 h-4" /> By: {result.submitter_name}</div>
          <div className="flex items-center gap-2 text-text-muted"><Clock className="w-4 h-4" /> At: {new Date(result.created_at).toLocaleString()}</div>
          {result.latitude && <div className="flex items-center gap-2 text-text-muted"><MapPin className="w-4 h-4" /> GPS: {result.latitude}, {result.longitude}</div>}
          {result.content_hash && <div className="flex items-center gap-2 text-text-muted"><Shield className="w-4 h-4" /> Hash: <span className="font-mono text-xs">{result.content_hash}</span></div>}
          {result.verified_by && <div className="flex items-center gap-2 text-text-muted"><CheckCircle className="w-4 h-4 text-green-400" /> Verified by: {result.verifier_name} at {new Date(result.verified_at).toLocaleString()}</div>}
          {result.rejection_reason && <div className="flex items-center gap-2 text-red-400"><XCircle className="w-4 h-4" /> Reason: {result.rejection_reason}</div>}
        </div>
      </div>

      <div className="flex gap-3 no-print mt-8">
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" /> Print Result</button>
        <Link to="/app/results" className="btn-outline">← Back to Results</Link>
        {result.status !== 'disputed' && <Link to={`/disputes?submission=${result.id}`} className="btn-outline text-orange-400 border-orange-500/30 hover:bg-orange-500/10 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Raise Dispute</Link>}
      </div>
    </motion.div>
  );
}
