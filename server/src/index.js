const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOtpEmail } = require('./notisend');
const {
  sendSmsOtp: sendMobileAuthSms,
  verifyAuthCode,
  getSmsCodeLength,
} = require('./smsService');
const { normalizePhone, isValidRuPhone, staffPlaceholderEmail } = require('./phoneUtils');
const { authMiddleware } = require('./middleware/auth');
const {
  initSubscriptionSchema,
  enrichSyncSnapshot,
  registerSubscriptionRoutes,
} = require('./subscription');
const { mergeSyncSnapshotPayload } = require('./snapshotMerge');
const {
  initChatSchema,
  registerChatRoutes,
  deleteUserChatData,
} = require('./chat');
const { registerScheduleRoutes } = require('./schedule');
const { registerPvzFinanceRoutes } = require('./pvzFinance');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      pin_code VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS pvz_points (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      city VARCHAR(100),
      work_start VARCHAR(10) DEFAULT '09:00',
      work_end VARCHAR(10) DEFAULT '21:00',
      working_hours VARCHAR(50) DEFAULT '09:00 - 21:00',
      phone VARCHAR(50) DEFAULT '',
      owner_inn VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pvz_id UUID REFERENCES pvz_points(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      employee_name VARCHAR(255),
      date DATE,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active',
      payment_status VARCHAR(20) DEFAULT 'pending',
      shift_type VARCHAR(50),
      total_hours NUMERIC,
      earnings NUMERIC,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_support BOOLEAN DEFAULT FALSE,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sync_snapshots (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE users ALTER COLUMN pin_code TYPE VARCHAR(255);
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'owner';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
  `).catch(() => {});

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone IS NOT NULL;
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('employee', 'admin')),
      pvz_id UUID REFERENCES pvz_points(id) ON DELETE CASCADE,
      invited_by UUID REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_invitations_phone_status ON invitations (phone, status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_otp_codes (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS sms_mobile_auth_sessions (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      aero_request_id INTEGER NOT NULL,
      role VARCHAR(20),
      verified BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sms_mobile_auth_phone ON sms_mobile_auth_sessions (phone, verified);
    CREATE TABLE IF NOT EXISTS push_tokens (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      expo_push_token VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('DB initialized');
  await initSubscriptionSchema(pool);
  await initChatSchema(pool);
}

function invitationRowToJson(row, pvzName) {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    role: row.role,
    pvzId: row.pvz_id,
    pvzName: pvzName ?? '',
    status: row.status,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    invitedBy: row.invited_by,
  };
}

async function findPendingInvitations(phone, role) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `SELECT i.*, p.name AS pvz_name
     FROM invitations i
     LEFT JOIN pvz_points p ON p.id = i.pvz_id
     WHERE i.phone = $1 AND i.status = 'pending' AND ($2::text IS NULL OR i.role = $2)
     ORDER BY i.created_at DESC`,
    [normalized, role ?? null]
  );
  return rows.map((row) => invitationRowToJson(row, row.pvz_name));
}

initDB().catch((err) => console.error('DB init failed:', err.message));

// --- Auth ---

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const purpose = req.body.purpose === 'pin_reset' ? 'pin_reset' : 'login';

    if (!email) return res.status(400).json({ error: 'Email required' });

    if (purpose === 'pin_reset') {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)',
      [email, code, expiresAt]
    );

    const result = await sendOtpEmail(email, code, purpose);
    res.json({ success: true, testMode: result.testMode === true });
  } catch (err) {
    console.error('[send-otp]', err.message);
    const message = String(err.message || err);
    if (message.includes('NOTISEND')) {
      return res.status(503).json({ error: 'Email service not configured' });
    }
    if (message.startsWith('delivery_')) {
      const isMailRu = message.includes('non-local sender') || message.includes('mxs.mail.ru');
      return res.status(502).json({
        error: isMailRu
          ? 'Mail.ru rejected: domain SPF/DKIM not configured'
          : 'Email delivery failed',
        detail: message.slice(0, 200),
      });
    }
    res.status(500).json({ error: message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').replace(/\D/g, '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });

    const { rows } = await pool.query(
      `SELECT * FROM otp_codes WHERE email = $1 AND code = $2 AND used = FALSE
       AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [email, code]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired code' });

    await pool.query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [rows[0].id]);

    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      user = await pool.query('INSERT INTO users (email) VALUES ($1) RETURNING *', [email]);
    }

    const row = user.rows[0];
    const token = signToken(row);
    res.json({ token, userId: row.id, hasPin: !!row.pin_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/set-pin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;
    const hashedPin = await bcrypt.hash(String(pin), 10);
    await pool.query('UPDATE users SET pin_code = $1 WHERE id = $2', [hashedPin, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) return res.status(400).json({ error: 'Email and PIN required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!rows[0].pin_code) return res.status(400).json({ error: 'PIN not set' });

    const valid = await bcrypt.compare(String(pin), rows[0].pin_code);
    if (!valid) return res.status(400).json({ error: 'Invalid PIN' });

    const token = signToken(rows[0]);
    res.json({ token, userId: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-pin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body;
    const hashedPin = await bcrypt.hash(String(pin), 10);
    await pool.query('UPDATE users SET pin_code = $1 WHERE id = $2', [hashedPin, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Staff SMS (SMS Aero Mobile Auth) ---

async function saveMobileAuthSession(normalized, aeroRequestId, role) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `UPDATE sms_mobile_auth_sessions SET verified = TRUE
     WHERE phone = $1 AND verified = FALSE`,
    [normalized]
  );
  await pool.query(
    `INSERT INTO sms_mobile_auth_sessions (phone, aero_request_id, role, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [normalized, aeroRequestId, role ?? null, expiresAt]
  );
}

async function findActiveMobileAuthSession(normalized) {
  const { rows } = await pool.query(
    `SELECT * FROM sms_mobile_auth_sessions
     WHERE phone = $1 AND verified = FALSE AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [normalized]
  );
  return rows[0] ?? null;
}

async function handleSendStaffSms(req, res) {
  const { phone, role } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }
  if (role && !['employee', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (!isValidRuPhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone' });
  }

  const normalized = normalizePhone(phone);
  if (role) {
    const pending = await findPendingInvitations(normalized, role);
    if (pending.length === 0) {
      return res.status(404).json({ error: 'No pending invitation' });
    }
  }

  const session = await sendMobileAuthSms(normalized);
  await saveMobileAuthSession(normalized, session.aeroRequestId, role ?? null);

  res.json({
    success: true,
    codeLength: getSmsCodeLength(),
    testMode: process.env.SMSAERO_TEST_MODE === '1',
  });
}

async function handleVerifyStaffSms(req, res) {
  const { phone, code, role } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone and code required' });
  }

  const normalized = normalizePhone(phone);
  const authSession = await findActiveMobileAuthSession(normalized);
  if (!authSession) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  await verifyAuthCode(authSession.aero_request_id, code);
  await pool.query('UPDATE sms_mobile_auth_sessions SET verified = TRUE WHERE id = $1', [
    authSession.id,
  ]);

  const staffRole = role ?? authSession.role;
  if (staffRole) {
    const invitations = await findPendingInvitations(normalized, staffRole);
    if (invitations.length === 0) {
      return res.status(404).json({ error: 'No pending invitation' });
    }

    let user = await pool.query('SELECT * FROM users WHERE phone = $1', [normalized]);
    if (user.rows.length === 0) {
      user = await pool.query(
        `INSERT INTO users (phone, email, role, name) VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          normalized,
          staffPlaceholderEmail(normalized),
          staffRole,
          invitations[0].name,
        ]
      );
    }

    const row = user.rows[0];
    const token = signToken(row);
    return res.json({
      token,
      accessToken: token,
      userId: row.id,
      user: { id: row.id, phone: row.phone, role: row.role, name: row.name },
      invitations,
    });
  }

  let user = await pool.query('SELECT * FROM users WHERE phone = $1', [normalized]);
  if (user.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const row = user.rows[0];
  const token = signToken(row);
  return res.json({
    token,
    accessToken: token,
    userId: row.id,
    user: { id: row.id, phone: row.phone, role: row.role, name: row.name },
  });
}

app.post('/api/auth/send-sms', async (req, res) => {
  try {
    await handleSendStaffSms(req, res);
  } catch (err) {
    console.error('[send-sms]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-sms', async (req, res) => {
  try {
    await handleVerifyStaffSms(req, res);
  } catch (err) {
    console.error('[verify-sms]', err.message);
    const status = /invalid|expired|failed/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** @deprecated — используйте /api/auth/send-sms */
app.post('/api/auth/send-sms-otp', async (req, res) => {
  try {
    await handleSendStaffSms(req, res);
  } catch (err) {
    console.error('[send-sms-otp]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** @deprecated — используйте /api/auth/verify-sms */
app.post('/api/auth/verify-sms-otp', async (req, res) => {
  try {
    await handleVerifyStaffSms(req, res);
  } catch (err) {
    console.error('[verify-sms-otp]', err.message);
    const status = /invalid|expired|failed/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/webhooks/smsaero-mobile-id', (req, res) => {
  console.log('[smsaero-mobile-id webhook]', JSON.stringify(req.body).slice(0, 300));
  res.sendStatus(200);
});

app.post('/api/profiles/staff', authMiddleware, async (req, res) => {
  try {
    const { name, role, pvzId, invitationId } = req.body;
    if (!invitationId) {
      return res.status(400).json({ error: 'invitationId required' });
    }

    const { rows: invRows } = await pool.query(
      `SELECT * FROM invitations WHERE id = $1 AND status = 'pending'`,
      [invitationId]
    );
    if (invRows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    const invitation = invRows[0];
    const normalized = normalizePhone(invitation.phone);

    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userRows[0].phone && normalizePhone(userRows[0].phone) !== normalized) {
      return res.status(403).json({ error: 'Phone mismatch' });
    }

    const staffRole = role ?? invitation.role;
    const staffName = name ?? invitation.name;
    const staffPvzId = pvzId ?? invitation.pvz_id;

    await pool.query(
      `UPDATE users SET phone = $1, email = COALESCE(email, $2), role = $3, name = $4, pvz_id = $5 WHERE id = $6`,
      [normalized, staffPlaceholderEmail(normalized), staffRole, staffName, staffPvzId, req.user.id]
    );
    await pool.query(`UPDATE invitations SET status = 'accepted' WHERE id = $1`, [invitationId]);

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    res.json({
      user: {
        id: updated.rows[0].id,
        phone: updated.rows[0].phone,
        name: updated.rows[0].name,
        role: updated.rows[0].role,
        pvzId: staffPvzId,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Invitations ---

app.get('/api/invitations/check', async (req, res) => {
  try {
    const phone = req.query.phone;
    const role = req.query.role;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const pending = await findPendingInvitations(String(phone), role ? String(role) : null);
    const filtered = role
      ? pending.filter((inv) => inv.role === role)
      : pending;
    res.json({ pending: filtered.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invitations/pending', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT phone FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length || !rows[0].phone) {
      return res.status(400).json({ error: 'Phone not set' });
    }
    const role = req.query.role ? String(req.query.role) : null;
    const invitations = await findPendingInvitations(rows[0].phone, role);
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/invitations', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, p.name AS pvz_name
       FROM invitations i
       LEFT JOIN pvz_points p ON p.id = i.pvz_id
       WHERE i.invited_by = $1
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map((row) => invitationRowToJson(row, row.pvz_name)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invitations', authMiddleware, async (req, res) => {
  try {
    const { phone, name, role, pvzId } = req.body;
    if (!phone || !name || !role || !pvzId) {
      return res.status(400).json({ error: 'phone, name, role, pvzId required' });
    }
    if (!['employee', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (!isValidRuPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone' });
    }

    const normalized = normalizePhone(phone);
    const pvz = await pool.query(
      'SELECT id FROM pvz_points WHERE id = $1 AND owner_id = $2',
      [pvzId, req.user.id]
    );
    if (!pvz.rows.length) {
      return res.status(404).json({ error: 'PVZ not found' });
    }

    await pool.query(
      `UPDATE invitations SET status = 'expired'
       WHERE phone = $1 AND status = 'pending' AND role = $2`,
      [normalized, role]
    );

    const { rows } = await pool.query(
      `INSERT INTO invitations (phone, name, role, pvz_id, invited_by, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [normalized, name, role, pvzId, req.user.id]
    );
    const pvzNameRow = await pool.query('SELECT name FROM pvz_points WHERE id = $1', [pvzId]);
    res.status(201).json(
      invitationRowToJson(rows[0], pvzNameRow.rows[0]?.name ?? '')
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/invitations/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'expired', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rows } = await pool.query('SELECT * FROM invitations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Invitation not found' });

    const invitation = rows[0];
    if (status === 'expired' && invitation.invited_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('UPDATE invitations SET status = $1 WHERE id = $2', [status, req.params.id]);
    const updated = await pool.query(
      `SELECT i.*, p.name AS pvz_name FROM invitations i
       LEFT JOIN pvz_points p ON p.id = i.pvz_id WHERE i.id = $1`,
      [req.params.id]
    );
    res.json(invitationRowToJson(updated.rows[0], updated.rows[0].pvz_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PVZ ---

app.get('/api/pvz', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pvz_points WHERE owner_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pvz', authMiddleware, async (req, res) => {
  try {
    const { name, address, city, work_start, work_end, working_hours, phone, owner_inn } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const { rows } = await pool.query(
      `INSERT INTO pvz_points (owner_id, name, address, city, work_start, work_end, working_hours, phone, owner_inn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.user.id,
        name,
        address || '',
        city || '',
        work_start || '09:00',
        work_end || '21:00',
        working_hours || '09:00 - 21:00',
        phone || '',
        owner_inn || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pvz/:id', authMiddleware, async (req, res) => {
  try {
    const { name, address, city, work_start, work_end, working_hours, phone, owner_inn } = req.body;
    const { rows } = await pool.query(
      `UPDATE pvz_points SET name = COALESCE($1, name), address = COALESCE($2, address),
       city = COALESCE($3, city), work_start = COALESCE($4, work_start), work_end = COALESCE($5, work_end),
       working_hours = COALESCE($6, working_hours), phone = COALESCE($7, phone), owner_inn = COALESCE($8, owner_inn)
       WHERE id = $9 AND owner_id = $10 RETURNING *`,
      [name, address, city, work_start, work_end, working_hours, phone, owner_inn, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'PVZ not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pvz/:id', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM pvz_points WHERE id = $1 AND owner_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'PVZ not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Account deletion ---

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

async function deleteUserAccountData(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM invitations WHERE invited_by = $1', [userId]);
    await client.query('DELETE FROM shifts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM chats WHERE user_id = $1', [userId]);
    await deleteUserChatData(pool, userId, client);
    await client.query('DELETE FROM sync_snapshots WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM pvz_points WHERE owner_id = $1', [userId]);
    const { rows } = await client.query('SELECT email, phone FROM users WHERE id = $1', [userId]);
    if (rows[0]?.email) {
      await client.query('DELETE FROM otp_codes WHERE email = $1', [rows[0].email]);
    }
    if (rows[0]?.phone) {
      await client.query('DELETE FROM sms_otp_codes WHERE phone = $1', [rows[0].phone]);
    }
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

app.delete('/api/account', authMiddleware, async (req, res) => {
  try {
    await deleteUserAccountData(req.user.id);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/account/delete-by-pin', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const userId = String(req.body.userId ?? '').trim();
    const pin = String(req.body.pin ?? '').replace(/\D/g, '');

    if (!email || !userId || pin.length < 4) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const { rows } = await pool.query('SELECT id, email, role, pin_code FROM users WHERE id = $1', [userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    if (user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    if (normalizeEmail(user.email) !== email) return res.status(403).json({ error: 'Email mismatch' });
    if (!user.pin_code) return res.status(400).json({ error: 'PIN not set' });

    const valid = await bcrypt.compare(pin, user.pin_code);
    if (!valid) return res.status(401).json({ error: 'Invalid PIN' });

    await deleteUserAccountData(userId);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Shifts ---

app.get('/api/shifts', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM shifts WHERE user_id = $1 ORDER BY start_time DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shifts/active', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shifts WHERE user_id = $1 AND status = 'active' AND end_time IS NULL
       ORDER BY start_time DESC LIMIT 1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shifts/start', authMiddleware, async (req, res) => {
  try {
    const { pvz_id } = req.body;
    if (!pvz_id) return res.status(400).json({ error: 'pvz_id required' });

    const pvz = await pool.query(
      'SELECT id FROM pvz_points WHERE id = $1 AND owner_id = $2',
      [pvz_id, req.user.id]
    );
    if (!pvz.rows.length) return res.status(404).json({ error: 'PVZ not found' });

    await pool.query(
      `UPDATE shifts SET end_time = NOW(), status = 'completed'
       WHERE user_id = $1 AND status = 'active' AND end_time IS NULL`,
      [req.user.id]
    );

    const now = new Date();
    const { rows } = await pool.query(
      `INSERT INTO shifts (pvz_id, user_id, employee_name, date, start_time, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING *`,
      [pvz_id, req.user.id, req.user.email || 'Owner', now.toISOString().slice(0, 10), now]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shifts/:id/end', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE shifts SET end_time = NOW(), status = 'completed'
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Shift not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Chats ---

app.get('/api/chats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats', authMiddleware, async (req, res) => {
  try {
    const { message, is_support: isSupport } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const { rows } = await pool.query(
      `INSERT INTO chats (user_id, message, is_support) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, message.trim(), Boolean(isSupport)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chats/unread', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM chats WHERE user_id = $1 AND is_read = FALSE AND is_support = TRUE`,
      [req.user.id]
    );
    res.json({ count: rows[0]?.count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chats/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE chats SET is_read = TRUE WHERE user_id = $1 AND is_support = TRUE',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Push tokens ---

app.put('/api/push-tokens', authMiddleware, async (req, res) => {
  try {
    const token = String(req.body.token ?? '').trim();
    if (!token) return res.status(400).json({ error: 'Token required' });
    await pool.query(
      `INSERT INTO push_tokens (user_id, expo_push_token, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET expo_push_token = EXCLUDED.expo_push_token, updated_at = NOW()`,
      [req.user.id, token]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/push-tokens/:userId', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT expo_push_token FROM push_tokens WHERE user_id = $1',
      [req.params.userId]
    );
    res.json({ token: rows[0]?.expo_push_token ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/push-tokens/:userId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Notifications (snapshot per recipient) ---

app.post('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const recipientUserId = String(req.body.recipientUserId ?? '').trim();
    const notification = req.body.notification;
    if (!recipientUserId || !notification || typeof notification !== 'object') {
      return res.status(400).json({ error: 'recipientUserId and notification required' });
    }

    const { rows } = await pool.query(
      'SELECT payload FROM sync_snapshots WHERE user_id = $1',
      [recipientUserId]
    );
    const snapshot = rows[0]?.payload && typeof rows[0].payload === 'object' ? rows[0].payload : {};
    const existing = Array.isArray(snapshot.notifications) ? snapshot.notifications : [];
    const index = existing.findIndex((item) => item?.id === notification.id);
    const next = [...existing];
    if (index >= 0) {
      next[index] = notification;
    } else {
      next.unshift(notification);
    }

    const merged = { ...snapshot, notifications: next.slice(0, 200) };
    await pool.query(
      `INSERT INTO sync_snapshots (user_id, payload, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [recipientUserId, merged]
    );

    res.json({ ok: true, notification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Sync ---

app.get('/api/sync', authMiddleware, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    const role = userRows[0]?.role || 'owner';

    const shiftsQuery =
      role === 'owner'
        ? pool.query(
            `SELECT s.* FROM shifts s
             INNER JOIN pvz_points p ON p.id = s.pvz_id
             WHERE p.owner_id = $1
             ORDER BY s.start_time DESC`,
            [req.user.id]
          )
        : pool.query('SELECT * FROM shifts WHERE user_id = $1 ORDER BY start_time DESC', [
            req.user.id,
          ]);

    const pvzQuery =
      role === 'owner'
        ? pool.query('SELECT * FROM pvz_points WHERE owner_id = $1 ORDER BY created_at ASC', [
            req.user.id,
          ])
        : pool.query(
            `SELECT p.* FROM pvz_points p
             INNER JOIN users u ON u.id = $1
             WHERE p.id = u.pvz_id OR p.owner_id = $1
             ORDER BY p.created_at ASC`,
            [req.user.id]
          );

    const [pvz, shifts, chats, snapshot] = await Promise.all([
      pvzQuery,
      shiftsQuery,
      pool.query('SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]),
      pool.query('SELECT payload FROM sync_snapshots WHERE user_id = $1', [req.user.id]),
    ]);

    const snapshotPayload = snapshot.rows[0]?.payload ?? {};
    const enrichedSnapshot = await enrichSyncSnapshot(pool, req.user.id, snapshotPayload);

    res.json({
      pvz: pvz.rows,
      shifts: shifts.rows,
      chats: chats.rows,
      snapshot: enrichedSnapshot,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync', authMiddleware, async (req, res) => {
  const errors = [];
  try {
    const payload = req.body ?? {};

    if (Array.isArray(payload.pvz)) {
      for (const item of payload.pvz) {
        try {
          if (item.id) {
            await pool.query(
              `INSERT INTO pvz_points (id, owner_id, name, address, city, work_start, work_end, working_hours, phone, owner_inn)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address,
               city = EXCLUDED.city, work_start = EXCLUDED.work_start, work_end = EXCLUDED.work_end,
               working_hours = EXCLUDED.working_hours, phone = EXCLUDED.phone, owner_inn = EXCLUDED.owner_inn`,
              [
                item.id,
                req.user.id,
                item.name,
                item.address || '',
                item.city || '',
                item.workStart || item.work_start || '09:00',
                item.workEnd || item.work_end || '21:00',
                item.workingHours || item.working_hours || '09:00 - 21:00',
                item.phone || '',
                item.ownerInn || item.owner_inn || null,
              ]
            );
          }
        } catch (e) {
          errors.push(`pvz:${item.id}:${e.message}`);
        }
      }
    }

    const { rows: existingRows } = await pool.query(
      'SELECT payload FROM sync_snapshots WHERE user_id = $1',
      [req.user.id]
    );
    const existingPayload = existingRows[0]?.payload ?? {};
    const mergedPayload = mergeSyncSnapshotPayload(existingPayload, payload);

    await pool.query(
      `INSERT INTO sync_snapshots (user_id, payload, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [req.user.id, mergedPayload]
    );

    res.json({ success: errors.length === 0, errors });
  } catch (err) {
    res.status(500).json({ success: false, errors: [err.message] });
  }
});

// --- Subscription (ЮKassa) ---
registerSubscriptionRoutes(app, pool, authMiddleware);

// --- Team chat (rooms / members / messages) ---
registerChatRoutes(app, pool, authMiddleware);

// --- PVZ schedule (shared via owner snapshot) ---
registerScheduleRoutes(app, pool, authMiddleware);

// --- PVZ salary & finance (shared via owner snapshot) ---
registerPvzFinanceRoutes(app, pool, authMiddleware);

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API running on port ${port}`);
});
