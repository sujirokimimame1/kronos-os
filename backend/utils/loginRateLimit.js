const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded || req.ip || 'unknown');
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${ip}::${email}`;
}

function cleanupExpired(now = Date.now()) {
  for (const [key, entry] of attempts.entries()) {
    if (entry.expiresAt <= now) {
      attempts.delete(key);
    }
  }
}

function registerFailure(req) {
  const now = Date.now();
  cleanupExpired(now);

  const key = getClientKey(req);
  const entry = attempts.get(key) || { count: 0, expiresAt: now + WINDOW_MS };
  entry.count += 1;
  entry.expiresAt = now + WINDOW_MS;
  attempts.set(key, entry);

  return entry;
}

function clearFailures(req) {
  attempts.delete(getClientKey(req));
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  cleanupExpired(now);

  const key = getClientKey(req);
  const entry = attempts.get(key);

  if (entry && entry.count >= MAX_ATTEMPTS && entry.expiresAt > now) {
    const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
    });
  }

  return next();
}

module.exports = {
  loginRateLimit,
  registerFailure,
  clearFailures
};
