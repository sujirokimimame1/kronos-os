const express = require('express');
const cors = require('cors');
const path = require('path');

// Tratamento global de erros
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promessa rejeitada:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Configuração CORS para produção e Render
const allowedOrigins = [
  'https://kronos-app-prod.fly.dev',
  'https://kronos-os-1.onrender.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080'
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // mobile apps, curl, health checks

  return (
    allowedOrigins.includes(origin) ||
    origin.includes('fly.dev') ||
    origin.includes('onrender.com') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  );
}

app.use(cors({
  origin: function(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.log('🚫 Origem bloqueada:', origin);
    return callback(new Error('Não permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

// Middleware para headers de segurança
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin) && origin) {
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
  index: false, // Não servir index.html automaticamente
  setHeaders: (res, path) => {
    // Headers de cache para arquivos estáticos
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 dia
    }
  }
}));

// ✅ Health check melhorado para Fly.io
app.get('/health', (req, res) => {
  const { db } = require('./db');
  
  // Verificar saúde do banco de dados
  db.get("SELECT COUNT(*) as user_count FROM usuarios", (err, row) => {
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
  
  // Coletar estatísticas do sistema
  Promise.all([
    new Promise(resolve => {
      db.get("SELECT COUNT(*) as total FROM ordens_servico", (err, row) => {
        resolve({ total_os: err ? 0 : row.total });
      });
    }),
    new Promise(resolve => {
      db.get("SELECT COUNT(*) as total FROM usuarios", (err, row) => {
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
        features: ['Aguardando Peças'] // ✅ NOVA FUNCIONALIDADE
      },
      statistics: status
    });
  });
});

// ✅ Middleware de logging aprimorado
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log da requisição
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type')
  });

  // Interceptar resposta para logging
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    console.log(`📤 [${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });
    
    originalSend.call(this, data);
  };

  next();
});

// ✅ IMPORTAR ROTAS - CORREÇÃO CRÍTICA
try {
  const usuariosRoutes = require('./routes/usuarios');
  const osRoutes = require('./routes/os');
  const relatoriosRoutes = require('./routes/relatorios'); // ✅ ROTA DE RELATÓRIOS

  console.log('✅ Rotas carregadas:', {
    usuarios: !!usuariosRoutes,
    os: !!osRoutes,
    relatorios: !!relatoriosRoutes
  });

  // ✅ REGISTRAR ROTAS DA API
  app.use('/api/usuarios', usuariosRoutes);
  app.use('/api/os', osRoutes);
  app.use('/api/relatorios', relatoriosRoutes); // ✅ REGISTRAR ROTA DE RELATÓRIOS

  console.log('🚀 Rotas da API registradas com sucesso');

} catch (error) {
  console.error('❌ ERRO CRÍTICO ao carregar rotas:', error);
  process.exit(1);
}

// ✅ ROTAS PARA PÁGINAS HTML COM TRATAMENTO DE ERRO
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

// Rotas principais
app.get('/', servePage('index.html'));
app.get('/login', servePage('login.html'));
app.get('/cadastro', servePage('cadastro.html'));
app.get('/solicitante-dashboard', servePage('solicitante-dashboard.html'));
app.get('/tecnico-dashboard', servePage('tecnico-dashboard.html'));
app.get('/tecnico-selecao-setor', servePage('tecnico-selecao-setor.html'));
app.get('/relatorios', servePage('relatorios.html')); // ✅ ROTA DE RELATÓRIOS

// ✅ Redirects para compatibilidade
app.get('/tecnico', (req, res) => {
  res.redirect('/tecnico-selecao-setor');
});

// ✅ Rota para debug do banco (apenas desenvolvimento)
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
      database: dbPath
    };
    
    // Para cada tabela, contar registros e mostrar estrutura
    const tablePromises = tables.map(table => {
      return new Promise((resolve) => {
        const tableInfo = { name: table.name };
        
        // Contar registros
        db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, countRow) => {
          if (err) {
            tableInfo.error = err.message;
          } else {
            tableInfo.count = countRow.count;
          }
          
          // Obter estrutura
          db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
            if (!err) {
              tableInfo.columns = columns;
            }
            
            // Obter alguns registros de exemplo
            db.all(`SELECT * FROM ${table.name} LIMIT 3`, (err, sampleRows) => {
              if (!err) {
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

// ✅ Rota para limpar cache (apenas desenvolvimento)
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

// ✅ Middleware de erro global aprimorado
app.use((err, req, res, next) => {
  console.error('💥 Erro global:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });
  
  // Erro de CORS
  if (err.message === 'Não permitido por CORS') {
    return res.status(403).json({ 
      success: false, 
      message: 'Origem não permitida' 
    });
  }
  
  // Erro de validação
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

// ✅ Fallback para SPA (Single Page Application)
app.get('*', (req, res) => {
  // Se for uma rota de API, já foi tratada acima
  if (req.path.startsWith('/api/')) {
    return;
  }
  
  // Servir index.html para SPA routing
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
🗄️  Banco: ${dbPath}

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