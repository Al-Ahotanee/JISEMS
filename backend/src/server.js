require('dotenv').config();

const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const { setupSocketHandlers } = require('./websocket/socket.handler');
const { rawPool } = require('./config/database');
const logger = require('./utils/logger');

const port = Number(process.env.PORT || 10000);
const host = process.env.HOST || '0.0.0.0';
const originConfiguration = process.env.FRONTEND_URL
  || process.env.RENDER_EXTERNAL_URL
  || (process.env.NODE_ENV === 'production' ? '' : '*');
const allowedOrigins = originConfiguration
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL or RENDER_EXTERNAL_URL is required in production');
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);
setupSocketHandlers(io);

function start() {
  return server.listen(port, host, () => {
    logger.info('GSEM API server started', { port, host, environment: process.env.NODE_ENV || 'development' });
  });
}

async function shutdown(signal) {
  logger.info('Shutdown requested', { signal });
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await rawPool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', { error: error?.message || String(error), stack: error?.stack });
  process.exitCode = 1;
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

if (require.main === module) start();

module.exports = { server, io, start, shutdown };
