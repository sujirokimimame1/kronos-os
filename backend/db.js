const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ✅ Caminho único do banco
// Em produção no Render, defina:
// DB_PATH=/data/kronos.db
// Em ambiente local, se não definir DB_PATH, ele usará ./data/kronos.db
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'kronos.db');
const dbDir = path.dirname(dbPath);

// ✅ Garantir que o diretório existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ Pasta do banco criada:', dbDir);
}

console.log('📦 Banco selecionado:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Falha ao abrir/criar o banco de dados:', err.message);
  } else {
    console.log('✅ Banco de dados conectado:', dbPath);
    criarTabelas();
  }
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

// ✅ FUNÇÃO PARA VERIFICAR E CRIAR CAMPOS NA TABELA USUARIOS
function verificarECriarCamposUsuarios() {
  return new Promise((resolve) => {
    db.all('PRAGMA table_info(usuarios)', (err, rows) => {
      if (err) {
        console.error('❌ Erro ao verificar estrutura da tabela usuarios:', err);
        resolve();
        return;
      }

      const camposExistentes = Array.isArray(rows) ? rows.map((row) => row.name) : [];

      const finalizar = () => {
        db.run(
          `UPDATE usuarios
           SET tipo = CASE
             WHEN tipo = 'admin' THEN 'admin'
             WHEN setor IN ('TI', 'Manutenção') THEN 'tecnico'
             ELSE 'solicitante'
           END
           WHERE tipo IS NULL OR tipo = '' OR tipo NOT IN ('solicitante', 'tecnico', 'admin')`,
          (updateErr) => {
            if (updateErr) {
              console.error('❌ Erro ao normalizar tipos de usuário:', updateErr);
            } else {
              console.log('✅ Perfis de usuário normalizados');
            }
            resolve();
          }
        );
      };

      if (!camposExistentes.includes('tipo')) {
        db.run(
          "ALTER TABLE usuarios ADD COLUMN tipo TEXT NOT NULL DEFAULT 'solicitante' CHECK(tipo IN ('solicitante', 'tecnico', 'admin'))",
          (alterErr) => {
            if (alterErr) {
              console.error('❌ Erro ao adicionar coluna tipo em usuarios:', alterErr);
            } else {
              console.log('✅ Campo tipo adicionado em usuarios');
            }
            finalizar();
          }
        );
      } else {
        finalizar();
      }
    });
  });
}

function criarTabelas() {
  db.serialize(() => {
    // ✅ TABELA DE USUÁRIOS
    db.run(
      `
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'solicitante' CHECK(tipo IN ('solicitante', 'tecnico', 'admin')),
        setor TEXT CHECK(setor IN (
          'Pronto Socorro', 'Recepção', 'Ambulatório', 'Administrativo',
          'Faturamento', 'Maternidade', 'Clínica Médica', 'Clínica Cirúrgica',
          'Centro Cirúrgico', 'Tomografia', 'Mamografia', 'HEMOPI', 'Núcleos', 'UTI',
          'Farmácia', 'Almoxarifado', 'Nutrição', 'Laboratório', 'Fisioterapia',
          'TI', 'Manutenção'
        ))
      )
    `,
      (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela usuarios:', err);
        } else {
          console.log('✅ Tabela usuarios verificada/criada');
        }
      }
    );

    // ✅ TABELA ORDENS_SERVICO
    db.run(
      `
      CREATE TABLE IF NOT EXISTS ordens_servico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        setor_origem TEXT NOT NULL,
        setor_destino TEXT NOT NULL CHECK(setor_destino IN ('TI', 'Manutenção')),
        categoria TEXT NOT NULL,
        cliente TEXT NOT NULL,
        descricao TEXT NOT NULL,
        prioridade TEXT NOT NULL DEFAULT 'Média',
        status TEXT NOT NULL DEFAULT 'Aberto',
        relato_tecnico TEXT,
        materiais_usados TEXT,
        data_abertura TEXT DEFAULT (datetime('now', 'localtime')),
        data_fechamento TEXT,
        tempo_resolucao_horas REAL,
        FOREIGN KEY (user_id) REFERENCES usuarios(id)
      )
    `,
      async (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela ordens_servico:', err);
        } else {
          console.log('✅ Tabela ordens_servico verificada/criada');

          // ✅ VERIFICAR CAMPOS FALTANTES
          await verificarECriarCampos();
          await verificarECriarCamposUsuarios();
        }
      }
    );

    // ✅ INSERIR USUÁRIOS PADRÃO APENAS SE A TABELA ESTIVER VAZIA
    db.get('SELECT COUNT(*) as count FROM usuarios', (err, row) => {
      if (err) {
        console.error('❌ Erro ao verificar usuários:', err);
        return;
      }

      if (row.count === 0) {
        db.run(
          `
          INSERT INTO usuarios (nome, email, senha, tipo, setor)
          VALUES 
          ('Admin', 'admin@hospital.com', '123456', 'admin', 'TI'),
          ('Técnico Manutenção', 'manutencao@hospital.com', '123456', 'tecnico', 'Manutenção'),
          ('Usuário Teste', 'teste@hospital.com', '123456', 'solicitante', 'Pronto Socorro')
        `,
          (insertErr) => {
            if (insertErr) {
              console.error('❌ Erro ao inserir usuários padrão:', insertErr);
            } else {
              console.log('✅ Usuários padrão inseridos');
            }
          }
        );
      }
    });
  });
}

