'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

const PORT = Number(process.env.ROLE_UAT_PORT || 10103);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const FRONTEND_BASE = process.env.ROLE_UAT_FRONTEND || `http://127.0.0.1:${PORT}`;
const REPORT_PATH = process.env.ROLE_UAT_REPORT || path.resolve(__dirname, '../role-matrix-results.json');

const app = require('../backend/src/app');
const { pool } = require('../backend/src/config/database');

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const seeded = {
  super_admin: { email: 'admin@jisems.ng', password: 'Admin@JISEMS2027!' },
  state_coordinator: { email: 'coordinator@jisems.ng', password: 'Coord@123456!' },
  lga_coordinator: { email: 'dutse-lga@jisems.ng', password: 'LGA@123456!' },
  ward_officer: { email: 'ward1@jisems.ng', password: 'Ward@123456!' },
  pu_agent: { email: 'agent@jisems.ng', password: 'Agent@123456!' },
  observer: { email: 'observer@jisems.ng', password: 'Observer@123!' },
};

const results = [];
const sessions = {};
const fixtures = {};
let server;

function record(name, status, details = {}) {
  const item = { name, status, ...details };
  results.push(item);
  console.log(`[${status === 'passed' ? 'PASS' : 'FAIL'}] ${name}${details.message ? ` — ${details.message}` : ''}`);
}

function unwrap(payload) {
  return payload?.data ?? payload;
}

async function request(name, route, options = {}) {
  const {
    method = 'GET',
    token,
    json,
    form,
    expected = [200, 201],
    binary = false,
  } = options;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (form) body = form;
  else if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const started = Date.now();
  try {
    const response = await fetch(`${BASE}${route}`, { method, headers, body });
    const contentType = response.headers.get('content-type') || '';
    const payload = binary || !contentType.includes('application/json')
      ? await response.arrayBuffer()
      : await response.json();
    const duration_ms = Date.now() - started;
    if (!expected.includes(response.status)) {
      const message = payload instanceof ArrayBuffer
        ? `HTTP ${response.status}`
        : `HTTP ${response.status}: ${payload?.message || JSON.stringify(payload)}`;
      throw Object.assign(new Error(message), { status_code: response.status });
    }
    record(name, 'passed', { status_code: response.status, duration_ms });
    return { response, payload };
  } catch (error) {
    record(name, 'failed', {
      status_code: error.status_code,
      duration_ms: Date.now() - started,
      message: error.message,
    });
    throw error;
  }
}

async function expectFailure(name, route, options, expectedStatus) {
  await request(name, route, { ...options, expected: [expectedStatus] });
}

async function check(name, callback) {
  try {
    await callback();
  } catch (error) {
    if (!results.some((item) => item.name === name && item.status === 'failed')) {
      record(name, 'failed', { message: error.message });
    }
  }
}

async function login(role) {
  const response = await request(`${role}: login`, '/auth/login', {
    method: 'POST',
    json: seeded[role],
  });
  const auth = unwrap(response.payload);
  assert.ok(auth.accessToken, `${role} access token missing`);
  assert.ok(auth.refreshToken, `${role} refresh token missing`);
  sessions[role] = { ...auth, token: auth.accessToken, user: auth.user };
  return sessions[role];
}

