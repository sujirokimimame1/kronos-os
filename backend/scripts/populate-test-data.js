const db = require('../config/database');

// Inserir dados de teste
const insertTestData = () => {
    console.log('📥 Inserindo dados de teste...');

    // Inserir técnicos
    const tecnicos = [
        { nome: 'Técnico TI 1', email: 'ti1@kronos.com', senha: '123456', tipo: 'tecnico', setor_id: 1 },
        { nome: 'Técnico TI 2', email: 'ti2@kronos.com', senha: '123456', tipo: 'tecnico', setor_id: 1 },
        { nome: 'Técnico Manut. 1', email: 'manut1@kronos.com', senha: '123456', tipo: 'tecnico', setor_id: 2 },
        { nome: 'Técnico Manut. 2', email: 'manut2@kronos.com', senha: '123456', tipo: 'tecnico', setor_id: 2 }
    ];

    tecnicos.forEach(tecnico => {
        db.run(`INSERT OR IGNORE INTO usuarios (nome, email, senha, tipo, setor_id) VALUES (?, ?, ?, ?, ?)`, 
        [tecnico.nome, tecnico.email, tecnico.senha, tecnico.tipo, tecnico.setor_id]);
    });

    // Inserir chamados de exemplo
    const chamados = [
        {
            titulo: 'Problema com acesso ao sistema',
            descricao: 'Usuário não consegue acessar o sistema interno da empresa. Mensagem de erro aparece ao tentar login.',
            prioridade: 'Alta',
            status: 'Finalizado',
            setor_origem_id: 3,
            setor_destino_id: 1,
            usuario_id: 1,
            tecnico_id: 1,
            categoria: 'Software',
            data_abertura: '2024-01-15 10:30:00',
            data_finalizacao: '2024-01-15 14:45:00'
        },
        {
            titulo: 'Manutenção preventiva máquina',
            descricao: 'Realizar manutenção preventiva na máquina de produção linha B',
            prioridade: 'Média',
            status: 'Em Andamento',
            setor_origem_id: 2,
            setor_destino_id: 2,
            usuario_id: 1,
            tecnico_id: 3,
            categoria: 'Equipamento',
            data_abertura: '2024-01-16 09:15:00'
        },
        {
            titulo: 'Instalação de software novo',
            descricao: 'Necessário instalar novo software na área administrativa - pacote Office 365',
            prioridade: 'Baixa',
            status: 'Aberto',
            setor_origem_id: 3,
            setor_destino_id: 1,
            usuario_id: 1,
            categoria: 'Software',
            data_abertura: '2024-01-17 14:20:00'
        },
        {
            titulo: 'Troca de lâmpada setor produção',
            descricao: 'Lâmpada queimada no setor de produção, necessária troca urgente',
            prioridade: 'Alta',
            status: 'Finalizado',
            setor_origem_id: 2,
            setor_destino_id: 2,
            usuario_id: 1,
            tecnico_id: 4,
            categoria: 'Elétrica',
            data_abertura: '2024-01-14 08:00:00',
            data_finalizacao: '2024-01-14 09:30:00'
        },
        {
            titulo: 'Configuração de email novo',
            descricao: 'Configurar conta de email para novo funcionário do RH',
            prioridade: 'Média',
            status: 'Finalizado',
            setor_origem_id: 3,
            setor_destino_id: 1,
            usuario_id: 1,
            tecnico_id: 2,
            categoria: 'Rede',
            data_abertura: '2024-01-13 11:00:00',
            data_finalizacao: '2024-01-13 12:15:00'
        }
    ];

    chamados.forEach(chamado => {
        db.run(`INSERT OR IGNORE INTO chamados (
            titulo, descricao, prioridade, status, setor_origem_id, 
            setor_destino_id, usuario_id, tecnico_id, categoria, 
            data_abertura, data_finalizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [
            chamado.titulo, chamado.descricao, chamado.prioridade, chamado.status,
            chamado.setor_origem_id, chamado.setor_destino_id, chamado.usuario_id,
            chamado.tecnico_id, chamado.categoria, chamado.data_abertura,
            chamado.data_finalizacao
        ], (err) => {
            if (err) {
                console.error('❌ Erro ao inserir chamado:', err);
            } else {
                console.log('✅ Chamado inserido com sucesso');
            }
        });
    });

    console.log('🎉 Dados de teste inseridos com sucesso!');
};

// Executar apenas se chamados estiverem vazios
db.get("SELECT COUNT(*) as count FROM chamados", (err, row) => {
    if (err) {
        console.error('❌ Erro ao verificar chamados:', err);
    } else if (row.count === 0) {
        console.log('📋 Tabela de chamados vazia, inserindo dados de teste...');
        insertTestData();
    } else {
        console.log(`✅ Já existem ${row.count} chamados na tabela`);
    }
});