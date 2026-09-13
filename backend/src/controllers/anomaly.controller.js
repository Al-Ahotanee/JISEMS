const AnomalyService = require('../services/anomaly.service');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

class AnomalyController {
  static async listAnomalies(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await AnomalyService.listAnomalies(pageNum, limitNum, status);
      
      return ApiResponse.paginated(res, result.data, {
        page: pageNum,
        limit: limitNum,
        total: result.total
      }, 'Anomalies fetched successfully');
    } catch (error) {
      logger.error('List anomalies error:', error);
      return ApiResponse.error(res, 'Failed to fetch anomalies');
    }
  }

  static async resolveAnomaly(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;

      if (!status || !['resolved', 'dismissed'].includes(status)) {
        return ApiResponse.badRequest(res, 'Status must be resolved or dismissed');
      }

      await AnomalyService.resolveAnomaly(id, status, userId);
      
      logger.info(`Anomaly ${id} resolved by user ${userId}`);
      return ApiResponse.success(res, null, 'Anomaly resolved successfully');
    } catch (error) {
      logger.error('Resolve anomaly error:', error);
      if (error.message === 'Anomaly not found') {
        return ApiResponse.notFound(res, 'Anomaly not found');
      }
      return ApiResponse.error(res, 'Failed to resolve anomaly');
    }
  }
}

module.exports = AnomalyController;
