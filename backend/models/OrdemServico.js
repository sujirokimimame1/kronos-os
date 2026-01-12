const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ✅ CONFIGURAÇÃO PARA FLY.IO
const dbPath = process.env.DB_PATH || path.join(__dirname, '../db/kronos.db');
const dbDir = path.dirname(dbPath);

// Garantir que o diretório existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ Pasta do banco criada:', dbDir);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Falha ao abrir/criar o banco de dados:', err.message);
  } else {
    console.log('✅ Banco de dados conectado:', dbPath);
    criarTabelas();
  }
});

function criarTabelas() {
  db.serialize(() => {
    // Tabela de usuários COM coluna setor
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        setor TEXT CHECK(setor IN (
          'Pronto Socorro', 'Recepção', 'Ambulatório', 'Administrativo',
          'Faturamento', 'Maternidade', 'Clínica Médica', 'Clínica Cirúrgica',
          'Centro Cirúrgico', 'Tomografia', 'HEMOPI', 'Núcleos', 'UTI',
          'Farmácia', 'Almoxarifado', 'Nutrição', 'Laboratório', 'Fisioterapia',
          'TI', 'Manutenção'
        ))
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela usuarios:', err);
      } else {
        console.log('✅ Tabela usuarios verificada/criada');
      }
    });

    // Tabela de ordens de serviço
    db.run(`
      CREATE TABLE IF NOT EXISTS ordens_servico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        setor_origem TEXT NOT NULL,
        setor_destino TEXT NOT NULL CHECK(setor_destino IN ('TI', 'Manutenção')),
        categoria TEXT NOT NULL,
        cliente TEXT NOT NULL,
        descricao TEXT NOT NULL,
        prioridade TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Aberto',
        relato_tecnico TEXT,
        materiais_usados TEXT,
        data_abertura TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES usuarios(id)
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela ordens_servico:', err);
      } else {
        console.log('✅ Tabela ordens_servico verificada/criada');
      }
    });

    // Inserir usuário padrão se não existir
    db.get("SELECT COUNT(*) as count FROM usuarios", (err, row) => {
      if (err) {
        console.error('❌ Erro ao verificar usuários:', err);
        return;
      }

      if (row.count === 0) {
        db.run(`
          INSERT INTO usuarios (nome, email, senha, setor)
          VALUES ('Usuário Teste', 'teste@hospital.com', '123456', 'Pronto Socorro')
        `, (err) => {
          if (err) {
            console.error('❌ Erro ao inserir usuário padrão:', err);
          } else {
            console.log('✅ Usuário padrão inserido');
          }
        });
      }
    });
  });
}

class OrdemServico {
  static getAll(callback) {
    db.all('SELECT * FROM ordens_servico ORDER BY id DESC', callback);
  }

  static getByUserId(user_id, callback) {
    db.all('SELECT * FROM ordens_servico WHERE user_id = ? ORDER BY id DESC', [user_id], callback);
  }

  static create(data, callback) {
    // ✅ SOLUÇÃO DE EMERGÊNCIA: Garantir user_id sempre válido
    let user_id = data.user_id;
    
    console.log('🔍 DEBUG OrdemServico.create - user_id recebido:', user_id);
    console.log('🔍 DEBUG OrdemServico.create - tipo do user_id:', typeof user_id);
    
    // Validação robusta do user_id
    if (!user_id || user_id === 'undefined' || user_id === 'null' || user_id === '') {
      console.warn('⚠️ User ID não veio do frontend, usando fallback');
      user_id = 1; // Fallback para usuário 1
    }
    
    // Garantir que é número
    user_id = parseInt(user_id);
    if (isNaN(user_id)) {
      console.warn('⚠️ User ID não é número válido, usando fallback');
      user_id = 1;
    }
    
    console.log('🎯 User ID que será usado na criação:', user_id);

    const { 
      setor_origem = 'Não informado', 
      setor_destino, 
      categoria = 'Geral', 
      cliente, 
      descricao, 
      prioridade, 
      status = 'Aberto',
      solicitante,       
      equipamento,       
      defeito            
    } = data;

    // ✅ TRATAMENTO DOS CAMPOS - Compatibilidade com front-end antigo e novo
    const clienteFinal = cliente || solicitante || 'Não informado';
    const descricaoFinal = descricao || defeito || 'Não informado';
    
    // Se veio equipamento, adiciona na descrição
    const descricaoCompleta = equipamento ? 
      `Equipamento: ${equipamento}. Problema: ${descricaoFinal}` : 
      descricaoFinal;

    console.log('📦 Dados finais para criação de OS:', {
      user_id,
      setor_origem,
      setor_destino,
      categoria,
      cliente: clienteFinal,
      descricao: descricaoCompleta,
      prioridade,
      status
    });

    db.run(
      `INSERT INTO ordens_servico (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, setor_origem, setor_destino, categoria, clienteFinal, descricaoCompleta, prioridade, status],
      function(err) {
        if (err) {
          console.error('❌ Erro ao criar OS:', err);
          return callback(err);
        }
        console.log(`✅ OS criada com ID: ${this.lastID} para setor: ${setor_destino}`);
        callback(null, { id: this.lastID });
      }
    );
  }

  static updateStatus(id, status, relato_tecnico = null, materiais_usados = null, callback) {
    if (status === 'Finalizado') {
      db.run(
        `UPDATE ordens_servico 
         SET status = ?, relato_tecnico = ?, materiais_usados = ? 
         WHERE id = ?`,
        [status, relato_tecnico, materiais_usados, id],
        callback
      );
    } else {
      db.run(
        `UPDATE ordens_servico 
         SET status = ?, relato_tecnico = NULL, materiais_usados = NULL 
         WHERE id = ?`,
        [status, id],
        callback
      );
    }
  }

  // ✅ NOVO MÉTODO: Buscar OS por setor destino
  static getBySetorDestino(setor_destino, callback) {
    const query = 'SELECT * FROM ordens_servico WHERE setor_destino = ? ORDER BY id DESC';
    
    console.log(`🔍 Buscando OSs para setor: ${setor_destino}`);
    
    db.all(query, [setor_destino], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar OSs por setor:', err);
        return callback(err);
      }
      console.log(`✅ Encontradas ${rows.length} OSs para setor ${setor_destino}`);
      callback(null, rows);
    });
  }

  // ✅ MÉTODO: Buscar OS por ID
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

  // ✅ MÉTODO: Debug - listar todas as OSs
  static debugAll(callback) {
    db.all('SELECT id, user_id, setor_destino, cliente, descricao, status FROM ordens_servico ORDER BY id DESC', (err, rows) => {
      if (err) {
        console.error('❌ Erro no debug:', err);
        return callback(err);
      }
      console.log('🐛 DEBUG - Todas as OSs:', rows);
      callback(null, rows);
    });
  }
}

module.exports = { OrdemServico, db };