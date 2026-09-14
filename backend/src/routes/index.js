const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Import middleware
const { authenticate, authorize, checkJurisdiction, optionalAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const { uploadResultImages, uploadDocument, uploadEvidence, uploadProfilePhoto } = require('../middleware/upload');

// Import controllers
const authController = require('../controllers/auth.controller');
const geoController = require('../controllers/geo.controller');
const electionController = require('../controllers/election.controller');
const resultsController = require('../controllers/results.controller');
const collationController = require('../controllers/collation.controller');
const dashboardController = require('../controllers/dashboard.controller');
const publicController = require('../controllers/public.controller');
const disputesController = require('../controllers/disputes.controller');
const reportsController = require('../controllers/reports.controller');
const notificationsController = require('../controllers/notifications.controller');
const pushController = require('../controllers/push.controller');
const usersController = require('../controllers/users.controller');
const adminController = require('../controllers/admin.controller');
const privacyController = require('../controllers/privacy.controller');

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  message: { success: false, message: 'Too many auth attempts, please try again later.' }
});

// ============ AUTH ROUTES ============
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/logout', authenticate, authController.logout);
router.post('/auth/forgot-password', authLimiter, authController.forgotPassword);
router.post('/auth/reset-password', authLimiter, authController.resetPassword);
router.post('/auth/verify-email', authController.verifyEmail);
router.get('/auth/me', authenticate, authController.getMe);

// ============ GEO ROUTES ============
router.get('/geo/lgas', geoController.getLGAs);
router.post('/geo/lgas', authenticate, authorize('super_admin'), auditLog('create', 'lga'), geoController.createLGA);
router.put('/geo/lgas/:id', authenticate, authorize('super_admin'), auditLog('update', 'lga'), geoController.updateLGA);
router.delete('/geo/lgas/:id', authenticate, authorize('super_admin'), auditLog('delete', 'lga'), geoController.deleteLGA);

router.get('/geo/wards', geoController.getWards);
router.post('/geo/wards', authenticate, authorize('super_admin'), auditLog('create', 'ward'), geoController.createWard);
router.put('/geo/wards/:id', authenticate, authorize('super_admin'), auditLog('update', 'ward'), geoController.updateWard);
router.delete('/geo/wards/:id', authenticate, authorize('super_admin'), auditLog('delete', 'ward'), geoController.deleteWard);

router.get('/geo/polling-units', geoController.getPollingUnits);
router.get('/geo/polling-units/:id', geoController.getPollingUnit);
router.post('/geo/polling-units', authenticate, authorize('super_admin'), auditLog('create', 'polling_unit'), geoController.createPollingUnit);
router.put('/geo/polling-units/:id', authenticate, authorize('super_admin'), auditLog('update', 'polling_unit'), geoController.updatePollingUnit);
router.delete('/geo/polling-units/:id', authenticate, authorize('super_admin'), auditLog('delete', 'polling_unit'), geoController.deletePollingUnit);

// ============ ELECTION ROUTES ============
router.get('/elections', authenticate, electionController.listElections);
router.get('/elections/:id', authenticate, electionController.getElection);
router.post('/elections', authenticate, authorize('super_admin'), auditLog('create', 'election'), electionController.createElection);
router.put('/elections/:id', authenticate, authorize('super_admin'), auditLog('update', 'election'), electionController.updateElection);
router.get('/elections/:electionId/candidates', authenticate, electionController.listCandidates);
router.post('/elections/:electionId/candidates', authenticate, authorize('super_admin'), auditLog('create', 'candidate'), electionController.createCandidate);
router.put('/elections/:electionId/candidates/:id', authenticate, authorize('super_admin'), auditLog('update', 'candidate'), electionController.updateCandidate);
router.delete('/elections/:electionId/candidates/:id', authenticate, authorize('super_admin'), auditLog('delete', 'candidate'), electionController.deleteCandidate);

