const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('./notisend');
const { authMiddleware } = require('./middleware/auth');

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
  `).catch(() => {
    // column may already be wide enough
  });
  console.log('DB initialized');
}

initDB().catch((err) => console.error('DB init failed:', err.message));

// --- Auth ---

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)',
      [email, code, expiresAt]
    );

    await sendEmail(email, 'Код подтверждения PVZ', `Ваш код: ${code}. Действителен 10 минут.`);
    res.json({ success: true });
  } catch (err) {
    console.error('[send-otp]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
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
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const { rows } = await pool.query(
      `INSERT INTO chats (user_id, message, is_support) VALUES ($1,$2,FALSE) RETURNING *`,
      [req.user.id, message.trim()]
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

// --- Sync ---

app.get('/api/sync', authMiddleware, async (req, res) => {
  try {
    const [pvz, shifts, chats, snapshot] = await Promise.all([
      pool.query('SELECT * FROM pvz_points WHERE owner_id = $1 ORDER BY created_at ASC', [req.user.id]),
      pool.query('SELECT * FROM shifts WHERE user_id = $1 ORDER BY start_time DESC', [req.user.id]),
      pool.query('SELECT * FROM chats WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]),
      pool.query('SELECT payload FROM sync_snapshots WHERE user_id = $1', [req.user.id]),
    ]);

    res.json({
      pvz: pvz.rows,
      shifts: shifts.rows,
      chats: chats.rows,
      snapshot: snapshot.rows[0]?.payload ?? {},
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

    await pool.query(
      `INSERT INTO sync_snapshots (user_id, payload, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [req.user.id, payload]
    );

    res.json({ success: errors.length === 0, errors });
  } catch (err) {
    res.status(500).json({ success: false, errors: [err.message] });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API running on port ${port}`);
});
