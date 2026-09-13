const { rawPool } = require('./database');
require('dotenv').config();

const schema = [
  `CREATE TABLE IF NOT EXISTS lgas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    headquarters VARCHAR(100),
    state_id INTEGER,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS wards (
    id SERIAL PRIMARY KEY,
    lga_id INTEGER NOT NULL REFERENCES lgas(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS polling_units (
    id SERIAL PRIMARY KEY,
    ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    lga_id INTEGER NOT NULL REFERENCES lgas(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    inec_pu_code VARCHAR(30),
    registered_voters INTEGER NOT NULL DEFAULT 0 CHECK (registered_voters >= 0),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'field_agent',
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    lga_id INTEGER REFERENCES lgas(id) ON DELETE SET NULL,
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    polling_unit_id INTEGER REFERENCES polling_units(id) ON DELETE SET NULL,
    nin VARCHAR(20),
    profile_photo_url VARCHAR(500),
    photo_url VARCHAR(500),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    token_version INTEGER NOT NULL DEFAULT 0,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    jti UUID NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS registration_applications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255),
    phone VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    requested_role VARCHAR(32) NOT NULL,
    password_hash VARCHAR(255),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    lga_id INTEGER REFERENCES lgas(id) ON DELETE SET NULL,
    ward_id INTEGER REFERENCES wards(id) ON DELETE SET NULL,
    polling_unit_id INTEGER REFERENCES polling_units(id) ON DELETE SET NULL,
    nin VARCHAR(20),
    accreditation_doc_url VARCHAR(500),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS elections (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    election_type VARCHAR(40) NOT NULL,
    election_date DATE NOT NULL,
    election_year INTEGER,
    status VARCHAR(16) NOT NULL DEFAULT 'upcoming',
    state VARCHAR(50) NOT NULL DEFAULT 'Jigawa',
    constituency_type VARCHAR(40) NOT NULL DEFAULT 'statewide',
    constituency_name VARCHAR(100),
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY,
    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    party_code VARCHAR(10) NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    photo_url VARCHAR(500),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (election_id, party_code)
  )`,
  `CREATE TABLE IF NOT EXISTS result_submissions (
    id SERIAL PRIMARY KEY,
    submission_uid VARCHAR(50) NOT NULL UNIQUE,
    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    polling_unit_id INTEGER NOT NULL REFERENCES polling_units(id) ON DELETE CASCADE,
    ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    lga_id INTEGER NOT NULL REFERENCES lgas(id) ON DELETE CASCADE,
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    accredited_voters INTEGER NOT NULL DEFAULT 0 CHECK (accredited_voters >= 0),
    total_valid_votes INTEGER NOT NULL DEFAULT 0 CHECK (total_valid_votes >= 0),
    rejected_votes INTEGER NOT NULL DEFAULT 0 CHECK (rejected_votes >= 0),
    total_votes_cast INTEGER NOT NULL DEFAULT 0 CHECK (total_votes_cast >= 0),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    content_hash VARCHAR(64),
    digital_signature VARCHAR(255),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    flag_reason TEXT,
    flagged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    flagged_at TIMESTAMPTZ,
    is_offline_submission BOOLEAN NOT NULL DEFAULT FALSE,
    is_anomalous BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (election_id, polling_unit_id)
  )`,
  `CREATE TABLE IF NOT EXISTS result_sheet_images (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES result_submissions(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    image_type VARCHAR(32) NOT NULL DEFAULT 'ec8a_front',
    file_size INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS vote_data (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES result_submissions(id) ON DELETE CASCADE,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (submission_id, candidate_id)
  )`,
  `CREATE TABLE IF NOT EXISTS collation_records (
    id SERIAL PRIMARY KEY,
    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    level VARCHAR(16) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name VARCHAR(100),
    total_registered_voters INTEGER NOT NULL DEFAULT 0,
    total_accredited_voters INTEGER NOT NULL DEFAULT 0,
    total_valid_votes INTEGER NOT NULL DEFAULT 0,
    total_rejected_votes INTEGER NOT NULL DEFAULT 0,
    total_votes_cast INTEGER NOT NULL DEFAULT 0,
    total_polling_units INTEGER NOT NULL DEFAULT 0,
    reported_polling_units INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    collated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    digital_signature VARCHAR(255),
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (election_id, level, entity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS collation_aggregated_votes (
    id SERIAL PRIMARY KEY,
    collation_id INTEGER NOT NULL REFERENCES collation_records(id) ON DELETE CASCADE,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    total_votes INTEGER NOT NULL DEFAULT 0,
    UNIQUE (collation_id, candidate_id)
  )`,
  `CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    submission_id INTEGER REFERENCES result_submissions(id) ON DELETE SET NULL,
    raised_by INTEGER NOT NULL REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(48) NOT NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'medium',
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    resolution_notes TEXT,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    escalation_level VARCHAR(16) NOT NULL DEFAULT 'ward',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS dispute_comments (
    id SERIAL PRIMARY KEY,
    dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS dispute_evidence (
    id SERIAL PRIMARY KEY,
    dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    description VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (user_id, notification_type)
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER,
    old_value JSONB,
    new_value JSONB,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description VARCHAR(255),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS anomalies (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES result_submissions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    detail TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'warning',
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_wards_lga ON wards(lga_id)',
  'CREATE INDEX IF NOT EXISTS idx_polling_units_ward ON polling_units(ward_id)',
  'CREATE INDEX IF NOT EXISTS idx_polling_units_lga ON polling_units(lga_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
  'CREATE INDEX IF NOT EXISTS idx_users_lga ON users(lga_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_ward ON users(ward_id)',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti)',
  'CREATE INDEX IF NOT EXISTS idx_applications_status ON registration_applications(status)',
  'CREATE INDEX IF NOT EXISTS idx_results_election ON result_submissions(election_id)',
  'CREATE INDEX IF NOT EXISTS idx_results_status ON result_submissions(status)',
  'CREATE INDEX IF NOT EXISTS idx_results_submitter ON result_submissions(submitted_by)',
  'CREATE INDEX IF NOT EXISTS idx_disputes_election ON disputes(election_id)',
  'CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status)',
];

const compatibility = [
  'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB',
  'ALTER TABLE elections ADD COLUMN IF NOT EXISTS election_year INTEGER',
  'ALTER TABLE candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  'ALTER TABLE result_submissions ADD COLUMN IF NOT EXISTS flag_reason TEXT',
  'ALTER TABLE result_submissions ADD COLUMN IF NOT EXISTS flagged_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE result_submissions ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ',
  'ALTER TABLE lgas ADD COLUMN IF NOT EXISTS state_id INTEGER',
  'ALTER TABLE wards ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7)',
  'ALTER TABLE wards ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7)',
  'ALTER TABLE registration_applications ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)',
  'ALTER TABLE registration_applications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_applications_user ON registration_applications(user_id) WHERE user_id IS NOT NULL`,
  `INSERT INTO registration_applications (email, phone, first_name, last_name, requested_role, password_hash, user_id, lga_id, ward_id, polling_unit_id, nin, status, created_at, updated_at)
   SELECT u.email, u.phone, u.first_name, u.last_name, u.role, u.password_hash, u.id, u.lga_id, u.ward_id, u.polling_unit_id, u.nin, 'pending', u.created_at, u.updated_at
   FROM users u
   WHERE u.status = 'pending'
     AND u.role <> 'super_admin'
     AND NOT EXISTS (
       SELECT 1 FROM registration_applications ra
       WHERE ra.user_id = u.id
          OR (ra.user_id IS NULL AND ra.status = 'pending' AND ra.email IS NOT DISTINCT FROM u.email AND ra.phone IS NOT DISTINCT FROM u.phone)
     )`,
];

async function migrate() {
  const client = await rawPool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of schema) await client.query(statement);
    for (const statement of compatibility) await client.query(statement);
    for (const statement of indexes) await client.query(statement);
    await client.query('COMMIT');
    console.log(`Migration complete: ${schema.length} tables and ${indexes.length} indexes are ready.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await rawPool.end();
  }
}

if (require.main === module) migrate();

module.exports = { migrate, schema, indexes };
