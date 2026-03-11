const express = require('express');
const router = express.Router();
const { OrdemServico, db } = require('../db');

const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

router.use(authMiddleware);

// Função auxiliar para calcular horas entre datas
function calcularHorasEntreDatas(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return 0;
  }

  const diferencaMs = fim.getTime() - inicio.getTime();
  const diferencaHoras = diferencaMs / (1000 * 60 * 60);

  return Number(diferencaHoras.toFixed(2));
}

// Listar todas as OS - somente técnico/admin
router.get('/', requireTechnical, (req, res) => {
  OrdemServico.getAll((err, ordens) => {
    if (err) {
      console.error('Erro ao buscar ordens de serviço:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordens de serviço'
      });
    }

    res.json({
      success: true,
      data: ordens || []
    });
  });
});

// Criar nova OS - qualquer usuário autenticado
router.post('/', (req, res) => {
  const osData = {
    ...req.body,
    user_id: req.user_id
  };

  // Garantir que data_abertura seja salva
  osData.data_abertura = new Date().toISOString();

  OrdemServico.create(osData, (err, result) => {
    if (err) {
      console.error('Erro ao criar OS:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno ao criar ordem de serviço'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Ordem de serviço criada com sucesso!',
      id: result.id
    });
  });
});

// Listar OS por setor de destino - somente técnico/admin
router.get('/setor/:setor', requireTechnical, (req, res) => {
  const { setor } = req.params;

  if (setor !== 'TI' && setor !== 'Manutenção') {
    return res.status(400).json({
      success: false,
      message: 'Setor inválido. Use "TI" ou "Manutenção"'
    });
  }

  OrdemServico.getBySetorDestino(setor, (err, ordens) => {
    if (err) {
      console.error('Erro ao buscar OSs por setor:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordens do setor'
      });
    }

    res.json({
      success: true,
      data: ordens || []
    });
  });
});

// Listar minhas OS - qualquer usuário autenticado
router.get('/minhas', (req, res) => {
  const query = `
    SELECT os.*, u.nome as cliente_nome
    FROM ordens_servico os
    LEFT JOIN usuarios u ON os.user_id = u.id
    WHERE os.user_id = ?
    ORDER BY os.id DESC
  `;

  db.all(query, [req.user_id], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar OSs do usuário:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar suas ordens de serviço'
      });
    }

    res.json({
      success: true,
      data: rows || []
    });
  });
});

// Buscar OS por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;

  if (isNaN(id) || Number(id) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  OrdemServico.getById(id, (err, ordem) => {
    if (err) {
      console.error('Erro ao buscar OS por ID:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro ao carregar ordem de serviço'
      });
    }

    if (!ordem) {
      return res.status(404).json({
        success: false,
        message: 'Ordem de serviço não encontrada'
      });
    }

    const isTecnico = req.user?.tipo === 'tecnico' || req.user?.tipo === 'admin';

    if (!isTecnico && Number(ordem.user_id) !== Number(req.user_id)) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para visualizar esta ordem de serviço'
      });
    }

    res.json({
      success: true,
      data: ordem
    });
  });
});

