const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const sqlitePath = path.join(__dirname, '..', 'db', 'kronos.db');

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const sqlite = new sqlite3.Database(sqlitePath, async (err) => {
  if (err) {
    console.error('❌ Erro ao abrir SQLite:', err.message);
    process.exit(1);
  }

  console.log('✅ SQLite antigo aberto:', sqlitePath);

  sqlite.all(
    `SELECT id, nome, email, senha, setor, tipo FROM usuarios`,
    async (err, rows) => {
      if (err) {
        console.error('❌ Erro ao ler usuários do SQLite:', err.message);
        process.exit(1);
      }

      console.log(`📦 ${rows.length} usuários encontrados no SQLite`);

      try {
        for (const user of rows) {
          console.log(`➡️ Migrando: ${user.email}`);

          await pg.query(
            `
            INSERT INTO usuarios (nome, email, senha, setor, tipo)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE
            SET
              nome = EXCLUDED.nome,
              senha = EXCLUDED.senha,
              setor = EXCLUDED.setor,
              tipo = EXCLUDED.tipo
            `,
            [
              user.nome,
              user.email,
              user.senha,
              user.setor || 'Pronto Socorro',
              user.tipo || 'solicitante'
            ]
          );
        }

        console.log('✅ Migração de usuários concluída com sucesso');
      } catch (e) {
        console.error('❌ Erro ao inserir no PostgreSQL:', e.message);
      } finally {
        sqlite.close();
        await pg.end();
        process.exit(0);
      }
    }
  );
});