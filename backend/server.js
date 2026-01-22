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

// ✅ CONFIGURAÇÃO CORS PARA RENDER
const allowedOrigins = [
  'https://kronos-os.onrender.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origin (como mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.includes('onrender.com')) {
      callback(null, true);
    } else {
      console.log('🚫 Origem bloqueada pelo CORS:', origin);
      callback(new Error('Origem não permitida'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

// Headers CORS adicionais
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Middleware para dados JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ✅ Health check para Render
app.get('/health', (req, res) => {
  const { db } = require('./db');
  
  db.get('SELECT 1 as ok', (err) => {
    res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: err ? 'ERROR' : 'HEALTHY',
      cors: 'Configurado para Render',
      allowed_origins: allowedOrigins
    });
  });
});

// ✅ Status do sistema
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    system: {
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      deployed_on: 'Render',
      url: 'https://kronos-os.onrender.com'
    }
  });
});

// ✅ Carregar rotas dinamicamente
const fs = require('fs');
const routesPath = path.join(__dirname, 'routes');

console.log('🔍 Procurando rotas em:', routesPath);

// Carregar todas as rotas que existem
if (fs.existsSync(routesPath)) {
  const routeFiles = fs.readdirSync(routesPath);
  
  routeFiles.forEach(file => {
    if (file.endsWith('.js')) {
      try {
        const routeName = path.basename(file, '.js');
        const routePath = path.join(routesPath, file);
        const route = require(routePath);
        
        // Mapear nomes de arquivo para endpoints
        let endpoint;
        switch(routeName) {
          case 'usuarios':
            endpoint = '/api/usuarios';
            break;
          case 'os':
            endpoint = '/api/os';
            break;
          case 'relatorios':
            endpoint = '/api/relatorios';
            break;
          default:
            endpoint = `/api/${routeName}`;
        }
        
        app.use(endpoint, route);
        console.log(`✅ Rota carregada: ${endpoint} -> ${file}`);
      } catch (error) {
        console.error(`❌ Erro ao carregar rota ${file}:`, error.message);
      }
    }
  });
}

// ✅ Rotas para páginas HTML
const pages = ['/', '/login', '/solicitante-dashboard', '/tecnico-dashboard', '/relatorios'];

pages.forEach(page => {
  app.get(page, (req, res) => {
    let file = 'index.html';
    
    if (page === '/solicitante-dashboard') file = 'solicitante-dashboard.html';
    if (page === '/tecnico-dashboard') file = 'tecnico-dashboard.html';
    if (page === '/relatorios') file = 'relatorios.html';
    
    res.sendFile(path.join(__dirname, '../frontend', file));
  });
});

// ✅ Fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ✅ Middleware de erro
app.use((err, req, res, next) => {
  console.error('💥 Erro:', err.message);
  
  if (err.message === 'Origem não permitida') {
    return res.status(403).json({ 
      success: false, 
      message: 'Erro CORS: Origem não permitida',
      allowed_origins: allowedOrigins,
      your_origin: req.headers.origin
    });
  }
  
  res.status(500).json({ 
    success: false, 
    message: 'Erro interno do servidor'
  });
});

// ✅ Inicializar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🎉 KRONOS OS - CONFIGURADO PARA RENDER

🚀 Servidor rodando na porta: ${PORT}
📊 Ambiente: ${process.env.NODE_ENV || 'development'}
🌐 URL Backend: https://kronos-os.onrender.com
🔧 CORS: Configurado para Render

✅ Sistema pronto para receber requisições!
  `);
});