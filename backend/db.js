const sqlite3 = require('sqlite3').verbose();

// ✅ CONFIGURAÇÃO PARA RENDER (SQLite em memória)
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    console.error('❌ Falha ao conectar ao banco em memória:', err.message);
  } else {
    console.log('✅ Conectado ao SQLite em memória');
    criarTabelas();
  }
});

function criarTabelas() {
  db.serialize(() => {
    // Tabela de usuários
    db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        setor TEXT CHECK(setor IN (
          'Pronto Socorro', 'Recepção', 'Ambulatório', 'Administrativo',
          'Faturamento', 'Maternidade', 'Clínica Médica', 'Clínica Cirúrgica',
          'Centro Cirúrgico', 'Tomografia', 'Mamografia', 'HEMOPI', 'Núcleos', 'UTI',
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

    // ✅ TABELA CORRIGIDA: Adicionar campos para relatórios
    db.run(`
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
        -- ✅ NOVOS CAMPOS PARA RELATÓRIOS
        data_fechamento TEXT,
        tempo_resolucao_horas REAL,
        FOREIGN KEY (user_id) REFERENCES usuarios(id)
      )
    `, async (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela ordens_servico:', err);
      } else {
        console.log('✅ Tabela ordens_servico verificada/criada');
        
        // ✅ VERIFICAR E ADICIONAR CAMPOS FALTANTES
        await verificarECriarCampos();
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
          VALUES 
          ('Admin', 'admin@hospital.com', '123456', 'TI'),
          ('Técnico Manutenção', 'manutencao@hospital.com', '123456', 'Manutenção'),
          ('Usuário Teste', 'teste@hospital.com', '123456', 'Pronto Socorro')
        `, (err) => {
          if (err) {
            console.error('❌ Erro ao inserir usuários padrão:', err);
          } else {
            console.log('✅ Usuários padrão inseridos');
          }
        });
      }
    });
  });
}

// ✅ FUNÇÃO PARA VERIFICAR E CRIAR CAMPOS FALTANTES
function verificarECriarCampos() {
  return new Promise((resolve) => {
    // Verificar se campo data_fechamento existe - CORRIGIDO: db.all em vez de db.get
    db.all("PRAGMA table_info(ordens_servico)", (err, rows) => {
      if (err) {
        console.error('❌ Erro ao verificar estrutura da tabela:', err);
        resolve();
        return;
      }

      const camposExistentes = rows.map(row => row.name);
      console.log('📋 Campos existentes:', camposExistentes);

      // Adicionar data_fechamento se não existir
      if (!camposExistentes.includes('data_fechamento')) {
        db.run("ALTER TABLE ordens_servico ADD COLUMN data_fechamento TEXT", (err) => {
          if (err) {
            console.error('❌ Erro ao adicionar data_fechamento:', err);
          } else {
            console.log('✅ Campo data_fechamento adicionado');
          }
        });
      }

      // Adicionar tempo_resolucao_horas se não existir
      if (!camposExistentes.includes('tempo_resolucao_horas')) {
        db.run("ALTER TABLE ordens_servico ADD COLUMN tempo_resolucao_horas REAL", (err) => {
          if (err) {
            console.error('❌ Erro ao adicionar tempo_resolucao_horas:', err);
          } else {
            console.log('✅ Campo tempo_resolucao_horas adicionado');
          }
          resolve();
        });
      } else {
        resolve();
      }
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
    user_id = parseInt(user_id);
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
    const descricaoCompleta = equipamento ? 
      `Equipamento: ${equipamento}. Problema: ${descricaoFinal}` : 
      descricaoFinal;

    console.log('📦 Criando OS:', { user_id, setor_destino, cliente: clienteFinal, prioridade });

    db.run(
      `INSERT INTO ordens_servico (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, setor_origem, setor_destino, categoria, clienteFinal, descricaoCompleta, prioridade, status],
      function(err) {
        if (err) {
          console.error('❌ Erro ao criar OS:', err);
          return callback(err);
        }
        console.log(`✅ OS criada com ID: ${this.lastID}`);
        callback(null, { id: this.lastID });
      }
    );
  }

  // ✅ MÉTODO ATUALIZADO: Incluir data_fechamento e calcular tempo - COM NOVO STATUS
  static updateStatus(id, status, relato_tecnico = null, materiais_usados = null, callback) {
    // ✅ VALIDAÇÃO DO NOVO STATUS
    const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
    if (!statusValidos.includes(status)) {
      return callback(new Error('Status inválido. Use: Aberto, Em Andamento, Aguardando Peças, Finalizado ou Cancelado'));
    }
    
    if (status === 'Finalizado') {
      // ✅ CALCULAR TEMPO DE RESOLUÇÃO AO FINALIZAR
      const dataFechamento = new Date().toISOString();
      
      // Buscar data de abertura para calcular tempo
      db.get("SELECT data_abertura FROM ordens_servico WHERE id = ?", [id], (err, row) => {
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

  // ✅ NOVO MÉTODO: Atualização completa com reclassificação
  static updateCompleta(id, data, callback) {
    const { status, prioridade, relato_tecnico, materiais_usados } = data;
    
    // ✅ VALIDAÇÃO DO STATUS
    const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
    if (!statusValidos.includes(status)) {
      return callback(new Error('Status inválido'));
    }
    
    let query = `UPDATE ordens_servico SET status = ?`;
    const params = [status];
    
    // Se houver nova prioridade, atualizar
    if (prioridade) {
      query += `, prioridade = ?`;
      params.push(prioridade);
    }
    
    // Campos para quando finalizar
    if (status === 'Finalizado') {
      query += `, relato_tecnico = ?, materiais_usados = ?, data_fechamento = datetime('now', 'localtime')`;
      params.push(relato_tecnico || null, materiais_usados || null);
    } else {
      query += `, relato_tecnico = ?, materiais_usados = ?`;
      params.push(relato_tecnico || null, materiais_usados || null);
    }
    
    query += ` WHERE id = ?`;
    params.push(id);
    
    console.log('📝 Query de atualização completa:', query);
    console.log('📋 Parâmetros:', params);
    
    db.run(query, params, function(err) {
      if (err) {
        console.error('❌ Erro ao atualizar OS completa:', err);
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }
}

module.exports = { db, OrdemServico };