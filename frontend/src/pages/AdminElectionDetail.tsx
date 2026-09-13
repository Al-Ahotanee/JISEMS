import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users, Edit2, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { electionApi } from '../services/api';
import { Candidate } from '../types';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatusBadge from '../components/common/StatusBadge';
import toast from 'react-hot-toast';

export default function AdminElectionDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [electionForm, setElectionForm] = useState({ title: '', election_type: '', election_date: '', election_year: new Date().getFullYear(), description: '', status: '' });
  
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [candidateForm, setCandidateForm] = useState({ id: '', full_name: '', party_name: '', party_code: '' });

  // Fetch election details
  const { data: electionData, isLoading: isLoadingElection } = useQuery({
    queryKey: ['election', id],
    queryFn: () => electionApi.getElection(id!),
    enabled: !!id,
  });

  // Keep form in sync when editMode is enabled
  const handleEditClick = () => {
    if (election) {
      setElectionForm({
        title: election.title || '',
        election_type: election.election_type || '',
        election_date: election.election_date || '',
        election_year: Number(election.election_year || new Date().getFullYear()),
        description: election.description || '',
        status: election.status || ''
      });
    }
    setEditMode(true);
  };

  const election = electionData?.data?.data;

  // Mutations
  const updateElectionMut = useMutation({
    mutationFn: (d: typeof electionForm) => electionApi.updateElection(id!, { ...d, status: d.status as "upcoming" | "ongoing" | "completed" | "cancelled" }),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['election', id] }); 
      queryClient.invalidateQueries({ queryKey: ['elections'] });
      setEditMode(false); 
      toast.success('Election updated'); 
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update election')
  });

  const saveCandidateMut = useMutation({
    mutationFn: (d: typeof candidateForm) => {
      const payload: any = { candidate_name: d.full_name, party_name: d.party_name, party_code: d.party_code };
      if (d.id) return electionApi.updateCandidate(id!, d.id, payload);
      return electionApi.createCandidate(id!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['election', id] });
      setShowCandidateModal(false);
      setCandidateForm({ id: '', full_name: '', party_name: '', party_code: '' });
      toast.success('Candidate saved');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to save candidate')
  });

  const deleteCandidateMut = useMutation({
    mutationFn: (candidateId: string) => electionApi.deleteCandidate(id!, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['election', id] });
      toast.success('Candidate deleted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Cannot delete candidate (votes may be recorded)')
  });

  if (isLoadingElection) return <LoadingSpinner fullPage />;
  if (!election) return <div className="text-center py-20 text-text-muted">Election not found</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/app/admin/elections" className="p-2 rounded-lg bg-dark-surface border border-dark-border hover:bg-dark-surface-2 transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div className="flex-1">
          <PageHeader title={election.title} subtitle={`Manage settings and candidates`} />
        </div>
        <StatusBadge status={election.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* Left Column: Election Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary-400" /> Election Settings
              </h3>
              {!editMode && (
                <button onClick={handleEditClick} className="text-xs font-bold text-primary-400 bg-primary-500/10 px-3 py-1.5 rounded-full hover:bg-primary-500/20">
                  Edit
                </button>
              )}
            </div>

            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="label-text">Title</label>
                  <input value={electionForm.title} onChange={e => setElectionForm({ ...electionForm, title: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="label-text">Status</label>
                  <select value={electionForm.status} onChange={e => setElectionForm({ ...electionForm, status: e.target.value })} className="input-field">
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Date</label>
                  <input type="date" value={electionForm.election_date} onChange={e => setElectionForm({ ...electionForm, election_date: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="label-text">Election year</label>
                  <input type="number" min="1900" max="2200" value={electionForm.election_year} onChange={e => setElectionForm({ ...electionForm, election_year: Number(e.target.value) })} className="input-field" />
                </div>
                <div>
                  <label className="label-text">Description</label>
                  <textarea value={electionForm.description} onChange={e => setElectionForm({ ...electionForm, description: e.target.value })} className="input-field" rows={3} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditMode(false)} className="flex-1 btn-outline text-sm py-2">Cancel</button>
                  <button onClick={() => updateElectionMut.mutate(electionForm)} className="flex-1 btn-primary text-sm py-2" disabled={updateElectionMut.isPending}>
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div><span className="text-text-muted block mb-1">Title</span><p className="font-medium text-white">{election.title}</p></div>
                <div><span className="text-text-muted block mb-1">Date</span><p className="font-medium text-white">{election.election_date}</p></div>
                <div><span className="text-text-muted block mb-1">Type</span><p className="font-medium text-white capitalize">{election.election_type?.replace(/_/g, ' ')}</p></div>
                <div><span className="text-text-muted block mb-1">Description</span><p className="font-medium text-white">{election.description || 'No description provided'}</p></div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Candidates List */}
        <div className="lg:col-span-2">
          <div className="glass-card p-6 min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-accent-400" /> Candidates ({election.candidates?.length || 0})
              </h3>
              <button 
                onClick={() => { setCandidateForm({ id: '', full_name: '', party_name: '', party_code: '' }); setShowCandidateModal(true); }}
                className="btn-accent flex items-center gap-2 text-sm py-2"
              >
                <Plus className="w-4 h-4" /> Add Candidate
              </button>
            </div>

            <div className="space-y-3">
              {election.candidates?.length === 0 ? (
                <div className="text-center py-12 text-text-muted">No candidates added yet.</div>
              ) : (
                election.candidates?.map((c: Candidate) => (
                  <div key={c.id} className="p-4 rounded-xl bg-dark-surface border border-dark-border flex items-center justify-between hover:border-dark-border-hover transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-dark-surface-2 rounded-lg flex items-center justify-center font-bold text-white border border-white/5">
                        {c.party_code}
                      </div>
                      <div>
                        <p className="font-bold text-white">{c.full_name}</p>
                        <p className="text-xs text-text-muted">{c.party_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => { setCandidateForm({ id: String(c.id), full_name: c.full_name, party_name: c.party_name, party_code: c.party_code }); setShowCandidateModal(true); }}
                        className="p-2 text-text-muted hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { if(window.confirm('Delete this candidate?')) deleteCandidateMut.mutate(String(c.id)); }}
                        className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Modal */}
      {showCandidateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-dark-surface border border-dark-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-display text-xl font-bold text-white mb-6">
              {candidateForm.id ? 'Edit Candidate' : 'Add Candidate'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label-text">Candidate Full Name</label>
                <input value={candidateForm.full_name} onChange={e => setCandidateForm({ ...candidateForm, full_name: e.target.value })} className="input-field" placeholder="John Doe" />
              </div>
              <div>
                <label className="label-text">Party Code (Acronym)</label>
                <input value={candidateForm.party_code} onChange={e => setCandidateForm({ ...candidateForm, party_code: e.target.value })} className="input-field" placeholder="APC" />
              </div>
              <div>
                <label className="label-text">Party Full Name</label>
                <input value={candidateForm.party_name} onChange={e => setCandidateForm({ ...candidateForm, party_name: e.target.value })} className="input-field" placeholder="All Progressives Congress" />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowCandidateModal(false)} className="flex-1 btn-outline">Cancel</button>
              <button onClick={() => saveCandidateMut.mutate(candidateForm)} disabled={saveCandidateMut.isPending} className="flex-1 btn-primary">
                {saveCandidateMut.isPending ? 'Saving...' : 'Save Candidate'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
    </motion.div>
  );
}
