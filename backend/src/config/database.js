const { Pool } = require('pg');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
const isLocalDatabase = !databaseUrl || /localhost|127\.0\.0\.1/i.test(databaseUrl);

if (process.env.NODE_ENV === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL is required in production');
}

const rawPool = new Pool({
  connectionString: databaseUrl,
  host: databaseUrl ? undefined : process.env.DB_HOST,
  port: databaseUrl ? undefined : Number(process.env.DB_PORT || 5432),
  user: databaseUrl ? undefined : process.env.DB_USER,
  password: databaseUrl ? undefined : process.env.DB_PASSWORD,
  database: databaseUrl ? undefined : process.env.DB_NAME,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
  allowExitOnIdle: process.env.NODE_ENV !== 'production',
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
});

rawPool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL pool error', { error: error.message, stack: error.stack });
});

function replaceQuestionMarks(sql) {
  let output = '';
  let parameter = 0;
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      output += char;
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }
    if (!quote && char === '-' && next === '-') {
      output += char + next;
      index += 1;
      inLineComment = true;
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      output += char + next;
      index += 1;
      inBlockComment = true;
      continue;
    }
    if (quote) {
      output += char;
      if (char === quote && sql[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }
    if (char === '?') {
      parameter += 1;
      output += `$${parameter}`;
      continue;
    }
    output += char;
  }
  return output;
}

function normalizeSql(input) {
  let sql = String(input).replace(/`/g, '"');

  // MySQL commonly uses double quotes for string literals in this codebase.
  sql = sql.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_, value) => `'${value.replace(/'/g, "''")}'`);
  sql = sql.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  sql = sql.replace(/DATE_FORMAT\(([^,]+),\s*'[^']*%Y[^']*%m[^']*%d[^']*%H:00'\)/gi, "to_char($1, 'YYYY-MM-DD HH24:00')");
  // Preserve INSERT IGNORE marker for compatibility handling
  sql = sql.replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+HOUR\)/gi, "(NOW() - INTERVAL '$1 hours')");
  sql = sql.replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+DAY\)/gi, "(NOW() - INTERVAL '$1 days')");
  sql = sql.replace(/DATE_ADD\(NOW\(\),\s*INTERVAL\s+(\d+)\s+HOUR\)/gi, "(NOW() + INTERVAL '$1 hours')");

  const booleanColumns = '(?:revoked|email_verified|phone_verified|is_offline_submission|is_anomalous|is_read|email_enabled|sms_enabled|push_enabled|in_app_enabled)';
  sql = sql.replace(new RegExp(`\\b${booleanColumns}\\s*=\\s*0\\b`, 'gi'), (match) => match.replace(/0\s*$/, 'FALSE'));
  sql = sql.replace(new RegExp(`\\b${booleanColumns}\\s*=\\s*1\\b`, 'gi'), (match) => match.replace(/1\s*$/, 'TRUE'));
  sql = sql.replace(new RegExp(`\\b${booleanColumns}\\s+IN\\s*\\(\\s*0\\s*,\\s*1\\s*\\)`, 'gi'), (match) => match.replace(/0/g, 'FALSE').replace(/1/g, 'TRUE'));

  return replaceQuestionMarks(sql);
}

function isReadQuery(sql) {
  return /^\s*(SELECT|WITH|SHOW|EXPLAIN|VALUES)\b/i.test(sql);
}

function addInsertCompatibility(sql) {
  let normalized = sql.trim().replace(/;\s*$/, '');
  const isInsertIgnore = /^\s*INSERT\s+IGNORE\b/i.test(normalized);
  if (isInsertIgnore) {
    normalized = normalized.replace(/^\s*INSERT\s+IGNORE\b/i, 'INSERT');
    if (!/\bON\s+CONFLICT\b/i.test(normalized)) {
      const returningIndex = normalized.search(/\bRETURNING\b/i);
      if (returningIndex >= 0) {
        normalized = `${normalized.slice(0, returningIndex)}ON CONFLICT DO NOTHING ${normalized.slice(returningIndex)}`;
      } else {
        normalized += ' ON CONFLICT DO NOTHING';
      }
    }
  }
  if (/^\s*INSERT\b/i.test(normalized) && !/\bRETURNING\b/i.test(normalized)) {
    normalized += ' RETURNING id';
  }
  return normalized;
}

function adaptClient(client) {
  return {
    async query(sql, values = []) {
      const normalized = normalizeSql(sql);
      const executableSql = /^\s*INSERT\b/i.test(normalized)
        ? addInsertCompatibility(normalized)
        : normalized;
      const result = await client.query(executableSql, values);

      if (isReadQuery(executableSql)) {
        return [result.rows, result.fields];
      }

      return [{
        insertId: result.rows[0]?.id ?? null,
        affectedRows: result.rowCount,
        rowCount: result.rowCount,
      }, result.fields];
    },
    async beginTransaction() {
      await client.query('BEGIN');
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
    release() {
      client.release();
    },
    async end() {
      client.release();
    },
  };
}

const pool = {
  async query(sql, values = []) {
    return adaptClient(rawPool).query(sql, values);
  },
  async getConnection() {
    return adaptClient(await rawPool.connect());
  },
  async end() {
    await rawPool.end();
  },
};

async function checkDatabase() {
  const result = await rawPool.query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}

const cache = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: false });

module.exports = { pool, rawPool, cache, checkDatabase, normalizeSql };
