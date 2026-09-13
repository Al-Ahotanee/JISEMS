import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, AlertTriangle, FileText, Shield, Clock } from 'lucide-react';
import { notificationsApi } from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PageHeader from '../components/common/PageHeader';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

type NotificationItem = { id: number; is_read: boolean; type: string; title: string; message: string; created_at: string; };

const iconMap: Record<string, React.ElementType> = { result_submitted: FileText, result_verified: Check, result_rejected: AlertTriangle, dispute_raised: AlertTriangle, dispute_resolved: Shield, escalation: AlertTriangle, system: Bell, collation: Shield };

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.listNotifications({ page: 1, limit: 50 }) });

  const markReadMut = useMutation({
    mutationFn: (id: number) => notificationsApi.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); toast.success('All marked as read'); },
  });

  const notifications = data?.data?.data || [];
  const unread = notifications.filter((n: NotificationItem) => !n.is_read).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Notifications" subtitle={`${unread} unread`} />
        {unread > 0 && <button onClick={() => markAllMut.mutate()} className="btn-outline py-1.5 px-3 text-sm flex items-center gap-1"><CheckCheck className="w-4 h-4" /> Mark All Read</button>}
      </div>
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {notifications.map((n: NotificationItem) => {
            const Icon = iconMap[n.type] || Bell;
            return (
              <div key={n.id} className={`glass-card p-4 flex items-start gap-3 cursor-pointer transition hover:border-primary-500/30 ${!n.is_read ? 'border-l-2 border-l-accent-500' : 'opacity-70'}`}
                onClick={() => { if (!n.is_read) markReadMut.mutate(n.id); }}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${!n.is_read ? 'bg-accent-500/10' : 'bg-dark-surface-3'}`}>
                  <Icon className={`w-5 h-5 ${!n.is_read ? 'text-accent-500' : 'text-text-muted'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium">{n.title}</p>
                  <p className="text-text-muted text-sm mt-0.5">{n.message}</p>
                  <p className="text-text-muted text-xs mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0 mt-2" />}
              </div>
            );
          })}
          {notifications.length === 0 && (
            <div className="text-center py-16"><Bell className="w-12 h-12 text-text-muted/30 mx-auto mb-3" /><p className="text-text-muted">No notifications yet</p></div>
          )}
        </div>
      )}
    </motion.div>
  );
}
