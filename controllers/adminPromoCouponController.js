/**
 * adminPromoCouponController.js
 * CRUD y toggle para promo_rules y coupons (admin). Fase 3.
 */
const { executeQuery } = require('./dbPS');
const couponService = require('../services/couponService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Promo rules ---

const listPromoRules = asyncHandler(async (req, res) => {
  const rows = await executeQuery(
    'SELECT * FROM promo_rules ORDER BY orden ASC, id ASC',
    [],
    'ADMIN_PROMO_LIST'
  );
  res.json(rows);
});

const createPromoRule = asyncHandler(async (req, res) => {
  const { nombre, tipo, monto_minimo, valor, porcentaje_descuento, fecha_inicio, fecha_fin, orden } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'nombre es requerido y no puede estar vacío' });
  }
  const tipoValidos = ['envio_gratis_monto', 'descuento_pct_monto'];
  if (!tipo || !tipoValidos.includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser envio_gratis_monto o descuento_pct_monto' });
  }
  const montoMin = parseFloat(monto_minimo);
  if (isNaN(montoMin) || montoMin < 0) {
    return res.status(400).json({ error: 'monto_minimo debe ser un número >= 0' });
  }
  if (tipo === 'descuento_pct_monto') {
    const pct = parseFloat(porcentaje_descuento);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'porcentaje_descuento debe ser entre 0 y 100 para tipo descuento_pct_monto' });
    }
  }
  const fechaIn = fecha_inicio || null;
  const fechaFi = fecha_fin || null;
  if (fechaIn && fechaFi && new Date(fechaIn) > new Date(fechaFi)) {
    return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
  }
  const ordenNum = parseInt(orden, 10);
  const q = `INSERT INTO promo_rules (nombre, tipo, activo, orden, monto_minimo, valor, porcentaje_descuento, fecha_inicio, fecha_fin)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`;
  await executeQuery(q, [
    String(nombre).trim(),
    tipo,
    isNaN(ordenNum) ? 0 : ordenNum,
    montoMin,
    tipo === 'envio_gratis_monto' ? (valor != null ? parseFloat(valor) : null) : null,
    tipo === 'descuento_pct_monto' ? parseFloat(porcentaje_descuento) : null,
    fechaIn,
    fechaFi,
  ], 'ADMIN_PROMO_INSERT');
  const inserted = await executeQuery('SELECT * FROM promo_rules ORDER BY id DESC LIMIT 1', [], 'ADMIN_PROMO_LAST');
  res.status(201).json(inserted[0] || {});
});

const updatePromoRule = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const { nombre, tipo, activo, orden, monto_minimo, valor, porcentaje_descuento, fecha_inicio, fecha_fin } = req.body;
  const tipoValidos = ['envio_gratis_monto', 'descuento_pct_monto'];
  if (tipo != null && !tipoValidos.includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser envio_gratis_monto o descuento_pct_monto' });
  }
  const existing = await executeQuery('SELECT * FROM promo_rules WHERE id = ?', [id], 'ADMIN_PROMO_GET');
  if (!existing || existing.length === 0) return res.status(404).json({ error: 'Regla no encontrada' });
  const row = existing[0];
  const nombreFinal = nombre != null ? String(nombre).trim() : row.nombre;
  if (!nombreFinal) return res.status(400).json({ error: 'nombre no puede estar vacío' });
  const tipoFinal = tipo != null ? tipo : row.tipo;
  const montoMin = monto_minimo != null ? parseFloat(monto_minimo) : parseFloat(row.monto_minimo);
  if (isNaN(montoMin) || montoMin < 0) return res.status(400).json({ error: 'monto_minimo debe ser >= 0' });
  const valorFinal = valor !== undefined ? (valor == null ? null : parseFloat(valor)) : row.valor;
  const pctFinal = porcentaje_descuento !== undefined ? (porcentaje_descuento == null ? null : parseFloat(porcentaje_descuento)) : row.porcentaje_descuento;
  if (tipoFinal === 'descuento_pct_monto' && pctFinal != null && (pctFinal < 0 || pctFinal > 100)) {
    return res.status(400).json({ error: 'porcentaje_descuento debe ser entre 0 y 100' });
  }
  const fechaIn = fecha_inicio !== undefined ? (fecha_inicio || null) : row.fecha_inicio;
  const fechaFi = fecha_fin !== undefined ? (fecha_fin || null) : row.fecha_fin;
  if (fechaIn && fechaFi && new Date(fechaIn) > new Date(fechaFi)) {
    return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
  }
  const ordenNum = orden !== undefined ? (parseInt(orden, 10) || 0) : row.orden;
  const activoVal = activo !== undefined ? (activo ? 1 : 0) : row.activo;
  const q = `UPDATE promo_rules SET nombre=?, tipo=?, activo=?, orden=?, monto_minimo=?, valor=?, porcentaje_descuento=?, fecha_inicio=?, fecha_fin=?, updated_at=NOW() WHERE id=?`;
  await executeQuery(q, [nombreFinal, tipoFinal, activoVal, ordenNum, montoMin, valorFinal, pctFinal, fechaIn, fechaFi, id], 'ADMIN_PROMO_UPDATE');
  const updated = await executeQuery('SELECT * FROM promo_rules WHERE id = ?', [id], 'ADMIN_PROMO_GET');
  res.json(updated[0] || {});
});

