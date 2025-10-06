// controllers/storeController.js - VERSIÓN OPTIMIZADA
const { executeQuery, logConnection } = require('./dbPS');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require("multer");
require('dotenv').config();

// ==============================================
// SISTEMA DE LOGS PARA CONTROLADOR
// ==============================================
const logController = (message, level = 'info', operation = 'CONTROLLER') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${operation}-${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
        console.error('\x1b[31m%s\x1b[0m', logMessage);
    } else if (level === 'warn') {
        console.warn('\x1b[33m%s\x1b[0m', logMessage);
    } else if (level === 'success') {
        console.log('\x1b[32m%s\x1b[0m', logMessage);
    } else {
        console.log('\x1b[36m%s\x1b[0m', logMessage);
    }
};

// ==============================================
// FUNCIONES HELPER OPTIMIZADAS
// ==============================================
// Función segura para obtener la columna de precio sin IVA
function getPrecioColumn() {
    const iva = parseInt(process.env.IVA, 10);
    const validColumns = [0, 1, 2, 3, 4];

    if (!validColumns.includes(iva)) {
        return 'PRECIO_SIN_IVA'; // fallback seguro
    }
    console.log(`Usando columna de precio: ${iva === 0 ? 'PRECIO_SIN_IVA' : `PRECIO_SIN_IVA_${iva}`}`);
    return iva === 0 ? 'PRECIO_SIN_IVA' : `PRECIO_SIN_IVA_${iva}`;
    
}


const createPaginatedResponse = (data, page, limit, totalCount) => {
    const totalPages = Math.ceil(totalCount / limit);
    
    return {
        data: data,
        pagination: {
            currentPage: parseInt(page),
            totalPages: totalPages,
            totalItems: totalCount,
            itemsPerPage: parseInt(limit),
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    };
};

// Wrapper para manejo de errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Función de validación de parámetros
const validatePaginationParams = (req) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30)); // Máximo 100 items
    const offset = (page - 1) * limit;
    
    return { page, limit, offset };
};


// Función helper mejorada para obtener parámetros
const getParametersFromRequest = (req) => {
    // Intentar obtener de path parameters primero, luego de query parameters
    let page = req.params.page || req.query.page || 1;
    let limit = req.params.limit || req.query.limit || 30;
    let searchTerm = req.params.searchTerm || req.query.q;
    
    // Decodificar searchTerm si viene de URL
    if (searchTerm) {
        searchTerm = decodeURIComponent(searchTerm);
    }
    
    // Validar y convertir a números
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 30));
    const offset = (page - 1) * limit;
    
    console.log(`📋 Parámetros extraídos:`, {
        page,
        limit,
        offset,
        searchTerm,
        categoryId: req.params.categoryId,
        source: req.params.page ? 'path' : 'query',
        allParams: {
            params: req.params,
            query: req.query
        }
    });
    
    return { page, limit, offset, searchTerm };
};

// ==============================================
// CONTROLADORES DE PRODUCTOS OPTIMIZADOS
// ==============================================

// ARTÍCULOS EN OFERTA
const articulosOferta = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logController('Obteniendo artículos en oferta', 'info', 'OFERTAS');
    
    try {
        const precioColumn = getPrecioColumn();

        const query = `
            SELECT 
                at.CODIGO_BARRA,
                a.COD_INTERNO,
                at.art_desc_vta,
                a.${precioColumn} AS PRECIO,
                at.PRECIO_DESC,
                a.STOCK,
                a.PESABLE
                
            FROM articulo_temp at
            INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '1' 
            AND at.activo = 1 
            AND a.HABILITADO = 'S'
            AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
            ORDER BY at.orden ASC, at.fecha_inicio DESC;
        `;

        const results = await executeQuery(query, [], 'OFERTAS');

        const duration = Date.now() - startTime;
        logController(`✅ ${results.length} artículos en oferta obtenidos (${duration}ms)`, 'success', 'OFERTAS');

        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo artículos en oferta: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error obteniendo artículos en oferta',
            timestamp: new Date().toISOString()
        });
    }
});

// ARTÍCULOS DESTACADOS
const articulosDestacados = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logController('Obteniendo artículos destacados', 'info', 'DESTACADOS');
    
    try {
        const precioColumn = getPrecioColumn();

        const query = `
            SELECT 
                at.CODIGO_BARRA,
                a.COD_INTERNO,
                at.art_desc_vta,
                a.${precioColumn} AS PRECIO,
                at.PRECIO_DESC,
                a.STOCK,
                a.PESABLE
                
            FROM articulo_temp at
            INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '2' 
            AND at.activo = 1 
            AND a.HABILITADO = 'S'
            AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
            ORDER BY at.orden ASC, at.fecha_inicio DESC;
        `;

        const results = await executeQuery(query, [], 'DESTACADOS');
        
        const duration = Date.now() - startTime;
        logController(`✅ ${results.length} artculos destacados obtenidos (${duration}ms)`, 'success', 'DESTACADOS');
        
        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo destacados: ${error.message}`, 'error', 'DESTACADOS');
        res.status(500).json({ 
            error: 'Error obteniendo artículos destacados',
            timestamp: new Date().toISOString()
        });
    }
});

const articulosLiquidacion = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logController('Obteniendo artículos en liquidacion', 'info', 'LIQUIDACION');
    
    try {
        const precioColumn = getPrecioColumn();

        const query = `
            SELECT 
                at.CODIGO_BARRA,
                at.cod_interno,
                at.art_desc_vta,
                a.${precioColumn} AS PRECIO,
                at.PRECIO_DESC,
                a.STOCK,
                a.PESABLE,
                a.COD_INTERNO
            FROM articulo_temp at
            INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '3' 
            AND at.activo = 1 
            AND a.HABILITADO = 'S'
            AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
            ORDER BY at.orden ASC, at.fecha_inicio DESC
            LIMIT 6;
        `;

        const results = await executeQuery(query, [], 'LIQUIDACION');

        const duration = Date.now() - startTime;
        logController(`✅ ${results.length} artículos en liquidacion obtenidos (${duration}ms)`, 'success', 'LIQUIDACION');

        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo artículos en liquidacion: ${error.message}`, 'error', 'LIQUIDACION');
        res.status(500).json({ 
            error: 'Error obteniendo artículos en liquidacion',
            timestamp: new Date().toISOString()
        });
    }
});

