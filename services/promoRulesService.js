/**
 * promoRulesService.js
 * Reglas de promoción: envío gratis por monto y descuento % por monto.
 * Fase 3.
 */

const { executeQuery } = require('../controllers/dbPS');

/**
 * Obtiene reglas activas y vigentes (activo=1, NOW entre fecha_inicio y fecha_fin), ordenadas por orden.
 * @returns {Promise<Array<{ id, nombre, tipo, monto_minimo, valor, porcentaje_descuento, ... }>>}
 */
async function getActiveRules() {
  const query = `
    SELECT id, nombre, tipo, activo, orden, monto_minimo, valor, porcentaje_descuento, fecha_inicio, fecha_fin
    FROM promo_rules
    WHERE activo = 1
      AND (fecha_inicio IS NULL OR fecha_inicio <= NOW())
      AND (fecha_fin IS NULL OR fecha_fin >= NOW())
    ORDER BY orden ASC
  `;
  const rows = await executeQuery(query, [], 'PROMO_RULES_ACTIVE');
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    activo: r.activo,
    orden: r.orden,
    monto_minimo: parseFloat(r.monto_minimo) || 0,
    valor: r.valor != null ? parseFloat(r.valor) : null,
    porcentaje_descuento: r.porcentaje_descuento != null ? parseFloat(r.porcentaje_descuento) : null,
    fecha_inicio: r.fecha_inicio,
    fecha_fin: r.fecha_fin,
  }));
}

/**
 * Aplica reglas al subtotal y costo de envío.
 * - Envío gratis: si existe regla envio_gratis_monto y subtotal >= monto_minimo → shipping final = 0.
 * - Descuento %: una sola regla (la de mayor beneficio: mayor porcentaje que aplique); se aplica al subtotal.
 * @param {number} subtotal
 * @param {number} shippingCost
 * @returns {Promise<{ envioGratis: boolean, shippingFinal: number, descuentoPct: number, montoDescuento: number, reglaAplicadaId: number|null }>}
 */
async function applyRules(subtotal, shippingCost) {
  const rules = await getActiveRules();
  const sub = Number(subtotal) || 0;
  let shipFinal = Number(shippingCost) || 0;
  let montoDescuento = 0;
  let reglaAplicadaId = null;
  let descuentoPct = 0;

  const envioGratisRule = rules.find((r) => r.tipo === 'envio_gratis_monto' && sub >= r.monto_minimo);
  if (envioGratisRule) {
    shipFinal = 0;
  }

  const descuentoRules = rules.filter((r) => r.tipo === 'descuento_pct_monto' && sub >= r.monto_minimo);
  if (descuentoRules.length > 0) {
    const mejor = descuentoRules.reduce((a, b) =>
      (a.porcentaje_descuento || 0) >= (b.porcentaje_descuento || 0) ? a : b
    );
    const pct = Number(mejor.porcentaje_descuento) || 0;
    if (pct > 0) {
      descuentoPct = pct;
      montoDescuento = Math.round((sub * pct / 100) * 100) / 100;
      reglaAplicadaId = mejor.id;
    }
  }

  return {
    envioGratis: !!envioGratisRule,
    shippingFinal: Math.round(shipFinal * 100) / 100,
    descuentoPct,
    montoDescuento,
    reglaAplicadaId,
  };
}

/**
 * Devuelve el monto mínimo de subtotal para envío gratis (primera regla activa envio_gratis_monto), o null.
 * Para mostrar en checkout "Agregá $X más para envío gratis".
 */
async function getEnvioGratisDesde() {
  const rules = await getActiveRules();
  const r = rules.find((x) => x.tipo === 'envio_gratis_monto');
  return r ? r.monto_minimo : null;
}

module.exports = {
  getActiveRules,
  applyRules,
  getEnvioGratisDesde,
};
