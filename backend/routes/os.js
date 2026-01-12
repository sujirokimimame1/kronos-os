const express = require('express');
const router = express.Router();
const { OrdemServico, db } = require('../db');

// ✅ CORREÇÃO: Importação correta do middleware
const authMiddleware = require('../middleware/auth');

// ✅ Aplicar middleware em todas as rotas
router.use(authMiddleware);

// ✅ GET todas as ordens de serviço (apenas para admin)
router.get('/', (req, res) => {
  console.log('📋 Buscando todas as ordens de serviço');
  
  OrdemServico.getAll((err, ordens) => {
    if (err) {
      console.error('❌ Erro ao buscar ordens de serviço:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordens de serviço'
      });
    }
    
    console.log(`✅ ${ordens?.length || 0} ordens encontradas`);
    
    res.json({
      success: true,
      data: ordens || []
    });
  });
});

// ✅ POST nova ordem de serviço
router.post('/', (req, res) => {
  console.log('🆕 Criando nova ordem de serviço:', req.body);
  
  // ✅ CORREÇÃO: Incluir user_id do usuário autenticado
  const osData = {
    ...req.body,
    user_id: req.user_id // Do middleware de autenticação
  };
  
  OrdemServico.create(osData, (err, result) => {
    if (err) {
      console.error('❌ Erro ao criar OS:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno ao criar ordem de serviço'
      });
    }

    console.log('✅ OS criada com sucesso, ID:', result.id);
    
    res.status(201).json({
      success: true,
      message: 'Ordem de serviço criada com sucesso!',
      id: result.id
    });
  });
});

// ✅ Ordens por setor destino (para técnicos)
router.get('/setor/:setor', (req, res) => {
  const { setor } = req.params;
  
  // ✅ VALIDAÇÃO: Verificar se setor é válido
  if (setor !== 'TI' && setor !== 'Manutenção') {
    return res.status(400).json({
      success: false,
      message: 'Setor inválido. Use "TI" ou "Manutenção"'
    });
  }
  
  console.log(`🎯 Buscando ordens para setor: ${setor}`);
  
  OrdemServico.getBySetorDestino(setor, (err, ordens) => {
    if (err) {
      console.error('❌ Erro ao buscar OSs por setor:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordens do setor'
      });
    }

    console.log(`✅ ${ordens?.length || 0} ordens encontradas para ${setor}`);
    
    res.json({
      success: true,
      data: ordens || []
    });
  });
});

// ✅ CORREÇÃO: Ordens do usuário logado (SEGURA)
router.get('/minhas', (req, res) => {
  const user_id = req.user_id; // ✅ Do middleware, SEM fallback
  
  if (!user_id) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }
  
  console.log(`👤 Buscando OSs do usuário: ${user_id}`);
  
  const query = `
    SELECT os.*, u.nome as cliente_nome 
    FROM ordens_servico os 
    LEFT JOIN usuarios u ON os.user_id = u.id 
    WHERE os.user_id = ? 
    ORDER BY os.id DESC
  `;
  
  db.all(query, [user_id], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar OSs do usuário:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar suas ordens de serviço'
      });
    }

    console.log(`✅ ${rows.length} OSs encontradas para usuário ${user_id}`);
    
    res.json({
      success: true,
      data: rows
    });
  });
});

// ✅ Buscar OS específica por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // ✅ VALIDAÇÃO: Verificar se ID é número
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }
  
  console.log(`🔍 Buscando OS por ID: ${id}`);
  
  OrdemServico.getById(id, (err, ordem) => {
    if (err) {
      console.error('❌ Erro ao buscar OS por ID:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordem de serviço'
      });
    }

    if (!ordem) {
      console.log('❌ OS não encontrada:', id);
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    console.log('✅ OS encontrada:', ordem.id);
    
    res.json({
      success: true,
      data: ordem
    });
  });
});

