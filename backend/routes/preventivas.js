const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTechnical } = require('../middleware/auth');

const STATUS_PERMITIDOS = [
  'Manutenção Solicitada',
  'Em Análise',
  'Programada',
  'Aguardando Peça',
  'Em Execução',
  'Concluída'
];

const PERIODICIDADES = ['Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'];
const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];

function normalizarStatus(status) {
  return STATUS_PERMITIDOS.includes(status) ? status : 'Manutenção Solicitada';
}

function normalizarPeriodicidade(periodicidade) {
  return PERIODICIDADES.includes(periodicidade) ? periodicidade : 'Mensal';
}

function normalizarPrioridade(prioridade) {
  return PRIORIDADES.includes(prioridade) ? prioridade : 'Média';
}

function adicionarPeriodo(dataBase, periodicidade) {
  if (!dataBase) return null;
  const data = new Date(`${String(dataBase).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(data.getTime())) return null;

  switch (periodicidade) {
    case 'Mensal':
      data.setMonth(data.getMonth() + 1);
      break;
    case 'Bimestral':
      data.setMonth(data.getMonth() + 2);
      break;
    case 'Trimestral':
      data.setMonth(data.getMonth() + 3);
      break;
    case 'Semestral':
      data.setMonth(data.getMonth() + 6);
      break;
    case 'Anual':
      data.setFullYear(data.getFullYear() + 1);
      break;
    default:
      return null;
  }

  return data.toISOString().slice(0, 10);
}

function gerarDescricaoMudancas(antes = {}, depois = {}) {
  const campos = {
    equipamento: 'equipamento',
    marca: 'marca',
    modelo: 'modelo',
    numero_serie: 'número de série',
    setor_equipamento: 'setor do equipamento',
    setor_responsavel: 'setor responsável',
    localizacao: 'localização',
    periodicidade: 'periodicidade',
    prioridade: 'prioridade',
    data_ultima_manutencao: 'última manutenção',
    data_proxima_manutencao: 'próxima manutenção',
    tecnico_responsavel: 'técnico responsável',
    observacoes: 'observações',
    status: 'status'
  };

  const alteracoes = [];

  Object.entries(campos).forEach(([chave, label]) => {
    const a = antes[chave] == null ? '' : String(antes[chave]);
    const d = depois[chave] == null ? '' : String(depois[chave]);
    if (a !== d) {
      alteracoes.push(`${label}: "${a || '-'}" → "${d || '-'}"`);
    }
  });

  return alteracoes.length ? alteracoes.join(' | ') : 'Registro atualizado';
}

async function garantirTabela() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS manutencoes_preventivas (
      id SERIAL PRIMARY KEY,
      equipamento VARCHAR(255) NOT NULL,
      marca VARCHAR(150) NOT NULL,
      modelo VARCHAR(150) NOT NULL,
      numero_serie VARCHAR(150) NOT NULL,
      setor_equipamento VARCHAR(150) NOT NULL,
      setor_responsavel VARCHAR(150) NOT NULL,
      localizacao VARCHAR(255),
      periodicidade VARCHAR(50) NOT NULL DEFAULT 'Mensal',
      data_ultima_manutencao DATE,
      data_proxima_manutencao DATE,
      status VARCHAR(50) NOT NULL DEFAULT 'Manutenção Solicitada',
      prioridade VARCHAR(30) NOT NULL DEFAULT 'Média',
      tecnico_responsavel VARCHAR(150),
      observacoes TEXT,
      criado_por INTEGER,
      ativo BOOLEAN NOT NULL DEFAULT true,
      data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
      data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW(),
      data_conclusao TIMESTAMP,
      CONSTRAINT fk_preventiva_criado_por FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`
    ALTER TABLE manutencoes_preventivas
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS manutencoes_preventivas_historico (
      id SERIAL PRIMARY KEY,
      preventiva_id INTEGER NOT NULL,
      acao VARCHAR(80) NOT NULL,
      descricao TEXT,
      status_anterior VARCHAR(50),
      status_novo VARCHAR(50),
      criado_por INTEGER,
      criado_por_nome VARCHAR(150),
      data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_preventiva_historico FOREIGN KEY (preventiva_id) REFERENCES manutencoes_preventivas(id) ON DELETE CASCADE,
      CONSTRAINT fk_preventiva_historico_usuario FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_preventivas_status ON manutencoes_preventivas(status);
    CREATE INDEX IF NOT EXISTS idx_preventivas_setor_resp ON manutencoes_preventivas(setor_responsavel);
    CREATE INDEX IF NOT EXISTS idx_preventivas_setor_eqp ON manutencoes_preventivas(setor_equipamento);
    CREATE INDEX IF NOT EXISTS idx_preventivas_proxima_data ON manutencoes_preventivas(data_proxima_manutencao);
    CREATE INDEX IF NOT EXISTS idx_preventivas_ativo ON manutencoes_preventivas(ativo);
    CREATE INDEX IF NOT EXISTS idx_preventivas_hist_preventiva ON manutencoes_preventivas_historico(preventiva_id);
  `);
}

async function registrarHistorico({ preventivaId, acao, descricao, statusAnterior = null, statusNovo = null, user = null }) {
  await db.get(`
    INSERT INTO manutencoes_preventivas_historico (
      preventiva_id, acao, descricao, status_anterior, status_novo, criado_por, criado_por_nome
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [
    preventivaId,
    acao,
    descricao || null,
    statusAnterior,
    statusNovo,
    user?.id || null,
    user?.nome || null
  ]);
}

function montarFiltros(reqQuery) {
  const {
    setor,
    status,
    busca,
    periodicidade,
    prioridade,
    setor_equipamento,
    tecnico,
    prazo,
    incluir_inativos
  } = reqQuery;

  const filtros = [];
  const params = [];

  if (!incluir_inativos || incluir_inativos !== 'true') {
    filtros.push('mp.ativo = true');
  }

  if (setor) {
    params.push(setor);
    filtros.push(`(mp.setor_responsavel = $${params.length} OR mp.setor_equipamento = $${params.length})`);
  }

  if (status && STATUS_PERMITIDOS.includes(status)) {
    params.push(status);
    filtros.push(`mp.status = $${params.length}`);
  }

  if (periodicidade && PERIODICIDADES.includes(periodicidade)) {
    params.push(periodicidade);
    filtros.push(`mp.periodicidade = $${params.length}`);
  }

  if (prioridade && PRIORIDADES.includes(prioridade)) {
    params.push(prioridade);
    filtros.push(`mp.prioridade = $${params.length}`);
  }

  if (setor_equipamento) {
    params.push(`%${String(setor_equipamento).toLowerCase()}%`);
    filtros.push(`LOWER(mp.setor_equipamento) LIKE $${params.length}`);
  }

  if (tecnico) {
    params.push(`%${String(tecnico).toLowerCase()}%`);
    filtros.push(`LOWER(COALESCE(mp.tecnico_responsavel, '')) LIKE $${params.length}`);
  }

  if (busca) {
    params.push(`%${String(busca).toLowerCase()}%`);
    filtros.push(`(
      LOWER(mp.equipamento) LIKE $${params.length}
      OR LOWER(mp.marca) LIKE $${params.length}
      OR LOWER(mp.modelo) LIKE $${params.length}
      OR LOWER(mp.numero_serie) LIKE $${params.length}
      OR LOWER(mp.setor_equipamento) LIKE $${params.length}
      OR LOWER(COALESCE(mp.localizacao, '')) LIKE $${params.length}
      OR LOWER(COALESCE(mp.observacoes, '')) LIKE $${params.length}
    )`);
  }

  if (prazo === 'atrasada') {
    filtros.push(`mp.status <> 'Concluída' AND mp.data_proxima_manutencao IS NOT NULL AND mp.data_proxima_manutencao < CURRENT_DATE`);
  } else if (prazo === 'vencendo') {
    filtros.push(`mp.status <> 'Concluída' AND mp.data_proxima_manutencao IS NOT NULL AND mp.data_proxima_manutencao BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`);
  } else if (prazo === 'ok') {
    filtros.push(`(
      mp.status = 'Concluída'
      OR mp.data_proxima_manutencao IS NULL
      OR mp.data_proxima_manutencao > CURRENT_DATE + INTERVAL '7 days'
    )`);
  }

  return {
    where: filtros.length ? `WHERE ${filtros.join(' AND ')}` : '',
    params
  };
}

router.use(async (req, res, next) => {
  try {
    await garantirTabela();
    next();
  } catch (error) {
    console.error('❌ Erro ao preparar tabelas de preventivas:', error);
    res.status(500).json({ success: false, message: 'Erro ao preparar módulo de preventivas' });
  }
});

router.get('/metadata', authMiddleware, requireTechnical, async (req, res) => {
  res.json({
    success: true,
    data: {
      status: STATUS_PERMITIDOS,
      periodicidades: PERIODICIDADES,
      prioridades: PRIORIDADES
    }
  });
});

router.get('/stats/resumo', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const resumo = await db.get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mp.status = 'Manutenção Solicitada')::int AS solicitadas,
        COUNT(*) FILTER (WHERE mp.status = 'Em Análise')::int AS analise,
        COUNT(*) FILTER (WHERE mp.status = 'Programada')::int AS programadas,
        COUNT(*) FILTER (WHERE mp.status = 'Aguardando Peça')::int AS aguardando,
        COUNT(*) FILTER (WHERE mp.status = 'Em Execução')::int AS execucao,
        COUNT(*) FILTER (WHERE mp.status = 'Concluída')::int AS concluidas,
        COUNT(*) FILTER (WHERE mp.data_proxima_manutencao IS NOT NULL AND mp.data_proxima_manutencao < CURRENT_DATE AND mp.status <> 'Concluída')::int AS atrasadas,
        COUNT(*) FILTER (WHERE mp.data_proxima_manutencao IS NOT NULL AND mp.data_proxima_manutencao BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND mp.status <> 'Concluída')::int AS vencendo
      FROM manutencoes_preventivas mp
      ${where}
    `, params);

    res.json({ success: true, data: resumo });
  } catch (error) {
    console.error('❌ Erro ao gerar resumo:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar resumo das preventivas' });
  }
});

router.get('/relatorios/resumo', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);

    const [resumo, porStatus, porPeriodicidade, proximas] = await Promise.all([
      db.get(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE mp.status = 'Concluída')::int AS concluidas,
          COUNT(*) FILTER (WHERE mp.status <> 'Concluída' AND mp.data_proxima_manutencao < CURRENT_DATE)::int AS atrasadas,
          COUNT(*) FILTER (WHERE mp.status <> 'Concluída' AND mp.data_proxima_manutencao BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS proximos_30_dias
        FROM manutencoes_preventivas mp
        ${where}
      `, params),
      db.all(`
        SELECT mp.status, COUNT(*)::int AS total
        FROM manutencoes_preventivas mp
        ${where}
        GROUP BY mp.status
        ORDER BY total DESC, mp.status ASC
      `, params),
      db.all(`
        SELECT mp.periodicidade, COUNT(*)::int AS total
        FROM manutencoes_preventivas mp
        ${where}
        GROUP BY mp.periodicidade
        ORDER BY total DESC, mp.periodicidade ASC
      `, params),
      db.all(`
        SELECT mp.id, mp.equipamento, mp.marca, mp.modelo, mp.numero_serie, mp.setor_equipamento, mp.status, mp.data_proxima_manutencao, mp.prioridade
        FROM manutencoes_preventivas mp
        ${where}
        ORDER BY mp.data_proxima_manutencao NULLS LAST, mp.prioridade ASC, mp.id DESC
        LIMIT 100
      `, params)
    ]);

    res.json({ success: true, data: { resumo, porStatus, porPeriodicidade, proximas } });
  } catch (error) {
    console.error('❌ Erro ao montar relatório:', error);
    res.status(500).json({ success: false, message: 'Erro ao montar relatório das preventivas' });
  }
});