async function loadFixtures() {
  const [elections] = await pool.query("SELECT id, title FROM elections WHERE status = 'ongoing' ORDER BY id LIMIT 1");
  assert.ok(elections[0], 'No ongoing election fixture');
  fixtures.election = elections[0];

  const [candidates] = await pool.query('SELECT id, full_name FROM candidates WHERE election_id = ? ORDER BY position, id', [fixtures.election.id]);
  assert.ok(candidates.length >= 2, 'At least two candidate fixtures are required');
  fixtures.candidates = candidates;

  const [scopeUsers] = await pool.query(
    "SELECT email, role, lga_id, ward_id, polling_unit_id FROM users WHERE email IN (?, ?, ?)",
    [seeded.lga_coordinator.email, seeded.ward_officer.email, seeded.pu_agent.email],
  );
  const lgaScope = scopeUsers.find((user) => user.role === 'lga_coordinator');
  const wardScope = scopeUsers.find((user) => user.role === 'ward_officer');
  const agentScope = scopeUsers.find((user) => user.role === 'pu_agent');
  assert.ok(lgaScope?.lga_id, 'Seeded LGA coordinator jurisdiction is missing');
  assert.ok(wardScope?.ward_id, 'Seeded ward officer jurisdiction is missing');
  assert.ok(agentScope?.polling_unit_id, 'Seeded PU agent jurisdiction is missing');
  fixtures.lgaId = Number(lgaScope.lga_id);
  fixtures.wardId = Number(wardScope.ward_id);
  fixtures.agentPuId = Number(agentScope.polling_unit_id);

  const [pus] = await pool.query(
    `SELECT pu.id AS pu_id, pu.name AS pu_name, pu.ward_id, pu.lga_id,
            w.name AS ward_name, l.name AS lga_name
       FROM polling_units pu
       JOIN wards w ON w.id = pu.ward_id
       JOIN lgas l ON l.id = pu.lga_id
      WHERE pu.lga_id = ?
      ORDER BY CASE WHEN pu.id = ? THEN 0 WHEN pu.ward_id = ? THEN 1 ELSE 2 END, pu.id
      LIMIT 8`,
    [fixtures.lgaId, fixtures.agentPuId, fixtures.wardId],
  );
  assert.ok(pus.length >= 5, 'At least five polling-unit fixtures are required in the seeded LGA');
  fixtures.pus = pus;
}

async function resetIsolatedWorkflowState() {
  assert.equal(process.env.NODE_ENV, 'test', 'Role-matrix reset requires NODE_ENV=test');
  const pollingUnitIds = fixtures.pus.map((pu) => pu.pu_id);
  const placeholders = pollingUnitIds.map(() => '?').join(', ');

  await pool.query('DELETE FROM collation_records WHERE election_id = ?', [fixtures.election.id]);
  await pool.query('DELETE FROM disputes WHERE election_id = ?', [fixtures.election.id]);
  await pool.query(
    `DELETE FROM audit_logs
      WHERE resource_type = 'result_submission'
        AND resource_id IN (
          SELECT id FROM result_submissions
          WHERE election_id = ? AND polling_unit_id IN (${placeholders})
        )`,
    [fixtures.election.id, ...pollingUnitIds],
  );
  await pool.query(
    `DELETE FROM result_submissions
      WHERE election_id = ? AND polling_unit_id IN (${placeholders})`,
    [fixtures.election.id, ...pollingUnitIds],
  );
  await pool.query(
    "DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'role-matrix-%@example.test')",
  );
  await pool.query("DELETE FROM users WHERE email LIKE 'role-matrix-%@example.test'");
  record('role matrix: reset isolated workflow state', 'passed');
}

function resultForm(pu, totalVotes = 20) {
  const form = new FormData();
  form.append('election_id', String(fixtures.election.id));
  form.append('polling_unit_id', String(pu.pu_id));
  form.append('registered_voters', '100');
  form.append('accredited_voters', String(Math.min(80, totalVotes + 20)));
  form.append('total_votes_cast', String(totalVotes));
  form.append('total_valid_votes', String(totalVotes));
  form.append('rejected_votes', '0');
  form.append('latitude', '10');
  form.append('longitude', '11');
  form.append('votes', JSON.stringify([
    { candidate_id: fixtures.candidates[0].id, votes: Math.max(1, totalVotes - 5) },
    { candidate_id: fixtures.candidates[1].id, votes: 5 },
  ]));
  form.append('images', new Blob([pngBytes], { type: 'image/png' }), `role-${pu.pu_id}.png`);
  return form;
}

async function createResultAsAgent(agentSession, pu, label, totalVotes = 20) {
  const response = await request(`${label}: submit result`, '/results', {
    method: 'POST',
    token: agentSession.token,
    form: resultForm(pu, totalVotes),
  });
  const result = unwrap(response.payload);
  assert.ok(result.id, `${label} result id missing`);
  return result;
}

