const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'kronos_secret_dev';

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({
        success: false,
        message: 'Token não enviado'
      });
    }

    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Formato de token inválido'
      });
    }

    const token = header.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token não enviado'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const query = `
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE id = $1
    `;

    const row = await db.get(query, [decoded.id]);

    if (!row) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    req.user = row;
    req.user_id = row.id;

    return next();
  } catch (err) {
    console.error('❌ Erro no auth middleware:', err);

    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  }
}

function requireTechnical(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }

  if (req.user.tipo !== 'tecnico' && req.user.tipo !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acesso permitido apenas para técnicos e administradores'
    });
  }

  return next();
}

module.exports = authMiddleware;
module.exports.requireTechnical = requireTechnical;
