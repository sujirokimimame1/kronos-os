const db = require('../db');

exports.getRelatorios = async (req, res) => {
  try {
    const { periodo, setor, status, prioridade, data_inicio, data_fim } = req.query;

    console.log('📊 Buscando relatórios com filtros:', {
      periodo,
      setor,
      status,
      prioridade,
      data_inicio,
      data_fim
    });

    let query = `
      SELECT 
        id,
        setor_origem,
        setor_destino,
        categoria,
        cliente,
        descricao,
        prioridade,
        status,
        data_abertura,
        data_fechamento,
        relato_tecnico
      FROM ordens_servico
      WHERE 1=1
    `;

    const params = [];
    let index = 1;

    const intervaloCustomizado = construirIntervaloDatas(data_inicio, data_fim);

    if (intervaloCustomizado) {
      if (intervaloCustomizado.inicio) {
        query += ` AND data_abertura >= $${index}`;
        params.push(intervaloCustomizado.inicio);
        index++;
      }

      if (intervaloCustomizado.fim) {
        query += ` AND data_abertura <= $${index}`;
        params.push(intervaloCustomizado.fim);
        index++;
      }
    } else if (periodo && periodo !== 'todos') {
      const dias = parseInt(periodo, 10);
      if (!isNaN(dias) && dias > 0) {
        query += ` AND data_abertura >= NOW() - ($${index} * INTERVAL '1 day')`;
        params.push(dias);
        index++;
      }
    }

    if (setor && setor !== 'todos') {
      query += ` AND setor_destino = $${index}`;
      params.push(setor);
      index++;
    }

    if (status && status !== 'todos') {
      query += ` AND status = $${index}`;
      params.push(status);
      index++;
    }

    if (prioridade && prioridade !== 'todos') {
      query += ` AND prioridade = $${index}`;
      params.push(prioridade);
      index++;
    }

    query += ` ORDER BY data_abertura DESC, id DESC`;

    console.log('🔍 Query:', query);
    console.log('📋 Parâmetros:', params);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro no banco:', err.message);
        return res.status(500).json({
          success: false,
          message: 'Erro no banco de dados',
          error: err.message
        });
      }

      console.log(`✅ ${rows.length} ordens de serviço encontradas`);

      const chamados = rows.map(os => ({
        id: os.id,
        setor_origem: os.setor_origem || 'Não informado',
        setor_destino: os.setor_destino || 'Não informado',
        categoria: os.categoria || 'Geral',
        cliente: os.cliente || 'Não informado',
        descricao: os.descricao || 'Sem descrição',
        prioridade: os.prioridade || 'Média',
        status: os.status || 'Aberto',
        data_abertura: os.data_abertura || new Date().toISOString(),
        data_fechamento: os.data_fechamento || null,
        relato_tecnico: os.relato_tecnico || null
      }));

      const tempos = chamados
        .map(c => calcularTempoResolucao(c))
        .filter(t => t !== null);

      const tempoMedioResolucao = tempos.length > 0
        ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length)
        : 0;

      const slaCumprido = chamados.filter(c => calcularSLA(c)).length;

      const taxaSLACumprido = chamados.length > 0
        ? Math.round((slaCumprido / chamados.length) * 100)
        : 0;

      const tempoMedioSetor = {
        TI: 0,
        'Manutenção': 0
      };

      const contagemSetor = {
        TI: 0,
        'Manutenção': 0
      };

      chamados.forEach(os => {
        if (os.status === 'Finalizado' && os.data_fechamento && os.setor_destino) {
          const tempo = calcularTempoResolucao(os);
          if (tempo !== null && (os.setor_destino === 'TI' || os.setor_destino === 'Manutenção')) {
            tempoMedioSetor[os.setor_destino] += tempo;
            contagemSetor[os.setor_destino]++;
          }
        }
      });

      if (contagemSetor.TI > 0) {
        tempoMedioSetor.TI = Math.round(tempoMedioSetor.TI / contagemSetor.TI);
      }

      if (contagemSetor['Manutenção'] > 0) {
        tempoMedioSetor['Manutenção'] = Math.round(
          tempoMedioSetor['Manutenção'] / contagemSetor['Manutenção']
        );
      }

      const estatisticas = calcularEstatisticas(
        chamados,
        tempoMedioResolucao,
        slaCumprido,
        taxaSLACumprido
      );

      const agrupamentos = calcularAgrupamentos(chamados, tempoMedioSetor);

      const responseData = {
        chamados: chamados.map(os => {
          const tempo = calcularTempoResolucao(os);
          const dentroSLA = calcularSLA(os);

          let sla_status = 'Em aberto';
          if (tempo !== null) {
            sla_status = dentroSLA ? 'Dentro do SLA' : 'Fora do SLA';
          }

          return {
            ...os,
            tempo_resolucao_horas: tempo,
            sla_status
          };
        }),
        estatisticas,
        agrupamentos,
        filtrosAplicados: {
          periodo: periodo || 'todos',
          setor: setor || 'todos',
          status: status || 'todos',
          prioridade: prioridade || 'todos',
          data_inicio: data_inicio || null,
          data_fim: data_fim || null
        }
      };

      res.json({
        success: true,
        dados: responseData
      });
    });
  } catch (error) {
    console.error('❌ Erro geral no relatório:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
};

exports.getRelatorioTecnicos = async (req, res) => {
  try {
    const query = `
      SELECT 
        setor_destino as setor,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Finalizado' THEN 1 ELSE 0 END) as finalizadas
      FROM ordens_servico
      WHERE setor_destino IS NOT NULL
      GROUP BY setor_destino
      ORDER BY total DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('❌ Erro no relatório de técnicos:', err);
        return res.status(500).json({
          success: false,
          message: 'Erro no banco de dados',
          error: err.message
        });
      }

      const relatorioSetores = rows.map(row => ({
        setor: row.setor,
        totalOS: Number(row.total) || 0,
        finalizadas: Number(row.finalizadas) || 0,
        taxaSucesso: Number(row.total) > 0
          ? parseFloat(((Number(row.finalizadas) / Number(row.total)) * 100).toFixed(1))
          : 0,
        tempoMedio: '24h'
      }));

      res.json({
        success: true,
        data: relatorioSetores
      });
    });
  } catch (error) {
    console.error('❌ Erro no relatório de técnicos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
};

exports.getSetores = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT setor_destino as nome
      FROM ordens_servico
      WHERE setor_destino IS NOT NULL AND setor_destino <> ''
      ORDER BY nome
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar setores:', err);
        return res.json({
          success: true,
          data: ['TI', 'Manutenção']
        });
      }

      const setores = rows.map(row => row.nome);

      res.json({
        success: true,
        data: setores
      });
    });
  } catch (error) {
    console.error('❌ Erro ao buscar setores:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
};

function calcularTempoResolucao(os) {
  if (!os.data_fechamento) return null;

  const abertura = new Date(os.data_abertura);
  const fechamento = new Date(os.data_fechamento);
  const diff = fechamento - abertura;

  return Math.round(diff / (1000 * 60 * 60));
}

function calcularSLA(os) {
  const tempo = calcularTempoResolucao(os);
  if (tempo === null) return false;

  const limites = {
    Baixa: 72,
    Média: 48,
    Alta: 24,
    Crítica: 8
  };

  const limite = limites[os.prioridade] || 48;
  return tempo <= limite;
}

function construirIntervaloDatas(dataInicio, dataFim) {
  if (!dataInicio && !dataFim) return null;

  const intervalo = {};

  if (dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
    intervalo.inicio = `${dataInicio} 00:00:00`;
  }

  if (dataFim && /^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
    intervalo.fim = `${dataFim} 23:59:59`;
  }

  return intervalo;
}

function obterTopCategoriaPorSetor(ordens, setorDestino) {
  const contagem = {};

  ordens
    .filter(os => os.setor_destino === setorDestino)
    .forEach(os => {
      const categoria = os.categoria || 'Não informada';
      contagem[categoria] = (contagem[categoria] || 0) + 1;
    });

  const categorias = Object.keys(contagem);
  if (categorias.length === 0) {
    return { categoria: 'Sem dados', quantidade: 0 };
  }

  const categoriaTop = categorias.reduce((a, b) => contagem[a] >= contagem[b] ? a : b);

  return {
    categoria: categoriaTop,
    quantidade: contagem[categoriaTop]
  };
}

function calcularEstatisticas(ordens, tempoMedioResolucao, slaCumprido, taxaSLACumprido) {
  const totalOS = ordens.length;
  const osFinalizadas = ordens.filter(os => os.status === 'Finalizado').length;
  const osAbertas = ordens.filter(os => os.status === 'Aberto').length;
  const osAndamento = ordens.filter(os => os.status === 'Em Andamento').length;
  const osAguardando = ordens.filter(os => os.status === 'Aguardando Peças').length;

  const taxaConclusao = totalOS > 0 ? ((osFinalizadas / totalOS) * 100) : 0;

  const setoresCount = {};
  ordens.forEach(os => {
    const setor = os.setor_origem || 'Não informado';
    setoresCount[setor] = (setoresCount[setor] || 0) + 1;
  });

  const setorTop = Object.keys(setoresCount).length > 0
    ? Object.keys(setoresCount).reduce((a, b) => setoresCount[a] > setoresCount[b] ? a : b)
    : 'Nenhum';

  const topCategoriaTI = obterTopCategoriaPorSetor(ordens, 'TI');
  const topCategoriaManutencao = obterTopCategoriaPorSetor(ordens, 'Manutenção');

  const eficienciaGeral = totalOS > 0 && osFinalizadas > 0
    ? parseFloat(((taxaConclusao + taxaSLACumprido) / 2).toFixed(1))
    : 0;

  return {
    totalOS,
    osFinalizadas,
    osAbertas,
    osAndamento,
    osAguardando,
    taxaConclusao: parseFloat(taxaConclusao.toFixed(1)),
    tempoMedio: tempoMedioResolucao,
    tempoMedioResolucao,
    slaCumprido,
    taxaSLACumprido,
    setorTop,
    osDentroSLA: slaCumprido,
    totalOSFinalizadas: osFinalizadas,
    eficienciaGeral,
    topCategoriaTI,
    topCategoriaManutencao
  };
}

function calcularAgrupamentos(ordens, tempoMedioSetor) {
  const statusCount = {};
  ordens.forEach(os => {
    const status = os.status || 'Aberto';
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  const prioridadeCount = {};
  ordens.forEach(os => {
    const prioridade = os.prioridade || 'Não informada';
    prioridadeCount[prioridade] = (prioridadeCount[prioridade] || 0) + 1;
  });

  const categoriaPorSetor = {
    TI: {},
    Manutenção: {}
  };

  ordens.forEach(os => {
    const setor = os.setor_destino || 'Não informado';
    const categoria = os.categoria || 'Não informada';

    if (!categoriaPorSetor[setor]) categoriaPorSetor[setor] = {};
    categoriaPorSetor[setor][categoria] = (categoriaPorSetor[setor][categoria] || 0) + 1;
  });

  const setorSolicitanteCount = {};
  ordens.forEach(os => {
    const setor = os.setor_origem || 'Não informado';
    setorSolicitanteCount[setor] = (setorSolicitanteCount[setor] || 0) + 1;
  });

  const setorExecutanteCount = {};
  ordens.forEach(os => {
    const setor = os.setor_destino || 'Não informado';
    setorExecutanteCount[setor] = (setorExecutanteCount[setor] || 0) + 1;
  });

  const mensalCount = {};
  ordens.forEach(os => {
    if (os.data_abertura) {
      try {
        const data = new Date(os.data_abertura);
        const mes = data.toLocaleDateString('pt-BR', { month: 'short' });
        mensalCount[mes] = (mensalCount[mes] || 0) + 1;
      } catch (_) {}
    }
  });

  return {
    status: statusCount,
    prioridades: prioridadeCount,
    categoriasPorSetor: categoriaPorSetor,
    setoresSolicitantes: setorSolicitanteCount,
    setoresExecutantes: setorExecutanteCount,
    mensal: mensalCount,
    tempoMedioSetor
  };
}