async function createDynamicAgent(adminSession, pu, suffix) {
  const email = `role-matrix-${suffix}-${Date.now()}@example.test`;
  const password = 'RoleMatrix@12345';
  const response = await request(`super_admin: create fixture agent ${suffix}`, '/admin/users', {
    method: 'POST',
    token: adminSession.token,
    json: {
      email,
      password,
      first_name: 'Role Matrix',
      last_name: suffix,
      role: 'pu_agent',
      lga_id: pu.lga_id,
      ward_id: pu.ward_id,
      polling_unit_id: pu.pu_id,
    },
  });
  const created = unwrap(response.payload);
  const loginResponse = await request(`fixture agent ${suffix}: login`, '/auth/login', {
    method: 'POST',
    json: { email, password },
  });
  return { user: created, token: unwrap(loginResponse.payload).accessToken };
}

async function sharedAuthenticatedChecks(role, session) {
  await check(`${role}: auth/me`, async () => {
    const response = await request(`${role}: current user`, '/auth/me', { token: session.token });
    assert.equal(unwrap(response.payload).role, role);
  });
  await check(`${role}: notification lifecycle`, async () => {
    await request(`${role}: list notifications`, '/notifications?page=1&limit=20', { token: session.token });
    await request(`${role}: unread count`, '/notifications/unread-count', { token: session.token });
    const preferences = await request(`${role}: get preferences`, '/notifications/preferences', { token: session.token });
    const existing = unwrap(preferences.payload);
    const preference = Array.isArray(existing) && existing[0]
      ? existing[0]
      : { notification_type: 'role_matrix', email_enabled: true, sms_enabled: false, push_enabled: false, in_app_enabled: true };
    await request(`${role}: update preferences`, '/notifications/preferences', {
      method: 'PUT', token: session.token,
      json: { preferences: [{ notification_type: preference.notification_type, email_enabled: Boolean(preference.email_enabled), sms_enabled: Boolean(preference.sms_enabled), push_enabled: Boolean(preference.push_enabled), in_app_enabled: true }] },
    });
    await request(`${role}: mark all notifications read`, '/notifications/read-all', { method: 'PUT', token: session.token });
  });
  await check(`${role}: push lifecycle`, async () => {
    await request(`${role}: VAPID key`, '/push/vapid-key', { token: session.token, expected: [200, 503] });
    const endpoint = `https://role-matrix.example/${role}-${Date.now()}`;
    await request(`${role}: push subscribe`, '/push/subscribe', {
      method: 'POST', token: session.token,
      json: { endpoint, keys: { p256dh: 'role-matrix-p256dh', auth: 'role-matrix-auth' } },
    });
    await request(`${role}: push unsubscribe`, '/push/unsubscribe', { method: 'POST', token: session.token, json: { endpoint } });
  });
  await check(`${role}: profile update`, async () => {
    await request(`${role}: profile update`, '/users/profile', { method: 'PUT', token: session.token, json: { language: 'en' } });
  });
  await check(`${role}: read election and result data`, async () => {
    await request(`${role}: election list`, '/elections', { token: session.token });
    await request(`${role}: election detail`, `/elections/${fixtures.election.id}`, { token: session.token });
    await request(`${role}: candidate list`, `/elections/${fixtures.election.id}/candidates`, { token: session.token });
    await request(`${role}: result list`, `/results?election_id=${fixtures.election.id}`, { token: session.token });
    if (fixtures.reviewResultId) await request(`${role}: result detail`, `/results/${fixtures.reviewResultId}`, { token: session.token });
    await request(`${role}: timeline`, `/dashboard/timeline?election_id=${fixtures.election.id}`, { token: session.token });
    await request(`${role}: dispute list`, `/disputes?election_id=${fixtures.election.id}`, { token: session.token });
    await request(`${role}: collation summary`, `/collation/summary?election_id=${fixtures.election.id}`, { token: session.token });
  });
  await check(`${role}: dispute participation`, async () => {
    const dispute = await request(`${role}: raise dispute`, '/disputes', {
      method: 'POST', token: session.token,
      json: { election_id: fixtures.election.id, title: `Role matrix ${role}`, description: 'Role-based acceptance test dispute', category: 'result_discrepancy', priority: 'medium' },
    });
    const disputeId = unwrap(dispute.payload).id;
    assert.ok(disputeId, `${role} dispute id missing`);
    fixtures.lastDisputeId = disputeId;
    await request(`${role}: get dispute`, `/disputes/${disputeId}`, { token: session.token });
    await request(`${role}: add dispute comment`, `/disputes/${disputeId}/comments`, { method: 'POST', token: session.token, json: { comment: `Comment from ${role}` } });
    const evidence = new FormData();
    evidence.append('description', `Evidence from ${role}`);
    evidence.append('files', new Blob([pngBytes], { type: 'image/png' }), `${role}-evidence.png`);
    await request(`${role}: add dispute evidence`, `/disputes/${disputeId}/evidence`, { method: 'POST', token: session.token, form: evidence });
  });
  await check(`${role}: privacy export`, async () => {
    const response = await request(`${role}: privacy export`, '/privacy/export', { token: session.token, binary: true });
    assert.ok(response.payload.byteLength > 0, `${role} privacy export is empty`);
  });
}

