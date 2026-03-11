const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'kronos_secret_dev';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      success: false,
      message: 'Token não enviado'
    });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const query = `
      SELECT id, nome, email, setor, tipo
      FROM usuarios
      WHERE id = ?
    `;

    db.get(query, [decoded.id], (err, row) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Erro ao verificar usuário'
        });
      }

      if (!row) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      req.user = row;
      req.user_id = row.id;

      next();
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
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

  next();
}

module.exports = authMiddleware;
module.exports.requireTechnical = requireTechnical;