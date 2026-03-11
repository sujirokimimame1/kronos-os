const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL não definida no ambiente.');
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Wrapper compatível com SQLite + PostgreSQL
const db = {
  async query(text, params = []) {
    return pool.query(text, params);
  },

  async get(text, params = [], callback) {
    try {
      const result = await pool.query(text, params);
      const row = result.rows[0] || null;
      if (callback) callback(null, row);
      return row;
    } catch (err) {
      if (callback) callback(err);
      else throw err;
    }
  },

  async all(text, params = [], callback) {
    try {
      const result = await pool.query(text, params);
      if (callback) callback(null, result.rows);
      return result.rows;
    } catch (err) {
      if (callback) callback(err);
      else throw err;
    }
  },

  async run(text, params = [], callback) {
    try {
      const result = await pool.query(text, params);
      const meta = {
        lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
        changes: result.rowCount || 0
      };

      if (callback) callback.call(meta, null);
      return meta;
    } catch (err) {
      if (callback) callback(err);
      else throw err;
    }
  }
};

pool.connect()
  .then(async (client) => {
    console.log('✅ PostgreSQL conectado');
    client.release();
    await criarTabelas();
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar no PostgreSQL:', err.message);
  });

// ✅ FUNÇÃO PARA CLASSIFICAR TIPO DE USUÁRIO
function classificarTipoUsuario(setor, tipoAtual = null) {
  if (tipoAtual === 'admin' || tipoAtual === 'tecnico' || tipoAtual === 'solicitante') {
    return tipoAtual;
  }

  if (setor === 'TI' || setor === 'Manutenção') {
    return 'tecnico';
  }

  return 'solicitante';
}

async function verificarECriarCamposUsuarios() {
  try {
    await db.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'solicitante'
    `);

    await db.query(`
      UPDATE usuarios
      SET tipo = CASE
        WHEN tipo = 'admin' THEN 'admin'
        WHEN setor IN ('TI', 'Manutenção') THEN 'tecnico'
        ELSE 'solicitante'
      END
      WHERE tipo IS NULL
         OR tipo = ''
         OR tipo NOT IN ('solicitante', 'tecnico', 'admin')
    `);

    console.log('✅ Estrutura e perfis da tabela usuarios verificados');
  } catch (err) {
    console.error('❌ Erro ao verificar/ajustar tabela usuarios:', err.message);
  }
}

async function verificarECriarCampos() {
  try {
    await db.query(`
      ALTER TABLE ordens_servico
      ADD COLUMN IF NOT EXISTS data_fechamento TIMESTAMP
    `);

    await db.query(`
      ALTER TABLE ordens_servico
      ADD COLUMN IF NOT EXISTS tempo_resolucao_horas REAL
    `);

    console.log('✅ Campos adicionais da tabela ordens_servico verificados');
  } catch (err) {
    console.error('❌ Erro ao verificar campos de ordens_servico:', err.message);
  }
}

async function criarTabelas() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'solicitante',
        setor TEXT
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ordens_servico (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1,
        setor_origem TEXT NOT NULL,
        setor_destino TEXT NOT NULL,
        categoria TEXT NOT NULL,
        cliente TEXT NOT NULL,
        descricao TEXT NOT NULL,
        prioridade TEXT NOT NULL DEFAULT 'Média',
        status TEXT NOT NULL DEFAULT 'Aberto',
        relato_tecnico TEXT,
        materiais_usados TEXT,
        data_abertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_fechamento TIMESTAMP,
        tempo_resolucao_horas REAL,
        CONSTRAINT fk_usuario
          FOREIGN KEY(user_id)
          REFERENCES usuarios(id)
          ON DELETE SET DEFAULT
      )
    `);

    await verificarECriarCampos();
    await verificarECriarCamposUsuarios();

    const result = await db.query('SELECT COUNT(*)::int AS count FROM usuarios');
    const count = result.rows[0].count;

    if (count === 0) {
      await db.query(`
        INSERT INTO usuarios (nome, email, senha, tipo, setor)
        VALUES
          ('Admin', 'admin@hospital.com', '123456', 'admin', 'TI'),
          ('Técnico Manutenção', 'manutencao@hospital.com', '123456', 'tecnico', 'Manutenção'),
          ('Usuário Teste', 'teste@hospital.com', '123456', 'solicitante', 'Pronto Socorro')
      `);

      console.log('✅ Usuários padrão inseridos');
    }

    console.log('✅ Tabelas PostgreSQL prontas');
  } catch (err) {
    console.error('❌ Erro ao criar tabelas:', err.message);
  }
}

class OrdemServico {
  static async getAll(callback) {
    try {
      const query = `
        SELECT os.*, u.nome AS cliente_nome
        FROM ordens_servico os
        LEFT JOIN usuarios u ON os.user_id = u.id
        ORDER BY os.id DESC
      `;
      const result = await db.query(query);
      callback(null, result.rows);
    } catch (err) {
      console.error('❌ Erro ao listar OS:', err);
      callback(err);
    }
  }

  static async getByUserId(user_id, callback) {
    try {
      const query = `
        SELECT os.*, u.nome AS cliente_nome
        FROM ordens_servico os
        LEFT JOIN usuarios u ON os.user_id = u.id
        WHERE os.user_id = $1
        ORDER BY os.id DESC
      `;
      const result = await db.query(query, [user_id]);
      callback(null, result.rows);
    } catch (err) {
      console.error('❌ Erro ao listar OS do usuário:', err);
      callback(err);
    }
  }

