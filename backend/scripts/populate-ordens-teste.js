const { OrdemServico, db } = require('../models/OrdemServico');

// Dados de teste para ordens de serviço
const ordensTeste = [
  {
    user_id: 1,
    setor_origem: 'Pronto Socorro',
    setor_destino: 'TI',
    categoria: 'Software',
    cliente: 'Dr. João Silva',
    descricao: 'Computador não conecta à rede interna do hospital',
    prioridade: 'Alta',
    status: 'Finalizado',
    data_abertura: '2024-01-15 08:30:00'
  },
  {
    user_id: 1,
    setor_origem: 'Centro Cirúrgico',
    setor_destino: 'Manutenção',
    categoria: 'Equipamento',
    cliente: 'Enf. Maria Santos',
    descricao: 'Mesa cirúrgica com problema no sistema hidráulico',
    prioridade: 'Alta',
    status: 'Em Andamento',
    data_abertura: '2024-01-16 14:20:00'
  },
  {
    user_id: 1,
    setor_origem: 'Laboratório',
    setor_destino: 'TI',
    categoria: 'Hardware',
    cliente: 'Téc. Carlos Oliveira',
    descricao: 'Impressora não está imprimindo resultados de exames',
    prioridade: 'Média',
    status: 'Aberto',
    data_abertura: '2024-01-17 09:15:00'
  },
  {
    user_id: 1,
    setor_origem: 'UTI',
    setor_destino: 'Manutenção',
    categoria: 'Elétrica',
    cliente: 'Dr. Ana Costa',
    descricao: 'Monitor de sinais vitais com oscilações na energia',
    prioridade: 'Alta',
    status: 'Finalizado',
    data_abertura: '2024-01-14 11:45:00'
  },
  {
    user_id: 1,
    setor_origem: 'Farmácia',
    setor_destino: 'TI',
    categoria: 'Software',
    cliente: 'Farm. Roberto Lima',
    descricao: 'Sistema de controle de medicamentos com lentidão',
    prioridade: 'Média',
    status: 'Finalizado',
    data_abertura: '2024-01-13 16:00:00'
  },
  {
    user_id: 1,
    setor_origem: 'Recepção',
    setor_destino: 'TI',
    categoria: 'Rede',
    cliente: 'Recepc. Patricia Alves',
    descricao: 'Problema com internet no balcão de atendimento',
    prioridade: 'Baixa',
    status: 'Aberto',
    data_abertura: '2024-01-18 10:30:00'
  }
];

// Primeiro verificar se existe usuário
db.get("SELECT COUNT(*) as count FROM usuarios", (err, userRow) => {
  if (err) {
    console.error('❌ Erro ao verificar usuários:', err);
    return;
  }

  if (userRow.count === 0) {
    // Criar usuário de teste
    db.run(
      `INSERT INTO usuarios (nome, email, senha, setor) VALUES (?, ?, ?, ?)`,
      ['Usuário Teste', 'teste@hospital.com', '123456', 'Pronto Socorro'],
      function(err) {
        if (err) {
          console.error('❌ Erro ao criar usuário:', err);
          return;
        }
        console.log('✅ Usuário teste criado (ID: 1)');
        inserirOrdens();
      }
    );
  } else {
    inserirOrdens();
  }
});

function inserirOrdens() {
  // Verificar se já existem ordens
  db.get("SELECT COUNT(*) as count FROM ordens_servico", (err, row) => {
    if (err) {
      console.error('❌ Erro ao verificar ordens:', err);
      return;
    }

    if (row.count === 0) {
      console.log('📥 Inserindo dados de teste para ordens de serviço...');
      
      let inserted = 0;
      ordensTeste.forEach(ordem => {
        OrdemServico.create(ordem, (err, result) => {
          if (err) {
            console.error('❌ Erro ao inserir ordem:', err);
          } else {
            inserted++;
            console.log(`✅ Ordem ${inserted} inserida (ID: ${result.id})`);
          }

          if (inserted === ordensTeste.length) {
            console.log('🎉 Todas as ordens de teste foram inseridas!');
            process.exit(0);
          }
        });
      });
    } else {
      console.log(`✅ Já existem ${row.count} ordens na tabela`);
      process.exit(0);
    }
  });
}