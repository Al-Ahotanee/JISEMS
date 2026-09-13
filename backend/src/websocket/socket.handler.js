const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { pool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'gsem-development-only-secret');

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendRoomError(socket, event, message, ack) {
  const payload = { ok: false, event, message };
  socket.emit('socket:error', payload);
  if (typeof ack === 'function') ack(payload);
}

function sendRoomSuccess(socket, event, room, ack) {
  const payload = { ok: true, event, room };
  if (typeof ack === 'function') ack(payload);
  return payload;
}

async function loadSocketUser(token) {
  if (!JWT_SECRET) throw new Error('Socket authentication is unavailable');

  const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'gsem-api' });
  if (!decoded?.id) throw new Error('Invalid access token');

  const [users] = await pool.query(
    'SELECT id, email, phone, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, token_version FROM users WHERE id = ? LIMIT 1',
    [decoded.id],
  );
  const user = users[0];
  if (!user || user.status !== 'active') throw new Error('Account is inactive or unavailable');
  if (decoded.token_version !== undefined && Number(decoded.token_version) !== Number(user.token_version || 0)) {
    throw new Error('Access token has been revoked');
  }

  return { ...decoded, ...user, authenticated: true };
}

async function canJoinElection(socket, electionId) {
  const [rows] = await pool.query('SELECT id FROM elections WHERE id = ? LIMIT 1', [electionId]);
  return Boolean(rows[0]) && socket.userData.authenticated === true;
}

async function canJoinLga(socket, lgaId) {
  const [rows] = await pool.query('SELECT id FROM lgas WHERE id = ? LIMIT 1', [lgaId]);
  if (!rows[0] || socket.userData.authenticated !== true) return false;

  const { role, lga_id: userLgaId } = socket.userData;
  if (role === 'super_admin' || role === 'state_coordinator') return true;
  if (role === 'lga_coordinator' || role === 'ward_officer' || role === 'pu_agent') return Number(userLgaId) === lgaId;
  return false;
}

async function canJoinWard(socket, wardId) {
  const [rows] = await pool.query('SELECT id, lga_id FROM wards WHERE id = ? LIMIT 1', [wardId]);
  const ward = rows[0];
  if (!ward || socket.userData.authenticated !== true) return false;

  const { role, lga_id: userLgaId, ward_id: userWardId } = socket.userData;
  if (role === 'super_admin' || role === 'state_coordinator') return true;
  if (role === 'lga_coordinator') return Number(userLgaId) === Number(ward.lga_id);
  if (role === 'ward_officer' || role === 'pu_agent') return Number(userWardId) === wardId;
  return false;
}

async function attemptJoin(socket, event, rawId, roomPrefix, authorization, ack) {
  const id = normalizeId(rawId);
  if (!id) return sendRoomError(socket, event, 'A valid numeric identifier is required', ack);

  try {
    if (!(await authorization(socket, id))) {
      return sendRoomError(socket, event, 'You are not authorized to join this live-update room', ack);
    }
    const room = `${roomPrefix}:${id}`;
    await socket.join(room);
    logger.debug(`Socket ${socket.id} joined ${room}`);
    return sendRoomSuccess(socket, event, room, ack);
  } catch (error) {
    logger.warn('Socket room authorization failed', { event, socketId: socket.id, error: error.message });
    return sendRoomError(socket, event, 'Unable to authorize this live-update room', ack);
  }
}

function setupSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // Unauthenticated sockets may connect for heartbeat/public shell use, but cannot join operational rooms.
      socket.userData = { role: 'public', authenticated: false };
      return next();
    }

    try {
      socket.userData = await loadSocketUser(token);
      return next();
    } catch (error) {
      logger.warn('Socket authentication rejected', { socketId: socket.id, error: error.message });
      return next(new Error('Invalid or revoked access token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (role: ${socket.userData.role})`);

    socket.on('join:election', (electionId, ack) => {
      void attemptJoin(socket, 'join:election', electionId, 'election', canJoinElection, ack);
    });

    socket.on('join:lga', (lgaId, ack) => {
      void attemptJoin(socket, 'join:lga', lgaId, 'lga', canJoinLga, ack);
    });

    socket.on('join:ward', (wardId, ack) => {
      void attemptJoin(socket, 'join:ward', wardId, 'ward', canJoinWard, ack);
    });

    socket.on('leave:election', (electionId) => {
      const id = normalizeId(electionId);
      if (id) socket.leave(`election:${id}`);
    });

    socket.on('leave:lga', (lgaId) => {
      const id = normalizeId(lgaId);
      if (id) socket.leave(`lga:${id}`);
    });

    socket.on('leave:ward', (wardId) => {
      const id = normalizeId(wardId);
      if (id) socket.leave(`ward:${id}`);
    });

    socket.on('ping:client', () => {
      socket.emit('pong:server', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('Socket.io handlers initialized');
}

function broadcastResultSubmission(io, submission) {
  io.to(`election:${submission.election_id}`).emit('result:submitted', {
    submissionId: submission.id,
    pollingUnitId: submission.polling_unit_id,
    wardId: submission.ward_id,
    lgaId: submission.lga_id,
    status: submission.status,
    timestamp: new Date().toISOString(),
  });

  if (submission.lga_id) {
    io.to(`lga:${submission.lga_id}`).emit('result:submitted', {
      submissionId: submission.id,
      pollingUnitId: submission.polling_unit_id,
      wardId: submission.ward_id,
      timestamp: new Date().toISOString(),
    });
  }

  if (submission.ward_id) {
    io.to(`ward:${submission.ward_id}`).emit('result:submitted', {
      submissionId: submission.id,
      pollingUnitId: submission.polling_unit_id,
      timestamp: new Date().toISOString(),
    });
  }
}

function broadcastResultVerified(io, submission) {
  io.to(`election:${submission.election_id}`).emit('result:verified', {
    submissionId: submission.id,
    pollingUnitId: submission.polling_unit_id,
    wardId: submission.ward_id,
    lgaId: submission.lga_id,
    votes: submission.votes,
    timestamp: new Date().toISOString(),
  });
}

function broadcastCollation(io, collation) {
  io.to(`election:${collation.election_id}`).emit('collation:updated', {
    level: collation.level,
    entityId: collation.entity_id,
    votes: collation.votes,
    timestamp: new Date().toISOString(),
  });
}

function broadcastDisputeUpdate(io, dispute) {
  io.to(`election:${dispute.election_id}`).emit('dispute:updated', {
    disputeId: dispute.id,
    status: dispute.status,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  setupSocketHandlers,
  broadcastResultSubmission,
  broadcastResultVerified,
  broadcastCollation,
  broadcastDisputeUpdate,
};
