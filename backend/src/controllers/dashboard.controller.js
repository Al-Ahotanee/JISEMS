const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');

// State Dashboard — all 11 LGAs overview
const getStateDashboard = async (req, res) => {
  try {
    const { election_id } = req.query;
    const cacheKey = `state_dash_${election_id || 'latest'}`;
    const cached = cache.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached);

    // Get the requested election, otherwise the most recent ongoing election.
    let electionQuery = "SELECT id, title, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1";
    let electionParams = [];
    if (election_id) {
      electionQuery = 'SELECT id, title, election_date, status FROM elections WHERE id = ?';
      electionParams = [Number.parseInt(election_id, 10)];
    }
    const [elections] = await pool.query(electionQuery, electionParams);
    if (!elections.length) return ApiResponse.notFound(res, 'No active election found');
    const election = elections[0];

    // Get candidates
    const [candidates] = await pool.query(
      `SELECT c.id, c.full_name, c.party_code, c.party_name, c.photo_url,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY c.position`,
      [election.id, election.id]
    );
    const totalVerifiedVotes = candidates.reduce((s, c) => s + Number(c.total_votes), 0);
    const candidateResults = candidates.map(c => ({
      ...c,
      total_votes: Number(c.total_votes || 0),
      vote_percentage: totalVerifiedVotes > 0 ? Number(((Number(c.total_votes || 0) / totalVerifiedVotes) * 100).toFixed(2)) : 0
    }));

    // Get LGA breakdown
    const [lgaData] = await pool.query(
      `SELECT l.id as lga_id, l.name as lga_name,
              (SELECT COUNT(*) FROM wards WHERE lga_id = l.id) as total_wards,
              (SELECT COUNT(*) FROM polling_units WHERE lga_id = l.id) as total_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE lga_id = l.id AND election_id = ? AND status <> 'rejected') as reported_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE lga_id = l.id AND election_id = ? AND status = 'verified') as verified_polling_units,
              (SELECT COALESCE(SUM(pu.registered_voters), 0) FROM polling_units pu WHERE pu.lga_id = l.id) as registered_voters
       FROM lgas l ORDER BY l.name`,
      [election.id, election.id]
    );

    // Get per-LGA candidate votes.
    for (const lga of lgaData) {
      lga.total_wards = Number(lga.total_wards || 0);
      lga.total_polling_units = Number(lga.total_polling_units || 0);
      lga.reported_polling_units = Number(lga.reported_polling_units || 0);
      lga.verified_polling_units = Number(lga.verified_polling_units || 0);
      lga.registered_voters = Number(lga.registered_voters || 0);
      const [lgaCandidates] = await pool.query(
        `SELECT c.id as candidate_id, c.full_name, c.party_code, c.party_name,
                COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
         FROM candidates c
         LEFT JOIN vote_data vd ON vd.candidate_id = c.id
         LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.lga_id = ? AND rs.status = 'verified' AND rs.election_id = ?
         WHERE c.election_id = ?
         GROUP BY c.id ORDER BY c.position`,
        [lga.lga_id, election.id, election.id]
      );
      lga.candidates = lgaCandidates.map(c => ({ ...c, total_votes: Number(c.total_votes) }));
      lga.reporting_percentage = lga.total_polling_units > 0 ? Number(((lga.reported_polling_units / lga.total_polling_units) * 100).toFixed(1)) : 0;
    }

    // Totals
    const totalPUs = lgaData.reduce((s, l) => s + l.total_polling_units, 0);
    const reportedPUs = lgaData.reduce((s, l) => s + l.reported_polling_units, 0);
    const verifiedPUs = lgaData.reduce((s, l) => s + l.verified_polling_units, 0);
    const totalRegistered = lgaData.reduce((s, l) => s + Number(l.registered_voters), 0);

    const [votesCast] = await pool.query(
      "SELECT COALESCE(SUM(total_votes_cast), 0) AS total FROM result_submissions WHERE election_id = ? AND status = 'verified'",
      [election.id]
    );

    const data = {
      election,
      total_lgas: lgaData.length,
      total_wards: lgaData.reduce((s, l) => s + l.total_wards, 0),
      total_polling_units: totalPUs,
      reported_polling_units: reportedPUs,
      verified_polling_units: verifiedPUs,
      total_registered_voters: totalRegistered,
      total_votes_cast: Number(votesCast[0].total),
      turnout_percentage: totalRegistered > 0 ? Number(((Number(votesCast[0]?.total || 0) / totalRegistered) * 100).toFixed(2)) : 0,
      candidates: candidateResults,
      lgas: lgaData
    };

    cache.set(cacheKey, data, 30);
    return ApiResponse.success(res, data);
  } catch (error) {
    logger.error('State dashboard error:', error);
    return ApiResponse.error(res, 'Failed to load state dashboard');
  }
};