async function reviewChecks(role, session) {
  const reviewResultId = fixtures.reviewResultIds[role];
  if (!reviewResultId) return;
  await check(`${role}: review result`, async () => {
    if (role === 'ward_officer') {
      await request(`${role}: verify result`, `/results/${reviewResultId}/verify`, { method: 'PUT', token: session.token, json: { review_notes: 'Role matrix verified' } });
    } else if (role === 'lga_coordinator') {
      await request(`${role}: reject result`, `/results/${reviewResultId}/reject`, { method: 'PUT', token: session.token, json: { reason: 'Role matrix rejected' } });
    } else if (role === 'state_coordinator') {
      await request(`${role}: flag result`, `/results/${reviewResultId}/flag`, { method: 'PUT', token: session.token, json: { reason: 'Role matrix flagged', flag_type: 'review' } });
    } else if (role === 'super_admin') {
      await request(`${role}: verify result`, `/results/${reviewResultId}/verify`, { method: 'PUT', token: session.token, json: { review_notes: 'Role matrix admin verification' } });
    }
  });
}

async function roleSpecificChecks(role, session) {
  const { election, lgaId, wardId } = fixtures;
  if (role === 'pu_agent') {
    await check('pu_agent: submit result', async () => {
      const result = await createResultAsAgent(session, fixtures.pus[0], 'pu_agent role');
      fixtures.reviewResultIds.ward_officer = result.id;
      fixtures.reviewResultId = result.id;
      await expectFailure('pu_agent: duplicate result denied', '/results', { method: 'POST', token: session.token, form: resultForm(fixtures.pus[0]) }, 409);
    });
    await expectFailure('pu_agent: verify forbidden', `/results/${fixtures.reviewResultId || 999999}/verify`, { method: 'PUT', token: session.token, json: { review_notes: 'forbidden' } }, 403);
    await expectFailure('pu_agent: reports forbidden', `/reports/csv?election_id=${election.id}`, { token: session.token }, 403);
    await expectFailure('pu_agent: state collation forbidden', '/collation/state', { method: 'POST', token: session.token, json: { election_id: election.id } }, 403);
  } else if (role === 'ward_officer') {
    await request('ward_officer: ward dashboard', `/dashboard/ward/${wardId}`, { token: session.token });
    await request('ward_officer: ward collation', '/collation/ward', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id, ward_id: wardId } });
    await expectFailure('ward_officer: lga collation forbidden', '/collation/lga', { method: 'POST', token: session.token, json: { election_id: election.id, lga_id: lgaId } }, 403);
    await expectFailure('ward_officer: reports forbidden', `/reports/csv?election_id=${election.id}`, { token: session.token }, 403);
  } else if (role === 'lga_coordinator') {
    await request('lga_coordinator: lga dashboard', `/dashboard/lga/${lgaId}`, { token: session.token });
    await request('lga_coordinator: lga collation', '/collation/lga', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id, lga_id: lgaId } });
    await request('lga_coordinator: csv report', `/reports/csv?election_id=${election.id}`, { token: session.token, binary: true });
    await expectFailure('lga_coordinator: state collation forbidden', '/collation/state', { method: 'POST', token: session.token, json: { election_id: election.id } }, 403);
    await expectFailure('lga_coordinator: anomaly list forbidden', '/anomalies', { token: session.token }, 403);
  } else if (role === 'state_coordinator') {
    await request('state_coordinator: state dashboard', '/dashboard/state', { token: session.token });
    await request('state_coordinator: state collation', '/collation/state', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id } });
    await request('state_coordinator: anomaly list', '/anomalies', { token: session.token });
    await request('state_coordinator: csv report', `/reports/csv?election_id=${election.id}`, { token: session.token, binary: true });
    await expectFailure('state_coordinator: admin users forbidden', '/admin/users', { token: session.token }, 403);
    await expectFailure('state_coordinator: election create forbidden', '/elections', { method: 'POST', token: session.token, json: { title: 'Forbidden role matrix election', election_type: 'test', election_date: '2031-01-01', election_year: 2031 } }, 403);
  } else if (role === 'observer') {
    await request('observer: state dashboard', '/dashboard/state', { token: session.token });
    await request('observer: public Situation Room', '/public/situation-room', { token: session.token });
    await expectFailure('observer: result submission forbidden', '/results', { method: 'POST', token: session.token, form: resultForm(fixtures.pus[0]) }, 403);
    await expectFailure('observer: collation forbidden', '/collation/state', { method: 'POST', token: session.token, json: { election_id: election.id } }, 403);
    await expectFailure('observer: report forbidden', `/reports/csv?election_id=${election.id}`, { token: session.token }, 403);
    await expectFailure('observer: admin users forbidden', '/admin/users', { token: session.token }, 403);
  } else if (role === 'super_admin') {
    await request('super_admin: state dashboard', '/dashboard/state', { token: session.token });
    await request('super_admin: admin dashboard stats', '/admin/dashboard-stats', { token: session.token });
    await request('super_admin: admin users', '/admin/users?limit=100', { token: session.token });
    await request('super_admin: applications', '/admin/applications?limit=100', { token: session.token });
    await request('super_admin: audit logs', '/admin/audit-logs?limit=20', { token: session.token });
    const config = await request('super_admin: get config', '/admin/config', { token: session.token });
    const entries = unwrap(config.payload);
    const first = Array.isArray(entries) && entries[0];
    if (first) {
      await request('super_admin: update config', '/admin/config', { method: 'PUT', token: session.token, json: { config_key: first.config_key, config_value: first.config_value } });
    }
    await request('super_admin: csv report', `/reports/csv?election_id=${election.id}`, { token: session.token, binary: true });
    await request('super_admin: excel report', `/reports/excel?election_id=${election.id}`, { token: session.token, binary: true });
    await request('super_admin: pdf report', `/reports/pdf?election_id=${election.id}`, { token: session.token, binary: true });
    await request('super_admin: ward collation', '/collation/ward', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id, ward_id: wardId } });
    await request('super_admin: lga collation', '/collation/lga', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id, lga_id: lgaId } });
    await request('super_admin: state collation', '/collation/state', { method: 'POST', token: session.token, expected: [201, 409], json: { election_id: election.id } });
  }
}

