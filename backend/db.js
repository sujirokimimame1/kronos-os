const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida no ambiente.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL conectado');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar no PostgreSQL:', err);
  });

const db = {
  all: async (query, params = [], callback) => {
    try {
      const result = await pool.query(query, params);
      if (callback) {
        callback(null, result.rows);
        return;
      }
      return result.rows;
    } catch (err) {
      if (callback) {
        callback(err, null);
        return;
      }
      throw err;
    }
  },

  get: async (query, params = [], callback) => {
    try {
      const result = await pool.query(query, params);
      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;

      if (callback) {
        callback(null, row);
        return;
      }
      return row;
    } catch (err) {
      if (callback) {
        callback(err, null);
        return;
      }
      throw err;
    }
  },

  run: async (query, params = [], callback) => {
    try {
      const result = await pool.query(query, params);

      const response = {
        lastID:
          result.rows &&
          result.rows[0] &&
          (result.rows[0].id || result.rows[0].lastID || null),
        changes: result.rowCount || 0
      };

      if (callback) {
        callback.call(response, null);
        return response;
      }

      return response;
    } catch (err) {
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    }
  },

  exec: async (query, callback) => {
    try {
      const result = await pool.query(query);
      if (callback) {
        callback(null);
        return result;
      }
      return result;
    } catch (err) {
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    }
  },

  query: async (query, params = []) => {
    return pool.query(query, params);
  }
};

module.exports = db;