// ✅ FUNÇÃO PARA VERIFICAR E CRIAR CAMPOS FALTANTES NA TABELA ORDENS_SERVICO
function verificarECriarCampos() {
  return new Promise((resolve) => {
    db.all('PRAGMA table_info(ordens_servico)', (err, rows) => {
      if (err) {
        console.error('❌ Erro ao verificar estrutura da tabela ordens_servico:', err);
        resolve();
        return;
      }

      const camposExistentes = Array.isArray(rows) ? rows.map((row) => row.name) : [];
      console.log('📋 Campos existentes em ordens_servico:', camposExistentes);

      const promises = [];

      if (!camposExistentes.includes('data_fechamento')) {
        promises.push(
          new Promise((res) => {
            db.run('ALTER TABLE ordens_servico ADD COLUMN data_fechamento TEXT', (alterErr) => {
              if (alterErr) {
                console.error('❌ Erro ao adicionar data_fechamento:', alterErr);
              } else {
                console.log('✅ Campo data_fechamento adicionado');
              }
              res();
            });
          })
        );
      }

      if (!camposExistentes.includes('tempo_resolucao_horas')) {
        promises.push(
          new Promise((res) => {
            db.run('ALTER TABLE ordens_servico ADD COLUMN tempo_resolucao_horas REAL', (alterErr) => {
              if (alterErr) {
                console.error('❌ Erro ao adicionar tempo_resolucao_horas:', alterErr);
              } else {
                console.log('✅ Campo tempo_resolucao_horas adicionado');
              }
              res();
            });
          })
        );
      }

      Promise.all(promises).then(() => resolve());
    });
  });
}

class OrdemServico {
  static getAll(callback) {
    const query = `
      SELECT os.*, u.nome as cliente_nome 
      FROM ordens_servico os 
      LEFT JOIN usuarios u ON os.user_id = u.id 
      ORDER BY os.id DESC
    `;
    db.all(query, callback);
  }

  static getByUserId(user_id, callback) {
    const query = `
      SELECT os.*, u.nome as cliente_nome 
      FROM ordens_servico os 
      LEFT JOIN usuarios u ON os.user_id = u.id 
      WHERE os.user_id = ? 
      ORDER BY os.id DESC
    `;
    db.all(query, [user_id], callback);
  }

