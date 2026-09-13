const { pool } = require('../config/database');
const logger = require('../utils/logger');

class AnomalyService {
  /**
   * Analyze a result submission for anomalies
   * @param {number} submissionId
   * @param {Object} submissionData
   * @param {number} registeredVoters
   * @param {Array} votes - Array of {candidate_id, votes}
   */
  static async analyzeResult(submissionId, submissionData, registeredVoters, votes) {
    try {
      const anomalies = [];
      const { accredited_voters, total_votes_cast } = submissionData;

      // Rule 1: Over-voting (Votes > Accredited)
      if (total_votes_cast > accredited_voters) {
        anomalies.push({
          type: 'over_voting',
          detail: `Total votes cast (${total_votes_cast}) exceeds accredited voters (${accredited_voters}).`,
          severity: 'critical'
        });
      }

      // Rule 2: Over-accreditation (Accredited > Registered)
      // Sometimes registeredVoters is 0 in test data, so ignore if 0
      if (registeredVoters > 0 && accredited_voters > registeredVoters) {
        anomalies.push({
          type: 'over_accreditation',
          detail: `Accredited voters (${accredited_voters}) exceeds registered voters (${registeredVoters}).`,
          severity: 'critical'
        });
      }

      // Rule 3: Unnatural Turnout (> 90%)
      if (registeredVoters > 100 && (accredited_voters / registeredVoters) > 0.9) {
        const percentage = ((accredited_voters / registeredVoters) * 100).toFixed(1);
        anomalies.push({
          type: 'unnatural_turnout',
          detail: `Extremely high voter turnout detected: ${percentage}%.`,
          severity: 'warning'
        });
      }

      // Rule 4: Single Party Dominance (> 95% of votes)
      if (total_votes_cast > 100) {
        for (const vote of votes) {
          if (vote.votes / total_votes_cast > 0.95) {
            anomalies.push({
              type: 'single_party_dominance',
              detail: `Candidate ID ${vote.candidate_id} received >95% of all votes cast.`,
              severity: 'warning'
            });
            break;
          }
        }
      }

      // If anomalies found, insert them and flag the submission
      if (anomalies.length > 0) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // Flag the submission
          await connection.query(
            "UPDATE result_submissions SET is_anomalous = TRUE, status = 'flagged' WHERE id = ?",
            [submissionId]
          );

          // Insert anomalies
          for (const anomaly of anomalies) {
            await connection.query(
              'INSERT INTO anomalies (submission_id, type, detail, severity) VALUES (?, ?, ?, ?)',
              [submissionId, anomaly.type, anomaly.detail, anomaly.severity]
            );
          }

          await connection.commit();
          logger.warn(`Anomalies detected and logged for submission ${submissionId}`);
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      }

      return anomalies;
    } catch (error) {
      logger.error(`Error analyzing result for anomalies: ${error.message}`);
      // Do not throw, we don't want to break the submission flow if anomaly detection fails
      return [];
    }
  }

  static async listAnomalies(page = 1, limit = 20, status = null) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        a.id, a.submission_id, a.type, a.detail, a.severity, a.status, a.created_at,
        rs.submission_uid,
        pu.name as polling_unit_name,
        w.name as ward_name,
        l.name as lga_name
      FROM anomalies a
      JOIN result_submissions rs ON a.submission_id = rs.id
      JOIN polling_units pu ON rs.polling_unit_id = pu.id
      JOIN wards w ON rs.ward_id = w.id
      JOIN lgas l ON rs.lga_id = l.id
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM anomalies a';
    const queryParams = [];

    if (status) {
      query += ' WHERE a.status = ?';
      countQuery += ' WHERE a.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    
    const [rows] = await pool.query(query, [...queryParams, limit, offset]);
    const [countRows] = await pool.query(countQuery, queryParams);
    
    return {
      data: rows,
      total: Number(countRows[0]?.total || 0)
    };
  }

  static async resolveAnomaly(id, status, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [anomalies] = await connection.query(
        'SELECT id, submission_id, status FROM anomalies WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!anomalies.length) throw new Error('Anomaly not found');

      await connection.query(
        'UPDATE anomalies SET status = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ?',
        [status, userId, id]
      );

      const submissionId = anomalies[0].submission_id;
      const [openAnomalies] = await connection.query(
        "SELECT id FROM anomalies WHERE submission_id = ? AND status = 'open'",
        [submissionId]
      );

      if (openAnomalies.length === 0) {
        await connection.query(
          "UPDATE result_submissions SET is_anomalous = FALSE, status = CASE WHEN status = 'flagged' THEN 'pending' ELSE status END WHERE id = ?",
          [submissionId]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = AnomalyService;
