/**
 * pricingService.js
 * Fuente única de verdad para cálculo de subtotal, envío y total del pedido.
 * Fase 1: sin reglas de envío gratis ni cupones; preparado para Fase 3+.
 */

const { executeQuery } = require('../controllers/dbPS');
const axios = require('axios');
require('dotenv').config();

// --- Helpers de precio (alineados con storeController / articulo) ---

const PRECIO_BASE_SQL = `
  CASE
    WHEN a.COD_IVA = 0 THEN ROUND(a.PRECIO_SIN_IVA_4 * 1.21, 2) + ROUND(COALESCE(a.COSTO, 0) * COALESCE(a.porc_impint, 0) / 100, 2)
    WHEN a.COD_IVA = 1 THEN ROUND(a.PRECIO_SIN_IVA_4 * 1.105, 2) + ROUND(COALESCE(a.COSTO, 0) * COALESCE(a.porc_impint, 0) / 100, 2)
    WHEN a.COD_IVA = 2 THEN ROUND(a.PRECIO_SIN_IVA_4, 2) + ROUND(COALESCE(a.COSTO, 0) * COALESCE(a.porc_impint, 0) / 100, 2)
    ELSE ROUND(a.PRECIO_SIN_IVA_4 * 1.21, 2) + ROUND(COALESCE(a.COSTO, 0) * COALESCE(a.porc_impint, 0) / 100, 2)
  END
`;

/**
 * Calcula el subtotal del carrito usando precios de BD (articulo + ofertas/destacados/liquidación en articulo_temp).
 * @param {Array<{ codigo_barra: string, cod_interno?: number, cantidad: number, nombre_producto?: string }>} productos
 * @returns {Promise<{ subtotal: number, items: Array<{ codigo_barra, cod_interno, nombre_producto, cantidad, precio, subtotal_item }> }>}
 */
