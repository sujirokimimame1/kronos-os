const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

const setoresOrigemValidos = [
  'Pronto Socorro',
  'Recepção',
  'Ambulatório',
  'Administrativo',
  'RH',
  'Financeiro',
  'Hotelaria',
  'Assistência Social',
  'Direção',
  'Faturamento',
  'Maternidade',
  'Clínica Médica',
  'Clínica Cirúrgica',
  'Centro Cirúrgico',
  'Tomografia',
  'Mamografia',
  'HEMOPI',
  'Núcleos',
  'UTI',
  'Farmácia',
  'Almoxarifado',
  'Nutrição',
  'Laboratório',
  'Fisioterapia'
];

const setoresDestinoValidos = ['TI', 'Manutenção'];
const statusPermitidos = ['Aberto', 'Em Andamento', 'Aguardando Peças', 'Finalizado', 'Cancelado'];
const TAMANHO_MAX_BASE64 = 5 * 1024 * 1024 * 1.37;
let schemaGarantido = false;

async function garantirSchemaOS() {
  if (schemaGarantido) return;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ordens_servico_historico (
      id SERIAL PRIMARY KEY,
      os_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
      acao VARCHAR(80) NOT NULL,
      status_anterior VARCHAR(50),
      status_novo VARCHAR(50),
      descricao TEXT,
      criado_por_id INTEGER,
      criado_por_nome VARCHAR(255),
      criado_por_tipo VARCHAR(50),
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS foto_base64 TEXT`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS foto_mime_type VARCHAR(100)`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS foto_nome VARCHAR(255)`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS tecnico_responsavel_id INTEGER`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS tecnico_responsavel_nome VARCHAR(255)`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS tempo_resolucao_horas NUMERIC(10,2)`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS materiais_usados TEXT`);
  await db.query(`ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_os_historico_os_id ON ordens_servico_historico(os_id);
    CREATE INDEX IF NOT EXISTS idx_os_historico_criado_em ON ordens_servico_historico(criado_em DESC);
  `);

  schemaGarantido = true;
}

function normalizarBase64(valor) {
  if (!valor || typeof valor !== 'string') return null;
  return valor.replace(/^data:[^;]+;base64,/, '').trim();
}

function montarDescricaoMudanca({ statusAnterior, statusNovo, relatoTecnico }) {
  const partes = [];
  if (statusAnterior !== statusNovo) {
    partes.push(`Status alterado de "${statusAnterior || '-'}" para "${statusNovo || '-'}"`);
  }
  if (typeof relatoTecnico === 'string' && relatoTecnico.trim()) {
    partes.push(`Relato técnico informado: ${relatoTecnico.trim()}`);
  }
  return partes.join(' | ') || 'Atualização da ordem de serviço';
}

async function registrarHistorico({ osId, acao, statusAnterior = null, statusNovo = null, descricao = null, user = null }) {
  await db.query(`
    INSERT INTO ordens_servico_historico (
      os_id, acao, status_anterior, status_novo, descricao, criado_por_id, criado_por_nome, criado_por_tipo
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    osId,
    acao,
    statusAnterior,
    statusNovo,
    descricao,
    user?.id || null,
    user?.nome || null,
    user?.tipo || null
  ]);
}

router.use(async (req, res, next) => {
  try {
    await garantirSchemaOS();
    next();
  } catch (error) {
    console.error('❌ Erro ao preparar schema de OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao preparar módulo de ordens de serviço' });
  }
});

