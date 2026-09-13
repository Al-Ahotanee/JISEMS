const { pool, cache } = require('../config/database');
const ApiResponse = require('../utils/response');
const logger = require('../utils/logger');
const JIGAWA_GEO = require('../data/jigawa-geo');

function getConstituencyLgas(election) {
  if (!election || election.constituency_type === 'statewide') return null;
  if (election.constituency_type === 'senatorial') {
    const dist = JIGAWA_GEO.senatorialDistricts.find(d => d.name === election.constituency_name);
    return dist ? new Set(dist.lgas) : null;
  }
  if (election.constituency_type === 'federal_constituency') {
    const fed = JIGAWA_GEO.federalConstituencies.find(f => f.name === election.constituency_name);
    return fed ? new Set(fed.lgas) : null;
  }
  if (election.constituency_type === 'state_assembly') {
    const lga = JIGAWA_GEO.lgas.find(l => l.stateConstituency === election.constituency_name || l.name === election.constituency_name);
    return lga ? new Set([lga.name]) : null;
  }
  return null;
}

// Public Situation Room — NO AUTH required
const getSituationRoom = async (req, res) => {
  try {
    const requestedElectionId = req.query.election_id ? parseInt(req.query.election_id) : null;
    const cacheKey = requestedElectionId ? `situation_room_${requestedElectionId}` : 'situation_room_default';
    const cached = cache.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached);

    let election = null;
    if (requestedElectionId) {
      const [found] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE id = ?', [requestedElectionId]);
      if (found.length) election = found[0];
    }
    if (!election) {
      let [elections] = await pool.query("SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY id ASC LIMIT 1");
      if (!elections.length) {
        const [latest] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections ORDER BY election_date DESC LIMIT 1');
        if (!latest.length) return ApiResponse.notFound(res, 'No election found');
        election = latest[0];
      } else {
        election = elections[0];
      }
    }

    const [availableElections] = await pool.query(
      "SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections ORDER BY id ASC"
    );

    const constituencyLgas = getConstituencyLgas(election);

    const [puStats] = await pool.query('SELECT COUNT(*) as total FROM polling_units');
    const [reportedStats] = await pool.query(
      `SELECT COUNT(*) AS total FROM result_submissions
       WHERE election_id = ? AND status <> 'rejected'`, [election.id]
    );
    const [verifiedStats] = await pool.query(
      `SELECT COUNT(*) AS total FROM result_submissions
       WHERE election_id = ? AND status = 'verified'`, [election.id]
    );
    const [regVoters] = await pool.query('SELECT COALESCE(SUM(registered_voters), 0) as total FROM polling_units');

    // Comprehensive State-Wide Vote Metrics
    const [submissionAggregates] = await pool.query(
      `SELECT
         COALESCE(SUM(accredited_voters), 0) AS total_accredited_voters,
         COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
         COALESCE(SUM(total_valid_votes), 0) AS total_valid_votes,
         COALESCE(SUM(rejected_votes), 0) AS total_rejected_votes
       FROM result_submissions
       WHERE election_id = ? AND status = 'verified'`,
      [election.id]
    );

    const totalRegVoters = Number(regVoters[0]?.total || 0);
    const totalAccreditedVoters = Number(submissionAggregates[0]?.total_accredited_voters || 0);
    const totalVotesCast = Number(submissionAggregates[0]?.total_votes_cast || 0);
    const totalValidVotes = Number(submissionAggregates[0]?.total_valid_votes || 0);
    const totalRejectedVotes = Number(submissionAggregates[0]?.total_rejected_votes || 0);

    const [candidates] = await pool.query(
      `SELECT c.id as candidate_id, c.full_name, c.party_code, c.party_name, c.photo_url,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY total_votes DESC`,
      [election.id, election.id]
    );

    const validDenom = totalValidVotes > 0 ? totalValidVotes : totalVotesCast;
    const candidateResults = candidates.map(c => ({
      ...c,
      total_votes: Number(c.total_votes),
      vote_percentage: validDenom > 0 ? Number(((Number(c.total_votes) / validDenom) * 100).toFixed(2)) : 0
    }));

    // LGA breakdown with full granular metrics
    const [lgaBreakdown] = await pool.query(
      `SELECT l.id as lga_id, l.name as lga_name, l.code as lga_code, l.latitude, l.longitude,
              (SELECT COUNT(*) FROM polling_units WHERE lga_id = l.id) as total_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE lga_id = l.id AND election_id = ? AND status <> 'rejected') as reported_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE lga_id = l.id AND election_id = ? AND status = 'verified') as verified_polling_units,
              (SELECT COALESCE(SUM(registered_voters), 0) FROM polling_units WHERE lga_id = l.id) as total_registered_voters
       FROM lgas l ORDER BY l.name`,
      [election.id, election.id]
    );

    for (const lga of lgaBreakdown) {
      lga.total_polling_units = Number(lga.total_polling_units || 0);
      lga.reported_polling_units = Number(lga.reported_polling_units || 0);
      lga.verified_polling_units = Number(lga.verified_polling_units || 0);
      lga.total_registered_voters = Number(lga.total_registered_voters || 0);

      const [lgaAggs] = await pool.query(
        `SELECT
           COALESCE(SUM(accredited_voters), 0) AS accredited_voters,
           COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
           COALESCE(SUM(total_valid_votes), 0) AS total_valid_votes,
           COALESCE(SUM(rejected_votes), 0) AS rejected_votes
         FROM result_submissions
         WHERE election_id = ? AND lga_id = ? AND status = 'verified'`,
        [election.id, lga.lga_id]
      );
      const lgaAgg = lgaAggs[0] || {};
      lga.total_accredited_voters = Number(lgaAgg.accredited_voters || 0);
      lga.total_votes_cast = Number(lgaAgg.total_votes_cast || 0);
      lga.total_valid_votes = Number(lgaAgg.total_valid_votes || 0);
      lga.rejected_votes = Number(lgaAgg.rejected_votes || 0);

      lga.reporting_percentage = lga.total_polling_units > 0
        ? Number(((lga.reported_polling_units / lga.total_polling_units) * 100).toFixed(1)) : 0;
      lga.turnout_percentage = lga.total_registered_voters > 0
        ? Number(((lga.total_votes_cast / lga.total_registered_voters) * 100).toFixed(2)) : 0;
      lga.accreditation_percentage = lga.total_registered_voters > 0
        ? Number(((lga.total_accredited_voters / lga.total_registered_voters) * 100).toFixed(2)) : 0;

      const [lgaCands] = await pool.query(
        `SELECT c.id as candidate_id, c.full_name, c.party_code,
                COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
         FROM candidates c
         LEFT JOIN vote_data vd ON vd.candidate_id = c.id
         LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.lga_id = ? AND rs.status = 'verified' AND rs.election_id = ?
         WHERE c.election_id = ? GROUP BY c.id ORDER BY total_votes DESC`,
        [lga.lga_id, election.id, election.id]
      );
      const lgaValid = lga.total_valid_votes > 0 ? lga.total_valid_votes : lga.total_votes_cast;
      lga.candidates = lgaCands.map(c => ({
        ...c,
        total_votes: Number(c.total_votes || 0),
        vote_percentage: lgaValid > 0 ? Number(((Number(c.total_votes || 0) / lgaValid) * 100).toFixed(2)) : 0
      }));

      const top1 = lga.candidates[0];
      const top2 = lga.candidates[1];
      lga.leading_party = top1 && top1.total_votes > 0 ? top1.party_code : 'N/A';
      lga.leading_candidate = top1 && top1.total_votes > 0 ? top1.full_name : 'N/A';
      lga.lead_margin = top1 && top2 ? Number(top1.total_votes || 0) - Number(top2.total_votes || 0) : Number(top1?.total_votes || 0);
    }

    const leader = candidateResults[0];
    const runnerUp = candidateResults[1];
    const leadMargin = leader && runnerUp ? Number(leader.total_votes || 0) - Number(runnerUp.total_votes || 0) : Number(leader?.total_votes || 0);

    const totalLGAs = lgaBreakdown.length;
    const reportedLGAs = lgaBreakdown.filter(l => l.reported_polling_units > 0).length;
    const verifiedLGAs = lgaBreakdown.filter(l => l.verified_polling_units > 0).length;

    const data = {
      election,
      available_elections: availableElections,
      candidates: candidateResults,
      total_lgas: totalLGAs,
      reported_lgas: reportedLGAs,
      verified_lgas: verifiedLGAs,
      total_polling_units: Number(puStats[0].total || 0),
      reported_polling_units: Number(reportedStats[0].total || 0),
      verified_polling_units: Number(verifiedStats[0].total || 0),
      total_registered_voters: totalRegVoters,
      total_accredited_voters: totalAccreditedVoters,
      total_votes_cast: totalVotesCast,
      total_valid_votes: totalValidVotes,
      rejected_votes: totalRejectedVotes,
      accreditation_percentage: totalRegVoters > 0
        ? Number(((totalAccreditedVoters / totalRegVoters) * 100).toFixed(2)) : 0,
      turnout_percentage: totalRegVoters > 0
        ? Number(((totalVotesCast / totalRegVoters) * 100).toFixed(2)) : 0,
      valid_vote_percentage: totalVotesCast > 0
        ? Number(((totalValidVotes / totalVotesCast) * 100).toFixed(2)) : 0,
      rejected_vote_percentage: totalVotesCast > 0
        ? Number(((totalRejectedVotes / totalVotesCast) * 100).toFixed(2)) : 0,
      reporting_percentage: puStats[0].total > 0
        ? Number(((reportedStats[0].total / puStats[0].total) * 100).toFixed(1)) : 0,
      leading_party: leader && leader.total_votes > 0 ? leader.party_code : 'N/A',
      leading_candidate: leader && leader.total_votes > 0 ? leader.full_name : 'N/A',
      lead_margin: leadMargin,
      lga_breakdown: lgaBreakdown,
      last_updated: new Date().toISOString()
    };

    cache.set(cacheKey, data, 15);
    return ApiResponse.success(res, data);
  } catch (error) {
    logger.error('Situation room error:', error);
    return ApiResponse.error(res, 'Failed to load situation room data');
  }
};