// LGA Dashboard
const getLGADashboard = async (req, res) => {
  try {
    const lgaId = Number.parseInt(req.params.id, 10);
    const { election_id } = req.query;

    const [lgas] = await pool.query('SELECT id, name, state_id FROM lgas WHERE id = ?', [lgaId]);
    if (!lgas.length) return ApiResponse.notFound(res, 'LGA not found');

    let electionQuery = "SELECT id, title, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1";
    let electionParams = [];
    if (election_id) {
      electionQuery = 'SELECT id, title, election_date, status FROM elections WHERE id = ?';
      electionParams = [Number.parseInt(election_id, 10)];
    }
    const [elections] = await pool.query(electionQuery, electionParams);
    if (!elections.length) return ApiResponse.notFound(res, 'No active election');
    const election = elections[0];

    const [wards] = await pool.query(
      `SELECT w.id as ward_id, w.name as ward_name,
              (SELECT COUNT(*) FROM polling_units WHERE ward_id = w.id) as total_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE ward_id = w.id AND election_id = ? AND status <> 'rejected') as reported_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE ward_id = w.id AND election_id = ? AND status = 'verified') as verified_polling_units
       FROM wards w WHERE w.lga_id = ? ORDER BY w.name`,
      [election.id, election.id, lgaId]
    );

    for (const ward of wards) {
      ward.total_polling_units = Number(ward.total_polling_units || 0);
      ward.reported_polling_units = Number(ward.reported_polling_units || 0);
      ward.verified_polling_units = Number(ward.verified_polling_units || 0);
      ward.reporting_percentage = ward.total_polling_units > 0
        ? Number(((ward.reported_polling_units / ward.total_polling_units) * 100).toFixed(1)) : 0;
    }

    const [candidates] = await pool.query(
      `SELECT c.id as candidate_id, c.full_name, c.party_code, c.party_name,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.lga_id = ? AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY c.position`,
      [lgaId, election.id, election.id]
    );

    return ApiResponse.success(res, {
      lga: lgas[0],
      election,
      wards,
      candidates: candidates.map(c => ({ ...c, total_votes: Number(c.total_votes) }))
    });
  } catch (error) {
    logger.error('LGA dashboard error:', error);
    return ApiResponse.error(res, 'Failed to load LGA dashboard');
  }
};

// Ward Dashboard
const getWardDashboard = async (req, res) => {
  try {
    const wardId = Number.parseInt(req.params.id, 10);
    const { election_id } = req.query;

    const [wards] = await pool.query(
      `SELECT w.*, l.name as lga_name FROM wards w JOIN lgas l ON l.id = w.lga_id WHERE w.id = ?`,
      [wardId]
    );
    if (!wards.length) return ApiResponse.notFound(res, 'Ward not found');

    let electionQuery = "SELECT id, title, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1";
    let electionParams = [];
    if (election_id) {
      electionQuery = 'SELECT id, title, election_date, status FROM elections WHERE id = ?';
      electionParams = [Number.parseInt(election_id, 10)];
    }
    const [elections] = await pool.query(electionQuery, electionParams);
    if (!elections.length) return ApiResponse.notFound(res, 'No active election');
    const election = elections[0];

    const [pus] = await pool.query(
      `SELECT pu.id, pu.name, pu.inec_pu_code, pu.registered_voters,
              rs.id as submission_id, rs.submission_uid, rs.status, rs.total_votes_cast,
              rs.accredited_voters, rs.created_at as submitted_at
       FROM polling_units pu
       LEFT JOIN result_submissions rs ON rs.polling_unit_id = pu.id AND rs.election_id = ?
       WHERE pu.ward_id = ? ORDER BY pu.inec_pu_code`,
      [election.id, wardId]
    );

    return ApiResponse.success(res, {
      ward: wards[0],
      election,
      polling_units: pus
    });
  } catch (error) {
    logger.error('Ward dashboard error:', error);
    return ApiResponse.error(res, 'Failed to load ward dashboard');
  }
};

// Anomalies Detection
const getAnomalies = async (req, res) => {
  try {
    const { election_id } = req.query;
    let electionFilter = "AND rs.election_id = (SELECT id FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1)";
    if (election_id && Number.isInteger(Number.parseInt(election_id, 10))) {
      electionFilter = `AND rs.election_id = ${Number.parseInt(election_id, 10)}`;
    }

    const [anomalies] = await pool.query(
      `SELECT rs.id as submission_id, rs.submission_uid, rs.total_votes_cast, rs.accredited_voters,
              pu.name as polling_unit_name, pu.registered_voters,
              w.name as ward_name, l.name as lga_name
       FROM result_submissions rs
       JOIN polling_units pu ON pu.id = rs.polling_unit_id
       JOIN wards w ON w.id = rs.ward_id
       JOIN lgas l ON l.id = rs.lga_id
       WHERE (rs.total_votes_cast > pu.registered_voters
              OR rs.accredited_voters > pu.registered_voters
              OR rs.total_votes_cast > rs.accredited_voters)
       ${electionFilter}
       ORDER BY rs.created_at DESC LIMIT 50`
    );

    const results = anomalies.map(a => {
      const types = [];
      if (a.total_votes_cast > a.registered_voters) types.push('votes_exceed_registered');
      if (a.accredited_voters > a.registered_voters) types.push('accredited_exceed_registered');
      if (a.total_votes_cast > a.accredited_voters) types.push('votes_exceed_accredited');
      return {
        submission_id: a.submission_id,
        submission_uid: a.submission_uid,
        polling_unit_name: a.polling_unit_name,
        ward_name: a.ward_name,
        lga_name: a.lga_name,
        type: types.join(', '),
        detail: `Votes: ${a.total_votes_cast}, Accredited: ${a.accredited_voters}, Registered: ${a.registered_voters}`,
        severity: a.total_votes_cast > a.registered_voters ? 'critical' : 'warning'
      };
    });

    return ApiResponse.success(res, results);
  } catch (error) {
    logger.error('Anomalies error:', error);
    return ApiResponse.error(res, 'Failed to load anomalies');
  }
};

// Timeline — submissions per hour
const getTimeline = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS hour, COUNT(*)::INTEGER AS count
       FROM result_submissions
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY date_trunc('hour', created_at) ORDER BY date_trunc('hour', created_at)`
    );
    return ApiResponse.success(res, rows);
  } catch (error) {
    logger.error('Timeline error:', error);
    return ApiResponse.error(res, 'Failed to load timeline');
  }
};

module.exports = { getStateDashboard, getLGADashboard, getWardDashboard, getAnomalies, getTimeline };