router.get('/painel-tv', async (req, res) => {
  try {
    const [resultAtivas, resultStats] = await Promise.all([
      db.query(`
        SELECT id, user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade, status,
               data_abertura, data_fechamento, updated_at, relato_tecnico, tecnico_responsavel_nome, materiais_usados
        FROM ordens_servico
        WHERE status IN ('Aberto', 'Em Andamento', 'Aguardando Peças')
        ORDER BY
          CASE
            WHEN prioridade = 'Crítica' THEN 1
            WHEN prioridade = 'Alta' THEN 2
            WHEN prioridade = 'Média' THEN 3
            WHEN prioridade = 'Baixa' THEN 4
            ELSE 5
          END,
          data_abertura DESC,
          id DESC
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS total_geral,
          COUNT(*) FILTER (
            WHERE status <> 'Finalizado'
              AND DATE(data_abertura AT TIME ZONE 'America/Fortaleza') = DATE(NOW() AT TIME ZONE 'America/Fortaleza')
          )::int AS total_dia_nao_finalizado
        FROM ordens_servico
      `)
    ]);

    const stats = resultStats.rows?.[0] || {};
    const resumoSetores = setoresDestinoValidos.reduce((acc, setor) => {
      const listaSetor = (resultAtivas.rows || []).filter((os) => os.setor_destino === setor);
      acc[setor] = {
        aberto: listaSetor.filter((os) => os.status === 'Aberto').length,
        andamento: listaSetor.filter((os) => os.status === 'Em Andamento').length,
        aguardando: listaSetor.filter((os) => os.status === 'Aguardando Peças').length,
        total: listaSetor.length
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: resultAtivas.rows || [],
      stats: {
        total_geral: Number(stats.total_geral || 0),
        total_dia_nao_finalizado: Number(stats.total_dia_nao_finalizado || 0)
      },
      resumoSetores
    });
  } catch (error) {
    console.error('❌ Erro ao carregar painel TV:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar painel TV' });
  }
});

router.get('/minhas', authMiddleware, async (req, res) => {
  try {
    const userId = req.user_id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
    }

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE user_id = $1
      ORDER BY data_abertura DESC, id DESC
    `, [userId]);

    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('❌ Erro ao buscar minhas OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar suas ordens de serviço' });
  }
});

router.get('/', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      ORDER BY data_abertura DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao listar OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordens de serviço' });
  }
});

router.get('/setor/:setor', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { setor } = req.params;
    if (!setoresDestinoValidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor técnico inválido' });
    }

    const result = await db.query(`
      SELECT *
      FROM ordens_servico
      WHERE setor_destino = $1
      ORDER BY
        CASE
          WHEN prioridade = 'Crítica' THEN 1
          WHEN prioridade = 'Alta' THEN 2
          WHEN prioridade = 'Média' THEN 3
          WHEN prioridade = 'Baixa' THEN 4
          ELSE 5
        END,
        data_abertura ASC,
        id DESC
    `, [setor]);

    res.json({ success: true, data: result.rows || [] });
  } catch (error) {
    console.error('❌ Erro ao buscar OS por setor:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordens de serviço' });
  }
});


router.get('/setor/:setor/resumo', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { setor } = req.params;
    if (!setoresDestinoValidos.includes(setor)) {
      return res.status(400).json({ success: false, message: 'Setor técnico inválido' });
    }

    const [statusResult, slaResult] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Aberto')::int AS aberto,
          COUNT(*) FILTER (WHERE status = 'Em Andamento')::int AS andamento,
          COUNT(*) FILTER (WHERE status = 'Aguardando Peças')::int AS aguardando,
          COUNT(*) FILTER (WHERE status = 'Finalizado')::int AS finalizado,
          COUNT(*) FILTER (WHERE status = 'Cancelado')::int AS cancelado,
          COUNT(*) FILTER (WHERE tecnico_responsavel_id = $2 AND status NOT IN ('Finalizado', 'Cancelado'))::int AS minha_fila
        FROM ordens_servico
        WHERE setor_destino = $1
      `, [setor, req.user.id]),
      db.query(`
        SELECT
          ROUND(AVG(tempo_resolucao_horas)::numeric, 2) AS tempo_medio_resolucao,
          COUNT(*) FILTER (
            WHERE status = 'Finalizado' AND (
              (prioridade = 'Crítica' AND tempo_resolucao_horas <= 1) OR
              (prioridade = 'Alta' AND tempo_resolucao_horas <= 4) OR
              (prioridade = 'Média' AND tempo_resolucao_horas <= 8) OR
              (prioridade = 'Baixa' AND tempo_resolucao_horas <= 24)
            )
          )::int AS dentro_sla,
          COUNT(*) FILTER (WHERE status = 'Finalizado')::int AS finalizadas
        FROM ordens_servico
        WHERE setor_destino = $1
      `, [setor])
    ]);

    const status = statusResult.rows?.[0] || {};
    const sla = slaResult.rows?.[0] || {};
    const finalizadas = Number(sla.finalizadas || 0);
    const dentroSla = Number(sla.dentro_sla || 0);

    res.json({
      success: true,
      data: {
        setor,
        total: Number(status.total || 0),
        aberto: Number(status.aberto || 0),
        andamento: Number(status.andamento || 0),
        aguardando: Number(status.aguardando || 0),
        finalizado: Number(status.finalizado || 0),
        cancelado: Number(status.cancelado || 0),
        minha_fila: Number(status.minha_fila || 0),
        tempo_medio_resolucao: Number(sla.tempo_medio_resolucao || 0),
        sla_percentual: finalizadas > 0 ? Math.round((dentroSla / finalizadas) * 100) : 0
      }
    });
  } catch (error) {
    console.error('❌ Erro ao gerar resumo do setor:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar resumo do setor' });
  }
});

