const { db } = require('../db');

function authMiddleware(req, res, next) {
  const authHeader = req.header('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token necessário'
    });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const [user_id] = decoded.split(':');

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }

    db.get(
      'SELECT id, nome, email, setor, tipo FROM usuarios WHERE id = ?',
      [user_id],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao validar usuário:', err);
          return res.status(500).json({
            success: false,
            message: 'Erro interno'
          });
        }

        if (!row) {
          return res.status(401).json({
            success: false,
            message: 'Usuário inválido'
          });
        }

        req.user_id = row.id;
        req.user = row;
        next();
      }
    );
  } catch (err) {
    console.error('❌ Erro ao processar token:', err);
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    if (!roles.includes(req.user.tipo)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    next();
  };
}

function requireTechnical(req, res, next) {
  return requireRole('tecnico', 'admin')(req, res, next);
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
module.exports.requireTechnical = requireTechnical;