// PRODUCTOS PRINCIPALES CON PAGINACIÓN OPTIMIZADA
const productosMain = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { page, limit, offset } = getParametersFromRequest(req);

    logController(`Obteniendo productos principales - Página ${page}, Límite ${limit}`, 'info', 'PRODUCTOS_MAIN');

    try {
        const precioColumn = getPrecioColumn();
        console.log('Usando columna de precio:', precioColumn);

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM articulo 
            WHERE HABILITADO = 'S' 
            AND (
                CASE 
                    WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 2 THEN precio_sin_iva_4 
                    ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                END
            ) > 0
        `;

const productosQuery = `
        SELECT 
            CODIGO_BARRA,
            COD_INTERNO,
            COD_IVA,
            CASE 
                WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                WHEN COD_IVA = 2 THEN round(precio_sin_iva_4, 2) + round(costo * porc_impint / 100, 2)
                ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
            END AS PRECIO,
            COSTO,
            porc_impint,
            COD_DPTO,
            PESABLE,
            STOCK,
            art_desc_vta,
            HABILITADO
        FROM articulo 
        WHERE HABILITADO = 'S' 
        AND (
            CASE 
                WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                WHEN COD_IVA = 2 THEN precio_sin_iva_4
                ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
            END
        ) > 0
        AND STOCK >= STOCK_MIN
        ORDER BY art_desc_vta ASC 
        LIMIT ${limit} OFFSET ${offset}
    `;

        const [countResult, products] = await Promise.all([
            executeQuery(countQuery, [], 'COUNT_PRODUCTOS'),
            executeQuery(productosQuery, [], 'PRODUCTOS_MAIN')
        ]);

        const totalCount = countResult[0].total;
        const response = createPaginatedResponse(products, page, limit, totalCount);

        const duration = Date.now() - startTime;
        logController(`✅ ${products.length} productos principales obtenidos (${duration}ms) - Total: ${totalCount}`, 'success', 'PRODUCTOS_MAIN');

        res.json(response);
    } catch (error) {
        logController(`❌ Error obteniendo productos principales: ${error.message}`, 'error', 'PRODUCTOS_MAIN');
        res.status(500).json({
            error: 'Error obteniendo productos principales',
            timestamp: new Date().toISOString()
        });
    }
});



// FILTRADO POR CATEGORÍAS OPTIMIZADO
const filtradoCategorias = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const categoryName = req.params.categoryId;
    
    // 🆕 CORREGIDO: Usar la función helper para obtener parámetros de path y query
    const { page, limit, offset } = getParametersFromRequest(req);
    
    logController(`Filtrando por categoría: ${categoryName} - Página ${page}`, 'info', 'FILTRO_CATEGORIA');
    
    if (!categoryName || categoryName.trim().length === 0) {
        return res.status(400).json({ 
            error: 'Nombre de categoría requerido',
            timestamp: new Date().toISOString()
        });
    }

     try {
        const precioColumn = getPrecioColumn();

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM articulo ar 
            INNER JOIN clasif c ON c.DAT_CLASIF = ar.COD_DPTO AND c.COD_CLASIF = 1
            WHERE c.NOM_CLASIF = ? AND ar.HABILITADO = 'S'
            AND (
                CASE 
                    WHEN ar.COD_IVA = 0 THEN round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 1 THEN round(ar.precio_sin_iva_4 * 1.105, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 2 THEN ar.precio_sin_iva_4
                    ELSE round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                END
            ) > 0
        `;

        const productosQuery = `
            SELECT 
                ar.CODIGO_BARRA,
                ar.COD_INTERNO,
                ar.COD_IVA,
                CASE 
                    WHEN ar.COD_IVA = 0 THEN round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 1 THEN round(ar.precio_sin_iva_4 * 1.105, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 2 THEN ar.precio_sin_iva_4
                    ELSE round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                END AS PRECIO,
                ar.COSTO,
                ar.porc_impint,
                ar.COD_DPTO,
                ar.PESABLE,
                ar.STOCK,
                ar.art_desc_vta,
                c.NOM_CLASIF as categoria_nombre
            FROM articulo ar 
            INNER JOIN clasif c ON c.DAT_CLASIF = ar.COD_DPTO AND c.COD_CLASIF = 1
            WHERE c.NOM_CLASIF = ? 
            AND ar.HABILITADO = 'S'
            AND (
                CASE 
                    WHEN ar.COD_IVA = 0 THEN round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 1 THEN round(ar.precio_sin_iva_4 * 1.105, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    WHEN ar.COD_IVA = 2 THEN round(ar.precio_sin_iva_4, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                    ELSE round(ar.precio_sin_iva_4 * 1.21, 2) + round(ar.costo * ar.porc_impint / 100, 2)
                END
            ) > 0
            AND STOCK >= STOCK_MIN
            ORDER BY ar.art_desc_vta ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [countResult, products] = await Promise.all([
            executeQuery(countQuery, [categoryName], 'COUNT_CATEGORIA'),
            executeQuery(productosQuery, [categoryName], 'FILTRO_CATEGORIA')
        ]);

        const totalCount = countResult[0].total;
        const response = createPaginatedResponse(products, page, limit, totalCount);
        
        const duration = Date.now() - startTime;
        logController(`✅ ${products.length} productos de categoría "${categoryName}" obtenidos (${duration}ms) - Página ${page}/${response.pagination.totalPages}`, 'success', 'FILTRO_CATEGORIA');
        
        res.json(response);
    } catch (error) {
        logController(`❌ Error filtrando categoría "${categoryName}": ${error.message}`, 'error', 'FILTRO_CATEGORIA');
        res.status(500).json({ 
            error: 'Error filtrando por categoría',
            timestamp: new Date().toISOString()
        });
    }
});


// BÚSQUEDA DE PRODUCTOS OPTIMIZADA
const buscarProductos = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const { page, limit, offset, searchTerm } = getParametersFromRequest(req);
    
    logController(`Búsqueda de productos: "${searchTerm}" - Página ${page}`, 'info', 'BUSQUEDA');
    
    // Validación mejorada
    if (!searchTerm || searchTerm.trim().length < 2) {
        console.log(`❌ Término de búsqueda inválido:`, {
            searchTerm,
            trimmed: searchTerm?.trim(),
            length: searchTerm?.trim()?.length || 0,
            params: req.params,
            query: req.query
        });
        
        return res.status(400).json({ 
            error: 'Término de búsqueda debe tener al menos 2 caracteres',
            received: searchTerm,
            timestamp: new Date().toISOString()
        });
    }

    try {
        const precioColumn = getPrecioColumn();
        const searchPattern = `%${searchTerm.trim()}%`;
        const exactStart = `${searchTerm.trim()}%`;

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM articulo
            WHERE (art_desc_vta LIKE ? OR CODIGO_BARRA LIKE ? OR NOMBRE LIKE ?)
            AND HABILITADO = 'S'
            AND (
                CASE 
                    WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 2 THEN precio_sin_iva_4
                    ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                END
            ) > 0
        `;

        const productosQuery = `
            SELECT 
                CODIGO_BARRA,
                COD_INTERNO,
                COD_IVA,
                CASE 
                    WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 2 THEN precio_sin_iva_4
                    ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                END AS PRECIO,
                COSTO,
                porc_impint,
                COD_DPTO,
                PESABLE,
                STOCK,
                art_desc_vta
            FROM articulo
            WHERE (art_desc_vta LIKE ? OR CODIGO_BARRA LIKE ? OR NOMBRE LIKE ?)
            AND HABILITADO = 'S'
            AND (
                CASE 
                    WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 2 THEN round(precio_sin_iva_4, 2) + round(costo * porc_impint / 100, 2)
                    ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                END
            ) > 0
            AND STOCK >= STOCK_MIN
            ORDER BY 
                CASE 
                    WHEN art_desc_vta LIKE ? THEN 1
                    WHEN CODIGO_BARRA LIKE ? THEN 2
                    ELSE 3
                END,
                art_desc_vta ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [countResult, products] = await Promise.all([
            executeQuery(countQuery, [searchPattern, searchPattern, searchPattern], 'COUNT_BUSQUEDA'),
            executeQuery(productosQuery, [searchPattern, searchPattern, searchPattern, exactStart, exactStart], 'BUSQUEDA')
        ]);

        const totalCount = countResult[0].total;
        const response = createPaginatedResponse(products, page, limit, totalCount);
        
        const duration = Date.now() - startTime;
        logController(`✅ ${products.length} productos encontrados para "${searchTerm}" (${duration}ms)`, 'success', 'BUSQUEDA');
        
        res.json(response);
    } catch (error) {
        logController(`❌ Error en búsqueda "${searchTerm}": ${error.message}`, 'error', 'BUSQUEDA');
        res.status(500).json({ 
            error: 'Error en la búsqueda',
            timestamp: new Date().toISOString()
        });
    }
});


// OBTENER CATEGORÍAS OPTIMIZADA
const obtenerCategorias = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logController('Obteniendo categorías', 'info', 'CATEGORIAS');
    
    try {
        const query = `
            SELECT 
                c.id_clasif,
                c.NOM_CLASIF,
                COUNT(a.COD_INTERNO) as cantidad_productos
            FROM clasif c
            LEFT JOIN articulo a ON c.DAT_CLASIF = a.COD_DPTO AND a.HABILITADO = 'S'
            WHERE c.COD_CLASIF = 1 
            GROUP BY c.id_clasif, c.NOM_CLASIF
            HAVING cantidad_productos > 0
            ORDER BY c.NOM_CLASIF ASC
        `;

        const results = await executeQuery(query, [], 'CATEGORIAS');
        
        const duration = Date.now() - startTime;
        logController(`✅ ${results.length} categorías obtenidas (${duration}ms)`, 'success', 'CATEGORIAS');
        
        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo categorías: ${error.message}`, 'error', 'CATEGORIAS');
        res.status(500).json({ 
            error: 'Error obteniendo categorías',
            timestamp: new Date().toISOString()
        });
    }
});

