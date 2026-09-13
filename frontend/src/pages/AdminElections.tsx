import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Users } from 'lucide-react';
import { electionApi } from '../services/api';
import { Election } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function AdminElectionsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', election_type: 'gubernatorial', election_date: '', election_year: new Date().getFullYear(), description: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['elections'], queryFn: () => electionApi.listElections() });
  const elections = data?.data?.data || [];

  const createMut = useMutation({
    mutationFn: (d: typeof form) => electionApi.createElection(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['elections'] }); setShowCreate(false); toast.success('Election created'); setForm({ title: '', election_type: 'gubernatorial', election_date: '', election_year: new Date().getFullYear(), description: '' }); },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between"><PageHeader title="Elections" /><button onClick={() => setShowCreate(!showCreate)} className="btn-accent flex items-center gap-2"><Plus className="w-4 h-4" /> New Election</button></div>

      {showCreate && (
        <div className="glass-card-accent p-6">
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Create Election</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><label className="label-text">Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input-field" placeholder="2027 Gubernatorial Election" /></div>
            <div><label className="label-text">Type</label><select value={form.election_type} onChange={e => setForm({ ...form, election_type: e.target.value })} className="input-field"><option value="gubernatorial">Gubernatorial</option><option value="presidential">Presidential</option><option value="senatorial">Senatorial</option><option value="house_of_reps">House of Reps</option><option value="state_assembly">State Assembly</option><option value="local_government">Local Government</option></select></div>
            <div><label className="label-text">Date</label><input type="date" value={form.election_date} onChange={e => setForm({ ...form, election_date: e.target.value })} className="input-field" /></div>
            <div><label className="label-text">Election year</label><input type="number" min="1900" max="2200" value={form.election_year} onChange={e => setForm({ ...form, election_year: Number(e.target.value) })} className="input-field" /></div>
            <div className="md:col-span-2"><label className="label-text">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} /></div>
          </div>
          <button onClick={() => createMut.mutate(form)} className="btn-primary mt-4">Create</button>
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {elections.map((e: Election) => (
            <Link key={e.id} to={`/app/admin/elections/${e.id}`} className="glass-card p-4 flex items-center justify-between hover:border-primary-500/50 hover:bg-white/5 transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform"><Calendar className="w-5 h-5 text-primary-400" /></div>
                <div><p className="text-text-primary font-medium group-hover:text-primary-400 transition-colors">{e.title}</p><p className="text-text-muted text-xs">{e.election_date} · {e.election_type?.replace(/_/g, ' ')}</p></div>
              </div>
              <StatusBadge status={e.status} />
            </Link>
          ))}
          {elections.length === 0 && <div className="text-center py-16 text-text-muted">No elections created yet</div>}
        </div>
      )}
    </motion.div>
  );
}
