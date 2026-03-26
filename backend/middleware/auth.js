require('../config/env');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { jwtSecret } = require('../config/env');

function normalizeUserType(user) {
  if (!user) return user;

  if (user.tipo === 'admin') return user;
  if (user.tipo === 'tecnico') return user;

  if (['TI', 'Manutenção'].includes(user.setor)) {
    return { ...user, tipo: 'tecnico' };
  }

  return { ...user, tipo: 'solicitante' };
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ success: false, message: 'Token não enviado' });
    }

    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Formato de token inválido' });
    }

    const token = header.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token não enviado' });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const row = await db.get(`
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE id = $1
    `, [decoded.id]);

    if (!row) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado' });
    }

    req.user = normalizeUserType(row);
    req.user_id = req.user.id;
    return next();
  } catch (err) {
    console.error('❌ Erro no auth middleware:', err);
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
  }
}

function requireTechnical(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
  }

  const user = normalizeUserType(req.user);
  if (user.tipo !== 'tecnico' && user.tipo !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acesso permitido apenas para técnicos e administradores'
    });
  }

  req.user = user;
  return next();
}

module.exports = authMiddleware;
module.exports.requireTechnical = requireTechnical;
module.exports.normalizeUserType = normalizeUserType;
