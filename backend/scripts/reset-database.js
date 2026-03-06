const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ✅ CONFIGURAÇÃO PARA FLY.IO
const dbPath = process.env.DB_PATH || path.join(__dirname, '../db/kronos.db');
const dbDir = path.dirname(dbPath);

console.log('🗄️  Resetando banco em:', dbPath);

// Garantir que o diretório existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ Pasta criada:', dbDir);
}

// Deletar o banco existente
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('🗑️  Banco de dados antigo removido');
}

// Criar novo banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao criar banco:', err);
    process.exit(1);
  } else {
    console.log('✅ Novo banco de dados criado');
    criarTabelas();
  }
});

function criarTabelas() {
  db.serialize(() => {
    // ✅ TABELA DE USUÁRIOS
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
        console.log('✅ Tabela usuarios criada');
      }
    });

    // ✅ TABELA DE ORDENS DE SERVIÇO
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
        console.error('❌ Erro ao criar tabela ordens_servico:', err);
      } else {
        console.log('✅ Tabela ordens_servico criada');
      }
    });

    // ✅ INSERIR USUÁRIOS PADRÃO
    const usuarios = [
      {
        nome: 'Administrador Sistema',
        email: 'admin@hospital.com', 
        senha: '123456',
        setor: 'Administrativo'
      },
      {
        nome: 'Técnico TI',
        email: 'tecnico.ti@hospital.com',
        senha: '123456', 
        setor: 'TI'
      },
      {
        nome: 'Técnico Manutenção',
        email: 'tecnico.manutencao@hospital.com',
        senha: '123456',
        setor: 'Manutenção'
      },
      {
        nome: 'Médico Teste',
        email: 'medico@hospital.com',
        senha: '123456',
        setor: 'Pronto Socorro'
      },
      {
        nome: 'Enfermeira Teste', 
        email: 'enfermeira@hospital.com',
        senha: '123456',
        setor: 'UTI'
      }
    ];

    usuarios.forEach((usuario) => {
      db.run(
        `INSERT INTO usuarios (nome, email, senha, setor) VALUES (?, ?, ?, ?)`,
        [usuario.nome, usuario.email, usuario.senha, usuario.setor],
        function(err) {
          if (err) {
            console.error(`❌ Erro ao inserir usuário ${usuario.email}:`, err);
          } else {
            console.log(`✅ Usuário ${usuario.email} inserido (ID: ${this.lastID})`);
          }
        }
      );
    });

    // ✅ INSERIR ALGUMAS OSs DE EXEMPLO
    setTimeout(() => {
      const ordensExemplo = [
        {
          user_id: 4, // Médico Teste
          setor_origem: 'Pronto Socorro',
          setor_destino: 'TI',
          categoria: 'Computador (Hardware)',
          cliente: 'Dr. Silva',
          descricao: 'Computador da sala de emergência não liga. Verificar fonte e componentes.',
          prioridade: 'Alta',
          status: 'Finalizado',
          relato_tecnico: 'Fonte queimada substituída. HD verificado, memória testada. Sistema reinstalado.',
          materiais_usados: 'Fonte ATX 500W, pasta térmica'
        },
        {
          user_id: 5, // Enfermeira Teste  
          setor_origem: 'UTI',
          setor_destino: 'Manutenção',
          categoria: 'Ar Condicionado',
          cliente: 'Enf. Maria',
          descricao: 'Ar condicionado da UTI não está refrigerando adequadamente.',
          prioridade: 'Crítica',
          status: 'Em Andamento',
          relato_tecnico: 'Verificado gás refrigerante. Agendada manutenção completa.'
        },
        {
          user_id: 4, // Médico Teste
          setor_origem: 'Pronto Socorro', 
          setor_destino: 'TI',
          categoria: 'Impressora',
          cliente: 'Dr. Costa',
          descricao: 'Impressora não conecta à rede. Erro de comunicação.',
          prioridade: 'Média',
          status: 'Aberto'
        },
        {
          user_id: 5, // Enfermeira Teste
          setor_origem: 'UTI',
          setor_destino: 'Manutenção', 
          categoria: 'Elétrica',
          cliente: 'Enf. João',
          descricao: 'Tomada do monitor de sinais vitais não funciona.',
          prioridade: 'Alta',
          status: 'Aguardando Peças',
          relato_tecnico: 'Tomada queimada. Aguardando chegada do modelo específico.'
        }
      ];

      ordensExemplo.forEach((os, index) => {
        db.run(
          `INSERT INTO ordens_servico (
            user_id, setor_origem, setor_destino, categoria, cliente, 
            descricao, prioridade, status, relato_tecnico, materiais_usados
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            os.user_id, os.setor_origem, os.setor_destino, os.categoria,
            os.cliente, os.descricao, os.prioridade, os.status,
            os.relato_tecnico || null, os.materiais_usados || null
          ],
          function(err) {
            if (err) {
              console.error(`❌ Erro ao inserir OS ${index + 1}:`, err);
            } else {
              console.log(`✅ OS ${index + 1} inserida (ID: ${this.lastID})`);
            }
          }
        );
      });

      // Fechar banco após inserir tudo
      setTimeout(() => {
        db.close((err) => {
          if (err) {
            console.error('❌ Erro ao fechar banco:', err);
          } else {
            console.log('\n🎉 BANCO DE DADOS RESETADO COM SUCESSO!');
            console.log('\n👤 USUÁRIOS CRIADOS:');
            console.log('   - admin@hospital.com / 123456 (Administrativo)');
            console.log('   - tecnico.ti@hospital.com / 123456 (Técnico TI)');
            console.log('   - tecnico.manutencao@hospital.com / 123456 (Técnico Manutenção)');
            console.log('   - medico@hospital.com / 123456 (Médico - Pronto Socorro)');
            console.log('   - enfermeira@hospital.com / 123456 (Enfermeira - UTI)');
            console.log('\n📋 OSs DE EXEMPLO: 4 ordens de serviço criadas');
            console.log('\n🚀 Sistema pronto para uso!');
          }
        });
      }, 1000);
      
    }, 500);
  });
}