const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

/* ============================
   CORS - CONFIGURAÇÃO RENDER
============================ */
const allowedOrigins = [
  'https://kronos-os.onrender.com',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // permite chamadas sem origin (Postman, mobile, etc)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.includes('onrender.com')
    ) {
      callback(null, true);
    } else {
      console.log('🚫 Origem bloqueada pelo CORS:', origin);
      callback(new Error('Origem não permitida'));
    }
  },
  credentials: true
}));

/* ============================
   MIDDLEWARES
============================ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ============================
   ROTAS
============================ */
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const osRoutes = require('./routes/os');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/os', osRoutes);

/* ============================
   FRONTEND (SE EXISTIR)
============================ */
// Caso esteja servindo frontend pelo backend
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

/* ============================
   START SERVER
============================ */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Kronos OS rodando na porta ${PORT}`);
});

