import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Search, Plus, Edit, Trash2, X } from 'lucide-react';
import { geoApi } from '../services/api';
import { LGA, Ward, PollingUnit } from '../types';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function AdminPollingUnitsPage() {
  const [selectedLGA, setSelectedLGA] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [search, setSearch] = useState('');

  const [modalType, setModalType] = useState<'lga' | 'ward' | 'pu' | null>(null);
  const [editItem, setEditItem] = useState<LGA | Ward | PollingUnit | null>(null);
  const [formData, setFormData] = useState<Partial<LGA & Ward & PollingUnit>>({});

  const queryClient = useQueryClient();

  const { data: lgaData } = useQuery({ queryKey: ['lgas'], queryFn: () => geoApi.getLGAs() });
  const { data: wardData } = useQuery({ queryKey: ['wards', selectedLGA], queryFn: () => geoApi.getWards({ lga_id: selectedLGA }), enabled: !!selectedLGA });
  const { data: puData, isLoading } = useQuery({ queryKey: ['pus', selectedWard, search], queryFn: () => geoApi.getPollingUnits({ ward_id: selectedWard || undefined, search: search || undefined }), enabled: !!selectedWard || !!search });

  const lgas = lgaData?.data?.data || [];
  const wards = wardData?.data?.data || [];
  const pus = puData?.data?.data || [];

  const handleSave = useMutation({
    mutationFn: async () => {
      if (modalType === 'lga') {
        if (editItem) return geoApi.updateLGA(editItem.id, formData as Partial<LGA>);
        return geoApi.createLGA(formData as Omit<LGA, 'id'>);
      }
      if (modalType === 'ward') {
        if (editItem) return geoApi.updateWard(editItem.id, { ...formData, lga_id: Number(selectedLGA) } as Partial<Ward>);
        return geoApi.createWard({ ...formData, lga_id: Number(selectedLGA) } as Omit<Ward, 'id'>);
      }
      if (modalType === 'pu') {
        if (editItem) return geoApi.updatePollingUnit(editItem.id, { ...formData, lga_id: Number(selectedLGA), ward_id: Number(selectedWard) } as Partial<PollingUnit>);
        return geoApi.createPollingUnit({ ...formData, lga_id: Number(selectedLGA), ward_id: Number(selectedWard) } as Omit<PollingUnit, 'id'>);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lgas'] });
      queryClient.invalidateQueries({ queryKey: ['wards'] });
      queryClient.invalidateQueries({ queryKey: ['pus'] });
      setModalType(null);
      setEditItem(null);
      toast.success('Saved successfully');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to save');
    }
  });

  const handleDelete = useMutation({
    mutationFn: async ({ type, id }: { type: string, id: number }) => {
      if (type === 'lga') return geoApi.deleteLGA(id);
      if (type === 'ward') return geoApi.deleteWard(id);
      if (type === 'pu') return geoApi.deletePollingUnit(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lgas'] });
      queryClient.invalidateQueries({ queryKey: ['wards'] });
      queryClient.invalidateQueries({ queryKey: ['pus'] });
      toast.success('Deleted successfully');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  });

  const openModal = (type: 'lga' | 'ward' | 'pu', item?: LGA | Ward | PollingUnit) => {
    setModalType(type);
    setEditItem(item || null);
    setFormData(item ? { ...item } : {});
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Geographic Entities" subtitle="Manage LGAs, Wards, and Polling Units" />
      </div>

      <div className="glass-card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-2 items-center">
          <select value={selectedLGA} onChange={e => { setSelectedLGA(e.target.value); setSelectedWard(''); }} className="input-field py-2 text-sm w-48">
            <option value="">Select LGA...</option>{lgas.map((l: LGA) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={() => openModal('lga')} className="btn-outline p-2"><Plus className="w-4 h-4" /></button>
          {selectedLGA && (
            <>
              <button onClick={() => openModal('lga', lgas.find((l: LGA) => l.id === parseInt(selectedLGA)))} className="text-blue-400 p-2 hover:bg-blue-500/10 rounded"><Edit className="w-4 h-4" /></button>
              <button onClick={() => { if(confirm('Delete LGA?')) handleDelete.mutate({ type: 'lga', id: parseInt(selectedLGA) }); setSelectedLGA(''); }} className="text-red-400 p-2 hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>

        <div className="flex gap-2 items-center">
          <select value={selectedWard} onChange={e => setSelectedWard(e.target.value)} className="input-field py-2 text-sm w-48" disabled={!selectedLGA}>
            <option value="">Select Ward...</option>{wards.map((w: Ward) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={() => openModal('ward')} disabled={!selectedLGA} className="btn-outline p-2 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
          {selectedWard && (
            <>
              <button onClick={() => openModal('ward', wards.find((w: Ward) => w.id === parseInt(selectedWard)))} className="text-blue-400 p-2 hover:bg-blue-500/10 rounded"><Edit className="w-4 h-4" /></button>
              <button onClick={() => { if(confirm('Delete Ward?')) handleDelete.mutate({ type: 'ward', id: parseInt(selectedWard) }); setSelectedWard(''); }} className="text-red-400 p-2 hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>

        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input placeholder="Search PU name or code..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10 py-2 text-sm" /></div>
        <button onClick={() => openModal('pu')} disabled={!selectedWard} className="btn-accent py-2 text-sm flex items-center gap-2 disabled:opacity-50"><Plus className="w-4 h-4" /> Add PU</button>
      </div>

      {isLoading ? <LoadingSpinner /> : pus.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <table className="w-full"><thead><tr><th className="table-header">PU Code</th><th className="table-header">Name</th><th className="table-header text-center">Registered Voters</th><th className="table-header text-center">Actions</th></tr></thead>
            <tbody>{pus.map((pu: PollingUnit) => (
              <tr key={pu.id} className="hover:bg-dark-surface-2 transition">
                <td className="table-cell font-mono text-xs text-accent-500">{pu.inec_pu_code || (pu as any).code}</td><td className="table-cell text-text-primary text-sm">{pu.name}</td>
                <td className="table-cell text-center font-mono">{pu.registered_voters}</td>
                <td className="table-cell text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => openModal('pu', pu)} className="text-blue-400 hover:bg-blue-500/10 p-1 rounded"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => { if(confirm('Delete PU?')) handleDelete.mutate({ type: 'pu', id: pu.id }) }} className="text-red-400 hover:bg-red-500/10 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16"><MapPin className="w-12 h-12 text-text-muted/30 mx-auto mb-3" /><p className="text-text-muted">Select an LGA and ward to view polling units</p></div>
      )}

      {modalType && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModalType(null)}>
          <div className="glass-card-accent p-6 max-w-md w-full relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-text-muted hover:text-white"><X className="w-5 h-5" /></button>
            <h3 className="font-display text-lg font-bold text-text-primary mb-4 capitalize">{editItem ? 'Edit' : 'Create'} {modalType === 'pu' ? 'Polling Unit' : modalType}</h3>
            <div className="space-y-4">
              <div><label className="label-text">Name</label><input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field" /></div>
              <div><label className="label-text">Code</label><input value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} className="input-field" /></div>
              {modalType === 'pu' && <div><label className="label-text">Registered Voters</label><input type="number" value={formData.registered_voters || 0} onChange={e => setFormData({ ...formData, registered_voters: parseInt(e.target.value) })} className="input-field" /></div>}
              {modalType === 'lga' && <div><label className="label-text">Headquarters</label><input value={formData.headquarters || ''} onChange={e => setFormData({ ...formData, headquarters: e.target.value })} className="input-field" /></div>}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label-text">Latitude</label><input type="number" step="any" value={formData.latitude || ''} onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) })} className="input-field" /></div>
                <div><label className="label-text">Longitude</label><input type="number" step="any" value={formData.longitude || ''} onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) })} className="input-field" /></div>
              </div>
            </div>
            <button onClick={() => handleSave.mutate()} disabled={handleSave.isPending} className="btn-primary w-full mt-6">{handleSave.isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