const getSituationRoomLGA = async (req, res) => {
  try {
    const lgaId = parseInt(req.params.id);
    const [lgas] = await pool.query('SELECT id, name, code, state_id, latitude, longitude FROM lgas WHERE id = ?', [lgaId]);
    if (!lgas.length) return ApiResponse.notFound(res, 'LGA not found');
    const lga = lgas[0];

    const requestedElectionId = req.query.election_id ? parseInt(req.query.election_id) : null;
    let election = null;
    if (requestedElectionId) {
      const [found] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE id = ?', [requestedElectionId]);
      if (found.length) election = found[0];
    }
    if (!election) {
      let [elections] = await pool.query("SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1");
      if (!elections.length) {
        const [latest] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections ORDER BY election_date DESC LIMIT 1');
        if (!latest.length) return ApiResponse.notFound(res, 'No election found');
        election = latest[0];
      } else {
        election = elections[0];
      }
    }

    // LGA Top-Level Totals
    const [lgaRegVoters] = await pool.query(
      'SELECT COALESCE(SUM(registered_voters), 0) AS total_registered_voters FROM polling_units WHERE lga_id = ?',
      [lgaId]
    );
    const [lgaVerifiedAgg] = await pool.query(
      `SELECT
         COALESCE(SUM(accredited_voters), 0) AS total_accredited_voters,
         COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
         COALESCE(SUM(total_valid_votes), 0) AS total_valid_votes,
         COALESCE(SUM(rejected_votes), 0) AS total_rejected_votes
       FROM result_submissions
       WHERE election_id = ? AND lga_id = ? AND status = 'verified'`,
      [election.id, lgaId]
    );

    const [puCounts] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM polling_units WHERE lga_id = ?) AS total_polling_units,
         (SELECT COUNT(*) FROM result_submissions WHERE lga_id = ? AND election_id = ? AND status <> 'rejected') AS reported_polling_units,
         (SELECT COUNT(*) FROM result_submissions WHERE lga_id = ? AND election_id = ? AND status = 'verified') AS verified_polling_units`,
      [lgaId, lgaId, election.id, lgaId, election.id]
    );

    const totalReg = Number(lgaRegVoters[0]?.total_registered_voters || 0);
    const totalAccred = Number(lgaVerifiedAgg[0]?.total_accredited_voters || 0);
    const totalCast = Number(lgaVerifiedAgg[0]?.total_votes_cast || 0);
    const totalValid = Number(lgaVerifiedAgg[0]?.total_valid_votes || 0);
    const totalRejected = Number(lgaVerifiedAgg[0]?.total_rejected_votes || 0);
    const totalPUs = Number(puCounts[0]?.total_polling_units || 0);
    const reportedPUs = Number(puCounts[0]?.reported_polling_units || 0);
    const verifiedPUs = Number(puCounts[0]?.verified_polling_units || 0);

    // Candidates in this LGA
    const [candidates] = await pool.query(
      `SELECT c.id as candidate_id, c.full_name, c.party_code, c.party_name, c.photo_url,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.lga_id = ? AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ? GROUP BY c.id ORDER BY total_votes DESC`,
      [lgaId, election.id, election.id]
    );

    const validDenom = totalValid > 0 ? totalValid : totalCast;
    const candidateResults = candidates.map(c => ({
      ...c,
      total_votes: Number(c.total_votes || 0),
      vote_percentage: validDenom > 0 ? Number(((Number(c.total_votes || 0) / validDenom) * 100).toFixed(2)) : 0
    }));

    // Wards in this LGA
    const [wardRows] = await pool.query(
      `SELECT w.id AS ward_id, w.name AS ward_name, w.code AS ward_code,
              (SELECT COUNT(*) FROM polling_units WHERE ward_id = w.id) AS total_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE ward_id = w.id AND election_id = ? AND status <> 'rejected') AS reported_polling_units,
              (SELECT COUNT(*) FROM result_submissions WHERE ward_id = w.id AND election_id = ? AND status = 'verified') AS verified_polling_units,
              (SELECT COALESCE(SUM(registered_voters), 0) FROM polling_units WHERE ward_id = w.id) AS total_registered_voters
       FROM wards w WHERE w.lga_id = ? ORDER BY w.name`,
      [election.id, election.id, lgaId]
    );

    const enrichedWards = [];
    for (const w of wardRows) {
      const [wardAgg] = await pool.query(
        `SELECT
           COALESCE(SUM(accredited_voters), 0) AS accredited_voters,
           COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
           COALESCE(SUM(total_valid_votes), 0) AS total_valid_votes,
           COALESCE(SUM(rejected_votes), 0) AS rejected_votes
         FROM result_submissions
         WHERE election_id = ? AND ward_id = ? AND status = 'verified'`,
        [election.id, w.ward_id]
      );
      const wAgg = wardAgg[0] || {};
      const wTotalPUs = Number(w.total_polling_units || 0);
      const wReportedPUs = Number(w.reported_polling_units || 0);
      const wVerifiedPUs = Number(w.verified_polling_units || 0);
      const wReg = Number(w.total_registered_voters || 0);
      const wAccred = Number(wAgg.accredited_voters || 0);
      const wCast = Number(wAgg.total_votes_cast || 0);
      const wValid = Number(wAgg.total_valid_votes || 0);
      const wRej = Number(wAgg.rejected_votes || 0);

      // Ward top candidate
      const [wardCands] = await pool.query(
        `SELECT c.party_code, c.full_name,
                COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
         FROM candidates c
         LEFT JOIN vote_data vd ON vd.candidate_id = c.id
         LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.ward_id = ? AND rs.status = 'verified' AND rs.election_id = ?
         WHERE c.election_id = ? GROUP BY c.id ORDER BY total_votes DESC LIMIT 1`,
        [w.ward_id, election.id, election.id]
      );
      const topCand = wardCands[0];

      enrichedWards.push({
        ward_id: w.ward_id,
        ward_name: w.ward_name,
        ward_code: w.ward_code,
        total_polling_units: wTotalPUs,
        reported_polling_units: wReportedPUs,
        verified_polling_units: wVerifiedPUs,
        total_registered_voters: wReg,
        total_accredited_voters: wAccred,
        total_votes_cast: wCast,
        total_valid_votes: wValid,
        rejected_votes: wRej,
        reporting_percentage: wTotalPUs > 0 ? Number(((wReportedPUs / wTotalPUs) * 100).toFixed(1)) : 0,
        turnout_percentage: wReg > 0 ? Number(((wCast / wReg) * 100).toFixed(2)) : 0,
        accreditation_percentage: wReg > 0 ? Number(((wAccred / wReg) * 100).toFixed(2)) : 0,
        leading_party: topCand && topCand.total_votes > 0 ? topCand.party_code : 'N/A',
        leading_candidate: topCand && topCand.total_votes > 0 ? topCand.full_name : 'N/A',
      });
    }

    const leader = candidateResults[0];
    const runnerUp = candidateResults[1];
    const margin = leader && runnerUp ? Number(leader.total_votes || 0) - Number(runnerUp.total_votes || 0) : Number(leader?.total_votes || 0);

    const totalWards = enrichedWards.length;
    const reportedWards = enrichedWards.filter(w => w.reported_polling_units > 0).length;
    const verifiedWards = enrichedWards.filter(w => w.verified_polling_units > 0).length;

    return ApiResponse.success(res, {
      lga,
      election,
      candidates: candidateResults,
      wards: enrichedWards,
      total_wards: totalWards,
      reported_wards: reportedWards,
      verified_wards: verifiedWards,
      total_polling_units: totalPUs,
      reported_polling_units: reportedPUs,
      verified_polling_units: verifiedPUs,
      total_registered_voters: totalReg,
      total_accredited_voters: totalAccred,
      total_votes_cast: totalCast,
      total_valid_votes: totalValid,
      rejected_votes: totalRejected,
      accreditation_percentage: totalReg > 0 ? Number(((totalAccred / totalReg) * 100).toFixed(2)) : 0,
      turnout_percentage: totalReg > 0 ? Number(((totalCast / totalReg) * 100).toFixed(2)) : 0,
      valid_vote_percentage: totalCast > 0 ? Number(((totalValid / totalCast) * 100).toFixed(2)) : 0,
      rejected_vote_percentage: totalCast > 0 ? Number(((totalRejected / totalCast) * 100).toFixed(2)) : 0,
      reporting_percentage: totalPUs > 0 ? Number(((reportedPUs / totalPUs) * 100).toFixed(1)) : 0,
      lead_margin: margin,
      leading_party: leader && leader.total_votes > 0 ? leader.party_code : 'N/A',
      leading_candidate: leader && leader.total_votes > 0 ? leader.full_name : 'N/A',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Situation room LGA error:', error);
    return ApiResponse.error(res, 'Failed to load LGA data');
  }
};

// Public Situation Room Ward & Polling Units breakdown
const getSituationRoomWard = async (req, res) => {
  try {
    const wardId = parseInt(req.params.id);
    const [wards] = await pool.query(
      `SELECT w.id, w.name, w.code, w.lga_id, l.name as lga_name, l.code as lga_code
       FROM wards w
       JOIN lgas l ON l.id = w.lga_id
       WHERE w.id = ?`,
      [wardId]
    );
    if (!wards.length) return ApiResponse.notFound(res, 'Ward not found');
    const ward = wards[0];

    const requestedElectionId = req.query.election_id ? parseInt(req.query.election_id) : null;
    let election = null;
    if (requestedElectionId) {
      const [found] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE id = ?', [requestedElectionId]);
      if (found.length) election = found[0];
    }
    if (!election) {
      let [elections] = await pool.query("SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections WHERE status = 'ongoing' ORDER BY election_date DESC LIMIT 1");
      if (!elections.length) {
        const [latest] = await pool.query('SELECT id, title, election_type, constituency_type, constituency_name, election_date, status FROM elections ORDER BY election_date DESC LIMIT 1');
        if (!latest.length) return ApiResponse.notFound(res, 'No election found');
        election = latest[0];
      } else {
        election = elections[0];
      }
    }

    // Ward Registered Voters
    const [wardReg] = await pool.query(
      'SELECT COALESCE(SUM(registered_voters), 0) AS total_registered_voters FROM polling_units WHERE ward_id = ?',
      [wardId]
    );

    // Ward Aggregated Verified Votes
    const [wardVerifiedAgg] = await pool.query(
      `SELECT
         COALESCE(SUM(accredited_voters), 0) AS total_accredited_voters,
         COALESCE(SUM(total_votes_cast), 0) AS total_votes_cast,
         COALESCE(SUM(total_valid_votes), 0) AS total_valid_votes,
         COALESCE(SUM(rejected_votes), 0) AS total_rejected_votes
       FROM result_submissions
       WHERE election_id = ? AND ward_id = ? AND status = 'verified'`,
      [election.id, wardId]
    );

    const [puCounts] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM polling_units WHERE ward_id = ?) AS total_polling_units,
         (SELECT COUNT(*) FROM result_submissions WHERE ward_id = ? AND election_id = ? AND status <> 'rejected') AS reported_polling_units,
         (SELECT COUNT(*) FROM result_submissions WHERE ward_id = ? AND election_id = ? AND status = 'verified') AS verified_polling_units`,
      [wardId, wardId, election.id, wardId, election.id]
    );

    const totalReg = Number(wardReg[0]?.total_registered_voters || 0);
    const totalAccred = Number(wardVerifiedAgg[0]?.total_accredited_voters || 0);
    const totalCast = Number(wardVerifiedAgg[0]?.total_votes_cast || 0);
    const totalValid = Number(wardVerifiedAgg[0]?.total_valid_votes || 0);
    const totalRejected = Number(wardVerifiedAgg[0]?.total_rejected_votes || 0);
    const totalPUs = Number(puCounts[0]?.total_polling_units || 0);
    const reportedPUs = Number(puCounts[0]?.reported_polling_units || 0);
    const verifiedPUs = Number(puCounts[0]?.verified_polling_units || 0);

    // Ward Candidate Totals
    const [candidates] = await pool.query(
      `SELECT c.id as candidate_id, c.full_name, c.party_code, c.party_name, c.photo_url,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) as total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.ward_id = ? AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ? GROUP BY c.id ORDER BY total_votes DESC`,
      [wardId, election.id, election.id]
    );

    const validDenom = totalValid > 0 ? totalValid : totalCast;
    const candidateResults = candidates.map(c => ({
      ...c,
      total_votes: Number(c.total_votes || 0),
      vote_percentage: validDenom > 0 ? Number(((Number(c.total_votes || 0) / validDenom) * 100).toFixed(2)) : 0
    }));

    // Polling Units in this Ward with submission details and candidate votes
    const [puRows] = await pool.query(
      `SELECT pu.id, pu.name, pu.inec_pu_code, pu.registered_voters, pu.latitude, pu.longitude,
              rs.id as submission_id, rs.submission_uid, rs.status as submission_status,
              rs.accredited_voters, rs.total_votes_cast, rs.total_valid_votes, rs.rejected_votes,
              rs.created_at as submitted_at, rs.verified_at
       FROM polling_units pu
       LEFT JOIN result_submissions rs ON rs.polling_unit_id = pu.id AND rs.election_id = ? AND rs.status <> 'rejected'
       WHERE pu.ward_id = ? ORDER BY pu.inec_pu_code`,
      [election.id, wardId]
    );

    const enrichedPUs = [];
    for (const pu of puRows) {
      let puVotes = [];
      if (pu.submission_id) {
        const [vData] = await pool.query(
          `SELECT vd.candidate_id, vd.votes, c.party_code, c.full_name
           FROM vote_data vd
           JOIN candidates c ON c.id = vd.candidate_id
           WHERE vd.submission_id = ? ORDER BY vd.votes DESC`,
          [pu.submission_id]
        );
        puVotes = vData.map(v => ({
          candidate_id: v.candidate_id,
          party_code: v.party_code,
          full_name: v.full_name,
          votes: Number(v.votes || 0)
        }));
      }

      const puLeader = puVotes[0];
      const puReg = Number(pu.registered_voters || 0);
      const puCast = Number(pu.total_votes_cast || 0);

      enrichedPUs.push({
        id: pu.id,
        name: pu.name,
        inec_pu_code: pu.inec_pu_code,
        registered_voters: puReg,
        submission_id: pu.submission_id || null,
        submission_uid: pu.submission_uid || null,
        status: pu.submission_status || 'not_reported',
        accredited_voters: pu.accredited_voters !== null ? Number(pu.accredited_voters) : null,
        total_votes_cast: pu.total_votes_cast !== null ? Number(pu.total_votes_cast) : null,
        total_valid_votes: pu.total_valid_votes !== null ? Number(pu.total_valid_votes) : null,
        rejected_votes: pu.rejected_votes !== null ? Number(pu.rejected_votes) : null,
        turnout_percentage: puReg > 0 && puCast > 0 ? Number(((puCast / puReg) * 100).toFixed(2)) : 0,
        submitted_at: pu.submitted_at || null,
        verified_at: pu.verified_at || null,
        leading_party: puLeader && puLeader.votes > 0 ? puLeader.party_code : 'N/A',
        leading_candidate: puLeader && puLeader.votes > 0 ? puLeader.full_name : 'N/A',
        votes: puVotes
      });
    }

    const leader = candidateResults[0];
    const runnerUp = candidateResults[1];
    const margin = leader && runnerUp ? Number(leader.total_votes || 0) - Number(runnerUp.total_votes || 0) : Number(leader?.total_votes || 0);

    return ApiResponse.success(res, {
      ward,
      election,
      candidates: candidateResults,
      polling_units: enrichedPUs,
      total_polling_units: totalPUs,
      reported_polling_units: reportedPUs,
      verified_polling_units: verifiedPUs,
      total_registered_voters: totalReg,
      total_accredited_voters: totalAccred,
      total_votes_cast: totalCast,
      total_valid_votes: totalValid,
      rejected_votes: totalRejected,
      accreditation_percentage: totalReg > 0 ? Number(((totalAccred / totalReg) * 100).toFixed(2)) : 0,
      turnout_percentage: totalReg > 0 ? Number(((totalCast / totalReg) * 100).toFixed(2)) : 0,
      valid_vote_percentage: totalCast > 0 ? Number(((totalValid / totalCast) * 100).toFixed(2)) : 0,
      rejected_vote_percentage: totalCast > 0 ? Number(((totalRejected / totalCast) * 100).toFixed(2)) : 0,
      reporting_percentage: totalPUs > 0 ? Number(((reportedPUs / totalPUs) * 100).toFixed(1)) : 0,
      lead_margin: margin,
      leading_party: leader && leader.total_votes > 0 ? leader.party_code : 'N/A',
      leading_candidate: leader && leader.total_votes > 0 ? leader.full_name : 'N/A',
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Situation room Ward error:', error);
    return ApiResponse.error(res, 'Failed to load Ward data');
  }
};