// ✅ CORREÇÃO CRÍTICA: Atualizar status da OS - VERSÃO SIMPLIFICADA
router.put('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, relato_tecnico, materiais_usados, prioridade } = req.body;

  console.log(`🔄 Atualizando OS ${id} para status: ${status}`, { prioridade });

  // ✅ VALIDAÇÃO: Status válido - COM NOVO STATUS
  const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status inválido. Use: Aberto, Em Andamento, Aguardando Peças, Finalizado ou Cancelado'
    });
  }

  // ✅ VALIDAÇÃO: ID válido
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  // ✅ QUERY DINÂMICA PARA SUPORTAR RECLASSIFICAÇÃO
  let query = `UPDATE ordens_servico SET status = ?`;
  const params = [status];

  // ✅ ADICIONAR PRIORIDADE SE FORNECIDA
  if (prioridade) {
    query += `, prioridade = ?`;
    params.push(prioridade);
    console.log(`🔄 Reclassificando prioridade para: ${prioridade}`);
  }

  // Adicionar campos opcionais apenas se for finalizado
  if (status === 'Finalizado') {
    query += `, relato_tecnico = ?, materiais_usados = ?`;
    params.push(relato_tecnico || null, materiais_usados || null);
  } else {
    query += `, relato_tecnico = ?, materiais_usados = ?`;
    params.push(relato_tecnico || null, materiais_usados || null);
  }

  query += ` WHERE id = ?`;
  params.push(id);

  console.log('📝 Query de atualização:', query);
  console.log('📋 Parâmetros:', params);

  db.run(query, params, function(err) {
    if (err) {
      console.error('❌ Erro ao atualizar status:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar ordem de serviço: ' + err.message
      });
    }

    if (this.changes === 0) {
      console.log('❌ OS não encontrada para atualização:', id);
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    console.log(`✅ OS ${id} atualizada com sucesso. Changes:`, this.changes);
    
    res.json({
      success: true,
      message: 'Status atualizado com sucesso!',
      changes: this.changes
    });
  });
});

// ✅ ROTA ALTERNATIVA: Atualização completa (backup)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { status, relato_tecnico, materiais_usados, prioridade } = req.body;

  // ✅ VALIDAÇÃO
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  console.log(`✏️ Atualizando OS completa: ${id}`, req.body);

  // Query dinâmica para suportar reclassificação
  let query = `UPDATE ordens_servico SET status = ?`;
  const params = [status];

  // ✅ ADICIONAR PRIORIDADE SE FORNECIDA
  if (prioridade) {
    query += `, prioridade = ?`;
    params.push(prioridade);
  }

  if (status === 'Finalizado') {
    query += `, relato_tecnico = ?, materiais_usados = ?`;
    params.push(relato_tecnico || null, materiais_usados || null);
  } else {
    query += `, relato_tecnico = ?, materiais_usados = ?`;
    params.push(relato_tecnico || null, materiais_usados || null);
  }

  query += ` WHERE id = ?`;
  params.push(id);

  db.run(query, params, function(err) {
    if (err) {
      console.error('❌ Erro ao atualizar OS:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao atualizar ordem de serviço: ' + err.message
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    console.log(`✅ OS ${id} atualizada com sucesso`);
    
    res.json({
      success: true,
      message: 'Ordem de serviço atualizada com sucesso!'
    });
  });
});

// ✅ ROTA DE EMERGÊNCIA: Atualização apenas de status
router.patch('/:id/status-simples', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log(`⚡ Atualização simples - OS ${id} para: ${status}`);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  // ✅ VALIDAÇÃO COM NOVO STATUS
  const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
  if (!statusValidos.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status inválido'
    });
  }

  // Query mais simples possível
  db.run(
    'UPDATE ordens_servico SET status = ? WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        console.error('❌ Erro na atualização simples:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro simples: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'OS não encontrada'
        });
      }

      console.log(`✅ Atualização simples OK - OS ${id} para ${status}`);
      
      res.json({
        success: true,
        message: 'Status atualizado com sucesso!'
      });
    }
  );
});

