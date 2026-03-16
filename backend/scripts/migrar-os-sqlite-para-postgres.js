const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const sqlitePath = path.join(__dirname, '..', 'db', 'kronos.db');

function criarPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000
  });
}

let pg = criarPool();

async function garantirConexao() {
  try {
    await pg.query('SELECT 1');
  } catch (err) {
    console.log('🔄 Reconectando ao PostgreSQL...');
    try {
      await pg.end();
    } catch (_) {}
    pg = criarPool();
    await pg.query('SELECT 1');
  }
}

async function getMaxIdMigrado() {
  const result = await pg.query(`
    SELECT COALESCE(MAX(id), 0) AS max_id
    FROM ordens_servico
  `);
  return Number(result.rows[0].max_id || 0);
}

async function userIdValido(userId) {
  if (!userId) return 1;
  const checkUser = await pg.query(
    `SELECT id FROM usuarios WHERE id = $1`,
    [userId]
  );
  return checkUser.rows.length > 0 ? userId : 1;
}

const sqlite = new sqlite3.Database(sqlitePath, async (err) => {
  if (err) {
    console.error('❌ Erro ao abrir SQLite:', err.message);
    process.exit(1);
  }

  console.log('✅ SQLite antigo aberto:', sqlitePath);

  try {
    await garantirConexao();

    const maxMigrado = await getMaxIdMigrado();
    console.log(`📌 Última OS já migrada no PostgreSQL: ${maxMigrado}`);

    sqlite.all(
      `
      SELECT 
        id,
        user_id,
        setor_origem,
        setor_destino,
        categoria,
        cliente,
        descricao,
        prioridade,
        status,
        relato_tecnico,
        materiais_usados,
        data_abertura,
        data_fechamento,
        tempo_resolucao_horas
      FROM ordens_servico
      WHERE id > ?
      ORDER BY id ASC
      `,
      [maxMigrado],
      async (err, rows) => {
        if (err) {
          console.error('❌ Erro ao ler OS do SQLite:', err.message);
          process.exit(1);
        }

        console.log(`📦 ${rows.length} ordens de serviço restantes para migrar`);

        let migradas = 0;
        let falhas = 0;

        try {
          for (const os of rows) {
            try {
              await garantirConexao();

              const userId = await userIdValido(os.user_id);

              console.log(`➡️ Migrando OS #${os.id} - ${os.cliente}`);

              await pg.query(
                `
                INSERT INTO ordens_servico (
                  id,
                  user_id,
                  setor_origem,
                  setor_destino,
                  categoria,
                  cliente,
                  descricao,
                  prioridade,
                  status,
                  relato_tecnico,
                  materiais_usados,
                  data_abertura,
                  data_fechamento,
                  tempo_resolucao_horas
                )
                VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
                ON CONFLICT (id) DO UPDATE SET
                  user_id = EXCLUDED.user_id,
                  setor_origem = EXCLUDED.setor_origem,
                  setor_destino = EXCLUDED.setor_destino,
                  categoria = EXCLUDED.categoria,
                  cliente = EXCLUDED.cliente,
                  descricao = EXCLUDED.descricao,
                  prioridade = EXCLUDED.prioridade,
                  status = EXCLUDED.status,
                  relato_tecnico = EXCLUDED.relato_tecnico,
                  materiais_usados = EXCLUDED.materiais_usados,
                  data_abertura = EXCLUDED.data_abertura,
                  data_fechamento = EXCLUDED.data_fechamento,
                  tempo_resolucao_horas = EXCLUDED.tempo_resolucao_horas
                `,
                [
                  os.id,
                  userId,
                  os.setor_origem || 'Não informado',
                  os.setor_destino || 'TI',
                  os.categoria || 'Geral',
                  os.cliente || 'Não informado',
                  os.descricao || 'Não informado',
                  os.prioridade || 'Média',
                  os.status || 'Aberto',
                  os.relato_tecnico || null,
                  os.materiais_usados || null,
                  os.data_abertura || null,
                  os.data_fechamento || null,
                  os.tempo_resolucao_horas || null
                ]
              );

              migradas++;

              if (migradas % 50 === 0) {
                console.log(`✅ ${migradas} OS migradas até agora...`);
              }
            } catch (e) {
              falhas++;
              console.error(`❌ Falha na OS #${os.id}: ${e.message}`);
            }
          }

          console.log(`✅ Migração concluída. Migradas: ${migradas}. Falhas: ${falhas}.`);

          const maxIdResult = await pg.query(`
            SELECT COALESCE(MAX(id), 0) AS max_id FROM ordens_servico
          `);

          const nextId = Number(maxIdResult.rows[0].max_id) + 1;

          await pg.query(
            `
            SELECT setval(
              pg_get_serial_sequence('ordens_servico', 'id'),
              $1,
              false
            )
            `,
            [nextId]
          );

          console.log(`✅ Sequência ajustada. Próximo ID: ${nextId}`);
        } finally {
          sqlite.close();
          await pg.end();
          process.exit(0);
        }
      }
    );
  } catch (e) {
    console.error('❌ Erro geral:', e.message);
    sqlite.close();
    try {
      await pg.end();
    } catch (_) {}
    process.exit(1);
  }
});