// ============ RESULT ROUTES ============
router.post('/results', authenticate, authorize('pu_agent', 'ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), uploadResultImages, auditLog('submit', 'result'), resultsController.submitResult);
router.get('/results', authenticate, resultsController.listResults);
router.get('/results/:id', authenticate, resultsController.getResult);
router.put('/results/:id/verify', authenticate, authorize('ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), auditLog('verify', 'result'), resultsController.verifyResult);
router.put('/results/:id/reject', authenticate, authorize('ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), auditLog('reject', 'result'), resultsController.rejectResult);
router.put('/results/:id/flag', authenticate, authorize('ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), auditLog('flag', 'result'), resultsController.flagResult);

// ============ COLLATION ROUTES ============
router.post('/collation/ward', authenticate, authorize('ward_officer', 'super_admin'), auditLog('collate', 'ward'), collationController.submitWardCollation);
router.post('/collation/lga', authenticate, authorize('lga_coordinator', 'super_admin'), auditLog('collate', 'lga'), collationController.submitLGACollation);
router.post('/collation/state', authenticate, authorize('state_coordinator', 'super_admin'), auditLog('collate', 'state'), collationController.submitStateCollation);
router.get('/collation/summary', authenticate, collationController.getCollationSummary);

// ============ DASHBOARD ROUTES ============
router.get('/dashboard/state', authenticate, authorize('super_admin', 'state_coordinator', 'observer'), dashboardController.getStateDashboard);
router.get('/dashboard/lga/:id', authenticate, dashboardController.getLGADashboard);
router.get('/dashboard/ward/:id', authenticate, dashboardController.getWardDashboard);
router.get('/dashboard/anomalies', authenticate, authorize('super_admin', 'state_coordinator'), dashboardController.getAnomalies);
router.get('/dashboard/timeline', authenticate, dashboardController.getTimeline);

// ============ PUBLIC ROUTES (NO AUTH) ============
router.get('/public/elections', electionController.listElections);
router.get('/public/situation-room', publicController.getSituationRoom);
router.get('/public/situation-room/lga/:id', publicController.getSituationRoomLGA);
router.get('/public/situation-room/ward/:id', publicController.getSituationRoomWard);
router.get('/public/embed/:electionId', publicController.getEmbedData);
router.get('/public/merkle-ledger', publicController.getMerkleLedger);

// ============ DISPUTE ROUTES ============
router.post('/disputes', authenticate, auditLog('create', 'dispute'), disputesController.raiseDispute);
router.get('/disputes', authenticate, disputesController.listDisputes);
router.get('/disputes/:id', authenticate, disputesController.getDispute);
router.post('/disputes/:id/comments', authenticate, disputesController.addComment);
router.post('/disputes/:id/evidence', authenticate, uploadEvidence, disputesController.addEvidence);
router.put('/disputes/:id/resolve', authenticate, authorize('ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), auditLog('resolve', 'dispute'), disputesController.resolveDispute);
router.put('/disputes/:id/escalate', authenticate, authorize('ward_officer', 'lga_coordinator', 'state_coordinator', 'super_admin'), auditLog('escalate', 'dispute'), disputesController.escalateDispute);

// ============ REPORT ROUTES ============
router.get('/reports/pdf', authenticate, authorize('super_admin', 'state_coordinator', 'lga_coordinator'), reportsController.generatePDF);
router.get('/reports/excel', authenticate, authorize('super_admin', 'state_coordinator', 'lga_coordinator'), reportsController.generateExcel);
router.get('/reports/csv', authenticate, authorize('super_admin', 'state_coordinator', 'lga_coordinator'), reportsController.generateCSV);

// ============ NOTIFICATION ROUTES ============
router.get('/notifications', authenticate, notificationsController.listNotifications);
router.get('/notifications/unread-count', authenticate, notificationsController.getUnreadCount);
router.put('/notifications/:id/read', authenticate, notificationsController.markAsRead);
router.put('/notifications/read-all', authenticate, notificationsController.markAllAsRead);
router.get('/notifications/preferences', authenticate, notificationsController.getPreferences);
router.put('/notifications/preferences', authenticate, notificationsController.updatePreferences);

// ============ PUSH ROUTES ============
router.post('/push/subscribe', authenticate, pushController.subscribe);
router.post('/push/unsubscribe', authenticate, pushController.unsubscribe);
router.get('/push/vapid-key', pushController.getVapidKey);

// ============ USER ROUTES ============
router.put('/users/profile', authenticate, usersController.updateProfile);
router.post('/users/profile/photo', authenticate, uploadProfilePhoto, usersController.uploadPhoto);
router.put('/users/password', authenticate, usersController.changePassword);

// ============ ADMIN ROUTES ============
router.get('/admin/users', authenticate, authorize('super_admin'), adminController.listUsers);
router.get('/admin/users/:id', authenticate, authorize('super_admin'), adminController.getUser);
router.post('/admin/users', authenticate, authorize('super_admin'), auditLog('create', 'user'), adminController.createUser);
router.put('/admin/users/:id', authenticate, authorize('super_admin'), auditLog('update', 'user'), adminController.updateUser);
router.delete('/admin/users/:id', authenticate, authorize('super_admin'), auditLog('delete', 'user'), adminController.deleteUser);
router.get('/admin/applications', authenticate, authorize('super_admin'), adminController.listApplications);
router.put('/admin/applications/:id/review', authenticate, authorize('super_admin'), auditLog('review', 'application'), adminController.reviewApplication);
router.get('/admin/audit-logs', authenticate, authorize('super_admin'), adminController.listAuditLogs);
router.get('/admin/config', authenticate, authorize('super_admin'), adminController.getSystemConfig);
router.put('/admin/config', authenticate, authorize('super_admin'), auditLog('update', 'config'), adminController.updateSystemConfig);
router.get('/admin/dashboard-stats', authenticate, authorize('super_admin'), adminController.getDashboardStats);

// ============ PRIVACY ROUTES (NDPR) ============
router.get('/privacy/export', authenticate, privacyController.exportMyData);
router.post('/privacy/erasure', authenticate, privacyController.requestErasure);

// ============ ANOMALY ROUTES ============
const anomalyRoutes = require('./anomaly.routes');
router.use('/anomalies', anomalyRoutes);

module.exports = router;
