const rateLimit = require('express-rate-limit');

/** 5 attempts per 15 minutes per IP on all /api/auth/* routes. */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Повторите через 15 минут.' },
  skipSuccessfulRequests: false,
});

module.exports = { authRateLimiter };