router.put('/:id/assumir', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const atual = await db.get(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const proximoStatus = atual.status === 'Aberto' ? 'Em Andamento' : atual.status;
    const result = await db.query(`
      UPDATE ordens_servico
      SET tecnico_responsavel_id = $1,
          tecnico_responsavel_nome = $2,
          status = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [req.user.id, req.user.nome, proximoStatus, id]);

    await registrarHistorico({
      osId: id,
      acao: 'assumiu_chamado',
      statusAnterior: atual.status,
      statusNovo: proximoStatus,
      descricao: `Chamado assumido por ${req.user.nome}`,
      user: req.user
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao assumir chamado:', error);
    res.status(500).json({ success: false, message: 'Erro ao assumir chamado' });
  }
});

router.get('/:id/historico', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }

    const os = await db.get('SELECT id, user_id FROM ordens_servico WHERE id = $1', [id]);
    if (!os) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const isTech = req.user?.tipo === 'tecnico' || req.user?.tipo === 'admin';
    const isOwner = os.user_id === (req.user_id || req.user?.id);
    if (!isTech && !isOwner) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }

    const historico = await db.all(`
      SELECT *
      FROM ordens_servico_historico
      WHERE os_id = $1
      ORDER BY criado_em DESC, id DESC
    `, [id]);

    res.json({ success: true, data: historico });
  } catch (error) {
    console.error('❌ Erro ao buscar histórico da OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar histórico da ordem de serviço' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }

    const result = await db.query(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const os = result.rows[0];
    const isTech = req.user?.tipo === 'tecnico' || req.user?.tipo === 'admin';
    const isOwner = os.user_id === (req.user_id || req.user?.id);
    if (!isTech && !isOwner) {
      return res.status(403).json({ success: false, message: 'Acesso negado' });
    }

    res.json({ success: true, data: os });
  } catch (error) {
    console.error('❌ Erro ao buscar OS por ID:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar ordem de serviço' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const user_id = req.user_id || req.user?.id;
    const { setor_origem, setor_destino, categoria, cliente, descricao, prioridade, foto_base64, foto_mime_type, foto_nome } = req.body;

    if (!user_id) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
    }

    if (!setor_origem || !setor_destino || !descricao || !prioridade) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: setor_origem, setor_destino, descricao, prioridade'
      });
    }

    if (!setoresOrigemValidos.includes(setor_origem)) {
      return res.status(400).json({ success: false, message: 'Setor de origem inválido' });
    }

    if (!setoresDestinoValidos.includes(setor_destino)) {
      return res.status(400).json({ success: false, message: 'Setor de destino inválido' });
    }

    const base64Limpa = normalizarBase64(foto_base64);
    const mimePermitido = !foto_mime_type || ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(String(foto_mime_type).toLowerCase());

    if (base64Limpa && base64Limpa.length > TAMANHO_MAX_BASE64) {
      return res.status(400).json({ success: false, message: 'A foto é muito grande. Use uma imagem de até 5 MB.' });
    }

    if (base64Limpa && !mimePermitido) {
      return res.status(400).json({ success: false, message: 'Formato de imagem inválido. Use JPG, PNG ou WEBP.' });
    }

    const result = await db.query(`
      INSERT INTO ordens_servico (
        user_id, setor_origem, setor_destino, categoria, cliente, descricao, prioridade,
        status, data_abertura, updated_at, foto_base64, foto_mime_type, foto_nome
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberto', NOW(), NOW(), $8, $9, $10)
      RETURNING *
    `, [
      user_id,
      setor_origem,
      setor_destino,
      categoria || 'Geral',
      cliente || 'Não informado',
      descricao,
      prioridade,
      base64Limpa,
      base64Limpa ? (foto_mime_type || 'image/jpeg') : null,
      base64Limpa ? (foto_nome || 'imagem-os') : null
    ]);

    const novaOS = result.rows[0];
    await registrarHistorico({
      osId: novaOS.id,
      acao: 'criacao',
      statusNovo: 'Aberto',
      descricao: 'Ordem de serviço criada',
      user: req.user
    });

    res.status(201).json({ success: true, data: novaOS });
  } catch (error) {
    console.error('❌ Erro ao criar OS:', error);
    res.status(500).json({ success: false, message: error?.detail || error?.message || 'Erro ao criar ordem de serviço' });
  }
});

router.put('/:id/status', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, relato_tecnico, prioridade, materiais_usados } = req.body;

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status inválido. Permitidos: ${statusPermitidos.join(', ')}`
      });
    }

    const atual = await db.get(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const updates = ['status = $1', 'tecnico_responsavel_id = $2', 'tecnico_responsavel_nome = $3', 'updated_at = NOW()'];
    const params = [status, req.user.id, req.user.nome];
    let index = 4;

    if (prioridade && ['Baixa', 'Média', 'Alta', 'Crítica'].includes(prioridade)) {
      updates.push(`prioridade = $${index}`);
      params.push(prioridade);
      index += 1;
    }

    if (typeof materiais_usados === 'string') {
      updates.push(`materiais_usados = $${index}`);
      params.push(materiais_usados.trim());
      index += 1;
    }

    if (typeof relato_tecnico === 'string') {
      updates.push(`relato_tecnico = $${index}`);
      params.push(relato_tecnico.trim());
      index += 1;
    }

    if (status === 'Finalizado') {
      updates.push('data_fechamento = NOW()');
      updates.push(`tempo_resolucao_horas = ROUND((EXTRACT(EPOCH FROM (NOW() - data_abertura)) / 3600)::numeric, 2)`);
    } else {
      updates.push('data_fechamento = NULL');
      updates.push('tempo_resolucao_horas = NULL');
    }

    params.push(id);
    const result = await db.query(`
      UPDATE ordens_servico
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `, params);

    const osAtualizada = result.rows[0];
    await registrarHistorico({
      osId: osAtualizada.id,
      acao: 'mudanca_status',
      statusAnterior: atual.status,
      statusNovo: status,
      descricao: montarDescricaoMudanca({ statusAnterior: atual.status, statusNovo: status, relatoTecnico: relato_tecnico }),
      user: req.user
    });

    res.json({ success: true, data: osAtualizada });
  } catch (error) {
    console.error('❌ Erro ao atualizar OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar OS' });
  }
});

router.delete('/:id', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const atual = await db.get(`SELECT * FROM ordens_servico WHERE id = $1`, [id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada' });
    }

    const result = await db.query(`DELETE FROM ordens_servico WHERE id = $1 RETURNING *`, [id]);
    res.json({
      success: true,
      message: 'Ordem de serviço excluída com sucesso',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erro ao excluir OS:', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir ordem de serviço' });
  }
});

module.exports = router;
