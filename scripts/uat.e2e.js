#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const PORT = Number(process.env.UAT_PORT || 10100);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const REPORT_PATH = process.env.UAT_REPORT || path.resolve(__dirname, '../uat-results.json');

const app = require('../backend/src/app');
const { pool } = require('../backend/src/config/database');

const results = [];
const tokens = {};
let server;
let fixtures;

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function record(name, status, details = {}) {
  results.push({ name, status, ...details });
  const prefix = status === 'passed' ? 'PASS' : status === 'skipped' ? 'SKIP' : 'FAIL';
  console.log(`[${prefix}] ${name}${details.message ? ` — ${details.message}` : ''}`);
}

async function request(name, route, options = {}) {
  const { method = 'GET', token, json, form, expected = [200, 201], binary = false } = options;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (form) {
    body = form;
  } else if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const started = Date.now();
  let response;
  let payload;
  try {
    response = await fetch(`${BASE}${route}`, { method, headers, body });
    const contentType = response.headers.get('content-type') || '';
    if (binary || !contentType.includes('application/json')) {
      payload = await response.arrayBuffer();
    } else {
      payload = await response.json();
    }
  } catch (error) {
    record(name, 'failed', { message: `Transport error: ${error.message}`, duration_ms: Date.now() - started });
    throw error;
  }

  const ok = expected.includes(response.status);
  if (!ok) {
    const message = Buffer.isBuffer(payload) || payload instanceof ArrayBuffer
      ? `HTTP ${response.status}`
      : `HTTP ${response.status}: ${payload?.message || JSON.stringify(payload)}`;
    record(name, 'failed', { message, status_code: response.status, duration_ms: Date.now() - started });
    throw new Error(`${name}: ${message}`);
  }

  record(name, 'passed', { status_code: response.status, duration_ms: Date.now() - started });
  return { response, payload };
}

async function expectFailure(name, route, options, expectedStatus) {
  try {
    await request(name, route, { ...options, expected: [expectedStatus] });
    return null;
  } catch (error) {
    throw error;
  }
}

function data(payload) {
  return payload?.data ?? payload;
}

async function login(label, credentials) {
  const response = await request(`Auth login: ${label}`, '/auth/login', { method: 'POST', json: credentials });
  const value = data(response.payload);
  assert.ok(value.accessToken, `${label} access token missing`);
  assert.ok(value.refreshToken, `${label} refresh token missing`);
  tokens[label] = value.accessToken;
  return { ...value, token: value.accessToken };
}

async function registerAndReview({ label, email, phone, password, requested_role, lga_id, ward_id, polling_unit_id, status = 'approved' }) {
  const registration = await request(`Auth registration: ${label}`, '/auth/register', {
    method: 'POST',
    json: { email, phone, password, first_name: `UAT${label}`, last_name: 'Applicant', requested_role, lga_id, ward_id, polling_unit_id }
  });
  const application = data(registration.payload);
  assert.equal(application.status, 'pending');

  const queue = await request(`Admin application queue contains ${label}`, '/admin/applications?status=pending&limit=100', { token: tokens.admin });
  const found = queue.payload.data.find((item) => item.id === application.id || item.email === email || item.phone === phone);
  assert.ok(found, `Application ${label} not found in admin queue`);

  await request(`Admin review ${label}: ${status}`, `/admin/applications/${found.id}/review`, {
    method: 'PUT', token: tokens.admin, json: { status, review_notes: `UAT ${status}` }
  });

  return { applicationId: found.id, email, phone, password, status };
}

