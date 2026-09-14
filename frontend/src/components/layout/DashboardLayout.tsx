/* Quiet Atlas: cloud-white operating canvas with cobalt wayfinding and restrained moss alerts. */
import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import OfflineSyncManager from '../common/OfflineSyncManager';
import OfflineIncidentModal from '../common/OfflineIncidentModal';
import MobileBottomNav from './MobileBottomNav';
import PWAInstallBanner from '../common/PWAInstallBanner';
import { AlertTriangle } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

function DashboardLayout() {
  const location = useLocation();
  const { isAuthenticated, accessToken } = useSelector((s: RootState) => s.auth);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);

  // Redirect to login if not authenticated
  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen bg-dark-bg atlas-grid">
      <OfflineSyncManager />
      <PWAInstallBanner />
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="lg:pl-72 print:pl-0 flex flex-col min-h-screen">
        {/* Top bar */}
        <TopBar />

        {/* Page content with bottom padding on mobile for MobileBottomNav */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 pb-24 lg:pb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />

      {/* Floating SOS Incident Button (positioned above bottom nav on mobile) */}
      <button
        onClick={() => setIsIncidentModalOpen(true)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 bg-status-error hover:bg-red-700 text-white p-3.5 sm:p-4 rounded-2xl shadow-lg shadow-red-900/30 flex items-center justify-center transition-transform duration-200 hover:-translate-y-1 active:scale-95 group no-print"
        aria-label="Report Incident"
      >
        <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse group-hover:animate-none" />
      </button>

      <OfflineIncidentModal 
        isOpen={isIncidentModalOpen} 
        onClose={() => setIsIncidentModalOpen(false)} 
      />
    </div>
  );
}

export default DashboardLayout;
