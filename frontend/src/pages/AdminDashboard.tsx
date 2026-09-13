import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, ArrowRight, BarChart3, ClipboardList, FileText, MapPin, ScrollText, Settings, Users } from 'lucide-react';
import { adminApi } from '../services/api';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';

const COLORS = ['#31598a', '#d39a35', '#5f8f62', '#9f5260', '#736494', '#527f89'];

export default function AdminDashboardPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-stats'], queryFn: () => adminApi.getDashboardStats() });
  const stats = data?.data?.data;

  if (isLoading) return <LoadingSpinner fullPage size="lg" />;
  if (isError || !stats) return <div className="glass-card p-8 text-center text-text-secondary">Unable to load the administration overview. Check the service connection and try again.</div>;

  const userChart = (stats.users_by_role || []).map((role: { role: string; count: number }) => ({ name: role.role.replace(/_/g, ' '), value: Number(role.count) }));
  const links = [
    { label: 'Manage users', description: 'Accounts and permissions', path: '/app/admin/users', icon: Users, color: 'text-primary-700' },
    { label: 'Review applications', description: `${stats.pending_applications} awaiting review`, path: '/app/admin/applications', icon: ClipboardList, color: 'text-accent-700' },
    { label: 'Elections', description: 'Cycles and candidates', path: '/app/admin/elections', icon: BarChart3, color: 'text-primary-600' },
    { label: 'Polling units', description: 'Geography and coverage', path: '/app/admin/polling-units', icon: MapPin, color: 'text-accent-700' },
    { label: 'Audit log', description: 'Review sensitive actions', path: '/app/admin/audit', icon: ScrollText, color: 'text-status-warning' },
    { label: 'Reports', description: 'Export operational data', path: '/app/admin/reports', icon: FileText, color: 'text-primary-700' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader title="Administration" subtitle="A concise view of system health, review queues, and operational control." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total users" value={(stats.users_by_role || []).reduce((sum: number, role: { count: number }) => sum + Number(role.count), 0)} icon={Users} color="primary" />
        <StatCard title="Submissions" value={stats.total_submissions} icon={FileText} color="accent" />
        <StatCard title="Pending reviews" value={stats.pending_reviews} icon={AlertTriangle} color="warning" />
        <StatCard title="Active disputes" value={stats.active_disputes} icon={AlertTriangle} color="danger" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-elevated p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">People and access</p><h3 className="mt-2 font-display text-xl font-bold">Users by role</h3></div><Settings className="h-5 w-5 text-text-muted" /></div>
          <div className="mt-6 h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={userChart} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value"><>{userChart.map((role: { name: string }, index: number) => <Cell key={role.name} fill={COLORS[index % COLORS.length]} />)}</></Pie><Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d8e2ef', borderRadius: 12, color: '#1c2c40' }} /></PieChart></ResponsiveContainer></div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">{userChart.map((role: { name: string; value: number }, index: number) => <span key={role.name} className="inline-flex items-center gap-2 text-xs capitalize text-text-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{role.name} <b className="text-text-secondary">{role.value}</b></span>)}</div>
        </div>

        <div className="surface-elevated flex flex-col justify-between p-6 sm:p-7"><div><p className="eyebrow">Review queue</p><h3 className="mt-2 font-display text-4xl font-semibold text-primary-800">{stats.pending_applications}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">Registration applications are waiting for an administrator decision.</p></div><div className="mt-8 rounded-2xl border border-accent-200 bg-accent-50 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700"><ClipboardList className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-text-primary">Keep the queue moving</p><p className="mt-1 text-xs text-text-muted">Reviewing an application creates an audit record.</p></div></div><Link to="/app/admin/applications" className="btn-primary mt-4 w-full">Open review queue <ArrowRight className="h-4 w-4" /></Link></div></div>
      </div>

      <section><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Control centre</p><h3 className="mt-2 font-display text-xl font-semibold">Quick access</h3></div><span className="text-xs text-text-muted">Administrator tools</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{links.map((link) => <Link key={link.path} to={link.path} className="group surface-elevated flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-primary-300"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 group-hover:bg-primary-100"><link.icon className={`h-5 w-5 ${link.color}`} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-text-primary">{link.label}</p><p className="mt-1 truncate text-xs text-text-muted">{link.description}</p></div><ArrowRight className="h-4 w-4 text-text-muted transition group-hover:translate-x-1 group-hover:text-primary-600" /></Link>)}</div></section>
    </motion.div>
  );
}
