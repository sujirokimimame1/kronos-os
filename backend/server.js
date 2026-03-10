const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbPath } = require('./db');

const DB_PATH_DISPLAY = typeof dbPath !== 'undefined' && dbPath ? dbPath : 'SQLite conectado';

// Tratamento global de erros
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promessa rejeitada:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Configuração CORS para produção
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://kronos-app-prod.fly.dev',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8080'
    ];

    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('fly.dev') || origin.includes('onrender.com')) {
      callback(null, true);
    } else {
      console.log('🚫 Origem bloqueada:', origin);
      callback(new Error('Não permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

// Middleware para headers de segurança
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('fly.dev') || origin.includes('onrender.com') || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');

  console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${origin || 'N/A'}`);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// ✅ Aumentar limite para uploads e dados complexos
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      console.error('❌ JSON malformado:', e.message);
      res.status(400).json({
        success: false,
        message: 'JSON malformado'
      });
    }
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// ✅ Health check melhorado
app.get('/health', (req, res) => {
  const { db } = require('./db');

  db.get('SELECT COUNT(*) as user_count FROM usuarios', (err, row) => {
    const dbStatus = err ? 'ERROR' : 'HEALTHY';
    const dbError = err ? err.message : null;

    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      timezone: process.env.TZ || 'UTC',
      database: {
        status: dbStatus,
        error: dbError,
        users: row ? row.user_count : 0
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  });
});

// ✅ Rota de status do sistema
app.get('/api/status', (req, res) => {
  const { db } = require('./db');

  Promise.all([
    new Promise(resolve => {
      db.get('SELECT COUNT(*) as total FROM ordens_servico', (err, row) => {
        resolve({ total_os: err ? 0 : row.total });
      });
    }),
    new Promise(resolve => {
      db.get('SELECT COUNT(*) as total FROM usuarios', (err, row) => {
        resolve({ total_usuarios: err ? 0 : row.total });
      });
    }),
    new Promise(resolve => {
      db.get(`SELECT COUNT(*) as em_aberto FROM ordens_servico WHERE status = 'Aberto'`, (err, row) => {
        resolve({ os_abertas: err ? 0 : row.em_aberto });
      });
    }),
    new Promise(resolve => {
      db.get(`SELECT COUNT(*) as aguardando_pecas FROM ordens_servico WHERE status = 'Aguardando Peças'`, (err, row) => {
        resolve({ os_aguardando_pecas: err ? 0 : row.aguardando_pecas });
      });
    })
  ]).then(results => {
    const status = Object.assign({}, ...results);

    res.json({
      success: true,
      system: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: ['Aguardando Peças']
      },
      statistics: status
    });
  });
});

// ✅ Middleware de logging aprimorado
app.use((req, res, next) => {
  const start = Date.now();

  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type')
  });

  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;

    console.log(`📤 [${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });

    return originalSend.call(this, data);
  };

  next();
});

// ✅ IMPORTAR ROTAS
try {
  const usuariosRoutes = require('./routes/usuarios');
  const osRoutes = require('./routes/os');
  const relatoriosRoutes = require('./routes/relatorios');

  console.log('✅ Rotas carregadas:', {
    usuarios: !!usuariosRoutes,
    os: !!osRoutes,
    relatorios: !!relatoriosRoutes
  });

  app.use('/api/usuarios', usuariosRoutes);
  app.use('/api/os', osRoutes);
  app.use('/api/relatorios', relatoriosRoutes);

  console.log('🚀 Rotas da API registradas com sucesso');
} catch (error) {
  console.error('❌ ERRO CRÍTICO ao carregar rotas:', error);
  process.exit(1);
}

// ✅ ROTAS PARA PÁGINAS HTML
const servePage = (pageName) => (req, res) => {
  const filePath = path.join(__dirname, '../frontend', pageName);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`❌ Erro ao servir ${pageName}:`, err);

      if (err.code === 'ENOENT') {
        res.status(404).json({
          success: false,
          message: `Página ${pageName} não encontrada`
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erro interno do servidor'
        });
      }
    }
  });
};