async function calculateSubtotal(productos) {
  if (!productos || productos.length === 0) {
    return { subtotal: 0, items: [] };
  }

  const codigos = [...new Set(productos.map((p) => (p.codigo_barra || '').trim()).filter(Boolean))];
  if (codigos.length === 0) {
    throw new Error('No hay códigos de producto válidos para calcular precio');
  }

  const placeholders = codigos.map(() => '?').join(',');
  const query = `
    SELECT
      a.CODIGO_BARRA,
      a.COD_INTERNO,
      a.art_desc_vta,
      COALESCE(at.PRECIO_DESC, (${PRECIO_BASE_SQL})) AS precio
    FROM articulo a
    LEFT JOIN (
      SELECT CODIGO_BARRA, MIN(PRECIO_DESC) AS PRECIO_DESC
      FROM articulo_temp
      WHERE activo = 1
      GROUP BY CODIGO_BARRA
    ) at ON a.CODIGO_BARRA = at.CODIGO_BARRA
    WHERE a.CODIGO_BARRA IN (${placeholders})
      AND a.HABILITADO = 'S'
  `;

  const rows = await executeQuery(query, codigos, 'PRICING_SUBTOTAL');
  const preciosPorCodigo = {};
  for (const r of rows) {
    const cod = (r.CODIGO_BARRA || '').toString().trim();
    preciosPorCodigo[cod] = {
      codigo_barra: cod,
      cod_interno: r.COD_INTERNO || 0,
      nombre_producto: r.art_desc_vta || '',
      precio: parseFloat(r.precio) || 0,
    };
  }

  const items = [];
  let subtotal = 0;

  for (const p of productos) {
    const cod = (p.codigo_barra || '').toString().trim();
    const cantidad = Math.max(1, parseInt(p.cantidad, 10) || 1);
    const info = preciosPorCodigo[cod];

    if (!info) {
      throw new Error(`Producto no encontrado o no habilitado: ${cod}`);
    }

    const precio = info.precio;
    const subtotal_item = Math.round(precio * cantidad * 100) / 100;
    subtotal += subtotal_item;

    items.push({
      codigo_barra: cod,
      cod_interno: info.cod_interno,
      nombre_producto: p.nombre_producto || info.nombre_producto,
      cantidad,
      precio,
      subtotal_item,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  return { subtotal, items };
}

// --- Envío: reutilizar lógica OpenCage + Haversine + costo por km ---

let storeCoordinates = null;

async function getStoreCoordinates() {
  if (storeCoordinates) return storeCoordinates;
  const address = process.env.STORE_ADDRESS;
  if (!address || !process.env.OPENCAGE_API_KEY) {
    throw new Error('STORE_ADDRESS y OPENCAGE_API_KEY son requeridos para calcular envío');
  }
  const encoded = encodeURIComponent(address);
  const response = await axios.get(
    `https://api.opencagedata.com/geocode/v1/json?q=${encoded}&key=${process.env.OPENCAGE_API_KEY}&limit=1`,
    { timeout: 10000 }
  );
  if (!response.data.results || response.data.results.length === 0) {
    throw new Error('Dirección de la tienda no válida');
  }
  const { lat, lng } = response.data.results[0].geometry;
  storeCoordinates = { lat, lng };
  return storeCoordinates;
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function calculateShippingCostFromDistance(distance) {
  const baseCost = parseFloat(process.env.STORE_DELIVERY_BASE) || 500;
  const costPerKm = parseFloat(process.env.STORE_DELIVERY_KM) || 100;
  const calculated = baseCost + distance * costPerKm;
  return Math.max(baseCost, Math.round(calculated * 100) / 100);
}

/**
 * Calcula el costo de envío. Si deliveryOption === 'local' retorna 0.
 * Si es delivery, geocodifica la dirección y aplica la fórmula actual (sin reglas de envío gratis en Fase 1).
 * @param { { deliveryOption: string, address?: string } } opts
 * @returns {Promise<number>}
 */
async function calculateShipping(opts) {
  const { deliveryOption, address } = opts || {};
  const isLocal =
    !address ||
    String(deliveryOption).toLowerCase() === 'local' ||
    String(address).toLowerCase().includes('retiro') ||
    String(address).trim() === '';

  if (isLocal) return 0;

  const trimmed = String(address).trim();
  if (trimmed.length < 5) return 0;

  const coords = await getStoreCoordinates();
  const encoded = encodeURIComponent(trimmed);
  const response = await axios.get(
    `https://api.opencagedata.com/geocode/v1/json?q=${encoded}&key=${process.env.OPENCAGE_API_KEY}&limit=1`,
    { timeout: 10000 }
  );

  if (!response.data.results || response.data.results.length === 0) {
    throw new Error('Dirección no válida o no encontrada');
  }

  const { lat, lng } = response.data.results[0].geometry;
  const distance = getDistanceFromLatLonInKm(coords.lat, coords.lng, lat, lng);
  const maxKm = parseFloat(process.env.STORE_DELIVERY_MAX_KM) || 0;
  if (maxKm > 0 && distance > maxKm) {
    throw new Error(`La dirección está fuera de la zona de entrega (máximo ${maxKm} km). Seleccioná otra.`);
  }
  return calculateShippingCostFromDistance(distance);
}

/**
 * Calcula el total final: subtotal - descuentos + envío (redondeado a 2 decimales).
 * Fase 1: discountFromRule y discountFromCoupon en 0.
 */
function calculateOrderTotal({ subtotal, shipping, discountFromRule = 0, discountFromCoupon = 0 }) {
  const sub = Number(subtotal) || 0;
  const ship = Number(shipping) || 0;
  const dRule = Number(discountFromRule) || 0;
  const dCoup = Number(discountFromCoupon) || 0;
  const total = Math.round((sub - dRule - dCoup + ship) * 100) / 100;
  return Math.max(0, total);
}

// --- Fase 3: Quote con reglas y cupones ---
const promoRulesService = require('./promoRulesService');
const couponService = require('./couponService');

/**
 * Obtiene el presupuesto (quote) completo: subtotal, envío, descuentos por regla y cupón, total.
 * No persiste nada. Incluye pricing_snapshot para auditoría.
 * @param {{
 *   productos: Array<{ codigo_barra, cod_interno?, cantidad, nombre_producto? }>,
 *   deliveryOption: string,
 *   address?: string,
 *   cuponCodigo?: string
 * }} opts
 * @returns {Promise<{
 *   subtotal, shipping, discountRule, discountCoupon, total, reglaAplicadaId, couponId,
 *   items, pricing_snapshot, envioGratis?
 * }>}
 */
async function getQuote(opts) {
  const { productos, deliveryOption, address, cuponCodigo } = opts || {};

  const { subtotal, items } = await calculateSubtotal(productos || []);
  let shippingCost = 0;
  try {
    shippingCost = await calculateShipping({ deliveryOption, address });
  } catch (e) {
    throw new Error(e.message || 'Error calculando envío');
  }

  const rulesResult = await promoRulesService.applyRules(subtotal, shippingCost);
  const shippingFinal = rulesResult.shippingFinal;
  const discountRule = rulesResult.montoDescuento;
  const reglaAplicadaId = rulesResult.reglaAplicadaId;
  const subtotalAfterRules = Math.round((subtotal - discountRule) * 100) / 100;

  let discountCoupon = 0;
  let couponId = null;
  if (cuponCodigo && String(cuponCodigo).trim()) {
    const couponResult = await couponService.validateCoupon(cuponCodigo, subtotalAfterRules);
    if (!couponResult.valid) {
      throw new Error(couponResult.message || 'Cupón inválido');
    }
    discountCoupon = couponResult.montoDescuento;
    couponId = couponResult.couponId;
  }

  const total = calculateOrderTotal({
    subtotal,
    shipping: shippingFinal,
    discountFromRule: discountRule,
    discountFromCoupon: discountCoupon,
  });

  const pricing_snapshot = {
    subtotal,
    shippingBruto: shippingCost,
    shippingFinal,
    discountRule,
    discountCoupon,
    reglaAplicadaId,
    couponId,
    total,
    at: new Date().toISOString(),
  };

  return {
    subtotal,
    shipping: shippingFinal,
    discountRule,
    discountCoupon,
    total,
    reglaAplicadaId,
    couponId,
    items,
    pricing_snapshot,
    envioGratis: rulesResult.envioGratis,
  };
}

module.exports = {
  calculateSubtotal,
  calculateShipping,
  calculateOrderTotal,
  calculateShippingCostFromDistance,
  getStoreCoordinates,
  getQuote,
};
