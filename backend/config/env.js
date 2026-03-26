const path = require('path');
const fs = require('fs');

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) return;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

(function initEnv() {
  const envFiles = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env')
  ];

  envFiles.forEach(loadDotEnvFile);
})();

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

function getBooleanEnv(name, fallback = false) {
  const value = getEnv(name);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(String(value).toLowerCase());
}

const nodeEnv = getEnv('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const jwtSecret = getEnv('JWT_SECRET');

if (!jwtSecret) {
  if (isProduction) {
    throw new Error('JWT_SECRET não definida no ambiente de produção.');
  }

  process.env.JWT_SECRET = 'kronos_dev_only_change_me';
  console.warn('⚠️ JWT_SECRET não definida. Usando segredo temporário apenas para desenvolvimento local.');
}

module.exports = {
  getEnv,
  getBooleanEnv,
  nodeEnv,
  isProduction,
  jwtSecret: process.env.JWT_SECRET
};