router.get('/', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { where, params } = montarFiltros(req.query);
    const rows = await db.all(`
      SELECT mp.*, u.nome AS nome_criador
      FROM manutencoes_preventivas mp
      LEFT JOIN usuarios u ON u.id = mp.criado_por
      ${where}
      ORDER BY
        CASE mp.status
          WHEN 'Manutenção Solicitada' THEN 1
          WHEN 'Em Análise' THEN 2
          WHEN 'Programada' THEN 3
          WHEN 'Aguardando Peça' THEN 4
          WHEN 'Em Execução' THEN 5
          WHEN 'Concluída' THEN 6
          ELSE 7
        END,
        CASE mp.prioridade
          WHEN 'Crítica' THEN 1
          WHEN 'Alta' THEN 2
          WHEN 'Média' THEN 3
          WHEN 'Baixa' THEN 4
          ELSE 5
        END,
        mp.data_proxima_manutencao NULLS LAST,
        mp.data_criacao DESC
    `, params);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Erro ao listar preventivas:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar manutenções preventivas' });
  }
});

router.get('/:id/historico', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const itens = await db.all(`
      SELECT *
      FROM manutencoes_preventivas_historico
      WHERE preventiva_id = $1
      ORDER BY data_criacao DESC, id DESC
    `, [req.params.id]);

    res.json({ success: true, data: itens });
  } catch (error) {
    console.error('❌ Erro ao buscar histórico:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico da preventiva' });
  }
});

