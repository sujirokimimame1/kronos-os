const bcrypt = require('bcryptjs');

const HASH_PREFIX = '$2';
const SALT_ROUNDS = 10;

function isHashedPassword(value) {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), SALT_ROUNDS);
}

async function verifyPassword(password, passwordFromDb) {
  if (!passwordFromDb) return false;

  if (isHashedPassword(passwordFromDb)) {
    return bcrypt.compare(String(password), passwordFromDb);
  }

  return String(password) === String(passwordFromDb);
}

module.exports = {
  isHashedPassword,
  hashPassword,
  verifyPassword
};