async function forbiddenMatrix(role, token) {
  const forbidden = {
    super_admin: [],
    state_coordinator: ['/geo/lgas', '/admin/users', '/elections'],
    lga_coordinator: ['/geo/lgas', '/admin/users', '/collation/state'],
    ward_officer: ['/geo/lgas', '/admin/users', '/collation/lga'],
    pu_agent: ['/geo/lgas', '/admin/users', '/collation/ward', '/reports/csv'],
    observer: ['/geo/lgas', '/admin/users', '/results', '/collation/state', '/reports/csv'],
  };
  for (const route of forbidden[role] || []) {
    const method = route === '/results' || route.startsWith('/collation/') || route.startsWith('/elections') || route.startsWith('/geo/') ? 'POST' : 'GET';
    const options = { method, token, expected: [403] };
    if (method === 'POST') {
      options.json = route.startsWith('/elections')
        ? { title: 'Forbidden matrix election', election_type: 'test', election_date: '2031-01-01', election_year: 2031 }
        : route === '/results'
          ? { election_id: fixtures.election.id }
          : route.startsWith('/geo/')
            ? { name: 'Forbidden Matrix LGA', code: `FORBIDDEN-${Date.now()}` }
            : { election_id: fixtures.election.id, ward_id: fixtures.wardId, lga_id: fixtures.lgaId };
    }
    await expectFailure(`${role}: forbidden ${method} ${route}`, route, options, 403);
  }
}

