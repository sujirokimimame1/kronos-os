const db = require('../db');

const SLA_LIMITS = {
  'Crítica': 1,
  'Alta': 4,
  'Média': 8,
  'Baixa': 24
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildFilters({ periodo, setor, setor_tecnico, status, prioridade, data_inicio, data_fim }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (data_inicio) {
    conditions.push(`o.data_abertura >= $${idx}`);
    params.push(data_inicio);
    idx += 1;
  }

  if (data_fim) {
    conditions.push(`o.data_abertura < ($${idx}::date + INTERVAL '1 day')`);
    params.push(data_fim);
    idx += 1;
  }

  if ((!data_inicio || !data_fim) && periodo && periodo !== 'todos') {
    const dias = Number(periodo);
    if (Number.isFinite(dias) && dias > 0) {
      conditions.push(`o.data_abertura >= NOW() - ($${idx} * INTERVAL '1 day')`);
      params.push(dias);
      idx += 1;
    }
  }

  const setorTecnico = setor_tecnico || setor;
  if (setorTecnico && setorTecnico !== 'todos' && setorTecnico !== 'ambos') {
    conditions.push(`LOWER(TRIM(COALESCE(o.setor_destino, ''))) = LOWER(TRIM($${idx}))`);
    params.push(setorTecnico);
    idx += 1;
  }

  if (status && status !== 'todos') {
    conditions.push(`o.status = $${idx}`);
    params.push(status);
    idx += 1;
  }

  if (prioridade && prioridade !== 'todos') {
    conditions.push(`o.prioridade = $${idx}`);
    params.push(prioridade);
    idx += 1;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

function buildSlaCase(alias = 'o') {
  return `
    CASE
      WHEN ${alias}.prioridade = 'Crítica' THEN 1
      WHEN ${alias}.prioridade = 'Alta' THEN 4
      WHEN ${alias}.prioridade = 'Média' THEN 8
      WHEN ${alias}.prioridade = 'Baixa' THEN 24
      ELSE 8
    END
  `;
}

exports.getRelatorios = async (req, res) => {
  try {
    const filters = buildFilters(req.query || {});
    const where = filters.where;
    const params = filters.params;
    const slaCase = buildSlaCase('o');

    const estatisticasPromise = db.get(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'Aberto')::int AS abertas,
        COUNT(*) FILTER (WHERE o.status = 'Em Andamento')::int AS em_andamento,
        COUNT(*) FILTER (WHERE o.status = 'Aguardando Peças')::int AS aguardando_pecas,
        COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas,
        COUNT(*) FILTER (WHERE o.status = 'Cancelado')::int AS canceladas,
        COUNT(*) FILTER (WHERE o.prioridade = 'Crítica')::int AS criticas,
        COUNT(*) FILTER (WHERE o.prioridade = 'Alta')::int AS altas,
        ROUND(AVG(o.tempo_resolucao_horas) FILTER (WHERE o.status = 'Finalizado')::numeric, 2) AS tempo_medio_resolucao,
        COUNT(*) FILTER (
          WHERE o.status = 'Finalizado'
            AND o.tempo_resolucao_horas IS NOT NULL
            AND o.tempo_resolucao_horas <= ${slaCase}
        )::int AS sla_dentro,
        COUNT(*) FILTER (
          WHERE o.status = 'Finalizado'
            AND o.tempo_resolucao_horas IS NOT NULL
            AND o.tempo_resolucao_horas > ${slaCase}
        )::int AS sla_fora
      FROM ordens_servico o
      ${where}
    `, params);

    const rankingTecnicosPromise = db.all(`
      SELECT
        COALESCE(NULLIF(o.tecnico_responsavel_nome, ''), 'Não atribuído') AS tecnico,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas,
        ROUND(AVG(o.tempo_resolucao_horas) FILTER (WHERE o.status = 'Finalizado')::numeric, 2) AS tempo_medio,
        COUNT(*) FILTER (
          WHERE o.status = 'Finalizado'
            AND o.tempo_resolucao_horas IS NOT NULL
            AND o.tempo_resolucao_horas <= ${slaCase}
        )::int AS dentro_sla
      FROM ordens_servico o
      ${where}
      GROUP BY COALESCE(NULLIF(o.tecnico_responsavel_nome, ''), 'Não atribuído')
      ORDER BY total DESC, finalizadas DESC, tecnico ASC
      LIMIT 10
    `, params);

    const rankingCategoriasPromise = db.all(`
      SELECT
        COALESCE(NULLIF(o.categoria, ''), 'Geral') AS categoria,
        COUNT(*)::int AS total
      FROM ordens_servico o
      ${where}
      GROUP BY COALESCE(NULLIF(o.categoria, ''), 'Geral')
      ORDER BY total DESC, categoria ASC
      LIMIT 10
    `, params);

    const resumoSetoresPromise = db.all(`
      SELECT
        COALESCE(NULLIF(o.setor_destino, ''), 'Não informado') AS setor,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas,
        ROUND(AVG(o.tempo_resolucao_horas) FILTER (WHERE o.status = 'Finalizado')::numeric, 2) AS tempo_medio
      FROM ordens_servico o
      ${where}
      GROUP BY COALESCE(NULLIF(o.setor_destino, ''), 'Não informado')
      ORDER BY total DESC, setor ASC
    `, params);

    const resumoSolicitantesPromise = db.all(`
      SELECT
        COALESCE(NULLIF(o.setor_origem, ''), 'Não informado') AS setor_origem,
        COUNT(*)::int AS total
      FROM ordens_servico o
      ${where}
      GROUP BY COALESCE(NULLIF(o.setor_origem, ''), 'Não informado')
      ORDER BY total DESC, setor_origem ASC
      LIMIT 10
    `, params);

    const chamadosRecentesPromise = db.all(`
      SELECT
        o.id,
        o.setor_origem,
        o.setor_destino,
        o.categoria,
        o.cliente,
        o.descricao,
        o.prioridade,
        o.status,
        o.data_abertura,
        o.data_fechamento,
        o.tempo_resolucao_horas,
        o.tecnico_responsavel_nome,
        o.updated_at
      FROM ordens_servico o
      ${where}
      ORDER BY o.data_abertura DESC, o.id DESC
      LIMIT 50
    `, params);

    const [estatisticasRaw, rankingTecnicosRaw, rankingCategoriasRaw, resumoSetoresRaw, resumoSolicitantesRaw, chamadosRecentesRaw] = await Promise.all([
      estatisticasPromise,
      rankingTecnicosPromise,
      rankingCategoriasPromise,
      resumoSetoresPromise,
      resumoSolicitantesPromise,
      chamadosRecentesPromise
    ]);

    const finalizadas = toNumber(estatisticasRaw?.finalizadas);
    const slaDentro = toNumber(estatisticasRaw?.sla_dentro);
    const slaFora = toNumber(estatisticasRaw?.sla_fora);

    const estatisticas = {
      total: toNumber(estatisticasRaw?.total),
      abertas: toNumber(estatisticasRaw?.abertas),
      em_andamento: toNumber(estatisticasRaw?.em_andamento),
      aguardando_pecas: toNumber(estatisticasRaw?.aguardando_pecas),
      finalizadas,
      canceladas: toNumber(estatisticasRaw?.canceladas),
      criticas: toNumber(estatisticasRaw?.criticas),
      altas: toNumber(estatisticasRaw?.altas),
      tempo_medio_resolucao: toNumber(estatisticasRaw?.tempo_medio_resolucao),
      sla_dentro: slaDentro,
      sla_fora: slaFora,
      sla_percentual: finalizadas > 0 ? Math.round((slaDentro / finalizadas) * 100) : 0
    };

    const rankingTecnicos = (rankingTecnicosRaw || []).map((row) => {
      const finalizadasTecnico = toNumber(row.finalizadas);
      const dentroSlaTecnico = toNumber(row.dentro_sla);
      return {
        tecnico: row.tecnico,
        total: toNumber(row.total),
        finalizadas: finalizadasTecnico,
        tempo_medio: toNumber(row.tempo_medio),
        sla_percentual: finalizadasTecnico > 0 ? Math.round((dentroSlaTecnico / finalizadasTecnico) * 100) : 0
      };
    });

    res.json({
      success: true,
      dados: {
        estatisticas,
        rankingTecnicos,
        rankingCategorias: (rankingCategoriasRaw || []).map((row) => ({
          categoria: row.categoria,
          total: toNumber(row.total)
        })),
        resumoSetores: (resumoSetoresRaw || []).map((row) => ({
          setor: row.setor,
          total: toNumber(row.total),
          finalizadas: toNumber(row.finalizadas),
          tempo_medio: toNumber(row.tempo_medio)
        })),
        resumoSolicitantes: (resumoSolicitantesRaw || []).map((row) => ({
          setor_origem: row.setor_origem,
          total: toNumber(row.total)
        })),
        maiorSolicitante: (resumoSolicitantesRaw && resumoSolicitantesRaw[0]) ? {
          setor_origem: resumoSolicitantesRaw[0].setor_origem,
          total: toNumber(resumoSolicitantesRaw[0].total)
        } : null,
        chamadosRecentes: chamadosRecentesRaw || [],
        filtrosAplicados: {
          periodo: req.query?.periodo || 'todos',
          setor_tecnico: req.query?.setor_tecnico || req.query?.setor || 'ambos',
          status: req.query?.status || 'todos',
          prioridade: req.query?.prioridade || 'todos',
          data_inicio: req.query?.data_inicio || null,
          data_fim: req.query?.data_fim || null
        }
      }
    });
  } catch (error) {
    console.error('❌ Erro ao gerar relatórios:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar relatórios', error: error.message });
  }
};

exports.getRelatorioTecnicos = async (req, res) => {
  try {
    const filters = buildFilters(req.query || {});
    const slaCase = buildSlaCase('o');
    const rows = await db.all(`
      SELECT
        COALESCE(NULLIF(o.tecnico_responsavel_nome, ''), 'Não atribuído') AS tecnico,
        COALESCE(NULLIF(o.setor_destino, ''), 'Não informado') AS setor,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas,
        ROUND(AVG(o.tempo_resolucao_horas) FILTER (WHERE o.status = 'Finalizado')::numeric, 2) AS tempo_medio,
        COUNT(*) FILTER (
          WHERE o.status = 'Finalizado'
            AND o.tempo_resolucao_horas IS NOT NULL
            AND o.tempo_resolucao_horas <= ${slaCase}
        )::int AS dentro_sla
      FROM ordens_servico o
      ${filters.where}
      GROUP BY COALESCE(NULLIF(o.tecnico_responsavel_nome, ''), 'Não atribuído'), COALESCE(NULLIF(o.setor_destino, ''), 'Não informado')
      ORDER BY total DESC, finalizadas DESC, tecnico ASC
    `, filters.params);

    res.json({
      success: true,
      data: (rows || []).map((row) => {
        const finalizadas = toNumber(row.finalizadas);
        const dentroSla = toNumber(row.dentro_sla);
        return {
          tecnico: row.tecnico,
          setor: row.setor,
          total: toNumber(row.total),
          finalizadas,
          tempo_medio: toNumber(row.tempo_medio),
          sla_percentual: finalizadas > 0 ? Math.round((dentroSla / finalizadas) * 100) : 0
        };
      })
    });
  } catch (error) {
    console.error('❌ Erro ao gerar relatório de técnicos:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar relatório de técnicos', error: error.message });
  }
};

exports.getSetores = async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT DISTINCT setor_destino AS nome
      FROM ordens_servico
      WHERE setor_destino IS NOT NULL AND setor_destino <> ''
      ORDER BY setor_destino ASC
    `);

    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('❌ Erro ao listar setores:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar setores', error: error.message });
  }
};

exports.getDashboardResumo = async (req, res) => {
  try {
    const filters = buildFilters(req.query || {});
    const where = filters.where;
    const params = filters.params;
    const hojeExpression = `DATE(NOW() AT TIME ZONE 'America/Fortaleza')`;

    const [resumo, serie] = await Promise.all([
      db.get(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE DATE(o.data_abertura AT TIME ZONE 'America/Fortaleza') = ${hojeExpression})::int AS abertas_hoje,
          COUNT(*) FILTER (WHERE o.status IN ('Aberto', 'Em Andamento', 'Aguardando Peças'))::int AS backlog,
          COUNT(*) FILTER (WHERE o.status = 'Finalizado' AND DATE(o.data_fechamento AT TIME ZONE 'America/Fortaleza') = ${hojeExpression})::int AS finalizadas_hoje,
          COUNT(*) FILTER (WHERE o.status = 'Aguardando Peças')::int AS aguardando_pecas,
          COUNT(*) FILTER (WHERE o.prioridade IN ('Alta', 'Crítica') AND o.status <> 'Finalizado')::int AS prioridade_elevada_aberta
        FROM ordens_servico o
        ${where}
      `, params),
      db.all(`
        SELECT
          TO_CHAR(DATE(o.data_abertura AT TIME ZONE 'America/Fortaleza'), 'YYYY-MM-DD') AS referencia,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas
        FROM ordens_servico o
        ${where}
        GROUP BY DATE(o.data_abertura AT TIME ZONE 'America/Fortaleza')
        ORDER BY DATE(o.data_abertura AT TIME ZONE 'America/Fortaleza') DESC
        LIMIT 15
      `, params)
    ]);

    res.json({
      success: true,
      data: {
        total: toNumber(resumo?.total),
        abertas_hoje: toNumber(resumo?.abertas_hoje),
        backlog: toNumber(resumo?.backlog),
        finalizadas_hoje: toNumber(resumo?.finalizadas_hoje),
        aguardando_pecas: toNumber(resumo?.aguardando_pecas),
        prioridade_elevada_aberta: toNumber(resumo?.prioridade_elevada_aberta),
        serie_aberturas: (serie || []).reverse()
      }
    });
  } catch (error) {
    console.error('❌ Erro ao gerar dashboard resumo:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar dashboard resumo', error: error.message });
  }
};

exports.getSlaResumo = async (req, res) => {
  try {
    const filters = buildFilters(req.query || {});
    const slaCase = buildSlaCase('o');
    const rows = await db.all(`
      SELECT
        o.prioridade,
        COUNT(*) FILTER (WHERE o.status = 'Finalizado')::int AS finalizadas,
        COUNT(*) FILTER (
          WHERE o.status = 'Finalizado'
            AND o.tempo_resolucao_horas IS NOT NULL
            AND o.tempo_resolucao_horas <= ${slaCase}
        )::int AS dentro_sla,
        ROUND(AVG(o.tempo_resolucao_horas) FILTER (WHERE o.status = 'Finalizado')::numeric, 2) AS tempo_medio
      FROM ordens_servico o
      ${filters.where}
      GROUP BY o.prioridade
      ORDER BY CASE o.prioridade
        WHEN 'Crítica' THEN 1
        WHEN 'Alta' THEN 2
        WHEN 'Média' THEN 3
        WHEN 'Baixa' THEN 4
        ELSE 5
      END
    `, filters.params);

    const data = ['Crítica', 'Alta', 'Média', 'Baixa'].map((prioridade) => {
      const row = (rows || []).find((item) => item.prioridade === prioridade) || {};
      const finalizadas = toNumber(row.finalizadas);
      const dentroSla = toNumber(row.dentro_sla);
      return {
        prioridade,
        meta_horas: SLA_LIMITS[prioridade],
        finalizadas,
        dentro_sla: dentroSla,
        fora_sla: Math.max(finalizadas - dentroSla, 0),
        sla_percentual: finalizadas > 0 ? Math.round((dentroSla / finalizadas) * 100) : 0,
        tempo_medio: toNumber(row.tempo_medio)
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Erro ao gerar resumo SLA:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar resumo SLA', error: error.message });
  }
};