const deletePromoRule = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const r = await executeQuery('DELETE FROM promo_rules WHERE id = ?', [id], 'ADMIN_PROMO_DELETE');
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Regla no encontrada' });
  res.status(204).send();
});

const togglePromoRule = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const rows = await executeQuery('SELECT id, activo FROM promo_rules WHERE id = ?', [id], 'ADMIN_PROMO_GET');
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Regla no encontrada' });
  const newActivo = rows[0].activo ? 0 : 1;
  await executeQuery('UPDATE promo_rules SET activo = ?, updated_at = NOW() WHERE id = ?', [newActivo, id], 'ADMIN_PROMO_TOGGLE');
  const updated = await executeQuery('SELECT * FROM promo_rules WHERE id = ?', [id], 'ADMIN_PROMO_GET');
  res.json(updated[0] || {});
});

// --- Coupons ---

const listCoupons = asyncHandler(async (req, res) => {
  const rows = await executeQuery('SELECT * FROM coupons ORDER BY id DESC', [], 'ADMIN_COUPONS_LIST');
  res.json(rows);
});

const createCoupon = asyncHandler(async (req, res) => {
  const { codigo, tipo, valor, monto_minimo, usos_maximos, fecha_inicio, fecha_fin } = req.body;
  const cod = couponService.normalizeCodigo(codigo);
  if (!cod) return res.status(400).json({ error: 'codigo es requerido y no puede estar vacío' });
  const tipoValidos = ['porcentaje', 'monto_fijo'];
  if (!tipo || !tipoValidos.includes(tipo)) return res.status(400).json({ error: 'tipo debe ser porcentaje o monto_fijo' });
  const val = parseFloat(valor);
  if (isNaN(val) || val < 0) return res.status(400).json({ error: 'valor debe ser un número >= 0' });
  if (tipo === 'porcentaje' && val > 100) return res.status(400).json({ error: 'valor no puede ser > 100 para tipo porcentaje' });
  const montoMin = parseFloat(monto_minimo);
  if (isNaN(montoMin) || montoMin < 0) return res.status(400).json({ error: 'monto_minimo debe ser >= 0' });
  const usosMax = parseInt(usos_maximos, 10);
  if (isNaN(usosMax) || usosMax < 1) return res.status(400).json({ error: 'usos_maximos debe ser >= 1' });
  const fechaIn = fecha_inicio || null;
  const fechaFi = fecha_fin || null;
  if (fechaIn && fechaFi && new Date(fechaIn) > new Date(fechaFi)) {
    return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
  }
  const existing = await executeQuery('SELECT id FROM coupons WHERE UPPER(TRIM(REPLACE(codigo, " ", ""))) = ?', [cod], 'ADMIN_COUPON_CHECK');
  if (existing && existing.length > 0) return res.status(400).json({ error: 'Ya existe un cupón con ese código' });
  const q = `INSERT INTO coupons (codigo, tipo, valor, monto_minimo, usos_maximos, usos_actuales, fecha_inicio, fecha_fin, activo)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`;
  await executeQuery(q, [cod, tipo, val, montoMin, usosMax, fechaIn, fechaFi], 'ADMIN_COUPON_INSERT');
  const inserted = await executeQuery('SELECT * FROM coupons ORDER BY id DESC LIMIT 1', [], 'ADMIN_COUPON_LAST');
  res.status(201).json(inserted[0] || {});
});