async function frontendSmoke(role) {
  const paths = ['/app/dashboard', '/app/notifications', '/app/profile'];
  if (role === 'super_admin') paths.push('/app/admin/users', '/app/admin/applications', '/app/admin/polling-units', '/app/admin/elections', '/app/admin/audit', '/app/admin/anti-rigging', '/app/admin/reports');
  if (role === 'state_coordinator') paths.push('/app/results', '/app/collation/state', '/app/disputes', '/app/admin/anti-rigging', '/app/admin/reports');
  if (role === 'lga_coordinator') paths.push('/app/results', '/app/collation/lga/1', '/app/disputes', '/app/admin/reports');
  if (role === 'ward_officer') paths.push('/app/results', '/app/collation/ward/1', '/app/disputes');
  if (role === 'pu_agent') paths.push('/app/results/submit', '/app/results', '/situation-room');
  if (role === 'observer') paths.push('/app/results', '/situation-room');
  for (const route of paths) {
    await check(`${role}: frontend route ${route}`, async () => {
      const response = await fetch(`${FRONTEND_BASE}${route}`);
      assert.equal(response.status, 200, `${route} returned ${response.status}`);
      const html = await response.text();
      assert.match(html, /<div id="root">/i, `${route} did not return the SPA shell`);
    });
  }
}

async function run() {
  server = app.listen(PORT);
  await once(server, 'listening');
  await loadFixtures();
  await resetIsolatedWorkflowState();
  for (const role of Object.keys(seeded)) await login(role);

  const fixtureAgent1 = await createDynamicAgent(sessions.super_admin, fixtures.pus[1], 'lga-review');
  const fixtureAgent2 = await createDynamicAgent(sessions.super_admin, fixtures.pus[2], 'state-review');
  const fixtureAgent3 = await createDynamicAgent(sessions.super_admin, fixtures.pus[3], 'admin-review');
  fixtures.reviewResultIds = {};
  fixtures.reviewResultIds.lga_coordinator = (await createResultAsAgent(fixtureAgent1, fixtures.pus[1], 'lga review fixture')).id;
  fixtures.reviewResultIds.state_coordinator = (await createResultAsAgent(fixtureAgent2, fixtures.pus[2], 'state review fixture')).id;
  fixtures.reviewResultIds.super_admin = (await createResultAsAgent(fixtureAgent3, fixtures.pus[3], 'admin review fixture')).id;

  for (const role of Object.keys(seeded)) {
    const session = sessions[role];
    await sharedAuthenticatedChecks(role, session);
    await reviewChecks(role, session);
    await roleSpecificChecks(role, session);
    await forbiddenMatrix(role, session.token);
    await frontendSmoke(role);
  }

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE,
    frontend_base: FRONTEND_BASE,
    roles_tested: Object.keys(seeded),
    passed,
    failed,
    total: results.length,
    results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Role matrix complete: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error('Role matrix fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });
