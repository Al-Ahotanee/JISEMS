/* Mobile Bottom Navigation Bar for field agents & mobile operators */
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileUp,
  BarChart3,
  Layers,
  AlertTriangle,
  Radio,
  Menu,
  Bell,
  Users,
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { useLiveQuery } from 'dexie-react-hooks';
import { RootState } from '../../store';
import { toggleSidebar } from '../../store/uiSlice';
import { offlineDb } from '../../lib/offlineDb';

export default function MobileBottomNav() {
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const role = user?.role || 'pu_agent';

  const pendingSyncCount = useLiveQuery(() => offlineDb.offlineResults.where('synced').equals(0).count()) || 0;

  // Determine role-based navigation tabs
  const getNavTabs = () => {
    if (role === 'pu_agent') {
      return [
        { label: 'Home', to: '/app/dashboard', icon: LayoutDashboard },
        { label: 'Results', to: '/app/results', icon: BarChart3 },
        { label: 'Submit', to: '/app/results/submit', icon: FileUp, isPrimary: true },
        { label: 'Alerts', to: '/app/notifications', icon: Bell },
      ];
    }
    if (['ward_officer', 'lga_coordinator', 'state_coordinator'].includes(role)) {
      return [
        { label: 'Home', to: '/app/dashboard', icon: LayoutDashboard },
        { label: 'Results', to: '/app/results', icon: BarChart3 },
        { label: 'Collation', to: '/app/collation', icon: Layers, isPrimary: true },
        { label: 'Disputes', to: '/app/disputes', icon: AlertTriangle },
      ];
    }
    if (role === 'super_admin') {
      return [
        { label: 'Home', to: '/app/dashboard', icon: LayoutDashboard },
        { label: 'Results', to: '/app/results', icon: BarChart3 },
        { label: 'Users', to: '/app/admin/users', icon: Users, isPrimary: true },
        { label: 'Collation', to: '/app/collation', icon: Layers },
      ];
    }
    return [
      { label: 'Home', to: '/app/dashboard', icon: LayoutDashboard },
      { label: 'Live Desk', to: '/situation-room', icon: Radio, isPrimary: true },
      { label: 'Results', to: '/app/results', icon: BarChart3 },
      { label: 'Alerts', to: '/app/notifications', icon: Bell },
    ];
  };

  const tabs = getNavTabs();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-dark-surface/95 backdrop-blur-xl border-t border-dark-border px-2 lg:hidden no-print shadow-lg">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          if (tab.isPrimary) {
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center -mt-5 p-2 rounded-2xl transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-4 ring-dark-surface scale-105'
                      : 'bg-primary-700 text-white shadow-md shadow-primary-950/30 ring-4 ring-dark-surface hover:bg-emerald-600'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-bold mt-0.5">{tab.label}</span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors relative ${
                  isActive
                    ? 'text-emerald-700 font-bold'
                    : 'text-text-muted hover:text-text-primary'
                }`
              }
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.label === 'Submit' && pendingSyncCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
            </NavLink>
          );
        })}

        {/* Menu toggle button */}
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl text-text-muted hover:text-text-primary transition-colors"
          aria-label="Open full navigation drawer"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Menu</span>
        </button>
      </div>
    </nav>
  );
}
