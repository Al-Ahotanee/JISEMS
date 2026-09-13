const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const port = Number(process.env.SOCKET_UAT_PORT || 10104);
const baseUrl = `http://127.0.0.1:${port}`;
const apiUrl = `${baseUrl}/api/v1`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(port),
  FRONTEND_URL: baseUrl,
  AUTH_RATE_LIMIT_MAX: '500',
  JWT_SECRET: process.env.JWT_SECRET || 'socket-hardening-jwt-secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'socket-hardening-refresh-secret',
  HMAC_SECRET: process.env.HMAC_SECRET || 'socket-hardening-hmac-secret',
};

const checks = [];
let server;
const sockets = [];

function check(name, condition, detail = '') {
  checks.push({ name, status: condition ? 'passed' : 'failed', detail: condition ? '' : detail });
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  console.log(`[PASS] ${name}`);
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200 || response.status === 503) return;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Server did not start in time');
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(identifier, password) {
  const { response, body } = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(identifier.includes('@') ? { email: identifier, password } : { phone: identifier, password }),
  });
  check(`login ${identifier}`, response.status === 200, JSON.stringify(body));
  return body.data?.accessToken || body.data?.token;
}

function connectSocket(name, token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    sockets.push(socket);
    const timer = setTimeout(() => reject(new Error(`${name}: connection timeout`)), 7000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function expectJoin(socket, name, event, id, expectedOk) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: ${event} acknowledgement timeout`)), 5000);
    socket.emit(event, id, (payload) => {
      clearTimeout(timer);
      try {
        check(`${name}: ${event} ${id} ${expectedOk ? 'allowed' : 'denied'}`, payload?.ok === expectedOk, JSON.stringify(payload));
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function expectRejectedConnection(name, token) {
  try {
    await connectSocket(name, token);
    throw new Error(`${name}: connection unexpectedly succeeded`);
  } catch (error) {
    check(`${name}: connection rejected`, !String(error.message).includes('unexpectedly succeeded'), error.message);
  }
}

async function run() {
  server = spawn(process.execPath, ['backend/src/server.js'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  await waitForServer();

  const anonymous = await connectSocket('anonymous', null);
  await expectJoin(anonymous, 'anonymous', 'join:election', 1, false);
  await expectJoin(anonymous, 'anonymous', 'join:lga', 6, false);
  await expectJoin(anonymous, 'anonymous', 'join:ward', 61, false);

  const adminToken = await login('admin@gsem.ng', 'Admin@GSEM2024!');
  const admin = await connectSocket('super_admin', adminToken);
  await expectJoin(admin, 'super_admin', 'join:election', 1, true);
  await expectJoin(admin, 'super_admin', 'join:lga', 6, true);
  await expectJoin(admin, 'super_admin', 'join:ward', 61, true);

  const observerToken = await login('observer@gsem.ng', 'Observer@123!');
  const observer = await connectSocket('observer', observerToken);
  await expectJoin(observer, 'observer', 'join:election', 1, true);
  await expectJoin(observer, 'observer', 'join:lga', 6, false);
  await expectJoin(observer, 'observer', 'join:ward', 61, false);

  const agentToken = await login('agent@gsem.ng', 'Agent@123456!');
  const agent = await connectSocket('pu_agent', agentToken);
  await expectJoin(agent, 'pu_agent', 'join:lga', 6, true);
  await expectJoin(agent, 'pu_agent', 'join:ward', 61, true);
  await expectJoin(agent, 'pu_agent', 'join:lga', 1, false);
  await expectJoin(agent, 'pu_agent', 'join:ward', 62, false);

  await expectRejectedConnection('invalid token', 'not-a-valid-jwt');
  const logout = await request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  check('logout invalidates admin socket token', logout.response.status === 200, JSON.stringify(logout.body));
  await expectRejectedConnection('revoked token', adminToken);

  const report = { generated_at: new Date().toISOString(), passed: checks.filter((item) => item.status === 'passed').length, failed: checks.filter((item) => item.status === 'failed').length, total: checks.length, results: checks };
  const output = process.env.SOCKET_UAT_REPORT || 'socket-hardening-results.json';
  require('fs').writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  if (report.failed) throw new Error(`${report.failed} websocket hardening checks failed`);
  console.log(`Socket hardening complete: ${report.passed}/${report.total} passed`);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  sockets.forEach((socket) => socket.close());
  if (server) server.kill('SIGTERM');
});