// Atualizar status - somente técnico/admin
router.put('/:id/status', requireTechnical, (req, res) => {
  const { id } = req.params;
  const { status, relato_tecnico, materiais_usados, prioridade } = req.body;

  const statusValidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];

  if (!statusValidos.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status inválido'
    });
  }

  if (isNaN(id) || Number(id) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  // Se for finalizar, primeiro buscar a OS para calcular o tempo
  if (status === 'Finalizado') {
    // Buscar dados da OS atual
    const buscarOS = `SELECT data_abertura FROM ordens_servico WHERE id = ?`;
    
    db.get(buscarOS, [id], (err, os) => {
      if (err) {
        console.error('Erro ao buscar OS para cálculo de tempo:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro ao processar finalização da OS'
        });
      }

      if (!os) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de serviço não encontrada'
        });
      }

      const dataFechamento = new Date().toISOString();
      const tempoResolucaoHoras = calcularHorasEntreDatas(os.data_abertura, dataFechamento);

      // Atualizar com data_fechamento e tempo_resolucao_horas
      const query = `
        UPDATE ordens_servico 
        SET status = ?, 
            relato_tecnico = ?, 
            materiais_usados = ?, 
            prioridade = ?,
            data_fechamento = ?,
            tempo_resolucao_horas = ?
        WHERE id = ?
      `;

      db.run(
        query,
        [
          status,
          relato_tecnico || null,
          materiais_usados || null,
          prioridade || 'Média',
          dataFechamento,
          tempoResolucaoHoras,
          id
        ],
        function(err) {
          if (err) {
            console.error('Erro ao finalizar OS:', err);
            return res.status(500).json({
              success: false,
              message: 'Erro ao finalizar ordem de serviço'
            });
          }

          if (this.changes === 0) {
            return res.status(404).json({
              success: false,
              message: 'Ordem de serviço não encontrada'
            });
          }

          res.json({
            success: true,
            message: 'OS finalizada com sucesso!',
            data_fechamento: dataFechamento,
            tempo_resolucao_horas: tempoResolucaoHoras
          });
        }
      );
    });
  } else {
    // Para outros status, não altera data_fechamento nem tempo_resolucao_horas
    let query = `UPDATE ordens_servico SET status = ?`;
    const params = [status];

    if (prioridade) {
      query += `, prioridade = ?`;
      params.push(prioridade);
    }

    query += `, relato_tecnico = ?, materiais_usados = ?`;
    params.push(relato_tecnico || null, materiais_usados || null);

    // Se não for finalizado, limpa data_fechamento e tempo_resolucao_horas
    // (caso esteja reabrindo uma OS finalizada)
    query += `, data_fechamento = NULL, tempo_resolucao_horas = NULL`;
    
    query += ` WHERE id = ?`;
    params.push(id);

    db.run(query, params, function(err) {
      if (err) {
        console.error('Erro ao atualizar status:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro ao atualizar ordem de serviço'
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ordem de serviço não encontrada'
        });
      }

      res.json({
        success: true,
        message: 'Status atualizado com sucesso!'
      });
    });
  }
});

// Atualizar OS completa - somente técnico/admin
router.put('/:id', requireTechnical, (req, res) => {
  const { id } = req.params;
  const { status, relato_tecnico, materiais_usados, prioridade } = req.body;

  if (isNaN(id) || Number(id) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'ID inválido'
    });
  }

  // Se o status for Finalizado, precisamos calcular o tempo
  if (status === 'Finalizado') {
    // Buscar dados da OS atual
    const buscarOS = `SELECT data_abertura FROM ordens_servico WHERE id = ?`;
    
    db.get(buscarOS, [id], (err, os) => {
      if (err) {
        console.error('Erro ao buscar OS para cálculo de tempo:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro ao processar atualização da OS'
        });
      }

      if (!os) {
        return res.status(404).json({
          success: false,
          message: 'OS não encontrada'
        });
      }

      const dataFechamento = new Date().toISOString();
      const tempoResolucaoHoras = calcularHorasEntreDatas(os.data_abertura, dataFechamento);

      const query = `
        UPDATE ordens_servico
        SET status = ?, 
            relato_tecnico = ?, 
            materiais_usados = ?, 
            prioridade = ?,
            data_fechamento = ?,
            tempo_resolucao_horas = ?
        WHERE id = ?
      `;

      db.run(
        query,
        [
          status || 'Aberto',
          relato_tecnico || null,
          materiais_usados || null,
          prioridade || 'Média',
          dataFechamento,
          tempoResolucaoHoras,
          id
        ],
        function(err) {
          if (err) {
            console.error('Erro ao atualizar OS:', err);
            return res.status(500).json({
              success: false,
              message: 'Erro ao atualizar OS'
            });
          }

          if (this.changes === 0) {
            return res.status(404).json({
              success: false,
              message: 'OS não encontrada'
            });
          }

          res.json({
            success: true,
            message: 'OS atualizada com sucesso',
            data_fechamento: dataFechamento,
            tempo_resolucao_horas: tempoResolucaoHoras
          });
        }
      );
    });
  } else {
    // Para outros status, não altera data_fechamento nem tempo_resolucao_horas
    const query = `
      UPDATE ordens_servico
      SET status = ?, 
          relato_tecnico = ?, 
          materiais_usados = ?, 
          prioridade = ?,
          data_fechamento = NULL,
          tempo_resolucao_horas = NULL
      WHERE id = ?
    `;

    db.run(
      query,
      [
        status || 'Aberto',
        relato_tecnico || null,
        materiais_usados || null,
        prioridade || 'Média',
        id
      ],
      function(err) {
        if (err) {
          console.error('Erro ao atualizar OS:', err);
          return res.status(500).json({
            success: false,
            message: 'Erro ao atualizar OS'
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({
            success: false,
            message: 'OS não encontrada'
          });
        }

        res.json({
          success: true,
          message: 'OS atualizada com sucesso'
        });
      }
    );
  }
});

module.exports = router;