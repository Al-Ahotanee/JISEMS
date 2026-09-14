import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { anomalyApi } from '../services/api';
import { Anomaly } from '../types';
import JigawaMap from '../components/maps/JigawaMap';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import { AlertTriangle, CheckCircle, ShieldAlert, FileSearch, RefreshCw, Scale, Activity, Info } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
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

  const { data: benfordRes, isLoading: isBenfordLoading } = useQuery({
    queryKey: ['benford-audit'],
    queryFn: () => anomalyApi.getBenfordAudit(),
    refetchInterval: 30000,
  });
  const benford = benfordRes?.data?.data;

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

      {/* Digit Forensic Analysis: Benford's Law Audit */}
      <div className="surface-elevated p-5 sm:p-6 border border-dark-border shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-text-primary">
                  Digit Forensic Analysis (Benford's Law Audit)
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold uppercase ${
                  benford?.riskLevel === 'critical'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : benford?.riskLevel === 'warning'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {benford?.riskLevel === 'critical' ? 'High Divergence Alert' : benford?.riskLevel === 'warning' ? 'Moderate Deviation' : 'Natural Distribution'}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                First-digit logarithmic distribution across all certified polling unit vote counts ({benford?.totalSamples || 0} sample tallies)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-dark-surface-2 border border-dark-border text-text-secondary">
              Chi-Square (χ²): <strong className="text-primary-700">{benford?.chiSquare ?? '0.00'}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-dark-surface-2 border border-dark-border text-text-muted">
              df: 8
            </span>
          </div>
        </div>

        {/* Forensic explanation banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary-50/60 border border-primary-200/60 text-xs text-primary-900">
          <Info className="w-4 h-4 text-primary-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {benford?.riskMessage || 'Natural election outcomes strictly adhere to Benford\'s Law (1 ~30.1%, 2 ~17.6% ... 9 ~4.6%). Statistical spikes in high digits indicate vote fabrication or manual rounding.'}
          </p>
        </div>

        {/* Composed Chart */}
        <div className="h-64 sm:h-72 w-full pt-2">
          {isBenfordLoading ? (
            <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={benford?.distribution || []} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="digit" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} label={{ value: 'First Digit (1 - 9)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }} />
                <YAxis unit="%" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 40]} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="surface-elevated p-3 border border-dark-border rounded-xl shadow-lg text-xs font-mono">
                          <p className="font-bold text-text-primary mb-1">Digit: {label}</p>
                          <p className="text-emerald-700">Observed: {item.observedPercent}% ({item.observedCount} tallies)</p>
                          <p className="text-amber-700">Benford Expected: {item.expectedPercent}%</p>
                          <p className={item.diff > 0 ? 'text-blue-600' : 'text-purple-600'}>Divergence: {item.diff > 0 ? `+${item.diff}%` : `${item.diff}%`}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="observedPercent" name="Empirical PU Vote Counts (%)" fill="#15803d" radius={[6, 6, 0, 0]} barSize={28} />
                <Line type="monotone" dataKey="expectedPercent" name="Benford Theoretical Curve (%)" stroke="#d97706" strokeWidth={3} dot={{ r: 4, fill: '#d97706' }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
}
