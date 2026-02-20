/**
 * couponService.js
 * Validación y uso (redeem) de cupones. Fase 3.
 */

const { executeQuery, pool } = require('../controllers/dbPS');

function normalizeCodigo(codigo) {
  return String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Valida un cupón para un subtotal (después de reglas).
 * @param {string} codigo
 * @param {number} subtotalAfterRules
 * @returns {Promise<{ valid: boolean, couponId?: number, montoDescuento?: number, tipo?: string, valor?: number, message?: string }>}
 */
async function validateCoupon(codigo, subtotalAfterRules) {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) {
    return { valid: false, message: 'Código de cupón inválido' };
  }

  const query = `
    SELECT id, codigo, tipo, valor, monto_minimo, usos_maximos, usos_actuales, fecha_inicio, fecha_fin, activo
    FROM coupons
    WHERE UPPER(TRIM(REPLACE(codigo, ' ', ''))) = ?
      AND activo = 1
    LIMIT 1
  `;
  const rows = await executeQuery(query, [normalized], 'COUPON_VALIDATE');
  if (!rows || rows.length === 0) {
    return { valid: false, message: 'Cupón no encontrado o no válido' };
  }

  const c = rows[0];
  const now = new Date();
  if (c.fecha_inicio && new Date(c.fecha_inicio) > now) {
    return { valid: false, message: 'El cupón aún no está vigente' };
  }
  if (c.fecha_fin && new Date(c.fecha_fin) < now) {
    return { valid: false, message: 'El cupón ha expirado' };
  }

  const usosActuales = parseInt(c.usos_actuales, 10) || 0;
  const usosMaximos = parseInt(c.usos_maximos, 10) || 1;
  if (usosActuales >= usosMaximos) {
    return { valid: false, message: 'Este cupón ya no tiene usos disponibles' };
  }

  const montoMinimo = parseFloat(c.monto_minimo) || 0;
  const subtotal = Number(subtotalAfterRules) || 0;
  if (subtotal < montoMinimo) {
    return { valid: false, message: `El subtotal mínimo para este cupón es $${montoMinimo.toFixed(2)}` };
  }

  const valor = parseFloat(c.valor) || 0;
  let montoDescuento = 0;
  if (c.tipo === 'porcentaje') {
    montoDescuento = Math.round((subtotal * Math.min(100, valor) / 100) * 100) / 100;
  } else {
    montoDescuento = Math.min(valor, subtotal);
    montoDescuento = Math.round(montoDescuento * 100) / 100;
  }

  return {
    valid: true,
    couponId: c.id,
    montoDescuento,
    tipo: c.tipo,
    valor,
    message: 'Cupón válido',
  };
}

/**
 * Registra el uso del cupón (redemption) e incrementa usos_actuales. Debe llamarse dentro de transacción
 * o en una transacción propia (pedido ya creado).
 * @param {number} cuponId
 * @param {number} pedidoId
 * @param {number} montoAplicado
 * @param {import('mysql2/promise').PoolConnection} [connection] - Si se pasa, usa esta conexión (misma transacción).
 */
async function redeemCoupon(cuponId, pedidoId, montoAplicado, connection = null) {
  const insertRedemption = `
    INSERT INTO coupon_redemptions (cupon_id, id_pedido, monto_aplicado) VALUES (?, ?, ?)
  `;
  const updateUsos = `
    UPDATE coupons SET usos_actuales = usos_actuales + 1, updated_at = NOW() WHERE id = ?
  `;
  const monto = Number(montoAplicado) || 0;

  if (connection) {
    await connection.execute(insertRedemption, [cuponId, pedidoId, monto]);
    const [ur] = await connection.execute(updateUsos, [cuponId]);
    if (ur.affectedRows === 0) throw new Error('Cupón no encontrado al actualizar usos');
    return;
  }

  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.execute(insertRedemption, [cuponId, pedidoId, monto]);
    const [ur] = await c.execute(updateUsos, [cuponId]);
    if (ur.affectedRows === 0) {
      await c.rollback();
      throw new Error('Cupón no encontrado al actualizar usos');
    }
    await c.commit();
  } finally {
    c.release();
  }
}

module.exports = {
  normalizeCodigo,
  validateCoupon,
  redeemCoupon,
};
