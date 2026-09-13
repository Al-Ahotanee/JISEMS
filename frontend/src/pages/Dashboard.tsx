import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Vote, AlertTriangle, Users, FileText, Upload, Eye, Shield, MapPin } from 'lucide-react';
import { RootState } from '../store';
import { dashboardApi, adminApi } from '../services/api';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function DashboardPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  if (!user) return null;

  const isAdmin = ['super_admin', 'state_coordinator'].includes(user.role);
  const { data: stateData, isLoading } = useQuery({
    queryKey: ['state-dashboard'],
    queryFn: () => dashboardApi.getStateDashboard(),
    enabled: isAdmin,
  });

  const { data: adminStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getDashboardStats(),
    enabled: user.role === 'super_admin',
  });

  const dash = stateData?.data?.data;
  const stats = adminStats?.data?.data;

  if (isLoading && isAdmin) return <LoadingSpinner fullPage size="lg" />;

  const quickLinks: Record<string, { label: string; path: string; icon: React.ElementType; color: string }[]> = {
    super_admin: [
      { label: 'State Dashboard', path: '/app/dashboard/state', icon: BarChart3, color: 'primary' },
      { label: 'Manage Users', path: '/app/admin/users', icon: Users, color: 'accent' },
      { label: 'View Results', path: '/app/results', icon: FileText, color: 'primary' },
      { label: 'Situation Room', path: '/situation-room', icon: Eye, color: 'accent' },
    ],
    state_coordinator: [
      { label: 'State Dashboard', path: '/app/dashboard/state', icon: BarChart3, color: 'primary' },
      { label: 'View Results', path: '/app/results', icon: FileText, color: 'accent' },
      { label: 'State Collation', path: '/app/collation/state', icon: Shield, color: 'primary' },
      { label: 'Disputes', path: '/app/disputes', icon: AlertTriangle, color: 'accent' },
    ],
    lga_coordinator: [
      { label: 'My LGA Dashboard', path: `/app/dashboard/lga/${user.lga_id}`, icon: BarChart3, color: 'primary' },
      { label: 'Results', path: '/app/results', icon: FileText, color: 'accent' },
      { label: 'LGA Collation', path: `/app/collation/lga/${user.lga_id}`, icon: Shield, color: 'primary' },
      { label: 'Disputes', path: '/app/disputes', icon: AlertTriangle, color: 'accent' },
    ],
    ward_officer: [
      { label: 'My Ward', path: `/app/dashboard/ward/${user.ward_id}`, icon: MapPin, color: 'primary' },
      { label: 'Results', path: '/app/results', icon: FileText, color: 'accent' },
      { label: 'Ward Collation', path: `/app/collation/ward/${user.ward_id}`, icon: Shield, color: 'primary' },
      { label: 'Disputes', path: '/app/disputes', icon: AlertTriangle, color: 'accent' },
    ],
    pu_agent: [
      { label: 'Submit Result', path: '/app/results/submit', icon: Upload, color: 'accent' },
      { label: 'My Submissions', path: '/app/results', icon: FileText, color: 'primary' },
      { label: 'Situation Room', path: '/situation-room', icon: Eye, color: 'accent' },
    ],
    observer: [
      { label: 'Situation Room', path: '/situation-room', icon: Eye, color: 'accent' },
      { label: 'View Results', path: '/app/results', icon: FileText, color: 'primary' },
    ],
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Welcome */}
      <div className="surface-elevated relative overflow-hidden p-6 sm:p-7">
        <div className="absolute right-0 top-0 h-full w-1.5 bg-primary-600" />
        <p className="eyebrow">Operations workspace</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">
          Welcome, {user.first_name}!
        </h1>
          <p className="text-text-muted mt-2">
          {user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Dashboard
        </p>
      </div>

      {/* Stats for admin */}
      {isAdmin && dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total PUs" value={dash.total_polling_units} icon={MapPin} color="primary" />
          <StatCard title="Reported" value={dash.reported_polling_units} icon={FileText} color="accent" />
          <StatCard title="Total Votes" value={dash.total_votes_cast} icon={Vote} color="success" />
          <StatCard title="Turnout" value={parseFloat(dash.turnout_percentage)} icon={BarChart3} color="warning" subtitle="%" />
        </div>
      )}

      {user.role === 'super_admin' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={stats.users_by_role?.reduce((s: number, r: { count: number }) => s + r.count, 0) || 0} icon={Users} color="primary" />
          <StatCard title="Submissions" value={stats.total_submissions} icon={FileText} color="accent" />
          <StatCard title="Pending Reviews" value={stats.pending_reviews} icon={AlertTriangle} color="warning" />
          <StatCard title="Active Disputes" value={stats.active_disputes} icon={AlertTriangle} color="danger" />
        </div>
      )}

      {/* PU Agent special view */}
      {user.role === 'pu_agent' && (
        <div className="surface-elevated p-6 text-center sm:p-8">
          <Upload className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <p className="eyebrow">Polling unit workflow</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-text-primary mb-2">Ready to Submit Results?</h2>
          <p className="text-text-muted mb-4">Upload your EC8A result sheet and enter vote counts</p>
          <Link to="/app/results/submit" className="btn-accent inline-flex items-center gap-2">
            <Upload className="w-5 h-5" /> Submit Result
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(quickLinks[user.role] || []).map((link, i) => (
            <Link key={i} to={link.path} className="surface-elevated p-5 hover:border-primary-300 transition-all group">
              <link.icon className={`w-8 h-8 mb-3 ${link.color === 'accent' ? 'text-accent-700' : 'text-primary-600'} group-hover:scale-110 transition-transform`} />
              <p className="text-sm font-bold text-text-primary">{link.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
