const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../db');
const dbPath = path.join(dbDir, 'kronos.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Falha ao abrir o banco de dados:', err.message);
  } else {
    console.log('✅ Banco de dados conectado com sucesso!');
  }
});

// Corrigir a estrutura do banco
db.serialize(() => {
  // 1. Fazer backup da tabela ordens_servico se existir
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='ordens_servico_backup'", (err, rows) => {
    if (err) {
      console.error('❌ Erro ao verificar backup:', err);
      return;
    }

    if (rows.length === 0) {
      // Criar backup da tabela ordens_servico
      db.run('CREATE TABLE IF NOT EXISTS ordens_servico_backup AS SELECT * FROM ordens_servico', (err) => {
        if (err) {
          console.error('❌ Erro ao criar backup:', err);
        } else {
          console.log('✅ Backup das ordens de serviço criado');
        }
      });
    }
  });

  // 2. Deletar tabela usuarios antiga
  db.run('DROP TABLE IF EXISTS usuarios', (err) => {
    if (err) {
      console.error('❌ Erro ao deletar tabela usuarios:', err);
    } else {
      console.log('✅ Tabela usuarios antiga removida');
    }
  });

  // 3. Criar nova tabela usuarios com a coluna setor
  db.run(`
    CREATE TABLE usuarios (
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
      console.log('✅ Nova tabela usuarios criada com coluna setor');
    }
  });

  // 4. Inserir usuário de teste
  db.run(`
    INSERT OR IGNORE INTO usuarios (nome, email, senha, setor)
    VALUES ('Usuário Teste', 'teste@hospital.com', '123456', 'Pronto Socorro')
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao inserir usuário teste:', err);
    } else {
      console.log('✅ Usuário teste inserido');
    }
  });

  // 5. Verificar se a tabela ordens_servico precisa ser recriada
  db.all("PRAGMA table_info(ordens_servico)", (err, columns) => {
    if (err) {
      console.error('❌ Erro ao verificar estrutura da tabela ordens_servico:', err);
      return;
    }

    const hasUserID = columns.some(col => col.name === 'user_id');
    
    if (!hasUserID) {
      console.log('⚠️  Tabela ordens_servico precisa ser atualizada');
      
      // Criar backup
      db.run('CREATE TABLE IF NOT EXISTS ordens_servico_temp AS SELECT * FROM ordens_servico');
      
      // Recriar tabela
      db.run('DROP TABLE IF EXISTS ordens_servico');
      
      db.run(`
        CREATE TABLE ordens_servico (
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
          console.error('❌ Erro ao recriar tabela ordens_servico:', err);
        } else {
          console.log('✅ Tabela ordens_servico recriada');
          
          // Restaurar dados do backup
          db.run(`
            INSERT INTO ordens_servico 
            (user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, relato_tecnico, materiais_usados, data_abertura)
            SELECT 1, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status, relato_tecnico, materiais_usados, data_abertura
            FROM ordens_servico_temp
          `, (err) => {
            if (err) {
              console.error('❌ Erro ao restaurar dados:', err);
            } else {
              console.log('✅ Dados das ordens de serviço restaurados');
            }
          });
        }
      });
    } else {
      console.log('✅ Tabela ordens_servico está correta');
    }
  });
});

// Finalizar
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('❌ Erro ao fechar banco:', err);
    } else {
      console.log('🎉 Banco de dados corrigido com sucesso!');
      console.log('👤 Usuário disponível: teste@hospital.com / 123456');
    }
  });
}, 2000);