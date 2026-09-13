import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { AnimatePresence } from 'framer-motion';
import { RootState } from './store';
import { setIsMobile } from './store/uiSlice';
import LoadingSpinner from './components/common/LoadingSpinner';

const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));
const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPassword'));
const SituationRoomPage = lazy(() => import('./pages/SituationRoom'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const StateDashboardPage = lazy(() => import('./pages/StateDashboard'));
const LGADashboardPage = lazy(() => import('./pages/LGADashboard'));
const WardDashboardPage = lazy(() => import('./pages/WardDashboard'));
const SubmitResultPage = lazy(() => import('./pages/SubmitResult'));
const ResultsListPage = lazy(() => import('./pages/ResultsList'));
const ResultDetailPage = lazy(() => import('./pages/ResultDetail'));
const DisputesListPage = lazy(() => import('./pages/DisputesList'));
const DisputeDetailPage = lazy(() => import('./pages/DisputeDetail'));
const NotificationsPage = lazy(() => import('./pages/Notifications'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const WardCollationPage = lazy(() => import('./pages/WardCollation'));
const LGACollationPage = lazy(() => import('./pages/LGACollation'));
const StateCollationPage = lazy(() => import('./pages/StateCollation'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsers'));
const AdminApplicationsPage = lazy(() => import('./pages/AdminApplications'));
const AdminPollingUnitsPage = lazy(() => import('./pages/AdminPollingUnits'));
const AdminElectionsPage = lazy(() => import('./pages/AdminElections'));
const AdminElectionDetailPage = lazy(() => import('./pages/AdminElectionDetail'));
const AdminAuditPage = lazy(() => import('./pages/AdminAudit'));
const AdminReportsPage = lazy(() => import('./pages/AdminReports'));
const AntiRiggingDashboardPage = lazy(() => import('./pages/AntiRiggingDashboard'));

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleResize = () => dispatch(setIsMobile(window.innerWidth < 768));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch]);

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<LoadingSpinner fullPage size="lg" />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/situation-room" element={<SituationRoomPage />} />
          <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="dashboard/state" element={<ProtectedRoute roles={['super_admin','state_coordinator','observer']}><StateDashboardPage /></ProtectedRoute>} />
            <Route path="dashboard/lga/:id" element={<LGADashboardPage />} />
            <Route path="dashboard/ward/:id" element={<WardDashboardPage />} />
            <Route path="results/submit" element={<ProtectedRoute roles={['pu_agent']}><SubmitResultPage /></ProtectedRoute>} />
            <Route path="results" element={<ResultsListPage />} />
            <Route path="results/:id" element={<ResultDetailPage />} />
            <Route path="disputes" element={<DisputesListPage />} />
            <Route path="disputes/:id" element={<DisputeDetailPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="collation" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="collation/ward/:id" element={<ProtectedRoute roles={['ward_officer','super_admin']}><WardCollationPage /></ProtectedRoute>} />
            <Route path="collation/lga/:id" element={<ProtectedRoute roles={['lga_coordinator','super_admin']}><LGACollationPage /></ProtectedRoute>} />
            <Route path="collation/state" element={<ProtectedRoute roles={['state_coordinator','super_admin']}><StateCollationPage /></ProtectedRoute>} />
            <Route path="admin" element={<ProtectedRoute roles={['super_admin']}><AdminDashboardPage /></ProtectedRoute>} />
            <Route path="admin/users" element={<ProtectedRoute roles={['super_admin']}><AdminUsersPage /></ProtectedRoute>} />
            <Route path="admin/applications" element={<ProtectedRoute roles={['super_admin']}><AdminApplicationsPage /></ProtectedRoute>} />
            <Route path="admin/polling-units" element={<ProtectedRoute roles={['super_admin']}><AdminPollingUnitsPage /></ProtectedRoute>} />
            <Route path="admin/elections" element={<ProtectedRoute roles={['super_admin']}><AdminElectionsPage /></ProtectedRoute>} />
            <Route path="admin/elections/:id" element={<ProtectedRoute roles={['super_admin']}><AdminElectionDetailPage /></ProtectedRoute>} />
            <Route path="admin/audit" element={<ProtectedRoute roles={['super_admin']}><AdminAuditPage /></ProtectedRoute>} />
            <Route path="admin/anti-rigging" element={<ProtectedRoute roles={['super_admin', 'state_coordinator']}><AntiRiggingDashboardPage /></ProtectedRoute>} />
            <Route path="admin/reports" element={<ProtectedRoute roles={['super_admin','state_coordinator','lga_coordinator']}><AdminReportsPage /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

export default App;