router.post('/:id/historico', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const item = await db.get('SELECT id FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [req.params.id]);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    const descricao = String(req.body?.descricao || '').trim();
    if (!descricao) {
      return res.status(400).json({ success: false, message: 'Informe a anotação do histórico' });
    }

    await registrarHistorico({
      preventivaId: req.params.id,
      acao: 'anotacao',
      descricao,
      user: req.user
    });

    res.status(201).json({ success: true, message: 'Anotação registrada com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao registrar anotação:', error);
    res.status(500).json({ success: false, message: 'Erro ao registrar anotação' });
  }
});

router.get('/:id', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const row = await db.get(`
      SELECT mp.*, u.nome AS nome_criador
      FROM manutencoes_preventivas mp
      LEFT JOIN usuarios u ON u.id = mp.criado_por
      WHERE mp.id = $1
    `, [req.params.id]);

    if (!row) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    res.json({ success: true, data: row });
  } catch (error) {
    console.error('❌ Erro ao buscar preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar preventiva' });
  }
});

router.post('/', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const {
      equipamento,
      marca,
      modelo,
      numero_serie,
      setor_equipamento,
      setor_responsavel,
      localizacao,
      periodicidade,
      data_ultima_manutencao,
      data_proxima_manutencao,
      status,
      prioridade,
      tecnico_responsavel,
      observacoes
    } = req.body;

    if (!equipamento || !marca || !modelo || !numero_serie || !setor_equipamento || !setor_responsavel) {
      return res.status(400).json({
        success: false,
        message: 'Preencha equipamento, marca, modelo, número de série, setor do equipamento e setor responsável'
      });
    }

    const periodicidadeFinal = normalizarPeriodicidade(periodicidade);
    const dataUltima = data_ultima_manutencao || null;
    const proximaCalculada = data_proxima_manutencao || (dataUltima ? adicionarPeriodo(dataUltima, periodicidadeFinal) : null);
    const statusFinal = normalizarStatus(status);
    const prioridadeFinal = normalizarPrioridade(prioridade);

    const result = await db.get(`
      INSERT INTO manutencoes_preventivas (
        equipamento, marca, modelo, numero_serie,
        setor_equipamento, setor_responsavel, localizacao,
        periodicidade, data_ultima_manutencao, data_proxima_manutencao,
        status, prioridade, tecnico_responsavel, observacoes, criado_por
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14, $15
      ) RETURNING *
    `, [
      equipamento,
      marca,
      modelo,
      numero_serie,
      setor_equipamento,
      setor_responsavel,
      localizacao || null,
      periodicidadeFinal,
      dataUltima,
      proximaCalculada,
      statusFinal,
      prioridadeFinal,
      tecnico_responsavel || null,
      observacoes || null,
      req.user_id
    ]);

    await registrarHistorico({
      preventivaId: result.id,
      acao: 'criado',
      descricao: `Preventiva cadastrada para ${equipamento} (${marca} ${modelo})`,
      statusNovo: statusFinal,
      user: req.user
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Erro ao cadastrar preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao cadastrar preventiva' });
  }
});