  static async create(data, callback) {
    try {
      let user_id = data.user_id || 1;
      user_id = parseInt(user_id, 10);
      if (isNaN(user_id)) user_id = 1;

      const {
        setor_origem = 'Não informado',
        setor_destino,
        categoria = 'Geral',
        cliente,
        descricao,
        prioridade = 'Média',
        status = 'Aberto',
        solicitante,
        equipamento,
        defeito
      } = data;

      const clienteFinal = cliente || solicitante || 'Não informado';
      const descricaoFinal = descricao || defeito || 'Não informado';
      const descricaoCompleta = equipamento
        ? `Equipamento: ${equipamento}. Problema: ${descricaoFinal}`
        : descricaoFinal;

      const result = await db.query(
        `INSERT INTO ordens_servico
          (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [user_id, setor_origem, setor_destino, categoria, clienteFinal, descricaoCompleta, prioridade, status]
      );

      console.log(`✅ OS criada com ID: ${result.rows[0].id}`);
      callback(null, { id: result.rows[0].id });
    } catch (err) {
      console.error('❌ Erro ao criar OS:', err);
      callback(err);
    }
  }

  static async updateStatus(id, status, relato_tecnico = null, materiais_usados = null, callback) {
    try {
      const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
      if (!statusValidos.includes(status)) {
        return callback(new Error('Status inválido. Use: Aberto, Em Andamento, Aguardando Peças, Finalizado ou Cancelado'));
      }

      if (status === 'Finalizado') {
        const result = await db.query(
          `SELECT data_abertura FROM ordens_servico WHERE id = $1`,
          [id]
        );

        let tempoResolucaoHoras = null;

        if (result.rows.length > 0 && result.rows[0].data_abertura) {
          const dataAbertura = new Date(result.rows[0].data_abertura);
          const dataFechamento = new Date();
          const diffMs = dataFechamento - dataAbertura;
          tempoResolucaoHoras = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
        }

        await db.query(
          `UPDATE ordens_servico
           SET status = $1,
               relato_tecnico = $2,
               materiais_usados = $3,
               data_fechamento = CURRENT_TIMESTAMP,
               tempo_resolucao_horas = $4
           WHERE id = $5`,
          [status, relato_tecnico, materiais_usados, tempoResolucaoHoras, id]
        );
      } else {
        await db.query(
          `UPDATE ordens_servico
           SET status = $1,
               relato_tecnico = $2,
               materiais_usados = $3,
               data_fechamento = NULL,
               tempo_resolucao_horas = NULL
           WHERE id = $4`,
          [status, relato_tecnico, materiais_usados, id]
        );
      }

      callback(null);
    } catch (err) {
      console.error('❌ Erro ao atualizar status da OS:', err);
      callback(err);
    }
  }

  static async getBySetorDestino(setor_destino, callback) {
    try {
      const query = `
        SELECT os.*, u.nome AS cliente_nome
        FROM ordens_servico os
        LEFT JOIN usuarios u ON os.user_id = u.id
        WHERE os.setor_destino = $1
        ORDER BY os.id DESC
      `;
      const result = await db.query(query, [setor_destino]);
      callback(null, result.rows);
    } catch (err) {
      console.error('❌ Erro ao buscar OSs por setor:', err);
      callback(err);
    }
  }

  static async getById(id, callback) {
    try {
      const query = `
        SELECT os.*, u.nome AS cliente_nome, u.email AS cliente_email
        FROM ordens_servico os
        LEFT JOIN usuarios u ON os.user_id = u.id
        WHERE os.id = $1
      `;
      const result = await db.query(query, [id]);
      callback(null, result.rows[0] || null);
    } catch (err) {
      console.error('❌ Erro ao buscar OS por ID:', err);
      callback(err);
    }
  }

  static async updateCompleta(id, data, callback) {
    try {
      const { status, prioridade, relato_tecnico, materiais_usados } = data;

      const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
      if (!statusValidos.includes(status)) {
        return callback(new Error('Status inválido'));
      }

      if (status === 'Finalizado') {
        const resultAbertura = await db.query(
          `SELECT data_abertura FROM ordens_servico WHERE id = $1`,
          [id]
        );

        let tempoResolucaoHoras = null;

        if (resultAbertura.rows.length > 0 && resultAbertura.rows[0].data_abertura) {
          const dataAbertura = new Date(resultAbertura.rows[0].data_abertura);
          const dataFechamento = new Date();
          const diffMs = dataFechamento - dataAbertura;
          tempoResolucaoHoras = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
        }

        const result = await db.query(
          `UPDATE ordens_servico
           SET status = $1,
               prioridade = COALESCE($2, prioridade),
               relato_tecnico = $3,
               materiais_usados = $4,
               data_fechamento = CURRENT_TIMESTAMP,
               tempo_resolucao_horas = $5
           WHERE id = $6`,
          [status, prioridade || null, relato_tecnico || null, materiais_usados || null, tempoResolucaoHoras, id]
        );

        callback(null, { changes: result.rowCount });
      } else {
        const result = await db.query(
          `UPDATE ordens_servico
           SET status = $1,
               prioridade = COALESCE($2, prioridade),
               relato_tecnico = $3,
               materiais_usados = $4
           WHERE id = $5`,
          [status, prioridade || null, relato_tecnico || null, materiais_usados || null, id]
        );

        callback(null, { changes: result.rowCount });
      }
    } catch (err) {
      console.error('❌ Erro ao atualizar OS completa:', err);
      callback(err);
    }
  }
}

module.exports = { db, OrdemServico, classificarTipoUsuario };