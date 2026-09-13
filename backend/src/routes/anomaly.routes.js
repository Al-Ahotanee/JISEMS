const express = require('express');
const router = express.Router();
const anomalyController = require('../controllers/anomaly.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Protect all anomaly routes
router.use(authenticate);

// Only admins and state coordinators can manage anomalies
router.use(authorize('super_admin', 'state_coordinator'));

router.get('/', anomalyController.listAnomalies);
router.patch('/:id/resolve', anomalyController.resolveAnomaly);

module.exports = router;
