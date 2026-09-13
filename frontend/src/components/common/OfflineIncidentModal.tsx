import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { offlineDb } from '../../lib/offlineDb';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { disputeApi } from '../../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function OfflineIncidentModal({ isOpen, onClose }: Props) {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'violence',
    priority: 'high',
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description) {
      return toast.error('Title and description are required');
    }

    setLoading(true);
    try {
      if (isOnline) {
        await disputeApi.raiseDispute({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          priority: formData.priority,
        });
        toast.success('Incident reported successfully to Situation Room');
      } else {
        await offlineDb.offlineIncidents.add({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          priority: formData.priority,
          created_at: new Date().toISOString(),
          synced: 0
        });
        toast.success('Saved Offline! Will sync when connection returns', { icon: '💾' });
      }
      onClose();
      setFormData({ title: '', category: 'violence', priority: 'high', description: '' });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to report incident');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 p-4"
          >
            <div className="bg-dark-surface-1 border border-dark-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-dark-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-text-primary">Report Incident (SOS)</h3>
                    <p className="text-xs text-text-muted">{isOnline ? 'Live Connection' : 'Offline Mode Active'}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-surface-2 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Incident Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="input-field w-full"
                    placeholder="e.g. Ballot Box Snatching, BVAS Failure"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Category</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="violence">Violence / Thuggery</option>
                      <option value="bvas_failure">BVAS Technical Failure</option>
                      <option value="fraud">Vote Buying / Fraud</option>
                      <option value="logistics">Late Materials</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Priority Level</label>
                    <select
                      value={formData.priority}
                      onChange={e => setFormData({ ...formData, priority: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical (SOS)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Details & Location</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="input-field w-full"
                    placeholder="Describe what happened and specify your exact Ward/PU if necessary..."
                  />
                </div>

                <div className="pt-2">
                  <button type="submit" disabled={loading} className="btn-primary bg-red-600 hover:bg-red-700 w-full py-3 flex items-center justify-center gap-2">
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
                    {isOnline ? 'Report to Situation Room' : 'Save Offline Report'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
