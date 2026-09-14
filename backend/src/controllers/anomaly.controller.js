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

  static async getBenfordAudit(req, res) {
    try {
      const { pool } = require('../config/database');
      const { election_id } = req.query;

      let params = [];
      let whereClause = "WHERE rs.status = 'verified' AND vd.votes > 0";
      if (election_id) {
        whereClause = "WHERE rs.election_id = ? AND rs.status = 'verified' AND vd.votes > 0";
        params = [parseInt(election_id)];
      }

      const [rows] = await pool.query(
        `SELECT vd.votes
         FROM vote_data vd
         JOIN result_submissions rs ON rs.id = vd.submission_id
         ${whereClause}`,
        params
      );

      const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
      let totalSamples = 0;

      for (const r of rows) {
        const str = String(r.votes);
        const firstDigit = parseInt(str[0]);
        if (firstDigit >= 1 && firstDigit <= 9) {
          counts[firstDigit]++;
          totalSamples++;
        }
      }

      const benfordTheoretical = {
        1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097,
        5: 0.079, 6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046
      };

      let chiSquare = 0;
      const distribution = [];

      for (let d = 1; d <= 9; d++) {
        const observedCount = counts[d];
        const observedPercent = totalSamples > 0 ? (observedCount / totalSamples) * 100 : 0;
        const expectedPercent = benfordTheoretical[d] * 100;
        const expectedCount = totalSamples * benfordTheoretical[d];

        if (expectedCount > 0) {
          chiSquare += Math.pow(observedCount - expectedCount, 2) / expectedCount;
        }

        distribution.push({
          digit: d,
          observedCount,
          observedPercent: Number(observedPercent.toFixed(2)),
          expectedPercent: Number(expectedPercent.toFixed(2)),
          diff: Number((observedPercent - expectedPercent).toFixed(2)),
        });
      }

      let riskLevel = 'normal';
      let riskMessage = 'First-digit vote distribution conforms to natural logarithmic variation.';
      if (totalSamples >= 30) {
        if (chiSquare >= 26.12) {
          riskLevel = 'critical';
          riskMessage = 'Severe divergence from Benford\'s Law detected. High statistical probability of artificial tally modification or vote fabrication.';
        } else if (chiSquare >= 15.51) {
          riskLevel = 'warning';
          riskMessage = 'Moderate deviation from Benford distribution. Audit sampling recommended.';
        }
      } else {
        riskMessage = 'Insufficient sample size for conclusive Chi-Square significance (requires 30+ data points).';
      }

      return ApiResponse.success(res, {
        totalSamples,
        chiSquare: Number(chiSquare.toFixed(3)),
        degreesOfFreedom: 8,
        riskLevel,
        riskMessage,
        distribution,
      }, 'Benford forensic audit completed');
    } catch (error) {
      logger.error('Benford audit error:', error);
      return ApiResponse.error(res, 'Failed to compute Benford audit');
    }
  }
}

module.exports = AnomalyController;