router.post('/:id/duplicar', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const atual = await db.get('SELECT * FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [req.params.id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    const dataUltima = req.body?.reiniciar_datas ? null : atual.data_ultima_manutencao;
    const dataProxima = req.body?.reiniciar_datas ? null : atual.data_proxima_manutencao;

    const duplicada = await db.get(`
      INSERT INTO manutencoes_preventivas (
        equipamento, marca, modelo, numero_serie,
        setor_equipamento, setor_responsavel, localizacao,
        periodicidade, data_ultima_manutencao, data_proxima_manutencao,
        status, prioridade, tecnico_responsavel, observacoes, criado_por
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14, $15
      ) RETURNING *
    `, [
      atual.equipamento,
      atual.marca,
      atual.modelo,
      atual.numero_serie,
      atual.setor_equipamento,
      atual.setor_responsavel,
      atual.localizacao,
      atual.periodicidade,
      dataUltima,
      dataProxima,
      'Manutenção Solicitada',
      atual.prioridade,
      atual.tecnico_responsavel,
      atual.observacoes,
      req.user_id
    ]);

    await registrarHistorico({
      preventivaId: duplicada.id,
      acao: 'duplicado',
      descricao: `Preventiva duplicada a partir do registro #${atual.id}`,
      statusNovo: 'Manutenção Solicitada',
      user: req.user
    });

    res.status(201).json({ success: true, data: duplicada });
  } catch (error) {
    console.error('❌ Erro ao duplicar preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao duplicar preventiva' });
  }
});