// ✅ ROTA PARA RECLASSIFICAÇÃO RÁPIDA DE PRIORIDADE
router.patch('/:id/prioridade', (req, res) => {
  const { id } = req.params;
  const { prioridade } = req.body;

  console.log(`🎯 Reclassificando prioridade da OS ${id} para: ${prioridade}`);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  const prioridadesValidas = ['Baixa', 'Média', 'Alta', 'Crítica'];
  if (!prioridadesValidas.includes(prioridade)) {
    return res.status(400).json({
      success: false,
      message: 'Prioridade inválida. Use: Baixa, Média, Alta ou Crítica'
    });
  }

  db.run(
    'UPDATE ordens_servico SET prioridade = ? WHERE id = ?',
    [prioridade, id],
    function(err) {
      if (err) {
        console.error('❌ Erro na reclassificação de prioridade:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro ao reclassificar prioridade: ' + err.message
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'OS não encontrada'
        });
      }

      console.log(`✅ Prioridade reclassificada - OS ${id} para ${prioridade}`);
      
      res.json({
        success: true,
        message: `Prioridade reclassificada para ${prioridade} com sucesso!`
      });
    }
  );
});

// ✅ Rota para relatórios gerais
router.get('/relatorios/geral', (req, res) => {
  console.log('📊 Gerando relatório geral');
  
  const query = `
    SELECT 
      os.*,
      u.nome as cliente_nome
    FROM ordens_servico os
    LEFT JOIN usuarios u ON os.user_id = u.id
    ORDER BY os.id DESC
    LIMIT 100
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao gerar relatório:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao gerar relatório'
      });
    }

    // ✅ CORREÇÃO: Estatísticas reais baseadas nos dados
    const totalOS = rows.length;
    const osFinalizadas = rows.filter(os => os.status === 'Finalizado').length;
    const osAbertas = rows.filter(os => os.status === 'Aberto').length;
    const osAndamento = rows.filter(os => os.status === 'Em Andamento').length;
    const osAguardando = rows.filter(os => os.status === 'Aguardando Peças').length; // ✅ NOVO
    const taxaConclusao = totalOS > 0 ? ((osFinalizadas / totalOS) * 100).toFixed(1) : 0;

    // Calcular setor mais demandado REAL
    const setoresCount = {};
    rows.forEach(os => {
      const setor = os.setor_destino;
      setoresCount[setor] = (setoresCount[setor] || 0) + 1;
    });
    
    const setorTop = Object.keys(setoresCount).length > 0 
      ? Object.keys(setoresCount).reduce((a, b) => setoresCount[a] > setoresCount[b] ? a : b)
      : 'Nenhum';

    // Calcular prioridades REAIS
    const prioridadesCount = {};
    rows.forEach(os => {
      const prioridade = os.prioridade || 'Não informada';
      prioridadesCount[prioridade] = (prioridadesCount[prioridade] || 0) + 1;
    });

    res.json({
      success: true,
      dados: {
        chamados: rows,
        estatisticas: {
          totalOS,
          osFinalizadas,
          osAbertas,
          osAndamento,
          osAguardando, // ✅ NOVO
          taxaConclusao,
          tempoMedio: '4.2h', // mock - pode ser calculado depois
          setorTop
        },
        agrupamentos: {
          setores: setoresCount,
          status: { 
            'Aberto': osAbertas, 
            'Em Andamento': osAndamento, 
            'Aguardando Peças': osAguardando, // ✅ NOVO
            'Finalizado': osFinalizadas 
          },
          prioridades: prioridadesCount
        }
      }
    });
  });
});

// ✅ NOVA ROTA: Debug - listar todas as OSs (apenas desenvolvimento)
router.get('/debug/todas', (req, res) => {
  console.log('🐛 Debug: Listando todas as OSs');
  
  const query = `
    SELECT os.*, u.nome as usuario_nome 
    FROM ordens_servico os 
    LEFT JOIN usuarios u ON os.user_id = u.id 
    ORDER BY os.id DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Erro no debug:', err);
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ 
      success: true, 
      data: rows,
      total: rows.length 
    });
  });
});

module.exports = router;