require('./config/env');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { getEnv, getBooleanEnv, nodeEnv, isProduction } = require('./config/env');
const { hashPassword } = require('./utils/password');

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promessa rejeitada:', reason);
});

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const allowedOrigins = [
  'https://kronos-app-prod.fly.dev',
  'https://kronos-os-1.onrender.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080'
];

function isAllowedOrigin(origin) {
  if (!origin) return true;

  return (
    allowedOrigins.includes(origin) ||
    origin.includes('fly.dev') ||
    origin.includes('onrender.com') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  );
}

async function garantirTabelaUsuarios() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      setor VARCHAR(150),
      tipo VARCHAR(50) NOT NULL DEFAULT 'solicitante',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function criarAdminDesenvolvimento() {
  if (isProduction || !getBooleanEnv('ALLOW_DEFAULT_ADMIN', false)) {
    return;
  }

  const nome = getEnv('DEFAULT_ADMIN_NAME', 'Administrador Local');
  const email = getEnv('DEFAULT_ADMIN_EMAIL', 'admin.local@kronos.test').toLowerCase();
  const senha = getEnv('DEFAULT_ADMIN_PASSWORD', '123456');

  const adminExistente = await db.get('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (adminExistente) {
    console.log(`ℹ️ Admin local já existe: ${email}`);
    return;
  }

  const senhaHash = await hashPassword(senha);
  await db.query(`
    INSERT INTO usuarios (nome, email, senha, setor, tipo)
    VALUES ($1, $2, $3, $4, $5)
  `, [nome, email, senhaHash, 'TI', 'admin']);

  console.log(`✅ Admin local criado para testes: ${email}`);
}

app.use(cors({
  origin(origin, callback) {
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
  res.header('Referrer-Policy', 'no-referrer');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.header('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(FRONTEND_DIR, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.get('/health', async (req, res) => {
  try {
    const row = await db.get('SELECT COUNT(*)::int AS user_count FROM usuarios');
    return res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: nodeEnv,
      timezone: process.env.TZ || 'UTC',
      database: {
        status: 'HEALTHY',
        users: Number(row?.user_count || 0)
      },
      uptime: process.uptime()
    });
  } catch (err) {
    console.error('❌ Erro no health check:', err);
    return res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: nodeEnv,
      timezone: process.env.TZ || 'UTC',
      database: {
        status: 'ERROR',
        error: err.message
      },
      uptime: process.uptime()
    });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const [totalOS, totalUsuarios, osAbertas, osAguardandoPecas] = await Promise.all([
      db.get('SELECT COUNT(*)::int AS total FROM ordens_servico'),
      db.get('SELECT COUNT(*)::int AS total FROM usuarios'),
      db.get(`SELECT COUNT(*)::int AS em_aberto FROM ordens_servico WHERE status = 'Aberto'`),
      db.get(`SELECT COUNT(*)::int AS aguardando_pecas FROM ordens_servico WHERE status = 'Aguardando Peças'`)
    ]);

    return res.json({
      success: true,
      system: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.1.0',
        features: ['Aguardando Peças', 'Histórico de OS', 'Login seguro']
      },
      statistics: {
        total_os: Number(totalOS?.total || 0),
        total_usuarios: Number(totalUsuarios?.total || 0),
        os_abertas: Number(osAbertas?.em_aberto || 0),
        os_aguardando_pecas: Number(osAguardandoPecas?.aguardando_pecas || 0)
      }
    });
  } catch (error) {
    console.error('❌ Erro ao carregar /api/status:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro ao carregar status do sistema'
    });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const duration = Date.now() - start;
    console.log(`📤 [${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    return originalJson(payload);
  };

  next();
});

const usuariosRoutes = require('./routes/usuarios');
const osRoutes = require('./routes/os');
const relatoriosRoutes = require('./routes/relatorios');
const preventivasRoutes = require('./routes/preventivas');

app.use('/api/usuarios', usuariosRoutes);
app.use('/api/os', osRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/preventivas', preventivasRoutes);

const servePage = (pageName) => (req, res) => {
  const filePath = path.join(FRONTEND_DIR, pageName);
  res.sendFile(filePath, (err) => {
    if (!err) return;

    console.error(`❌ Erro ao servir ${pageName}:`, err);
    if (err.code === 'ENOENT') {
      return res.status(404).json({ success: false, message: `Página ${pageName} não encontrada` });
    }

    return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  });
};

app.get('/', (req, res) => res.redirect('/solicitante'));
app.get('/solicitante', servePage('acesso-solicitante.html'));
app.get('/tecnico', servePage('acesso-tecnico.html'));
app.get('/admin', servePage('acesso-admin.html'));
app.get('/solicitante-dashboard', servePage('solicitante-dashboard.html'));
app.get('/tecnico-dashboard', servePage('tecnico-dashboard.html'));
app.get('/admin-dashboard', servePage('admin-dashboard.html'));
app.get('/tecnico-selecao-setor', servePage('tecnico-selecao-setor.html'));
app.get('/relatorios', servePage('relatorios.html'));
app.get('/painel', servePage('painel.html'));
app.get('/painel-tv', servePage('painel-tv.html'));
app.get('/manutencoes-preventivas', servePage('manutencoes-preventivas.html'));

app.get('/acesso-solicitante', (req, res) => res.redirect('/solicitante'));
app.get('/acesso-tecnico', (req, res) => res.redirect('/tecnico'));
app.get('/acesso-admin', (req, res) => res.redirect('/admin'));

app.get('/api/debug/db', async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ success: false, message: 'Debug não disponível em produção' });
  }

  try {
    const tables = await db.all(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const result = [];
    for (const table of tables) {
      const tableName = table.table_name;
      const columns = await db.all(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const countRow = await db.get(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
      const sampleRows = await db.all(`SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 3`);

      result.push({
        name: tableName,
        count: Number(countRow?.total || 0),
        columns,
        sample: sampleRows
      });
    }

    return res.json({ success: true, database: 'PostgreSQL', tables: result });
  } catch (error) {
    console.error('❌ Erro no debug do banco:', error);
    return res.status(500).json({ success: false, message: 'Erro ao inspecionar banco', error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('💥 Erro global:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  if (err.message === 'Não permitido por CORS') {
    return res.status(403).json({ success: false, message: 'Origem não permitida' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'JSON malformado' });
  }

  return res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: isProduction ? undefined : { message: err.message, stack: err.stack }
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint da API não encontrado',
    path: req.originalUrl,
    method: req.method
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).end();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM. Encerrando servidor...');
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', async () => {
  try {
    await garantirTabelaUsuarios();
    await criarAdminDesenvolvimento();
  } catch (error) {
    console.error('❌ Falha ao preparar ambiente inicial:', error);
  }

  console.log(`\n🎉 KRONOS OS INICIADO\n🚀 Porta: ${PORT}\n📊 Ambiente: ${nodeEnv}\n🗄️ Banco: PostgreSQL\n🔐 Login seguro ativo\n📝 Histórico de OS ativo\n🌐 URL local: http://localhost:${PORT}\n`);
});

module.exports = app;