const updateCoupon = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const { codigo, tipo, valor, monto_minimo, usos_maximos, fecha_inicio, fecha_fin, activo } = req.body;
  const existing = await executeQuery('SELECT * FROM coupons WHERE id = ?', [id], 'ADMIN_COUPON_GET');
  if (!existing || existing.length === 0) return res.status(404).json({ error: 'Cupón no encontrado' });
  const row = existing[0];
  const codFinal = codigo != null ? couponService.normalizeCodigo(codigo) : row.codigo;
  if (!codFinal) return res.status(400).json({ error: 'codigo no puede estar vacío' });
  if (codFinal !== row.codigo) {
    const dup = await executeQuery('SELECT id FROM coupons WHERE UPPER(TRIM(REPLACE(codigo, " ", ""))) = ? AND id != ?', [codFinal, id], 'ADMIN_COUPON_CHECK');
    if (dup && dup.length > 0) return res.status(400).json({ error: 'Ya existe otro cupón con ese código' });
  }
  const tipoValidos = ['porcentaje', 'monto_fijo'];
  const tipoFinal = tipo != null ? tipo : row.tipo;
  if (tipoValidos.indexOf(tipoFinal) === -1) return res.status(400).json({ error: 'tipo debe ser porcentaje o monto_fijo' });
  const valFinal = valor !== undefined ? parseFloat(valor) : parseFloat(row.valor);
  if (isNaN(valFinal) || valFinal < 0) return res.status(400).json({ error: 'valor debe ser >= 0' });
  if (tipoFinal === 'porcentaje' && valFinal > 100) return res.status(400).json({ error: 'valor no puede ser > 100 para tipo porcentaje' });
  const montoMin = monto_minimo !== undefined ? parseFloat(monto_minimo) : parseFloat(row.monto_minimo);
  if (isNaN(montoMin) || montoMin < 0) return res.status(400).json({ error: 'monto_minimo debe ser >= 0' });
  const usosMax = usos_maximos !== undefined ? parseInt(usos_maximos, 10) : row.usos_maximos;
  if (isNaN(usosMax) || usosMax < 1) return res.status(400).json({ error: 'usos_maximos debe ser >= 1' });
  const usosActuales = parseInt(row.usos_actuales, 10) || 0;
  if (usosMax < usosActuales) return res.status(400).json({ error: 'usos_maximos no puede ser menor que usos_actuales' });
  const fechaIn = fecha_inicio !== undefined ? (fecha_inicio || null) : row.fecha_inicio;
  const fechaFi = fecha_fin !== undefined ? (fecha_fin || null) : row.fecha_fin;
  if (fechaIn && fechaFi && new Date(fechaIn) > new Date(fechaFi)) {
    return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
  }
  const activoVal = activo !== undefined ? (activo ? 1 : 0) : row.activo;
  const q = `UPDATE coupons SET codigo=?, tipo=?, valor=?, monto_minimo=?, usos_maximos=?, fecha_inicio=?, fecha_fin=?, activo=?, updated_at=NOW() WHERE id=?`;
  await executeQuery(q, [codFinal, tipoFinal, valFinal, montoMin, usosMax, fechaIn, fechaFi, activoVal, id], 'ADMIN_COUPON_UPDATE');
  const updated = await executeQuery('SELECT * FROM coupons WHERE id = ?', [id], 'ADMIN_COUPON_GET');
  res.json(updated[0] || {});
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const hasRedemptions = await executeQuery('SELECT 1 FROM coupon_redemptions WHERE cupon_id = ? LIMIT 1', [id], 'ADMIN_COUPON_RED');
  if (hasRedemptions && hasRedemptions.length > 0) {
    return res.status(400).json({ error: 'No se puede eliminar un cupón que ya tiene canjes. Desactivarlo en su lugar.' });
  }
  const r = await executeQuery('DELETE FROM coupons WHERE id = ?', [id], 'ADMIN_COUPON_DELETE');
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Cupón no encontrado' });
  res.status(204).send();
});

const toggleCoupon = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const rows = await executeQuery('SELECT id, activo FROM coupons WHERE id = ?', [id], 'ADMIN_COUPON_GET');
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Cupón no encontrado' });
  const newActivo = rows[0].activo ? 0 : 1;
  await executeQuery('UPDATE coupons SET activo = ?, updated_at = NOW() WHERE id = ?', [newActivo, id], 'ADMIN_COUPON_TOGGLE');
  const updated = await executeQuery('SELECT * FROM coupons WHERE id = ?', [id], 'ADMIN_COUPON_GET');
  res.json(updated[0] || {});
});

const getCouponRedemptions = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const rows = await executeQuery(
    'SELECT r.id, r.id_pedido, r.monto_aplicado, r.created_at FROM coupon_redemptions r WHERE r.cupon_id = ? ORDER BY r.created_at DESC',
    [id],
    'ADMIN_COUPON_REDEMPTIONS'
  );
  res.json(rows);
});

module.exports = {
  listPromoRules,
  createPromoRule,
  updatePromoRule,
  deletePromoRule,
  togglePromoRule,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  getCouponRedemptions,
};
