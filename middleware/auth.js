const crypto = require('crypto');

// In-memory active user sessions
// Maps session token -> { user, expiresAt }
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes inactivity TTL
const ROLES = new Set(['Admin', 'Manager', 'Staff', 'Customer']);

/**
 * Hash password using Node.js native crypto scrypt with unique salt
 */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify plaintext password against stored salt:hash or legacy string
 */
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) {
    const input = Buffer.from(String(password));
    const legacy = Buffer.from(String(stored || ''));
    return input.length === legacy.length && crypto.timingSafeEqual(input, legacy);
  }
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Create a secure 32-byte session token
 */
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

/**
 * Delete a session token (logout)
 */
function deleteSession(token) {
  sessions.delete(token);
}

/**
 * Update user details stored in active session
 */
function updateSessionUser(userId, updatedUser) {
  for (const [token, value] of sessions) {
    if (value.user.user_id === userId) {
      sessions.set(token, { user: updatedUser, expiresAt: value.expiresAt });
    }
  }
}

/**
 * Authentication Middleware (Requirement 2)
 * Validates session token on every protected request
 */
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token && sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  // Refresh rolling session TTL
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.user = session.user;
  req.sessionToken = token;
  next();
}

/**
 * Role-Based Access Control Middleware
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = {
  sessions,
  ROLES,
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  updateSessionUser,
  requireAuth,
  requireRole
};