app.get('/', servePage('index.html'));
app.get('/login', servePage('login.html'));
app.get('/cadastro', servePage('cadastro.html'));
app.get('/solicitante-dashboard', servePage('solicitante-dashboard.html'));
app.get('/tecnico-dashboard', servePage('tecnico-dashboard.html'));
app.get('/tecnico-selecao-setor', servePage('tecnico-selecao-setor.html'));
app.get('/relatorios', servePage('relatorios.html'));

app.get('/tecnico', (req, res) => {
  res.redirect('/tecnico-selecao-setor');
});

// ✅ Rota para debug do banco
app.get('/api/debug/db', (req, res) => {
  if (process.env.NODE_ENV === 'production' && !req.headers['x-debug-key']) {
    return res.status(403).json({
      success: false,
      message: 'Debug não disponível em produção'
    });
  }

  const { db } = require('./db');

  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    const result = {
      success: true,
      tables: [],
      database: DB_PATH_DISPLAY
    };

    const tablePromises = tables.map(table => {
      return new Promise((resolve) => {
        const tableInfo = { name: table.name };

        db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (countErr, countRow) => {
          if (countErr) {
            tableInfo.error = countErr.message;
          } else {
            tableInfo.count = countRow.count;
          }

          db.all(`PRAGMA table_info(${table.name})`, (columnsErr, columns) => {
            if (!columnsErr) {
              tableInfo.columns = columns;
            }

            db.all(`SELECT * FROM ${table.name} LIMIT 3`, (sampleErr, sampleRows) => {
              if (!sampleErr) {
                tableInfo.sample = sampleRows;
              }

              result.tables.push(tableInfo);
              resolve();
            });
          });
        });
      });
    });

    Promise.all(tablePromises).then(() => {
      res.json(result);
    });
  });
});

// ✅ Rota para limpar cache
if (process.env.NODE_ENV !== 'production') {
  app.delete('/api/debug/cache', (req, res) => {
    Object.keys(require.cache).forEach(key => {
      delete require.cache[key];
    });

    res.json({
      success: true,
      message: 'Cache limpo',
      modulesRecarregados: Object.keys(require.cache).length
    });
  });
}

// ✅ Middleware de erro global
app.use((err, req, res, next) => {
  console.error('💥 Erro global:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });

  if (err.message === 'Não permitido por CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origem não permitida'
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'JSON malformado'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'production' ? {} : {
      message: err.message,
      stack: err.stack
    }
  });
});

// ✅ Rota 404 para API
app.use('/api/*', (req, res) => {
  console.log(`❌ API não encontrada: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: 'Endpoint da API não encontrado',
    path: req.originalUrl,
    method: req.method
  });
});

// ✅ Fallback para SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return;
  }

  res.sendFile(path.join(__dirname, '../frontend/index.html'), (err) => {
    if (err) {
      console.error('❌ Erro ao servir SPA fallback:', err);
      res.status(404).json({
        success: false,
        message: 'Página não encontrada'
      });
    }
  });
});

// ✅ Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM. Encerrando servidor...');
  process.exit(0);
});

// ✅ Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🎉 KRONOS OS SISTEMA INICIADO COM SUCESSO!

🚀 Servidor rodando na porta: ${PORT}
📊 Ambiente: ${process.env.NODE_ENV || 'development'}
🌐 Timezone: ${process.env.TZ || 'UTC'}
🗄️ Banco: ${DB_PATH_DISPLAY}

✨ NOVAS FUNCIONALIDADES:
   • ✅ Status "Aguardando Peças" para técnicos
   • ✅ Controle de OS pausadas por falta de recursos
   • ✅ Fluxo completo: Iniciar → Aguardar Peças → Retomar → Finalizar

📈 RELATÓRIOS DISPONÍVEIS:
   • Dashboard: http://localhost:${PORT}/relatorios
   • API Relatórios: http://localhost:${PORT}/api/relatorios

🔍 DEBUG:
   • Health Check: http://localhost:${PORT}/health
   • Status Sistema: http://localhost:${PORT}/api/status
   • Debug DB: http://localhost:${PORT}/api/debug/db

✅ Sistema pronto para receber requisições!
  `);
});

module.exports = app;