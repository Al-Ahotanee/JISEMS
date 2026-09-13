const bcrypt = require('bcryptjs');
const { pool } = require('./database');
const JIGAWA_GEO = require('../data/jigawa-geo');
require('dotenv').config();

async function firstValue(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0];
}

async function seed() {
  try {
    console.log('Beginning JISEMS Jigawa State Database Seeding...');
    const lgaIds = {};
    const wardIds = {};
    let dutseLgaId = null;
    let firstDutseWardId = null;
    let firstDutsePUId = null;

    // 1. Seed 27 LGAs
    for (const lga of JIGAWA_GEO.lgas) {
      const row = await firstValue(
        `INSERT INTO lgas (name, code, headquarters, latitude, longitude)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, headquarters = EXCLUDED.headquarters, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude
         RETURNING id`,
        [lga.name, lga.code, lga.headquarters, lga.coordinates.lat, lga.coordinates.lng],
      );
      const lgaId = row?.id || (await firstValue('SELECT id FROM lgas WHERE code = ?', [lga.code])).id;
      lgaIds[lga.code] = lgaId;
      if (lga.code === 'DUT') dutseLgaId = lgaId;
    }
    console.log(`Seeded ${Object.keys(lgaIds).length} LGAs for Jigawa State.`);

    // 2. Seed Wards
    for (const lga of JIGAWA_GEO.lgas) {
      const lgaId = lgaIds[lga.code];
      for (const ward of lga.wards) {
        const row = await firstValue(
          `INSERT INTO wards (lga_id, name, code)
           VALUES (?, ?, ?)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [lgaId, ward.name, ward.code],
        );
        const wardId = row?.id || (await firstValue('SELECT id FROM wards WHERE code = ?', [ward.code])).id;
        wardIds[ward.code] = wardId;
        if (lga.code === 'DUT' && !firstDutseWardId) firstDutseWardId = wardId;
      }
    }
    console.log(`Seeded ${Object.keys(wardIds).length} Wards.`);

    // 3. Seed Polling Units
    let puCount = 0;
    for (const lga of JIGAWA_GEO.lgas) {
      const lgaId = lgaIds[lga.code];
      for (const ward of lga.wards) {
        const wardId = wardIds[ward.code];
        for (const pu of ward.pollingUnits) {
          const row = await firstValue(
            `INSERT INTO polling_units (ward_id, lga_id, name, code, inec_pu_code, registered_voters, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, registered_voters = EXCLUDED.registered_voters
             RETURNING id`,
            [wardId, lgaId, pu.name, pu.code, pu.code, pu.registeredVoters, pu.coordinates?.lat || null, pu.coordinates?.lng || null],
          );
          puCount++;
          if (lga.code === 'DUT' && wardId === firstDutseWardId && !firstDutsePUId) {
            firstDutsePUId = row?.id || (await firstValue('SELECT id FROM polling_units WHERE code = ?', [pu.code])).id;
          }
        }
      }
    }
    console.log(`Seeded ${puCount} Polling Units across Jigawa State.`);

    // 4. Seed Multiple Elections
    const electionsToSeed = [
      {
        title: '2027 Jigawa State Gubernatorial Election',
        election_type: 'gubernatorial',
        constituency_type: 'statewide',
        constituency_name: 'Statewide (All 27 LGAs)',
        election_date: '2027-03-06',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Statewide Gubernatorial contest to elect the Executive Governor of Jigawa State.',
        candidates: [
          { full_name: 'Mallam Umar A. Namadi', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Mustapha Sule Lamido', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Aminu Ibrahim Ringim', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
          { full_name: 'Abdullahi Tsoho', party_code: 'LP', party_name: 'Labour Party', position: 4 },
          { full_name: 'Sani Gumel', party_code: 'ADC', party_name: 'African Democratic Congress', position: 5 },
        ]
      },
      {
        title: '2027 Jigawa North-East Senatorial Election',
        election_type: 'senatorial',
        constituency_type: 'senatorial',
        constituency_name: 'Jigawa North-East',
        election_date: '2027-02-20',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Senatorial contest for Jigawa North-East (Hadejia, Biriniwa, Guri, Kafin Hausa, Kiri Kasama, Malam Madori, Auyo, Kaugama, Gagarawa).',
        candidates: [
          { full_name: 'Ahmed Abdulhamid Malam-Madori', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Nuraddeen Muhammad', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Bashir Babandi', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
        ]
      },
      {
        title: '2027 Jigawa North-West Senatorial Election',
        election_type: 'senatorial',
        constituency_type: 'senatorial',
        constituency_name: 'Jigawa North-West',
        election_date: '2027-02-20',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Senatorial contest for Jigawa North-West (Babura, Garki, Gumel, Gwiwa, Kazaure, Maigatari, Roni, Sule Tankarkar, Yankwashi).',
        candidates: [
          { full_name: 'Babangida Husseini', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Nasiru Umar Roni', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Aliyu Muhammad Gwiwa', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
        ]
      },
      {
        title: '2027 Jigawa South-West Senatorial Election',
        election_type: 'senatorial',
        constituency_type: 'senatorial',
        constituency_name: 'Jigawa South-West',
        election_date: '2027-02-20',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Senatorial contest for Jigawa South-West (Birnin Kudu, Buji, Dutse, Gwaram, Jahun, Kiyawa, Miga, Ringim, Taura).',
        candidates: [
          { full_name: 'Tijjani Ibrahim Kiyawa', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Mustapha Khabeeb', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Rabiu Garba Taura', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
        ]
      },
      {
        title: '2027 Dutse / Kiyawa Federal Constituency Election',
        election_type: 'house_of_representatives',
        constituency_type: 'federal_constituency',
        constituency_name: 'Dutse / Kiyawa',
        election_date: '2027-02-20',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Federal House of Representatives election for Dutse / Kiyawa Federal Constituency.',
        candidates: [
          { full_name: 'Dahiru Madaki', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Aminu Kanta', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Haruna Aliyu', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
        ]
      },
      {
        title: '2027 Dutse Central State Assembly Election',
        election_type: 'state_assembly',
        constituency_type: 'state_assembly',
        constituency_name: 'Dutse',
        election_date: '2027-03-06',
        election_year: 2027,
        status: 'ongoing',
        state: 'Jigawa',
        description: 'Jigawa State House of Assembly constituency election for Dutse.',
        candidates: [
          { full_name: 'Kabiru Ibrahim', party_code: 'APC', party_name: 'All Progressives Congress', position: 1 },
          { full_name: 'Usman Bello', party_code: 'PDP', party_name: 'Peoples Democratic Party', position: 2 },
          { full_name: 'Yakubu Chamo', party_code: 'NNPP', party_name: 'New Nigeria Peoples Party', position: 3 },
        ]
      }
    ];

    for (const el of electionsToSeed) {
      const electionRow = await firstValue(
        `INSERT INTO elections (title, election_type, election_date, election_year, status, state, description, constituency_type, constituency_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [el.title, el.election_type, el.election_date, el.election_year, el.status, el.state, el.description, el.constituency_type, el.constituency_name],
      );
      const elId = electionRow?.id || (await firstValue('SELECT id FROM elections WHERE title = ?', [el.title])).id;

      for (const cand of el.candidates) {
        await pool.query(
          `INSERT INTO candidates (election_id, full_name, party_code, party_name, position)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (election_id, party_code) DO UPDATE SET full_name = EXCLUDED.full_name, party_name = EXCLUDED.party_name, position = EXCLUDED.position`,
          [elId, cand.full_name, cand.party_code, cand.party_name, cand.position],
        );
      }
    }
    console.log(`Seeded ${electionsToSeed.length} Elections with all registered Candidates.`);

    // 5. Seed Jigawa Users
    const passwordHashes = {
      admin: await bcrypt.hash('Admin@JISEMS2027!', 12),
      coordinator: await bcrypt.hash('Coord@123456!', 12),
      lga: await bcrypt.hash('LGA@123456!', 12),
      ward: await bcrypt.hash('Ward@123456!', 12),
      agent: await bcrypt.hash('Agent@123456!', 12),
      observer: await bcrypt.hash('Observer@123!', 12),
    };

    const users = [
      ['admin@jisems.ng', '+2348000000001', passwordHashes.admin, 'System', 'Administrator', 'super_admin', 'active', null, null, null],
      ['coordinator@jisems.ng', '+2348000000002', passwordHashes.coordinator, 'Jigawa', 'Coordinator', 'state_coordinator', 'active', null, null, null],
      ['dutse-lga@jisems.ng', '+2348000000003', passwordHashes.lga, 'Dutse LGA', 'Officer', 'lga_coordinator', 'active', dutseLgaId, null, null],
      ['ward1@jisems.ng', '+2348000000004', passwordHashes.ward, 'Limawa Ward', 'Officer', 'ward_officer', 'active', dutseLgaId, firstDutseWardId, null],
      ['agent@jisems.ng', '+2348000000005', passwordHashes.agent, 'Dutse Central', 'Agent', 'pu_agent', 'active', dutseLgaId, firstDutseWardId, firstDutsePUId],
      ['observer@jisems.ng', '+2348000000006', passwordHashes.observer, 'Election', 'Observer', 'observer', 'active', null, null, null],
    ];

    for (const user of users) {
      await pool.query(
        `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, status, lga_id, ward_id, polling_unit_id, email_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
         ON CONFLICT (email) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role, lga_id = EXCLUDED.lga_id, ward_id = EXCLUDED.ward_id, polling_unit_id = EXCLUDED.polling_unit_id`,
        user,
      );
    }
    console.log(`Seeded Jigawa default role accounts.`);

    // 6. System Configuration
    const configs = [
      ['app_name', 'JISEMS', 'Application name'],
      ['app_tagline', 'Counting Every Vote. Protecting Every Voice in The New World.', 'Application tagline'],
      ['election_state', 'Jigawa', 'Target state'],
      ['state_capital', 'Dutse', 'State capital'],
      ['total_lgas', '27', 'Number of LGAs'],
      ['max_upload_size', '10485760', 'Max file upload size in bytes'],
      ['max_images_per_submission', '5', 'Max images per result submission'],
      ['offline_sync_enabled', 'true', 'Enable offline sync'],
      ['maintenance_mode', 'false', 'Maintenance mode toggle'],
    ];

    for (const config of configs) {
      await pool.query(
        `INSERT INTO system_config (config_key, config_value, description)
         VALUES (?, ?, ?)
         ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, description = EXCLUDED.description`,
        config,
      );
    }

    const counts = {};
    for (const table of ['lgas', 'wards', 'polling_units', 'elections', 'candidates', 'users']) {
      const row = await firstValue(`SELECT COUNT(*)::INTEGER AS count FROM ${table}`);
      counts[table] = row.count;
    }
    console.log(`JISEMS Seed Complete: ${JSON.stringify(counts)}`);
  } catch (error) {
    console.error('Seed failed:', {
      message: error?.message || String(error),
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint,
      stack: error?.stack,
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) seed();

module.exports = { seed };
