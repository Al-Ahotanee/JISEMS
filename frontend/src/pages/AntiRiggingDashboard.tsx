import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { anomalyApi } from '../services/api';
import { Anomaly } from '../types';
import JigawaMap from '../components/maps/JigawaMap';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import { AlertTriangle, CheckCircle, ShieldAlert, FileSearch, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AntiRiggingDashboard() {
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('open');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['anomalies', filterStatus],
    queryFn: () => anomalyApi.listAnomalies({ status: filterStatus }),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number, status: 'resolved' | 'dismissed' }) => anomalyApi.resolveAnomaly(id, status),
    onSuccess: () => {
      toast.success('Anomaly updated successfully');
      setSelectedAnomaly(null);
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update anomaly');
    }
  });

  const anomalies: Anomaly[] = data?.data?.data || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 h-full flex flex-col"
    >
      <div className="flex justify-between items-start">
        <PageHeader
          title="Anti-Rigging Command Center"
          subtitle="Real-time detection of over-voting, unnatural turnout, and electoral fraud"
        />
        <button onClick={() => refetch()} className="btn-primary flex items-center gap-2 mt-2">
          <RefreshCw className="w-4 h-4" />
          Refresh Feed
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[600px]">
        {/* Left Column: List of Anomalies */}
        <div className="lg:col-span-1 glass-card flex flex-col h-[600px] overflow-hidden">
          <div className="p-4 border-b border-dark-border flex justify-between items-center bg-dark-surface-2">
            <h3 className="font-bold flex items-center gap-2 text-text-primary">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Active Alerts
            </h3>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-primary-500"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {isLoading ? (
              <div className="py-10"><LoadingSpinner /></div>
            ) : anomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mb-3 opacity-80" />
                <p>No active anomalies detected.</p>
                <p className="text-sm">The election is currently secure.</p>
              </div>
            ) : (
              anomalies.map((anomaly) => (
                <div 
                  key={anomaly.id} 
                  onClick={() => setSelectedAnomaly(anomaly)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedAnomaly?.id === anomaly.id ? 'bg-primary-500/10 border-primary-500' : 'bg-dark-surface-2 border-dark-border hover:border-text-muted'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="scale-75 origin-top-left -ml-1">
                      <StatusBadge status={anomaly.severity} />
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {new Date(anomaly.timestamp || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-text-primary mb-1">
                    {anomaly.type?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN ANOMALY'}
                  </h4>
                  <p className="text-xs text-text-muted line-clamp-2">
                    {anomaly.detail}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Map & Details */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Details Panel */}
          {selectedAnomaly && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-5"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-text-primary flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-orange-500" />
                    Anomaly #{selectedAnomaly.id} Details
                  </h3>
                  <p className="text-sm text-text-muted mt-1">Submission UID: {selectedAnomaly.submission_uid || 'N/A'}</p>
                </div>
                {selectedAnomaly.status === 'open' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => resolveMutation.mutate({ id: selectedAnomaly.id!, status: 'dismissed' })}
                      disabled={resolveMutation.isPending}
                      className="btn-outline text-xs py-1.5"
                    >
                      Dismiss (False Alarm)
                    </button>
                    <button 
                      onClick={() => resolveMutation.mutate({ id: selectedAnomaly.id!, status: 'resolved' })}
                      disabled={resolveMutation.isPending}
                      className="btn-primary text-xs py-1.5"
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 bg-dark-bg p-4 rounded-xl border border-dark-border mb-4">
                <div>
                  <p className="text-xs text-text-muted mb-1">Type</p>
                  <p className="font-semibold capitalize text-red-400">{selectedAnomaly.type?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Location</p>
                  <p className="font-semibold text-text-primary text-sm truncate">
                    {selectedAnomaly.lga_name} &gt; {selectedAnomaly.ward_name} &gt; {selectedAnomaly.polling_unit_name}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-primary-400" /> 
                  Detection Reason
                </p>
                <div className="bg-dark-surface-2 p-3 rounded-lg border border-dark-border">
                  <p className="text-sm text-text-muted">{selectedAnomaly.detail}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Interactive Map */}
          <div className="flex-1 glass-card p-2 min-h-[400px]">
            <JigawaMap anomalies={anomalies} onSelectAnomaly={setSelectedAnomaly} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