const getEmbedData = async (req, res) => {
  try {
    const electionId = parseInt(req.params.electionId);
    const [elections] = await pool.query('SELECT id, title, election_date, status FROM elections WHERE id = ?', [electionId]);
    if (!elections.length) return ApiResponse.notFound(res, 'Election not found');

    const [candidates] = await pool.query(
      `SELECT c.full_name, c.party_code, c.party_name,
              COALESCE(SUM(CASE WHEN rs.id IS NOT NULL THEN vd.votes ELSE 0 END), 0) AS total_votes
       FROM candidates c
       LEFT JOIN vote_data vd ON vd.candidate_id = c.id
       LEFT JOIN result_submissions rs ON rs.id = vd.submission_id AND rs.status = 'verified' AND rs.election_id = ?
       WHERE c.election_id = ? GROUP BY c.id ORDER BY total_votes DESC`,
      [electionId, electionId]
    );

    const [puCount] = await pool.query('SELECT COUNT(*) as total FROM polling_units');
    const [reported] = await pool.query("SELECT COUNT(*) AS total FROM result_submissions WHERE election_id = ? AND status <> 'rejected'", [electionId]);

    res.json({
      election: elections[0],
      candidates: candidates.map(c => ({ ...c, total_votes: Number(c.total_votes) })),
      total_polling_units: Number(puCount[0].total || 0),
      reported_polling_units: Number(reported[0].total || 0),
      reporting_percentage: Number(puCount[0].total || 0) > 0
        ? Number(((Number(reported[0].total || 0) / Number(puCount[0].total || 0)) * 100).toFixed(1)) : 0
    });
  } catch (error) {
    logger.error('Embed data error:', error);
    return ApiResponse.error(res, 'Failed to load embed data');
  }
};

module.exports = { getSituationRoom, getSituationRoomLGA, getSituationRoomWard, getEmbedData };