  static create(data, callback) {
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

    console.log('📦 Criando OS:', {
      user_id,
      setor_destino,
      cliente: clienteFinal,
      prioridade
    });

    db.run(
      `INSERT INTO ordens_servico (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, setor_origem, setor_destino, categoria, clienteFinal, descricaoCompleta, prioridade, status],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar OS:', err);
          return callback(err);
        }
        console.log(`✅ OS criada com ID: ${this.lastID}`);
        callback(null, { id: this.lastID });
      }
    );
  }

  // ✅ Atualizar status com cálculo de tempo de resolução
  static updateStatus(id, status, relato_tecnico = null, materiais_usados = null, callback) {
    const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];

    if (!statusValidos.includes(status)) {
      return callback(
        new Error('Status inválido. Use: Aberto, Em Andamento, Aguardando Peças, Finalizado ou Cancelado')
      );
    }

    if (status === 'Finalizado') {
      const dataFechamento = new Date().toISOString();

      db.get('SELECT data_abertura FROM ordens_servico WHERE id = ?', [id], (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar data abertura:', err);
          return callback(err);
        }

        let tempoResolucaoHoras = null;

        if (row && row.data_abertura) {
          const dataAbertura = new Date(row.data_abertura);
          const dataFechamentoDate = new Date(dataFechamento);
          const diffMs = dataFechamentoDate - dataAbertura;
          tempoResolucaoHoras = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
        }

        db.run(
          `UPDATE ordens_servico 
           SET status = ?, relato_tecnico = ?, materiais_usados = ?, data_fechamento = ?, tempo_resolucao_horas = ?
           WHERE id = ?`,
          [status, relato_tecnico, materiais_usados, dataFechamento, tempoResolucaoHoras, id],
          callback
        );
      });
    } else {
      db.run(
        `UPDATE ordens_servico 
         SET status = ?, relato_tecnico = ?, materiais_usados = ?, data_fechamento = NULL, tempo_resolucao_horas = NULL
         WHERE id = ?`,
        [status, relato_tecnico, materiais_usados, id],
        callback
      );
    }
  }

  static getBySetorDestino(setor_destino, callback) {
    const query = `
      SELECT os.*, u.nome as cliente_nome 
      FROM ordens_servico os 
      LEFT JOIN usuarios u ON os.user_id = u.id 
      WHERE os.setor_destino = ? 
      ORDER BY os.id DESC
    `;

    db.all(query, [setor_destino], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar OSs por setor:', err);
        return callback(err);
      }
      console.log(`✅ Encontradas ${rows.length} OSs para setor ${setor_destino}`);
      callback(null, rows);
    });
  }

  static getById(id, callback) {
    const query = `
      SELECT os.*, u.nome as cliente_nome, u.email as cliente_email
      FROM ordens_servico os
      LEFT JOIN usuarios u ON os.user_id = u.id
      WHERE os.id = ?
    `;

    db.get(query, [id], (err, row) => {
      if (err) {
        console.error('❌ Erro ao buscar OS por ID:', err);
        return callback(err);
      }
      callback(null, row);
    });
  }

  static updateCompleta(id, data, callback) {
    const { status, prioridade, relato_tecnico, materiais_usados } = data;

    const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
    if (!statusValidos.includes(status)) {
      return callback(new Error('Status inválido'));
    }

    let query = 'UPDATE ordens_servico SET status = ?';
    const params = [status];

    if (prioridade) {
      query += ', prioridade = ?';
      params.push(prioridade);
    }

    if (status === 'Finalizado') {
      query += ", relato_tecnico = ?, materiais_usados = ?, data_fechamento = datetime('now', 'localtime')";
      params.push(relato_tecnico || null, materiais_usados || null);
    } else {
      query += ', relato_tecnico = ?, materiais_usados = ?';
      params.push(relato_tecnico || null, materiais_usados || null);
    }

    query += ' WHERE id = ?';
    params.push(id);

    console.log('📝 Query de atualização completa:', query);
    console.log('📋 Parâmetros:', params);

    db.run(query, params, function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar OS completa:', err);
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }
}

module.exports = { db, dbPath, OrdemServico, classificarTipoUsuario };