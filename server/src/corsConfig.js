const cors = require('cors');

const DEFAULT_ORIGINS = [
  'https://pvzpersonal.ru',
  'https://www.pvzpersonal.ru',
  'https://api.pvzpersonal.ru',
];

function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return DEFAULT_ORIGINS;
  if (raw === '*') {
    console.warn('[cors] CORS_ORIGINS=* ignored — using DEFAULT_ORIGINS');
    return DEFAULT_ORIGINS;
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function createCorsMiddleware() {
  const allowed = getAllowedOrigins();

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
  });
}

module.exports = { createCorsMiddleware, DEFAULT_ORIGINS };