router.put('/:id', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const atual = await db.get('SELECT * FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [id]);

    if (!atual) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    const payload = { ...atual, ...req.body };
    const periodicidadeFinal = normalizarPeriodicidade(payload.periodicidade);
    const dataUltima = payload.data_ultima_manutencao || null;
    const dataProxima = payload.data_proxima_manutencao || (dataUltima ? adicionarPeriodo(dataUltima, periodicidadeFinal) : null);
    const statusFinal = normalizarStatus(payload.status);
    const prioridadeFinal = normalizarPrioridade(payload.prioridade);
    const conclusao = statusFinal === 'Concluída' ? 'NOW()' : 'NULL';

    const result = await db.get(`
      UPDATE manutencoes_preventivas
      SET equipamento = $1,
          marca = $2,
          modelo = $3,
          numero_serie = $4,
          setor_equipamento = $5,
          setor_responsavel = $6,
          localizacao = $7,
          periodicidade = $8,
          data_ultima_manutencao = $9,
          data_proxima_manutencao = $10,
          status = $11,
          prioridade = $12,
          tecnico_responsavel = $13,
          observacoes = $14,
          data_atualizacao = NOW(),
          data_conclusao = ${conclusao}
      WHERE id = $15
      RETURNING *
    `, [
      payload.equipamento,
      payload.marca,
      payload.modelo,
      payload.numero_serie,
      payload.setor_equipamento,
      payload.setor_responsavel,
      payload.localizacao || null,
      periodicidadeFinal,
      dataUltima,
      dataProxima,
      statusFinal,
      prioridadeFinal,
      payload.tecnico_responsavel || null,
      payload.observacoes || null,
      id
    ]);

    await registrarHistorico({
      preventivaId: result.id,
      acao: 'editado',
      descricao: gerarDescricaoMudancas(atual, result),
      statusAnterior: atual.status,
      statusNovo: statusFinal,
      user: req.user
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Erro ao atualizar preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar preventiva' });
  }
});

router.patch('/:id/status', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!STATUS_PERMITIDOS.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status inválido' });
    }

    const atual = await db.get('SELECT * FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    const dataConclusao = status === 'Concluída' ? 'NOW()' : 'NULL';
    const row = await db.get(`
      UPDATE manutencoes_preventivas
      SET status = $1,
          data_atualizacao = NOW(),
          data_conclusao = ${dataConclusao}
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    await registrarHistorico({
      preventivaId: id,
      acao: 'status',
      descricao: `Status alterado de ${atual.status} para ${status}`,
      statusAnterior: atual.status,
      statusNovo: status,
      user: req.user
    });

    res.json({ success: true, data: row });
  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar status da preventiva' });
  }
});

router.post('/:id/concluir', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const atual = await db.get('SELECT * FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [req.params.id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    const dataBase = req.body?.data_execucao || new Date().toISOString().slice(0, 10);
    const periodicidadeFinal = normalizarPeriodicidade(atual.periodicidade);
    const proxima = adicionarPeriodo(dataBase, periodicidadeFinal);

    const row = await db.get(`
      UPDATE manutencoes_preventivas
      SET status = 'Concluída',
          data_ultima_manutencao = $1,
          data_proxima_manutencao = $2,
          data_atualizacao = NOW(),
          data_conclusao = NOW()
      WHERE id = $3
      RETURNING *
    `, [dataBase, proxima, req.params.id]);

    await registrarHistorico({
      preventivaId: req.params.id,
      acao: 'concluido',
      descricao: `Preventiva concluída em ${dataBase}. Próxima manutenção prevista para ${proxima || '-'}.`,
      statusAnterior: atual.status,
      statusNovo: 'Concluída',
      user: req.user
    });

    res.json({ success: true, data: row });
  } catch (error) {
    console.error('❌ Erro ao concluir preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao concluir preventiva' });
  }
});

router.delete('/:id', authMiddleware, requireTechnical, async (req, res) => {
  try {
    const atual = await db.get('SELECT * FROM manutencoes_preventivas WHERE id = $1 AND ativo = true', [req.params.id]);
    if (!atual) {
      return res.status(404).json({ success: false, message: 'Preventiva não encontrada' });
    }

    await db.get(`
      UPDATE manutencoes_preventivas
      SET ativo = false,
          data_atualizacao = NOW()
      WHERE id = $1
      RETURNING id
    `, [req.params.id]);

    await registrarHistorico({
      preventivaId: req.params.id,
      acao: 'inativado',
      descricao: `Preventiva inativada/excluída logicamente do quadro`,
      statusAnterior: atual.status,
      statusNovo: atual.status,
      user: req.user
    });

    res.json({ success: true, message: 'Preventiva removida com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao excluir preventiva:', error);
    res.status(500).json({ success: false, message: 'Erro ao excluir preventiva' });
  }
});

module.exports = router;
