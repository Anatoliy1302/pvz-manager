const { normalizePhone } = require('./phoneUtils');
const { sendServerError } = require('./httpErrors');

/** Machine-readable version — sync with src/constants/legal.ts LEGAL_DOCUMENTS_VERSION */
const CURRENT_LEGAL_VERSIONS = {
  privacy: '2026-06-24',
  terms: '2026-06-24',
  consent: '2026-06-24',
};

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

async function initLegalAcceptanceSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255),
      phone VARCHAR(20),
      privacy_version VARCHAR(32) NOT NULL,
      terms_version VARCHAR(32) NOT NULL,
      consent_version VARCHAR(32) NOT NULL,
      app_version VARCHAR(32),
      accepted_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances (user_id);
    CREATE INDEX IF NOT EXISTS idx_legal_acceptances_email ON legal_acceptances (LOWER(email));
    CREATE INDEX IF NOT EXISTS idx_legal_acceptances_phone ON legal_acceptances (phone);
  `);
}

async function hasCurrentLegalAcceptance(pool, { email, phone, userId } = {}) {
  const identityParts = [];
  const params = [
    CURRENT_LEGAL_VERSIONS.privacy,
    CURRENT_LEGAL_VERSIONS.terms,
    CURRENT_LEGAL_VERSIONS.consent,
  ];
  let idx = 4;

  if (userId) {
    identityParts.push(`user_id = $${idx++}`);
    params.push(userId);
  }
  if (email) {
    identityParts.push(`LOWER(email) = LOWER($${idx++})`);
    params.push(normalizeEmail(email));
  }
  if (phone) {
    identityParts.push(`phone = $${idx++}`);
    params.push(normalizePhone(phone));
  }

  if (identityParts.length === 0) return false;

  const { rows } = await pool.query(
    `SELECT 1 FROM legal_acceptances
     WHERE privacy_version = $1 AND terms_version = $2 AND consent_version = $3
       AND (${identityParts.join(' OR ')})
     LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function recordLegalAcceptance(pool, { userId, email, phone, appVersion } = {}) {
  const normEmail = email ? normalizeEmail(email) : null;
  const normPhone = phone ? normalizePhone(phone) : null;
  if (!userId && !normEmail && !normPhone) {
    throw new Error('userId, email or phone required');
  }

  await pool.query(
    `INSERT INTO legal_acceptances
      (user_id, email, phone, privacy_version, terms_version, consent_version, app_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId ?? null,
      normEmail,
      normPhone,
      CURRENT_LEGAL_VERSIONS.privacy,
      CURRENT_LEGAL_VERSIONS.terms,
      CURRENT_LEGAL_VERSIONS.consent,
      appVersion ? String(appVersion).slice(0, 32) : null,
    ]
  );
}

async function linkLegalAcceptanceToUser(pool, userId, { email, phone } = {}) {
  if (!userId) return;
  const normEmail = email ? normalizeEmail(email) : null;
  const normPhone = phone ? normalizePhone(phone) : null;
  if (!normEmail && !normPhone) return;

  await pool.query(
    `UPDATE legal_acceptances SET user_id = $1
     WHERE user_id IS NULL AND (
       ($2::text IS NOT NULL AND LOWER(email) = LOWER($2))
       OR ($3::text IS NOT NULL AND phone = $3)
     )`,
    [userId, normEmail, normPhone]
  );
}

function registerLegalAcceptanceRoutes(app, pool) {
  app.get('/api/auth/legal-status', async (req, res) => {
    try {
      const email = normalizeEmail(req.query.email);
      const phone = req.query.phone ? normalizePhone(req.query.phone) : '';
      if (!email && !phone) {
        return res.status(400).json({ error: 'email or phone required' });
      }

      const accepted = await hasCurrentLegalAcceptance(pool, { email: email || undefined, phone: phone || undefined });
      res.json({ accepted, versions: CURRENT_LEGAL_VERSIONS });
    } catch (err) {
      sendServerError(res, 'legal-acceptance', err);
    }
  });

  app.post('/api/auth/accept-legal', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const phone = req.body.phone ? normalizePhone(req.body.phone) : '';
      const appVersion = req.body.appVersion;

      if (!email && !phone) {
        return res.status(400).json({ error: 'email or phone required' });
      }

      const alreadyAccepted = await hasCurrentLegalAcceptance(pool, {
        email: email || undefined,
        phone: phone || undefined,
      });
      if (!alreadyAccepted) {
        await recordLegalAcceptance(pool, {
          email: email || undefined,
          phone: phone || undefined,
          appVersion,
        });
      }

      res.json({ success: true, versions: CURRENT_LEGAL_VERSIONS });
    } catch (err) {
      sendServerError(res, 'legal-acceptance', err);
    }
  });
}

module.exports = {
  CURRENT_LEGAL_VERSIONS,
  initLegalAcceptanceSchema,
  hasCurrentLegalAcceptance,
  recordLegalAcceptance,
  linkLegalAcceptanceToUser,
  registerLegalAcceptanceRoutes,
};
