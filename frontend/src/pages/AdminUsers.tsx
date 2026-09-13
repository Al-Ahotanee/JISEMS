import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, Edit, UserCheck, UserX, X } from 'lucide-react';
import { adminApi, geoApi } from '../services/api';
import { User, LGA, Ward, PollingUnit } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ first_name: '', last_name: '', email: '', phone: '', password: '', role: 'pu_agent', lga_id: '', ward_id: '', polling_unit_id: '' });
  
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, roleFilter],
    queryFn: () => adminApi.listUsers({ page, limit: 20, search: search || undefined, role: roleFilter || undefined }),
  });

  const { data: lgaData } = useQuery({ queryKey: ['lgas'], queryFn: () => geoApi.getLGAs() });
  const { data: wardData } = useQuery({
    queryKey: ['wards', userForm.lga_id],
    queryFn: () => geoApi.getWards({ lga_id: userForm.lga_id }),
    enabled: !!userForm.lga_id,
  });
  const { data: puData } = useQuery({
    queryKey: ['pus', userForm.ward_id],
    queryFn: () => geoApi.getPollingUnits({ ward_id: userForm.ward_id }),
    enabled: !!userForm.ward_id,
  });

  const createMut = useMutation({
    mutationFn: (userData: typeof userForm) => adminApi.createUser({
      ...userData,
      lga_id: userData.lga_id ? parseInt(userData.lga_id) : null,
      ward_id: userData.ward_id ? parseInt(userData.ward_id) : null,
      polling_unit_id: userData.polling_unit_id ? parseInt(userData.polling_unit_id) : null,
      role: userData.role as any
    }),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['admin-users'] }); 
      setShowCreate(false); 
      toast.success('User created'); 
      setUserForm({ first_name: '', last_name: '', email: '', phone: '', password: '', role: 'pu_agent', lga_id: '', ward_id: '', polling_unit_id: '' }); 
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof userForm }) => adminApi.updateUser(id, {
      ...data,
      lga_id: data.lga_id ? parseInt(data.lga_id) : null,
      ward_id: data.ward_id ? parseInt(data.ward_id) : null,
      polling_unit_id: data.polling_unit_id ? parseInt(data.polling_unit_id) : null,
      role: data.role as any
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowEdit(false);
      toast.success('User updated');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed');
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => adminApi.updateUser(id, { status: status as any }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User updated'); },
  });

  const users = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const handleEditClick = (u: User) => {
    setSelectedUser(u);
    setUserForm({
      first_name: u.first_name || '', last_name: u.last_name || '', email: u.email || '', phone: u.phone || '',
      password: '', role: u.role || 'pu_agent', 
      lga_id: u.lga_id ? String(u.lga_id) : '', 
      ward_id: u.ward_id ? String(u.ward_id) : '', 
      polling_unit_id: u.polling_unit_id ? String(u.polling_unit_id) : ''
    });
    setShowEdit(true);
  };

  const UserFormFields = () => (
    <div className="grid md:grid-cols-2 gap-4">
      <div><label className="label-text">First Name</label><input value={userForm.first_name} onChange={e => setUserForm({ ...userForm, first_name: e.target.value })} className="input-field" /></div>
      <div><label className="label-text">Last Name</label><input value={userForm.last_name} onChange={e => setUserForm({ ...userForm, last_name: e.target.value })} className="input-field" /></div>
      <div><label className="label-text">Email</label><input value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="input-field" disabled={showEdit} /></div>
      <div><label className="label-text">Phone</label><input value={userForm.phone} onChange={e => setUserForm({ ...userForm, phone: e.target.value })} className="input-field" /></div>
      {!showEdit && <div><label className="label-text">Password</label><input type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className="input-field" /></div>}
      <div>
        <label className="label-text">Role</label>
        <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className="input-field">
          <option value="pu_agent">PU Agent</option><option value="ward_officer">Ward Officer</option>
          <option value="lga_coordinator">LGA Coordinator</option><option value="state_coordinator">State Coordinator</option>
          <option value="observer">Observer</option><option value="super_admin">Super Admin</option>
        </select>
      </div>
      {(['lga_coordinator', 'ward_officer', 'pu_agent'].includes(userForm.role)) && (
        <div>
          <label className="label-text">LGA</label>
          <select value={userForm.lga_id} onChange={e => setUserForm({ ...userForm, lga_id: e.target.value, ward_id: '', polling_unit_id: '' })} className="input-field">
            <option value="">Select LGA...</option>
            {lgaData?.data?.data?.map((lga: LGA) => <option key={lga.id} value={lga.id}>{lga.name}</option>)}
          </select>
        </div>
      )}
      {(['ward_officer', 'pu_agent'].includes(userForm.role)) && (
        <div>
          <label className="label-text">Ward</label>
          <select value={userForm.ward_id} onChange={e => setUserForm({ ...userForm, ward_id: e.target.value, polling_unit_id: '' })} className="input-field" disabled={!userForm.lga_id}>
            <option value="">Select Ward...</option>
            {wardData?.data?.data?.map((w: Ward) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}
      {userForm.role === 'pu_agent' && (
        <div className="md:col-span-2">
          <label className="label-text">Polling Unit</label>
          <select value={userForm.polling_unit_id} onChange={e => setUserForm({ ...userForm, polling_unit_id: e.target.value })} className="input-field" disabled={!userForm.ward_id}>
            <option value="">Select PU...</option>
            {puData?.data?.data?.map((p: PollingUnit) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between"><PageHeader title="User Management" /><button onClick={() => { setShowCreate(!showCreate); setShowEdit(false); setUserForm({ first_name: '', last_name: '', email: '', phone: '', password: '', role: 'pu_agent', lga_id: '', ward_id: '', polling_unit_id: '' }); }} className="btn-accent flex items-center gap-2"><Plus className="w-4 h-4" /> New User</button></div>

      {showCreate && (
        <div className="glass-card-accent p-6 relative">
          <button onClick={() => setShowCreate(false)} className="absolute top-4 right-4 text-text-muted hover:text-white"><X className="w-5 h-5" /></button>
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Create User</h3>
          <UserFormFields />
          <button onClick={() => createMut.mutate(userForm)} className="btn-primary mt-4" disabled={createMut.isPending}>{createMut.isPending ? 'Creating...' : 'Create User'}</button>
        </div>
      )}

      {showEdit && (
        <div className="glass-card-accent p-6 relative border border-primary-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
          <button onClick={() => setShowEdit(false)} className="absolute top-4 right-4 text-text-muted hover:text-white"><X className="w-5 h-5" /></button>
          <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Edit User: {selectedUser?.first_name} {selectedUser?.last_name}</h3>
          <UserFormFields />
          <button onClick={() => selectedUser && editMut.mutate({ id: selectedUser.id, data: userForm })} className="btn-primary mt-4" disabled={editMut.isPending}>{editMut.isPending ? 'Saving...' : 'Save Changes'}</button>
        </div>
      )}

      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="input-field pl-10 py-2 text-sm" /></div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="input-field py-2 text-sm w-40"><option value="">All Roles</option><option value="super_admin">Super Admin</option><option value="state_coordinator">State Coord.</option><option value="lga_coordinator">LGA Coord.</option><option value="ward_officer">Ward Officer</option><option value="pu_agent">PU Agent</option><option value="observer">Observer</option></select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header">Name/Email</th>
                <th className="table-header text-center">Role</th>
                <th className="table-header text-center">Assignment</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: User & { lga_name?: string; ward_name?: string; polling_unit_name?: string }) => (
                <tr key={u.id} className="hover:bg-dark-surface-2 transition">
                  <td className="table-cell">
                    <div className="text-text-primary font-medium">{u.first_name} {u.last_name}</div>
                    <div className="text-text-muted text-xs">{u.email}</div>
                  </td>
                  <td className="table-cell text-center capitalize">{u.role?.replace(/_/g, ' ')}</td>
                  <td className="table-cell text-center text-xs">
                    {u.role === 'lga_coordinator' ? (u.lga_name || 'None') :
                     u.role === 'ward_officer' ? (u.ward_name || 'None') :
                     u.role === 'pu_agent' ? (u.polling_unit_name ? `${u.ward_name} - ${u.polling_unit_name}` : 'None') : 'Statewide'}
                  </td>
                  <td className="table-cell text-center"><StatusBadge status={u.status} /></td>
                  <td className="table-cell text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => handleEditClick(u)} className="text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded transition"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => toggleMut.mutate({ id: u.id, status: u.status === 'active' ? 'suspended' : 'active' })} className={`px-2 py-1 rounded ${u.status === 'active' ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'} transition`}>
                        {u.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-text-muted">No users found</td></tr>}
            </tbody>
          </table>
          {pagination && <div className="flex items-center justify-between p-4 border-t border-dark-border"><span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages}</span><div className="flex gap-2"><button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="btn-outline py-1 px-3 text-sm">Prev</button><button onClick={() => setPage(p => p + 1)} disabled={!pagination.hasNext} className="btn-outline py-1 px-3 text-sm">Next</button></div></div>}
        </div>
      )}
    </motion.div>
  );
}