// ARTÍCULOS CHECKOUT OPTIMIZADO
const articulosCheckout = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const cartCodes = req.query.cartCodes ? req.query.cartCodes.split(',') : [];
    
    logController(`Obteniendo productos para checkout - Carrito: ${cartCodes.length} items`, 'info', 'CHECKOUT');
    
    try {
        const precioColumn = getPrecioColumn();
        
        if (cartCodes.length === 0) {
            const fallbackQuery = `
                SELECT 
                    CODIGO_BARRA,
                    COD_INTERNO,
                    COD_IVA,
                    CASE 
                        WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                        WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                        WHEN COD_IVA = 2 THEN precio_sin_iva_4
                        ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    END AS PRECIO,
                    COSTO,
                    porc_impint,
                    COD_DPTO,
                    PESABLE,
                    STOCK,
                    art_desc_vta
                FROM articulo 
                WHERE HABILITADO = 'S'
                AND (
                    CASE 
                        WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                        WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                        WHEN COD_IVA = 2 THEN precio_sin_iva_4
                        ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    END
                ) > 0
                ORDER BY RAND()
                LIMIT 6
            `;
            
            const results = await executeQuery(fallbackQuery, [], 'CHECKOUT_RANDOM');
            
            const duration = Date.now() - startTime;
            logController(`✅ ${results.length} productos aleatorios para checkout (${duration}ms)`, 'success', 'CHECKOUT');
            
            return res.json(results);
        }

        const placeholders1 = cartCodes.map(() => '?').join(',');
        const placeholders2 = cartCodes.map(() => '?').join(',');

        const smartQuery = `
            SELECT DISTINCT
                a.CODIGO_BARRA,
                a.COD_INTERNO,
                a.COD_IVA,
                CASE 
                    WHEN a.COD_IVA = 0 THEN round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 1 THEN round(a.precio_sin_iva_4 * 1.105, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 2 THEN a.precio_sin_iva_4
                    ELSE round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                END AS PRECIO,
                a.COSTO,
                a.porc_impint,
                a.COD_DPTO,
                a.PESABLE,
                a.STOCK,
                a.art_desc_vta,
                c.NOM_CLASIF as categoria_nombre
            FROM articulo a
            LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
            WHERE a.HABILITADO = 'S'
            AND a.CODIGO_BARRA NOT IN (${placeholders1})
            AND a.COD_DPTO IN (
                SELECT DISTINCT COD_DPTO 
                FROM articulo 
                WHERE CODIGO_BARRA IN (${placeholders2}) 
                AND HABILITADO = 'S'
            )
            AND (
                CASE 
                    WHEN a.COD_IVA = 0 THEN round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 1 THEN round(a.precio_sin_iva_4 * 1.105, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 2 THEN a.precio_sin_iva_4
                    ELSE round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                END
            ) > 0
            AND STOCK >= STOCK_MIN
            ORDER BY RAND()
            LIMIT 6
        `;

        const queryParams = [...cartCodes, ...cartCodes];
        const results = await executeQuery(smartQuery, queryParams, 'CHECKOUT_SMART');
        
        const duration = Date.now() - startTime;
        logController(`✅ ${results.length} productos relacionados para checkout (${duration}ms)`, 'success', 'CHECKOUT');
        
        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo productos checkout: ${error.message}`, 'error', 'CHECKOUT');
        
        // Fallback en caso de error
        try {
            const fallbackQuery = `
                SELECT 
                    CODIGO_BARRA,
                    COD_INTERNO,
                    COD_IVA,
                    CASE 
                    WHEN a.COD_IVA = 0 THEN round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 1 THEN round(a.precio_sin_iva_4 * 1.105, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 2 THEN a.precio_sin_iva_4
                    ELSE round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                    END AS PRECIO,
                    COSTO,
                    porc_impint,
                    COD_DPTO,
                    PESABLE,
                    STOCK,
                    art_desc_vta
                FROM articulo 
                WHERE HABILITADO = 'S'
                ORDER BY RAND()
                LIMIT 6
            `;
            
            const fallbackResults = await executeQuery(fallbackQuery, [], 'CHECKOUT_FALLBACK');
            logController(`✅ Fallback: ${fallbackResults.length} productos aleatorios`, 'success', 'CHECKOUT');
            res.json(fallbackResults);
        } catch (fallbackError) {
            logController(`❌ Error en fallback checkout: ${fallbackError.message}`, 'error', 'CHECKOUT');
            res.status(500).json({ 
                error: 'Error obteniendo productos para checkout',
                timestamp: new Date().toISOString()
            });
        }
    }
});

// ==============================================
// GESTIÓN DE CARRITO OPTIMIZADA
// ==============================================

const enviarCarrito = asyncHandler(async (req, res) => {
    const { cod_interno, codigo_barra, cantidad, precio, id_cliente } = req.body;
    
    logController(`Añadiendo al carrito: ${codigo_barra} (cantidad: ${cantidad})`, 'info', 'CARRITO');
    
    // Validaciones
    if (!codigo_barra || !cantidad || !precio) {
        return res.status(400).json({ 
            error: 'Datos del producto incompletos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Si no hay cliente, usar sesiones
        if (!id_cliente) {
            if (!req.session.cart) {
                req.session.cart = [];
            }
            
            const existingItem = req.session.cart.find(item => item.codigo_barra === codigo_barra);
            
            if (existingItem) {
                existingItem.cantidad += cantidad;
                existingItem.total = existingItem.cantidad * existingItem.precio;
                logController(`Producto actualizado en sesión: ${codigo_barra}`, 'success', 'CARRITO');
            } else {
                req.session.cart.push({
                    cod_interno,
                    codigo_barra,
                    cantidad,
                    precio,
                    total: cantidad * precio
                });
                logController(`Producto añadido a sesión: ${codigo_barra}`, 'success', 'CARRITO');
            }
            
            return res.json({ 
                success: true, 
                message: 'Producto añadido al carrito',
                items_count: req.session.cart.length
            });
        }

        // Si hay cliente registrado, usar base de datos
        const insertQuery = `
            INSERT INTO carrito_cont (idcarrito, cod_interno, codigo_barra, cantidad, precio)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            cantidad = cantidad + VALUES(cantidad)
        `;

        await executeQuery(insertQuery, [id_cliente, cod_interno, codigo_barra, cantidad, precio], 'CARRITO_INSERT');
        
        logController(`Producto añadido a BD para cliente ${id_cliente}: ${codigo_barra}`, 'success', 'CARRITO');
        res.json({ 
            success: true, 
            message: 'Producto añadido al carrito',
            cliente_id: id_cliente
        });
    } catch (error) {
        logController(`❌ Error añadiendo al carrito: ${error.message}`, 'error', 'CARRITO');
        res.status(500).json({ 
            error: 'Error añadiendo producto al carrito',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerCarrito = asyncHandler(async (req, res) => {
    const { id_cliente } = req.query;
    
    logController(`Obteniendo carrito para cliente: ${id_cliente || 'sesión'}`, 'info', 'CARRITO');
    
    try {
        // Si no hay cliente, devolver carrito de sesión
        if (!id_cliente) {
            const cart = req.session.cart || [];
            logController(`✅ Carrito de sesión obtenido: ${cart.length} items`, 'success', 'CARRITO');
            return res.json(cart);
        }

        // Si hay cliente, obtener de base de datos
        const query = `
            SELECT 
                cc.cod_interno,
                cc.codigo_barra,
                cc.cantidad,
                cc.precio,
                a.art_desc_vta as nombre,
                (cc.cantidad * cc.precio) as total
            FROM carrito_cont cc
            INNER JOIN articulo a ON cc.codigo_barra = a.CODIGO_BARRA
            WHERE cc.idcarrito = ?
        `;

        const results = await executeQuery(query, [id_cliente], 'CARRITO_GET');
        
        logController(`✅ Carrito BD obtenido para cliente ${id_cliente}: ${results.length} items`, 'success', 'CARRITO');
        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo carrito: ${error.message}`, 'error', 'CARRITO');
        res.status(500).json({ 
            error: 'Error obteniendo carrito',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// CÁLCULO DE ENVÍO OPTIMIZADO
// ==============================================

let storeCoordinates = { lat: 0, lng: 0 };

const getStoreCoordinates = async () => {
    const address = process.env.STORE_ADDRESS;
    try {
        logController(`Obteniendo coordenadas de tienda: ${address}`, 'info', 'GEOCODING');
        
        const response = await axios.get(
            `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${process.env.OPENCAGE_API_KEY}`
        );
        
        if (response.data.results.length === 0) {
            throw new Error('Dirección de la tienda no válida');
        }
        
        const { lat, lng } = response.data.results[0].geometry;
        storeCoordinates = { lat, lng };
        
        logController(`✅ Coordenadas de tienda obtenidas: ${lat}, ${lng}`, 'success', 'GEOCODING');
    } catch (error) {
        logController(`❌ Error obteniendo coordenadas de tienda: ${error.message}`, 'error', 'GEOCODING');
        throw error;
    }
};

// Inicializar coordenadas de la tienda
getStoreCoordinates().catch(error => {
    logController(`❌ Error crítico inicializando coordenadas: ${error.message}`, 'error', 'GEOCODING');
});

const calculateShipping = asyncHandler(async (req, res) => {
    const { address } = req.body;
    const startTime = Date.now();
    
    logController(`Calculando envío para: ${address}`, 'info', 'SHIPPING');
    
    if (!address || address.trim().length < 5) {
        return res.status(400).json({ 
            error: 'Dirección debe tener al menos 5 caracteres',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const encodedAddress = encodeURIComponent(address);
        const response = await axios.get(
            `https://api.opencagedata.com/geocode/v1/json?q=${encodedAddress}&key=${process.env.OPENCAGE_API_KEY}`,
            { timeout: 10000 } // 10 segundos timeout
        );

        if (response.data.results.length === 0) {
            logController(`❌ Dirección no encontrada: ${address}`, 'warn', 'SHIPPING');
            return res.status(400).json({ 
                error: 'Dirección no válida o no encontrada',
                timestamp: new Date().toISOString()
            });
        }

        const validResults = response.data.results.map(result => {
            const { lat, lng } = result.geometry;
            const distance = getDistanceFromLatLonInKm(storeCoordinates.lat, storeCoordinates.lng, lat, lng);
            const shippingCost = calculateShippingCost(distance);
            return {
                formatted: result.formatted,
                distance,
                shippingCost,
                confidence: result.confidence
            };
        });

        const duration = Date.now() - startTime;
        logController(`✅ Envío calculado para "${address}" (${duration}ms): ${validResults.length} resultados`, 'success', 'SHIPPING');
        
        res.json({ results: validResults });
    } catch (error) {
        const duration = Date.now() - startTime;
        logController(`❌ Error calculando envío (${duration}ms): ${error.message}`, 'error', 'SHIPPING');
        
        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({ 
                error: 'Timeout calculando envío, intenta nuevamente',
                timestamp: new Date().toISOString()
            });
        }
        
        res.status(500).json({ 
            error: 'Error calculando costo de envío',
            timestamp: new Date().toISOString()
        });
    }
});

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c;
    return Math.round(d * 100) / 100;
};

const deg2rad = (deg) => {
    return deg * (Math.PI/180);
};

const calculateShippingCost = (distance) => {
    const baseCost = parseFloat(process.env.STORE_DELIVERY_BASE) || 500;
    const costPerKm = parseFloat(process.env.STORE_DELIVERY_KM) || 100;
    
    const minCost = baseCost;
    const calculatedCost = baseCost + (distance * costPerKm);
    
    return Math.max(minCost, calculatedCost);
};

// ==============================================
// MERCADOPAGO OPTIMIZADO
// ==============================================

// ==============================================
// MERCADOPAGO OPTIMIZADO - SIN TARJETAS DE CRÉDITO
// ==============================================

const client = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});
const nombreTiendaMP = process.env.STORE_NAME || 'MercadoPago';

const createPreference = asyncHandler(async (req, res) => {
    const { total } = req.body;
    
    logController(`Creando preferencia MercadoPago - Total: ${total}`, 'info', 'MERCADOPAGO');
    
    if (!total || isNaN(total) || total <= 0) {
        return res.status(400).json({
            error: 'Total inválido para el pago',
            timestamp: new Date().toISOString()
        });
    }
    
    try {
        const body = {
            items: [
                {
                    title: `Compra de ${nombreTiendaMP}`,
                    quantity: 1,
                    unit_price: Number(total),
                    currency_id: "ARS"
                }
            ],
            payer: {
                name: nombreTiendaMP 
            },
            statement_descriptor: nombreTiendaMP.substring(0, 22),
            back_urls: {
                success: "https://vps-5234411-x.dattaweb.com/tienda/confirmacion?status=success",
                failure: "https://vps-5234411-x.dattaweb.com/tienda/pago-rechazado?status=failure", 
                pending: "https://vps-5234411-x.dattaweb.com/tienda/confirmacion?status=pending"
            },
            auto_return: "approved",
            payment_methods: {
                // ✅ EXCLUIR TARJETAS DE CRÉDITO
                excluded_payment_types: [
                    { id: "credit_card" }  // Excluye todas las tarjetas de crédito
                ],
                // ⚠️ ELIMINAR CUOTAS (solo aplican a crédito)
                // installments: 12  // <-- QUITAR ESTA LÍNEA
                installments: 1  // Solo pago en 1 cuota (débito/efectivo)
            },
            external_reference: `pedido_${Date.now()}`
        };
        
        const preference = new mercadopago.Preference(client);
        const result = await preference.create({ body });
        
        logController(`✅ Preferencia MercadoPago creada: ${result.id} - ${total}`, 'success', 'MERCADOPAGO');
        
        res.json({
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });
        
    } catch (error) {
        logController(`❌ Error creando preferencia MercadoPago: ${error.message}`, 'error', 'MERCADOPAGO');
        res.status(500).json({
            error: "Error al crear la preferencia de pago",
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// GESTIÓN DE PEDIDOS OPTIMIZADA
// ==============================================

const nuevoPedido = asyncHandler(async (req, res) => {
    const { 
        cliente, 
        direccion_cliente, 
        telefono_cliente, 
        email_cliente, 
        cantidad_productos, 
        monto_total, 
        costo_envio, 
        medio_pago, 
        estado, 
        notas_local, 
        productos 
    } = req.body;

    logController(`Creando nuevo pedido para: ${cliente}`, 'info', 'PEDIDOS');

    // Validaciones
    if (!cliente || !direccion_cliente || !telefono_cliente || !email_cliente || !productos || productos.length === 0) {
        return res.status(400).json({ 
            error: 'Datos incompletos del pedido',
            required: ['cliente', 'direccion_cliente', 'telefono_cliente', 'email_cliente', 'productos'],
            timestamp: new Date().toISOString()
        });
    }

    try {
        // ✅ VALIDAR Y NORMALIZAR productos antes de insertar
        const productosNormalizados = productos.map(producto => ({
            codigo_barra: producto.codigo_barra || '',
            cod_interno: producto.cod_interno || producto.codInterno || 0, // ✅ Normalizar aquí
            nombre_producto: producto.nombre_producto || '',
            cantidad: producto.cantidad || 1,
            precio: producto.precio || 0
        }));

        // ✅ LOG para debugging
        if (process.env.NODE_ENV === 'development') {
            logController(`📦 Productos normalizados:`, 'info', 'PEDIDOS');
            console.log(JSON.stringify(productosNormalizados, null, 2));
        }

        // Insertar pedido principal
        const insertPedidoQuery = `
            INSERT INTO pedidos (fecha, cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local)
            VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const pedidoValues = [
            cliente,
            direccion_cliente,
            telefono_cliente,
            email_cliente,
            cantidad_productos,
            monto_total,
            costo_envio,
            medio_pago || 'No especificado',
            estado || 'pendiente',
            notas_local
        ];
        const pedidoResult = await executeQuery(insertPedidoQuery, pedidoValues, 'INSERT_PEDIDO');
        const pedidoId = pedidoResult.insertId;

        // ✅ INSERTAR PRODUCTOS - Usar productosNormalizados
        if (productosNormalizados && productosNormalizados.length > 0) {
            const valuePlaceholders = productosNormalizados.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            
            const insertProductoQuery = `
                INSERT INTO pedidos_contenido (id_pedido, codigo_barra, cod_interno, nombre_producto, cantidad, precio)
                VALUES ${valuePlaceholders}
            `;

            const flattenedProductosValues = productosNormalizados.reduce((acc, producto) => {
                acc.push(
                    pedidoId,
                    producto.codigo_barra,
                    producto.cod_interno,  // ✅ Ya normalizado
                    producto.nombre_producto,
                    producto.cantidad,
                    producto.precio
                );
                return acc;
            }, []);

            // ✅ LOG de valores finales antes de insertar
            if (process.env.NODE_ENV === 'development') {
                logController(`📝 Valores para inserción:`, 'info', 'PEDIDOS');
                console.log('Query:', insertProductoQuery);
                console.log('Values:', flattenedProductosValues);
            }

            await executeQuery(insertProductoQuery, flattenedProductosValues, 'INSERT_PRODUCTOS_PEDIDO');
        }

        logController(`✅ Pedido creado exitosamente - ID: ${pedidoId}, Cliente: ${cliente}`, 'success', 'PEDIDOS');
        res.json({ success: true, message: 'Pedido creado correctamente', pedido_id: pedidoId, timestamp: new Date().toISOString() });
    } catch (error) {
        logController(`❌ Error creando pedido para ${cliente}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ error: 'Error al crear el pedido', details: process.env.NODE_ENV !== 'production' ? error.message : undefined, timestamp: new Date().toISOString() });
    }
});

// ==============================================
// FUNCIONES ADICIONALES (EMAIL, IMÁGENES, ETC.)
// ==============================================

const variablesEnv = (req, res) => {
    logController('Obteniendo variables de entorno', 'info', 'CONFIG');
    
    const config = {
        storeName: process.env.STORE_NAME,
        storeAddress: process.env.STORE_ADDRESS,
        storePhone: process.env.STORE_PHONE,
        storeDescription: process.env.STORE_DESCRIPTION,
        storeInstagram: process.env.STORE_INSTAGRAM,
        storeEmail: process.env.STORE_EMAIL,
        storeDeliveryBase: process.env.STORE_DELIVERY_BASE,
        storeDeliveryKm: process.env.STORE_DELIVERY_KM,
        iva: process.env.IVA,
        pageStatus: process.env.PAGE_STATUS
    };
    
    logController('✅ Variables de entorno enviadas', 'success', 'CONFIG');
    res.json(config);
};

// EMAIL OPTIMIZADO
const MailPedidoRealizado = asyncHandler(async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;
    
    logController(`Enviando email de confirmación a: ${clientMail}`, 'info', 'EMAIL');
    
    if (!clientMail || !name || !items) {
        return res.status(400).json({ 
            error: 'Datos incompletos para envío de email',
            timestamp: new Date().toISOString()
        });
    }

    try {
        let htmlTemplate = fs.readFileSync(
            path.join(__dirname, '../resources/email_template/pedido_realizado.html'), 
            'utf8'
        );

        // ITEMS CON ESTILOS MEJORADOS
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.name}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.quantity}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.price}
                </td>
            </tr>`;
        });

        htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName)
                                   .replace(/{{name}}/g, name)
                                   .replace(/{{items}}/g, itemsHtml)
                                   .replace(/{{subtotal}}/g, subtotal)
                                   .replace(/{{shippingCost}}/g, shippingCost)
                                   .replace(/{{total}}/g, total)
                                   .replace(/{{storeMail}}/g, storeMail)
                                   .replace(/{{storePhone}}/g, storePhone);

        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            }
        });

        await transporter.sendMail({
            from: `${storeName} <${storeMail}>`,
            to: clientMail,
            subject: 'Pedido realizado con éxito!',
            html: htmlTemplate,
            attachments: [
                {
                    filename: 'logo.jpg',
                    path: path.join(__dirname, '../resources/img/logo.jpg'),
                    cid: 'logo' // Esta imagen ahora aparece en el header
                }
            ]
        });

        logController(`✅ Email enviado exitosamente a: ${clientMail}`, 'success', 'EMAIL');
        res.json({ 
            success: true, 
            message: 'Email enviado correctamente',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logController(`❌ Error enviando email a ${clientMail}: ${error.message}`, 'error', 'EMAIL');
        res.status(500).json({ 
            error: 'Error enviando email de confirmación',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// GESTIÓN DE IMÁGENES OPTIMIZADA
// ==============================================

const showcasePath = path.join(__dirname, "../resources/showcase");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, publicidadPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});
const upload = multer({ 
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB límite
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
});

const getShowcase = asyncHandler(async (req, res) => {
    logController('Obteniendo imágenes de showcase', 'info', 'IMAGENES');
    
    try {
        const files = await fs.promises.readdir(showcasePath);
        const imagenes = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
                            .map(file => `/showcase/${file}`);

        logController(`✅ ${imagenes.length} imágenes de showcase encontradas`, 'success', 'IMAGENES');
        res.json(imagenes);
    } catch (error) {
        logController(`❌ Error obteniendo imágenes: ${error.message}`, 'error', 'IMAGENES');
        res.status(500).json({ 
            error: "No se pueden obtener las imágenes",
            timestamp: new Date().toISOString()
        });
    }
});

const subirImagenPublicidad = asyncHandler(async (req, res) => {
    upload.single("imagen")(req, res, (err) => {
        if (err) {
            logController(`❌ Error subiendo imagen: ${err.message}`, 'error', 'IMAGENES');
            return res.status(500).json({ 
                error: "Error al subir la imagen",
                details: err.message,
                timestamp: new Date().toISOString()
            });
        }
        
        logController(`✅ Imagen subida: ${req.file.filename}`, 'success', 'IMAGENES');
        res.json({ 
            message: "Imagen subida correctamente", 
            url: `/publicidad/${req.file.filename}`,
            timestamp: new Date().toISOString()
        });
    });
});

const eliminarImagenPublicidad = asyncHandler(async (req, res) => {
    const nombreImagen = req.params.nombreImagen;
    const rutaImagen = path.join(publicidadPath, nombreImagen);

    logController(`Eliminando imagen: ${nombreImagen}`, 'info', 'IMAGENES');

    try {
        await fs.promises.unlink(rutaImagen);
        logController(`✅ Imagen eliminada: ${nombreImagen}`, 'success', 'IMAGENES');
        res.json({ 
            message: "Imagen eliminada correctamente",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logController(`❌ Error eliminando imagen ${nombreImagen}: ${error.message}`, 'error', 'IMAGENES');
        res.status(500).json({ 
            error: "No se pudo eliminar la imagen",
            timestamp: new Date().toISOString()
        });
    }
});

// GESTIÓN DE IMÁGENES DE ARTÍCULOS
const storageImg = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../resources/img_art"));
    },
    filename: (req, file, cb) => {
        const codigo_barra = req.body.codigo_barra;
        cb(null, `${codigo_barra}${path.extname(file.originalname)}`);
    }
});

const uploadImg = multer({ 
    storage: storageImg,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB límite
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
}).single("imagen");

const verificarImagenArticulo = asyncHandler(async (req, res) => {
    const codigo_barra = req.body.codigo_barra;
    const imagePath = path.join(__dirname, `../resources/img_art/${codigo_barra}.jpg`);

    try {
        await fs.promises.access(imagePath, fs.constants.F_OK);
        res.json({ existe: true });
    } catch (error) {
        res.json({ existe: false });
    }
});

const subirImagenArticulo = asyncHandler(async (req, res) => {
    uploadImg(req, res, (err) => {
        if (err) {
            logController(`❌ Error subiendo imagen artículo: ${err.message}`, 'error', 'IMAGENES');
            return res.status(500).json({ 
                error: "Error al subir la imagen",
                details: err.message,
                timestamp: new Date().toISOString()
            });
        }

        if (!req.body.codigo_barra) {
            return res.status(400).json({ 
                error: "Código de barra no recibido",
                timestamp: new Date().toISOString()
            });
        }
        
        logController(`✅ Imagen artículo subida: ${req.body.codigo_barra}`, 'success', 'IMAGENES');
        res.json({ 
            mensaje: "Imagen subida correctamente",
            timestamp: new Date().toISOString()
        });
    });
});

// ==============================================
// GESTIÓN DE OFERTAS Y DESTACADOS OPTIMIZADA
// ==============================================

const gestionarOfertasDestacados = asyncHandler(async (req, res) => {
    const { codigo_barra, precio, precio_desc, categoria, fecha_fin, orden } = req.body;
    
    logController(`Gestionando oferta/destacado: ${codigo_barra}`, 'info', 'OFERTAS');
    
    if (!codigo_barra || !precio || !categoria) {
        return res.status(400).json({ 
            error: 'Datos incompletos (codigo_barra, precio, categoria requeridos)',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Obtener información del artículo
        const getArticuloQuery = `SELECT art_desc_vta FROM articulo WHERE CODIGO_BARRA = ?`;
        const articuloResult = await executeQuery(getArticuloQuery, [codigo_barra], 'GET_ARTICULO');
        
        if (articuloResult.length === 0) {
            return res.status(404).json({ 
                error: 'Artículo no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const art_desc_vta = articuloResult[0].art_desc_vta;

        const insertQuery = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, fecha_fin, orden)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            PRECIO = VALUES(PRECIO),
            PRECIO_DESC = VALUES(PRECIO_DESC),
            fecha_fin = VALUES(fecha_fin),
            orden = VALUES(orden),
            activo = 1
        `;

        await executeQuery(insertQuery, [
            codigo_barra, 
            art_desc_vta, 
            precio, 
            precio_desc, 
            categoria, 
            fecha_fin, 
            orden || 0
        ], 'INSERT_OFERTA');

        logController(`✅ Oferta/destacado gestionado: ${codigo_barra}`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Oferta/Destacado gestionado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logController(`❌ Error gestionando oferta ${codigo_barra}: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error gestionando oferta/destacado',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerOfertasDestacados = asyncHandler(async (req, res) => {
    logController('Obteniendo ofertas y destacados', 'info', 'OFERTAS');
    
    try {
        const query = `
            SELECT 
                at.*,
                a.art_desc_vta as nombre_completo,
                a.STOCK
            FROM articulo_temp at
            INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.activo = 1
            ORDER BY at.cat, at.orden, at.fecha_inicio DESC
        `;

        const results = await executeQuery(query, [], 'GET_OFERTAS');
        
        logController(`✅ ${results.length} ofertas/destacados obtenidos`, 'success', 'OFERTAS');
        res.json(results);
    } catch (error) {
        logController(`❌ Error obteniendo ofertas/destacados: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error obteniendo ofertas/destacados',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarOfertaDestacado = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    logController(`Eliminando oferta/destacado ID: ${id}`, 'info', 'OFERTAS');
    
    try {
        const query = `UPDATE articulo_temp SET activo = 0 WHERE id = ?`;
        const result = await executeQuery(query, [id], 'DELETE_OFERTA');
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Oferta/destacado no encontrado',
                timestamp: new Date().toISOString()
            });
        }
        
        logController(`✅ Oferta/destacado eliminado ID: ${id}`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Oferta/Destacado eliminado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logController(`❌ Error eliminando oferta ID ${id}: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error eliminando oferta/destacado',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// BÚSQUEDA DE DIRECCIONES OPTIMIZADA
// ==============================================

const searchAddresses = asyncHandler(async (req, res) => {
    const { query, country = 'ar', limit = 5 } = req.body;
    const startTime = Date.now();

    logController(`Buscando direcciones: "${query}"`, 'info', 'DIRECCIONES');

    if (!query || query.length < 3) {
        return res.status(400).json({ 
            message: 'Query debe tener al menos 3 caracteres',
            results: [],
            timestamp: new Date().toISOString()
        });
    }

    try {
        // 🆕 MEJORADO: Múltiples estrategias de búsqueda
        const searchStrategies = await executeMultipleSearchStrategies(query, country, limit);
        
        const duration = Date.now() - startTime;
        logController(`✅ ${searchStrategies.results.length} direcciones encontradas (${duration}ms)`, 'success', 'DIRECCIONES');

        res.json({
            results: searchStrategies.results,
            success: true,
            searchInfo: searchStrategies.searchInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logController(`❌ Error buscando direcciones (${duration}ms): ${error.message}`, 'error', 'DIRECCIONES');
        
        res.status(500).json({ 
            message: 'Error al buscar direcciones',
            results: [],
            timestamp: new Date().toISOString()
        });
    }
});

// 🆕 NUEVA FUNCIÓN: Múltiples estrategias de búsqueda
const executeMultipleSearchStrategies = async (originalQuery, country, limit) => {
    const searchInfo = {
        originalQuery,
        strategiesUsed: [],
        totalApiCalls: 0,
        bestStrategy: null
    };

    let allResults = [];

    // Estrategia 1: Búsqueda directa
    try {
        const directResults = await searchWithOpenCage(originalQuery, country, limit, {
            min_confidence: 2,
            proximity: '-31.4201,-64.1888', // Córdoba
            language: 'es'
        });
        
        allResults = allResults.concat(directResults.map(r => ({ ...r, strategy: 'direct' })));
        searchInfo.strategiesUsed.push('direct');
        searchInfo.totalApiCalls++;
        
        console.log(`📍 Estrategia directa: ${directResults.length} resultados`);
    } catch (error) {
        console.log('❌ Error en búsqueda directa:', error.message);
    }

    // Estrategia 2: Búsqueda con contexto de Córdoba si no se especifica
    if (!originalQuery.toLowerCase().includes('córdoba') && 
        !originalQuery.toLowerCase().includes('cordoba') && 
        allResults.length < 3) {
        try {
            const contextualQuery = `${originalQuery}, Córdoba, Argentina`;
            const contextualResults = await searchWithOpenCage(contextualQuery, country, limit, {
                min_confidence: 1,
                proximity: '-31.4201,-64.1888'
            });
            
            allResults = allResults.concat(contextualResults.map(r => ({ ...r, strategy: 'contextual' })));
            searchInfo.strategiesUsed.push('contextual');
            searchInfo.totalApiCalls++;
            
            console.log(`📍 Estrategia contextual: ${contextualResults.length} resultados`);
        } catch (error) {
            console.log('❌ Error en búsqueda contextual:', error.message);
        }
    }

    // Estrategia 3: Búsqueda con variaciones comunes (solo si tenemos pocos resultados)
    if (allResults.length < 2) {
        const variations = generateAddressVariations(originalQuery);
        
        for (const variation of variations.slice(0, 2)) { // Máximo 2 variaciones
            try {
                const variationResults = await searchWithOpenCage(variation, country, Math.ceil(limit/2), {
                    min_confidence: 1,
                    proximity: '-31.4201,-64.1888'
                });
                
                allResults = allResults.concat(variationResults.map(r => ({ ...r, strategy: 'variation', originalVariation: variation })));
                searchInfo.totalApiCalls++;
                
                console.log(`📍 Variación "${variation}": ${variationResults.length} resultados`);
            } catch (error) {
                console.log(`❌ Error en variación "${variation}":`, error.message);
            }
        }
        
        if (variations.length > 0) {
            searchInfo.strategiesUsed.push('variations');
        }
    }

    // Procesar y deduplicar resultados
    const processedResults = processAndDeduplicateResults(allResults, limit);
    
    // Determinar la mejor estrategia
    searchInfo.bestStrategy = determineBestStrategy(processedResults);
    
    return {
        results: processedResults,
        searchInfo
    };
};

// 🆕 NUEVA FUNCIÓN: Búsqueda con OpenCage (wrapper)
const searchWithOpenCage = async (query, country, limit, options = {}) => {
    const params = new URLSearchParams({
        q: query,
        key: process.env.OPENCAGE_API_KEY,
        limit: limit,
        countrycode: country,
        language: 'es',
        ...options
    });

    const response = await axios.get(
        `https://api.opencagedata.com/geocode/v1/json?${params}`,
        { timeout: 8000 }
    );

    if (response.data.results && response.data.results.length > 0) {
        return response.data.results.map((result) => {
            const { lat, lng } = result.geometry;
            const distance = getDistanceFromLatLonInKm(
                storeCoordinates.lat, 
                storeCoordinates.lng, 
                lat, 
                lng
            );
            const shippingCost = calculateShippingCost(distance);
            
            return {
                formatted: result.formatted,
                distance,
                shippingCost,
                confidence: result.confidence,
                components: result.components,
                coordinates: { lat, lng }
            };
        });
    }
    
    return [];
};

// 🆕 NUEVA FUNCIÓN: Generar variaciones de direcciones
const generateAddressVariations = (originalQuery) => {
    const variations = [];
    const query = originalQuery.toLowerCase().trim();
    
    // Expandir abreviaciones comunes
    const abbreviations = {
        'av ': 'avenida ',
        'av.': 'avenida',
        'avda': 'avenida',
        'bv ': 'bulevar ',
        'bv.': 'bulevar',
        'dr ': 'doctor ',
        'dr.': 'doctor',
        'gral ': 'general ',
        'gral.': 'general',
        'san ': 'san ',
        'sta ': 'santa ',
        'pte ': 'presidente '
    };

    let expandedQuery = query;
    for (const [abbrev, full] of Object.entries(abbreviations)) {
        if (expandedQuery.includes(abbrev)) {
            expandedQuery = expandedQuery.replace(new RegExp(abbrev, 'g'), full);
            variations.push(expandedQuery);
            break; // Solo una expansión por consulta
        }
    }

    // Si no hay número, sugerir buscar solo la calle
    const hasNumber = /\d/.test(query);
    if (!hasNumber && !query.includes('esquina')) {
        // Intentar buscar solo el nombre de la calle para encontrar la zona
        variations.push(`${query} córdoba capital`);
    }

    // Quitar duplicados y la consulta original
    return [...new Set(variations)].filter(v => v !== originalQuery && v !== query);
};

// 🆕 NUEVA FUNCIÓN: Procesar y deduplicar resultados
const processAndDeduplicateResults = (allResults, limit) => {
    // Deduplicar por dirección formateada (manteniendo el mejor resultado)
    const deduplicatedMap = new Map();
    
    for (const result of allResults) {
        const key = result.formatted.toLowerCase().trim();
        
        if (!deduplicatedMap.has(key) || 
            deduplicatedMap.get(key).confidence < result.confidence) {
            deduplicatedMap.set(key, result);
        }
    }
    
    // Convertir a array y ordenar por relevancia
    let processedResults = Array.from(deduplicatedMap.values());
    
    // Ordenar por: completitud, confianza, distancia
    processedResults.sort((a, b) => {
        // Priorizar direcciones con número de casa
        const aComplete = !!(a.components?.house_number && a.components?.road);
        const bComplete = !!(b.components?.house_number && b.components?.road);
        
        if (aComplete !== bComplete) return bComplete - aComplete;
        
        // Luego por confianza
        if (Math.abs(a.confidence - b.confidence) > 0.1) {
            return b.confidence - a.confidence;
        }
        
        // Finalmente por distancia (más cerca mejor)
        return a.distance - b.distance;
    });
    
    // Limitar resultados
    return processedResults.slice(0, limit);
};

// 🆕 NUEVA FUNCIÓN: Determinar mejor estrategia
const determineBestStrategy = (results) => {
    if (results.length === 0) return 'none';
    
    const strategies = results.reduce((acc, result) => {
        acc[result.strategy] = (acc[result.strategy] || 0) + 1;
        return acc;
    }, {});
    
    return Object.keys(strategies).reduce((a, b) => strategies[a] > strategies[b] ? a : b);
};

const reverseGeocode = asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    const startTime = Date.now();

    logController(`Geocodificación inversa: ${lat}, ${lng}`, 'info', 'GEOCODING');

    if (!lat || !lng) {
        return res.status(400).json({ 
            message: 'Latitud y longitud son requeridas',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Validar coordenadas
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        
        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ 
                message: 'Coordenadas inválidas',
                timestamp: new Date().toISOString()
            });
        }

        // Usar OpenCage para geocodificación inversa
        const params = new URLSearchParams({
            q: `${latitude},${longitude}`,
            key: process.env.OPENCAGE_API_KEY,
            language: 'es',
            limit: 1,
            no_annotations: 1,
            roadinfo: 1,
            countrycode: 'ar' // Limitar a Argentina
        });

        const response = await axios.get(
            `https://api.opencagedata.com/geocode/v1/json?${params}`,
            { timeout: 8000 }
        );

        if (response.data.results && response.data.results.length > 0) {
            const result = response.data.results[0];
            
            // Crear dirección formateada más limpia
            let formattedAddress = result.formatted;
            
            if (result.components) {
                const parts = [];
                
                // Construir dirección paso a paso
                if (result.components.house_number && result.components.road) {
                    parts.push(`${result.components.road} ${result.components.house_number}`);
                } else if (result.components.road) {
                    parts.push(result.components.road);
                }
                
                // Agregar barrio/zona
                if (result.components.neighbourhood) {
                    parts.push(result.components.neighbourhood);
                } else if (result.components.suburb) {
                    parts.push(result.components.suburb);
                } else if (result.components.quarter) {
                    parts.push(result.components.quarter);
                }
                
                // Agregar ciudad
                if (result.components.city) {
                    parts.push(result.components.city);
                } else if (result.components.town) {
                    parts.push(result.components.town);
                } else if (result.components.municipality) {
                    parts.push(result.components.municipality);
                }
                
                // Si tenemos partes, usar esa dirección
                if (parts.length > 0) {
                    formattedAddress = parts.join(', ');
                }
            }

            const duration = Date.now() - startTime;
            logController(`✅ Geocodificación exitosa (${duration}ms): ${formattedAddress}`, 'success', 'GEOCODING');

            res.json({
                formatted: formattedAddress,
                components: result.components,
                confidence: result.confidence,
                success: true,
                timestamp: new Date().toISOString()
            });

        } else {
            const duration = Date.now() - startTime;
            logController(`⚠️ No se encontró dirección para coordenadas (${duration}ms)`, 'warning', 'GEOCODING');
            
            res.json({
                formatted: `Ubicación (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
                components: {},
                confidence: 0,
                success: false,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        logController(`❌ Error en geocodificación inversa (${duration}ms): ${error.message}`, 'error', 'GEOCODING');
        
        res.status(500).json({ 
            message: 'Error en geocodificación inversa',
            formatted: `Ubicación (${lat}, ${lng})`,
            components: {},
            success: false,
            timestamp: new Date().toISOString()
        });
    }
});

// Reemplaza COMPLETAMENTE tus funciones verificarHorarioTienda y estadoHorarioSimple con este código

const verificarHorarioTienda = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logController('Verificando horario de la tienda', 'info', 'HORARIOS');
    
    try {
        // Valores por defecto si no están en .env
        const horaInicio = process.env.HORA_INICIO || '08:00';
        const horaFin = process.env.HORA_FIN || '22:00';
        
        // Validar formato de horarios
        const validarFormatoHora = (hora) => {
            const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            return regex.test(hora);
        };

        if (!validarFormatoHora(horaInicio) || !validarFormatoHora(horaFin)) {
            throw new Error(`Formato de horario inválido. Inicio: ${horaInicio}, Fin: ${horaFin}`);
        }
        
        // Obtener hora actual en Argentina (UTC-3)
        const now = new Date();
        const argentinaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
        
        const currentHour = argentinaTime.getHours();
        const currentMinute = argentinaTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        // Convertir horarios de apertura y cierre a minutos con validación
        let horaInicioHora, horaInicioMinuto, horaFinHora, horaFinMinuto;
        
        try {
            [horaInicioHora, horaInicioMinuto] = horaInicio.split(':').map(Number);
            [horaFinHora, horaFinMinuto] = horaFin.split(':').map(Number);
        } catch (parseError) {
            throw new Error(`Error parseando horarios: ${parseError.message}`);
        }
        
        // Validar que los números sean válidos
        if (isNaN(horaInicioHora) || isNaN(horaInicioMinuto) || isNaN(horaFinHora) || isNaN(horaFinMinuto)) {
            throw new Error('Horarios contienen valores no numéricos');
        }
        
        const inicioEnMinutos = horaInicioHora * 60 + horaInicioMinuto;
        let finEnMinutos = horaFinHora * 60 + horaFinMinuto;
        
        // Si la hora de fin es menor que la de inicio, significa que cruza medianoche
        const cruzaMedianoche = finEnMinutos < inicioEnMinutos;
        
        let estaAbierto = false;
        let tiempoParaAbrir = 0;
        let tiempoParaCerrar = 0;
        
        if (cruzaMedianoche) {
            // Ejemplo: 08:00 a 02:00 (cruza medianoche)
            estaAbierto = currentTimeInMinutes >= inicioEnMinutos || currentTimeInMinutes <= finEnMinutos;
            
            if (estaAbierto) {
                // Calcular tiempo hasta el cierre
                if (currentTimeInMinutes >= inicioEnMinutos) {
                    // Estamos en el mismo día, cerraremos después de medianoche
                    tiempoParaCerrar = (24 * 60) - currentTimeInMinutes + finEnMinutos;
                } else {
                    // Ya pasamos medianoche, cerraremos hoy
                    tiempoParaCerrar = finEnMinutos - currentTimeInMinutes;
                }
            } else {
                // Calcular tiempo hasta la apertura
                tiempoParaAbrir = inicioEnMinutos - currentTimeInMinutes;
            }
        } else {
            // Horario normal sin cruzar medianoche
            estaAbierto = currentTimeInMinutes >= inicioEnMinutos && currentTimeInMinutes <= finEnMinutos;
            
            if (estaAbierto) {
                tiempoParaCerrar = finEnMinutos - currentTimeInMinutes;
            } else if (currentTimeInMinutes < inicioEnMinutos) {
                tiempoParaAbrir = inicioEnMinutos - currentTimeInMinutes;
            } else {
                // Es después del horario de cierre
                tiempoParaAbrir = (24 * 60) - currentTimeInMinutes + inicioEnMinutos;
            }
        }
        
        // Formatear horarios para mostrar
        const formatearHora = (hora) => {
            try {
                const [h, m] = hora.split(':');
                const hora24 = parseInt(h);
                const minutos = m.padStart(2, '0');
                
                if (hora24 === 0) return `12:${minutos} AM`;
                if (hora24 < 12) return `${hora24}:${minutos} AM`;
                if (hora24 === 12) return `12:${minutos} PM`;
                return `${hora24 - 12}:${minutos} PM`;
            } catch (error) {
                return hora;
            }
        };
        
        const resultado = {
            estaAbierto: estaAbierto,
            horarios: {
                apertura: horaInicio,
                cierre: horaFin,
                aperturaFormateada: formatearHora(horaInicio),
                cierreFormateada: formatearHora(horaFin)
            },
            horaActual: {
                hora: currentHour,
                minuto: currentMinute,
                formateada: argentinaTime.toLocaleTimeString('es-AR', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                })
            },
            tiempos: {
                minutosParaAbrir: Math.max(0, tiempoParaAbrir),
                minutosParaCerrar: Math.max(0, tiempoParaCerrar),
                horasParaAbrir: Math.floor(Math.max(0, tiempoParaAbrir) / 60),
                horasParaCerrar: Math.floor(Math.max(0, tiempoParaCerrar) / 60)
            },
            cruzaMedianoche: cruzaMedianoche,
            timezone: 'America/Argentina/Cordoba',
            debug: {
                currentTimeInMinutes: currentTimeInMinutes,
                inicioEnMinutos: inicioEnMinutos,
                finEnMinutos: finEnMinutos,
                horaInicioParseada: `${horaInicioHora}:${horaInicioMinuto}`,
                horaFinParseada: `${horaFinHora}:${horaFinMinuto}`
            }
        };
        
        const duration = Date.now() - startTime;
        logController(`✅ Horario verificado (${duration}ms): ${estaAbierto ? 'ABIERTO' : 'CERRADO'}`, 'success', 'HORARIOS');
        
        res.json(resultado);
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logController(`❌ Error verificando horario (${duration}ms): ${error.message}`, 'error', 'HORARIOS');
        
        console.error('Detalles del error:', {
            message: error.message,
            stack: error.stack,
            env: {
                HORA_INICIO: process.env.HORA_INICIO,
                HORA_FIN: process.env.HORA_FIN
            }
        });
        
        res.status(500).json({ 
            error: 'Error verificando horario de la tienda',
            details: error.message,
            timestamp: new Date().toISOString(),
            estaAbierto: true,
            mensaje: 'Error al verificar horarios, se permite continuar',
            horarios: {
                apertura: process.env.HORA_INICIO || '08:00',
                cierre: process.env.HORA_FIN || '22:00',
                aperturaFormateada: '8:00 AM',
                cierreFormateada: '10:00 PM'
            }
        });
    }
});

const estadoHorarioSimple = asyncHandler(async (req, res) => {
    logController('Obteniendo estado simple del horario', 'info', 'HORARIOS');
    
    try {
        const horaInicio = process.env.HORA_INICIO || '08:00';
        const horaFin = process.env.HORA_FIN || '22:00';
        
        const validarFormatoHora = (hora) => {
            const regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            return regex.test(hora);
        };

        if (!validarFormatoHora(horaInicio) || !validarFormatoHora(horaFin)) {
            throw new Error(`Formato de horario inválido`);
        }
        
        const now = new Date();
        const argentinaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Argentina/Cordoba"}));
        const currentHour = argentinaTime.getHours();
        const currentMinute = argentinaTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        const [horaInicioHora, horaInicioMinuto] = horaInicio.split(':').map(Number);
        const [horaFinHora, horaFinMinuto] = horaFin.split(':').map(Number);
        
        const inicioEnMinutos = horaInicioHora * 60 + horaInicioMinuto;
        let finEnMinutos = horaFinHora * 60 + horaFinMinuto;
        
        const cruzaMedianoche = finEnMinutos < inicioEnMinutos;
        let estaAbierto = false;
        
        if (cruzaMedianoche) {
            estaAbierto = currentTimeInMinutes >= inicioEnMinutos || currentTimeInMinutes <= finEnMinutos;
        } else {
            estaAbierto = currentTimeInMinutes >= inicioEnMinutos && currentTimeInMinutes <= finEnMinutos;
        }
        
        logController(`✅ Estado simple obtenido: ${estaAbierto ? 'ABIERTO' : 'CERRADO'}`, 'success', 'HORARIOS');
        
        res.json({
            estaAbierto: estaAbierto,
            horaInicio: horaInicio,
            horaFin: horaFin,
            horaActual: argentinaTime.toLocaleTimeString('es-AR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            })
        });
        
    } catch (error) {
        logController(`❌ Error en estado simple: ${error.message}`, 'error', 'HORARIOS');
        
        res.status(500).json({ 
            error: 'Error obteniendo estado del horario',
            details: error.message,
            estaAbierto: true,
            horaInicio: process.env.HORA_INICIO || '08:00',
            horaFin: process.env.HORA_FIN || '22:00'
        });
    }
});

// ==============================================
// EXPORTAR TODOS LOS CONTROLADORES
// ==============================================

module.exports = {
    articulosOferta,
    articulosDestacados,
    articulosLiquidacion,
    productosMain,
    filtradoCategorias,
    buscarProductos,
    obtenerCategorias,
    articulosCheckout,
    enviarCarrito,
    obtenerCarrito,
    calculateShipping,
    createPreference,
    variablesEnv,
    MailPedidoRealizado,
    nuevoPedido,
    getShowcase,
    subirImagenPublicidad,
    eliminarImagenPublicidad,
    verificarImagenArticulo,
    subirImagenArticulo,
    gestionarOfertasDestacados,
    obtenerOfertasDestacados,
    eliminarOfertaDestacado,
    searchAddresses,
    
    reverseGeocode,
    verificarHorarioTienda,
    estadoHorarioSimple
};