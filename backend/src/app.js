require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const { checkDatabase } = require('./config/database');

const app = express();
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const uploadRoot = path.resolve(__dirname, '..', 'uploads');

function configuredOrigins() {
  return (process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = new Set(configuredOrigins());
if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
  throw new Error('FRONTEND_URL or RENDER_EXTERNAL_URL is required in production');
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.GLOBAL_RATE_LIMIT || 500),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

fs.mkdirSync(uploadRoot, { recursive: true });
app.use('/uploads', express.static(uploadRoot, {
  fallthrough: true,
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
  }
}));

const routes = require('./routes');
app.use('/api/v1', routes);

app.get('/health', async (req, res) => {
  try {
    await checkDatabase();
    return res.status(200).json({ status: 'ok', service: 'gsem-api', database: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    return res.status(503).json({ status: 'degraded', service: 'gsem-api', database: 'unavailable' });
  }
});

app.get('/api/v1/health', (req, res) => res.redirect(307, '/health'));

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    index: false,
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health' || req.path.startsWith('/uploads/')) return next();
    if (req.path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(req.path)) {
      return res.status(404).json({ success: false, message: 'Asset not found' });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

app.use((err, req, res, next) => {
  logger.error('Unhandled request error', { error: err.message, stack: err.stack, path: req.path, method: req.method });
  const status = Number(err.status || err.statusCode) || (err.name === 'ValidationError' ? 400 : 500);
  return res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && status >= 500 ? 'Internal server error' : err.message,
  });
});

module.exports = app;