async function run() {
  server = app.listen(PORT);
  await once(server, 'listening');

  await request('Health endpoint', '/health', { expected: [200, 503] });
  await request('Public situation room', '/public/situation-room', { expected: [200] });
  await request('Public situation-room invalid LGA', '/public/situation-room/lga/999999', { expected: [404] });

  const admin = await login('admin', { email: 'admin@jisems.ng', password: 'Admin@JISEMS2027!' });
  await login('state', { email: 'coordinator@jisems.ng', password: 'Coord@123456!' });
  const lgaUser = await login('lga', { email: 'dutse-lga@jisems.ng', password: 'LGA@123456!' });
  const wardUser = await login('ward', { email: 'ward1@jisems.ng', password: 'Ward@123456!' });
  const seededAgent = await login('seeded_agent', { email: 'agent@jisems.ng', password: 'Agent@123456!' });
  await login('observer', { email: 'observer@jisems.ng', password: 'Observer@123!' });

  const me = await request('Auth current user', '/auth/me', { token: tokens.admin });
  assert.equal(data(me.payload).role, 'super_admin');
  await request('Auth refresh token', '/auth/refresh', { method: 'POST', json: { refreshToken: admin.refreshToken } });
  await request('Forgot password known account', '/auth/forgot-password', { method: 'POST', json: { email: 'admin@jisems.ng' } });
  await request('Forgot password unknown account does not enumerate', '/auth/forgot-password', { method: 'POST', json: { email: `missing-${Date.now()}@example.test` } });
  await expectFailure('Forgot password missing email rejected', '/auth/forgot-password', { method: 'POST', json: {} }, 400);
  await expectFailure('Reset password missing fields rejected', '/auth/reset-password', { method: 'POST', json: {} }, 400);
  await expectFailure('Email verification missing token rejected', '/auth/verify-email', { method: 'POST' }, 400);
  await expectFailure('Email verification invalid token rejected', '/auth/verify-email?token=invalid', { method: 'POST' }, 400);
  await expectFailure('Observer cannot access admin users', '/admin/users', { token: tokens.observer }, 403);
  await expectFailure('Observer cannot create elections', '/elections', { method: 'POST', token: tokens.observer, json: { title: 'Forbidden UAT Election', election_type: 'test', election_date: '2032-01-01', election_year: 2032 } }, 403);

  const geoLgas = await request('Geo list LGAs', '/geo/lgas');
  const geoWards = await request('Geo list wards', `/geo/wards?lga_id=${fixtures?.lgaId || data(geoLgas.payload)[0].id}`);
  const geoPUs = await request('Geo list polling units', '/geo/polling-units?page=1&limit=5');
  assert.ok(geoLgas.payload.data.length >= 11);
  assert.ok(geoWards.payload.data.length >= 1);
  assert.ok(geoPUs.payload.data.length >= 1);

  const timestamp = Date.now();
  const tempLga = data((await request('Geo create temporary LGA', '/geo/lgas', { method: 'POST', token: tokens.admin, json: { name: `UAT LGA ${timestamp}`, code: `UAT${timestamp % 100000}`, headquarters: 'UAT HQ', latitude: 10, longitude: 11 } })).payload);
  const tempLgaId = tempLga.id;
  const tempWard = data((await request('Geo create temporary ward', '/geo/wards', { method: 'POST', token: tokens.admin, json: { lga_id: tempLgaId, name: `UAT Ward ${timestamp}`, code: `UW${timestamp % 100000}`, latitude: 10, longitude: 11 } })).payload);
  const tempWardId = tempWard.id;
  const tempPu = data((await request('Geo create temporary polling unit', '/geo/polling-units', { method: 'POST', token: tokens.admin, json: { lga_id: tempLgaId, ward_id: tempWardId, name: `UAT PU ${timestamp}`, code: `UP${timestamp % 100000}`, registered_voters: 100, latitude: 10, longitude: 11 } })).payload);
  const tempPuId = tempPu.id;
  await request('Geo get polling unit', `/geo/polling-units/${tempPuId}`, { token: tokens.admin });
  await request('Geo update polling unit', `/geo/polling-units/${tempPuId}`, { method: 'PUT', token: tokens.admin, json: { lga_id: tempLgaId, ward_id: tempWardId, name: `UAT PU Updated ${timestamp}`, code: `UP${timestamp % 100000}`, registered_voters: 120, latitude: 12, longitude: 13 } });
  await request('Geo update ward', `/geo/wards/${tempWardId}`, { method: 'PUT', token: tokens.admin, json: { lga_id: tempLgaId, name: `UAT Ward Updated ${timestamp}`, code: `UW${timestamp % 100000}`, latitude: 12, longitude: 13 } });
  await request('Geo update LGA', `/geo/lgas/${tempLgaId}`, { method: 'PUT', token: tokens.admin, json: { name: `UAT LGA Updated ${timestamp}`, code: `UAT${timestamp % 100000}`, headquarters: 'Updated HQ', latitude: 12, longitude: 13 } });
  await request('Geo delete temporary polling unit', `/geo/polling-units/${tempPuId}`, { method: 'DELETE', token: tokens.admin });
  await request('Geo delete temporary ward', `/geo/wards/${tempWardId}`, { method: 'DELETE', token: tokens.admin });
  await request('Geo delete temporary LGA', `/geo/lgas/${tempLgaId}`, { method: 'DELETE', token: tokens.admin });

  const elections = await request('Election list', '/elections', { token: tokens.admin });
  const election = data(elections.payload).find((item) => item.election_year === 2027) || data(elections.payload)[0];
  assert.ok(election?.id, 'Seed election missing');
  fixtures = { ...fixtures, electionId: election.id };
  await request('Election detail', `/elections/${election.id}`, { token: tokens.admin });
  const candidateList = await request('Candidate list', `/elections/${election.id}/candidates`, { token: tokens.admin });
  const candidates = data(candidateList.payload);
  assert.ok(candidates.length >= 4, 'Seed candidates missing');
  await request('Public election embed', `/public/embed/${election.id}`);

  const draftElection = data((await request('Election create', '/elections', { method: 'POST', token: tokens.admin, json: { title: `UAT Election ${timestamp}`, election_type: 'test', election_date: '2030-01-01', election_year: 2030, description: 'UAT temporary election', status: 'upcoming' } })).payload);
  await request('Election update', `/elections/${draftElection.id}`, { method: 'PUT', token: tokens.admin, json: { title: `UAT Election Updated ${timestamp}`, election_year: 2031 } });
  const tempCandidate = data((await request('Candidate create', `/elections/${draftElection.id}/candidates`, { method: 'POST', token: tokens.admin, json: { candidate_name: 'UAT Candidate', party_name: 'UAT Party', party_code: `UP${timestamp % 100000}` } })).payload);
  await request('Candidate update', `/elections/${draftElection.id}/candidates/${tempCandidate.id}`, { method: 'PUT', token: tokens.admin, json: { candidate_name: 'UAT Candidate Updated', party_name: 'UAT Party Updated', party_code: `UP${timestamp % 100000}` } });
  await request('Candidate delete', `/elections/${draftElection.id}/candidates/${tempCandidate.id}`, { method: 'DELETE', token: tokens.admin });

  const [fixtureRows] = await pool.query(`
    SELECT e.id AS election_id, p.id AS pu_id, p.ward_id, p.lga_id, p.registered_voters
    FROM elections e JOIN polling_units p ON p.id = (SELECT polling_unit_id FROM users WHERE email = 'agent@gsem.ng')
    WHERE e.election_year = 2027 LIMIT 1`);
  const [candidateRows] = await pool.query('SELECT id FROM candidates WHERE election_id = $1 ORDER BY created_at LIMIT 4', [election.id]);
  const [puRows] = await pool.query('SELECT id, ward_id, lga_id, registered_voters FROM polling_units WHERE id <> $1 ORDER BY id LIMIT 3', [fixtureRows[0].pu_id]);
  assert.ok(puRows.length >= 3, 'Need three additional polling units for result workflows');
  const pu1 = fixtureRows[0];
  const pu2 = puRows[0];
  const pu3 = puRows[1];
  await request('Public valid LGA situation room', `/public/situation-room/lga/${pu1.lga_id}`);

  const approvedRegistration = await registerAndReview({
    label: 'approved PU agent', email: `uat-agent-${timestamp}@example.test`, password: 'UATagent@12345', requested_role: 'pu_agent',
    lga_id: pu1.lga_id, ward_id: pu1.ward_id, polling_unit_id: pu1.pu_id
  });
  const approvedAgent = await login('approved_agent', { email: approvedRegistration.email, password: approvedRegistration.password });
  assert.equal(approvedAgent.user.status, 'active');
  await pool.query('UPDATE users SET email_verified = FALSE WHERE id = $1', [approvedAgent.user.id]);
  const verificationToken = jwt.sign({ id: approvedAgent.user.id, purpose: 'email_verification' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await request('Email verification success', `/auth/verify-email?token=${encodeURIComponent(verificationToken)}`, { method: 'POST' });
  await expectFailure('Email verification duplicate rejected', `/auth/verify-email?token=${encodeURIComponent(verificationToken)}`, { method: 'POST' }, 400);

  const phoneRegistration = await registerAndReview({
    label: 'approved phone observer', phone: `080${String(timestamp).slice(-8)}`, password: 'UATphone@12345', requested_role: 'observer'
  });
  const phoneUser = await login('phone_observer', { phone: phoneRegistration.phone, password: phoneRegistration.password });
  assert.equal(phoneUser.user.role, 'observer');

  const rejectedEmail = `uat-rejected-${timestamp}@example.test`;
  await registerAndReview({ label: 'rejected applicant', email: rejectedEmail, password: 'UATreject@12345', requested_role: 'observer', status: 'rejected' });
  await expectFailure('Rejected applicant cannot log in', '/auth/login', { method: 'POST', json: { email: rejectedEmail, password: 'UATreject@12345' } }, 401);

  const imageForm = () => {
    const form = new FormData();
    form.append('election_id', String(election.id));
    form.append('polling_unit_id', String(pu1.pu_id));
    form.append('registered_voters', '100');
    form.append('accredited_voters', '60');
    form.append('total_votes_cast', '50');
    form.append('total_valid_votes', '48');
    form.append('rejected_votes', '2');
    form.append('latitude', '10');
    form.append('longitude', '11');
    form.append('votes', JSON.stringify(candidateRows.slice(0, 2).map((row, index) => ({ candidate_id: row.id, votes: index === 0 ? 30 : 18 }))));
    form.append('images', new Blob([pngBytes], { type: 'image/png' }), 'result.png');
    return form;
  };
  const submitted = data((await request('Result submit with image', '/results', { method: 'POST', token: tokens.approved_agent, form: imageForm() })).payload);
  const submissionId = submitted.id;
  assert.ok(submissionId, 'Submitted result id missing');
  await request('Result list as agent', `/results?election_id=${election.id}`, { token: tokens.approved_agent });
  await request('Result detail before review', `/results/${submissionId}`, { token: tokens.ward });
  await expectFailure('Duplicate result submission rejected', '/results', { method: 'POST', token: tokens.approved_agent, form: imageForm() }, 409);
  await request('Result verify', `/results/${submissionId}/verify`, { method: 'PUT', token: tokens.ward, json: { review_notes: 'UAT verified' } });
  const verified = await request('Result detail after verification', `/results/${submissionId}`, { token: tokens.admin });
  assert.equal(data(verified.payload).status, 'verified');

  const createAgent = async (label, pu, password) => {
    const email = `uat-${label}-${timestamp}@example.test`;
    const created = data((await request(`Admin create ${label}`, '/admin/users', { method: 'POST', token: tokens.admin, json: { email, password, first_name: `UAT${label}`, last_name: 'Agent', role: 'pu_agent', lga_id: pu.lga_id, ward_id: pu.ward_id, polling_unit_id: pu.id } })).payload);
    const user = await login(label, { email, password });
    return { ...pu, userId: created.id, email, password, token: user.token };
  };
  const anomalyAgent = await createAgent('anomaly_agent', pu2, 'UATanomaly@12345');
  const rejectAgent = await createAgent('reject_agent', pu3, 'UATrejectagent@12345');

  const anomalousForm = new FormData();
  for (const [key, value] of Object.entries({     election_id: election.id, polling_unit_id: pu2.id, registered_voters: 100, accredited_voters: 95, total_votes_cast: 96, total_valid_votes: 96, rejected_votes: 0, votes: JSON.stringify([{ candidate_id: candidateRows[0].id, votes: 96 }]) })) anomalousForm.append(key, String(value));
  anomalousForm.append('images', new Blob([pngBytes], { type: 'image/png' }), 'anomaly.png');
  const anomalous = data((await request('Anomaly-triggering result submit', '/results', { method: 'POST', token: anomalyAgent.token, form: anomalousForm })).payload);
  const anomalyResults = await request('Anomaly list', '/anomalies?status=open', { token: tokens.admin });
  const anomaly = anomalyResults.payload.data.find((item) => item.submission_id === anomalous.id);
  assert.ok(anomaly, 'Expected auto-generated anomaly was not found');
  await request('Anomaly resolve', `/anomalies/${anomaly.id}/resolve`, { method: 'PATCH', token: tokens.admin, json: { status: 'resolved' } });

  const rejectedForm = new FormData();
  for (const [key, value] of Object.entries({ election_id: election.id, polling_unit_id: pu3.id, registered_voters: 100, accredited_voters: 50, total_votes_cast: 20, total_valid_votes: 20, rejected_votes: 0, votes: JSON.stringify([{ candidate_id: candidateRows[0].id, votes: 20 }]) })) rejectedForm.append(key, String(value));
  rejectedForm.append('images', new Blob([pngBytes], { type: 'image/png' }), 'reject.png');
  const rejected = data((await request('Result submit for rejection', '/results', { method: 'POST', token: rejectAgent.token, form: rejectedForm })).payload);
  await request('Result reject', `/results/${rejected.id}/reject`, { method: 'PUT', token: tokens.state, json: { reason: 'UAT rejected' } });
  await request('Result flag forbidden for observer', `/results/${rejected.id}/flag`, { method: 'PUT', token: tokens.observer, json: { reason: 'not allowed', flag_type: 'review' }, expected: [403] });

  const wardId = pu1.ward_id;
  const lgaId = pu1.lga_id;
  await request('Ward collation', '/collation/ward', { method: 'POST', token: tokens.ward, json: { election_id: election.id, ward_id: wardId } });
  await request('LGA collation', '/collation/lga', { method: 'POST', token: tokens.lga, json: { election_id: election.id, lga_id: lgaId } });
  await request('State collation', '/collation/state', { method: 'POST', token: tokens.state, json: { election_id: election.id } });
  await request('Collation summary', `/collation/summary?election_id=${election.id}`, { token: tokens.admin });

  await request('State dashboard', '/dashboard/state', { token: tokens.state });
  await request('LGA dashboard', `/dashboard/lga/${lgaId}`, { token: tokens.lga });
  await request('Ward dashboard', `/dashboard/ward/${wardId}`, { token: tokens.ward });
  await request('Anomaly dashboard', '/dashboard/anomalies', { token: tokens.state });
  await request('Dashboard timeline', '/dashboard/timeline', { token: tokens.admin });
  await request('Admin dashboard statistics', '/admin/dashboard-stats', { token: tokens.admin });

  const dispute = data((await request('Dispute raise', '/disputes', { method: 'POST', token: tokens.ward, json: { election_id: election.id, submission_id: submissionId, title: 'UAT discrepancy', description: 'End-to-end test issue', category: 'result_accuracy', priority: 'medium' } })).payload);
  const disputeId = dispute.id;
  await request('Dispute list', '/disputes', { token: tokens.admin });
  await request('Dispute detail', `/disputes/${disputeId}`, { token: tokens.admin });
  await request('Dispute comment', `/disputes/${disputeId}/comments`, { method: 'POST', token: tokens.admin, json: { comment: 'UAT comment' } });
  const evidence = new FormData();
  evidence.append('files', new Blob([Buffer.from('%PDF-1.4\nUAT')], { type: 'application/pdf' }), 'evidence.pdf');
  evidence.append('description', 'UAT evidence');
  await request('Dispute evidence upload', `/disputes/${disputeId}/evidence`, { method: 'POST', token: tokens.admin, form: evidence });
  await request('Dispute escalate', `/disputes/${disputeId}/escalate`, { method: 'PUT', token: tokens.ward });
  await request('Dispute resolve', `/disputes/${disputeId}/resolve`, { method: 'PUT', token: tokens.admin, json: { status: 'resolved', resolution_notes: 'UAT resolved' } });

  await pool.query(`INSERT INTO notifications (user_id, title, message, type, is_read)
    VALUES ($1, $2, $3, $4, FALSE)`, [admin.user.id, 'UAT notification', 'UAT notification message', 'system']);
  const [notificationRows] = await pool.query(`SELECT id FROM notifications WHERE user_id = $1 AND title = $2 ORDER BY id DESC LIMIT 1`, [admin.user.id, 'UAT notification']);
  const notificationId = notificationRows[0]?.id;
  assert.ok(notificationId, 'Notification fixture insert failed');
  await request('Notifications list', '/notifications', { token: tokens.admin });
  await request('Notification mark one read', `/notifications/${notificationId}/read`, { method: 'PUT', token: tokens.admin });
  const unread = await request('Notifications unread count', '/notifications/unread-count', { token: tokens.admin });
  assert.ok(data(unread.payload).count !== undefined);
  await request('Notifications preferences get', '/notifications/preferences', { token: tokens.admin });
  await request('Notifications preferences update', '/notifications/preferences', { method: 'PUT', token: tokens.admin, json: { preferences: [{ notification_type: 'result_verified', email_enabled: false, sms_enabled: false, push_enabled: false, in_app_enabled: true }] } });
  await request('Notifications mark all read', '/notifications/read-all', { method: 'PUT', token: tokens.admin });
  await request('Push VAPID key', '/push/vapid-key');
  await request('Push subscribe', '/push/subscribe', { method: 'POST', token: tokens.admin, json: { endpoint: `https://example.test/uat-${timestamp}`, keys: { p256dh: 'uat-p256dh', auth: 'uat-auth' } } });
  await request('Push unsubscribe', '/push/unsubscribe', { method: 'POST', token: tokens.admin, json: { endpoint: `https://example.test/uat-${timestamp}` } });

  await request('Profile update', '/users/profile', { method: 'PUT', token: tokens.phone_observer, json: { first_name: 'UAT Phone Updated', language: 'en' } });
  const photoForm = new FormData();
  photoForm.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'profile.png');
  await request('Profile photo upload', '/users/profile/photo', { method: 'POST', token: tokens.phone_observer, form: photoForm });
  const tokenBeforePasswordChange = tokens.phone_observer;
  await request('Password change', '/users/password', { method: 'PUT', token: tokenBeforePasswordChange, json: { current_password: phoneRegistration.password, new_password: 'UATphoneNew@12345' } });
  await expectFailure('Password change revokes old access token', '/auth/me', { token: tokenBeforePasswordChange }, 401);
  await login('phone_observer_after_password_change', { phone: phoneRegistration.phone, password: 'UATphoneNew@12345' });

  const [phoneRows] = await pool.query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [phoneRegistration.phone]);
  assert.ok(phoneRows[0]?.id, 'Phone observer fixture missing after password change');
  const resetToken = jwt.sign({ id: phoneRows[0].id, purpose: 'password_reset' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  await pool.query(`INSERT INTO system_config (config_key, config_value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW()`,
    [`password_reset_${phoneRows[0].id}`, JSON.stringify({ token_hash: resetHash, expires_at: new Date(Date.now() + 3600000).toISOString() })]);
  await request('Password reset success', '/auth/reset-password', { method: 'POST', json: { token: resetToken, password: 'UATphoneReset@12345' } });
  await expectFailure('Password reset revokes prior access token', '/auth/me', { token: tokens.phone_observer_after_password_change }, 401);
  await login('phone_observer_after_reset', { phone: phoneRegistration.phone, password: 'UATphoneReset@12345' });

  await request('Admin users list', '/admin/users?limit=100', { token: tokens.admin });
  await request('Admin user detail', `/admin/users/${admin.user.id}`, { token: tokens.admin });
  await request('Admin user update', `/admin/users/${anomalyAgent.userId}`, { method: 'PUT', token: tokens.admin, json: { first_name: 'UAT Anomaly Updated' } });
  await request('Admin user deactivate', `/admin/users/${rejectAgent.userId}`, { method: 'DELETE', token: tokens.admin });
  await expectFailure('Deactivated user cannot log in', '/auth/login', { method: 'POST', json: { email: rejectAgent.email, password: rejectAgent.password } }, 403);
  await request('Admin audit logs', '/admin/audit-logs?limit=10', { token: tokens.admin });
  await request('Admin config get', '/admin/config', { token: tokens.admin });
  await request('Admin config update reversible key', '/admin/config', { method: 'PUT', token: tokens.admin, json: { config_key: `uat.test.${timestamp}`, config_value: 'passed' } });

  await request('Report CSV', `/reports/csv?election_id=${election.id}`, { token: tokens.admin, binary: true });
  await request('Report Excel', `/reports/excel?election_id=${election.id}`, { token: tokens.admin, binary: true });
  await request('Report PDF', `/reports/pdf?election_id=${election.id}`, { token: tokens.admin, binary: true });
  await request('Privacy export', '/privacy/export', { token: tokens.observer, binary: true });
  await request('Privacy erasure request', '/privacy/erasure', { method: 'POST', token: tokens.phone_observer_after_reset });

  await request('Auth logout', '/auth/logout', { method: 'POST', token: tokens.admin });
  await expectFailure('Logged-out access denied', '/auth/me', { token: tokens.admin }, 401);

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const summary = { generated_at: new Date().toISOString(), base_url: BASE, passed, failed, total: results.length, results };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`UAT complete: ${passed}/${results.length} passed; ${failed} failed. Report: ${REPORT_PATH}`);
  if (failed > 0) process.exitCode = 1;
}

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT e.id AS election_id, p.id AS pu_id, p.ward_id, p.lga_id, p.registered_voters
      FROM elections e
      JOIN polling_units p ON p.id = (SELECT polling_unit_id FROM users WHERE email = 'agent@gsem.ng')
      WHERE e.election_year = 2027 LIMIT 1`);
    assert.ok(rows.length, 'Seed fixture lookup failed');
    fixtures = rows[0];
    await run();
  } catch (error) {
    console.error(`UAT aborted: ${error.stack || error.message}`);
    const failed = results.filter((item) => item.status === 'failed').length + 1;
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ generated_at: new Date().toISOString(), passed: results.filter((item) => item.status === 'passed').length, failed, total: results.length + 1, results, abort: error.message }, null, 2));
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end().catch(() => undefined);
  }
})();
