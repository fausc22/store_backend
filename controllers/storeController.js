// controllers/storeController.js
const db = require('./db');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { create } = require('domain');
const multer = require("multer");
require('dotenv').config();

// Función helper para obtener la columna de precio según la variable IVA
const getPrecioColumn = () => {
    const ivaValue = parseInt(process.env.IVA) || 0;
    return `PRECIO_SIN_IVA_${ivaValue}`;
};



// Función helper para crear respuesta paginada
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

// ARTÍCULOS EN OFERTA
// const articulosOferta = (req, res) => {
//     const ivaValue = parseInt(process.env.IVA);
//     const IVA = calcularIVA(ivaValue);

//     const query = `
//         SELECT 
//             at.CODIGO_BARRA,
//             at.art_desc_vta,
//             ROUND(at.PRECIO * ?, 2) AS PRECIO,
//             at.PRECIO_DESC,
//             a.STOCK,
//             a.PESABLE,
//             a.COD_INTERNO
//         FROM articulo_temp at
//         INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
//         WHERE at.cat = '1' 
//         AND at.activo = 1 
//         AND a.HABILITADO = 'S'
//         AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
//         ORDER BY at.orden ASC, at.fecha_inicio DESC;
//     `;

//     db.query(query, [IVA], (err, results) => {
//         if (err) {
//             console.error('Error ejecutando la consulta de ofertas:', err);
//             res.status(500).json({ error: 'Error en el servidor' });
//             return;
//         }
//         res.json(results);
//     });
// };


// ARTÍCULOS EN OFERTA
const articulosOferta = (req, res) => {
    const precioColumn = getPrecioColumn();

    const query = `
        SELECT 
            CODIGO_BARRA, 
            COD_INTERNO, 
            COD_IVA, 
            ${precioColumn} AS PRECIO, 
            COSTO, 
            porc_impint, 
            COD_DPTO, 
            PESABLE, 
            STOCK, 
            art_desc_vta 
        FROM articulo 
        WHERE HABILITADO = 'S'
        LIMIT 8
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de ofertas:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// ARTÍCULOS DESTACADOS DE LA PÁGINA HOME
const articulosDestacados = (req, res) => {
    const precioColumn = getPrecioColumn();

    const query = `
        SELECT 
            at.CODIGO_BARRA,
            at.art_desc_vta,
            a.${precioColumn} AS PRECIO,
            at.PRECIO_DESC,
            a.STOCK,
            a.PESABLE,
            a.COD_INTERNO
        FROM articulo_temp at
        INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
        WHERE at.cat = '2' 
        AND at.activo = 1 
        AND a.HABILITADO = 'S'
        AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
        ORDER BY at.orden ASC, at.fecha_inicio DESC;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de destacados:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// PRODUCTOS PRINCIPALES (HOME)
/// PRODUCTOS PRINCIPALES CON PAGINACIÓN
const productosMain = (req, res) => {
    const precioColumn = getPrecioColumn();
    
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // Primero obtener el total de productos
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM articulo 
        WHERE HABILITADO = 'S'
    `;

    db.query(countQuery, (err, countResult) => {
        if (err) {
            console.error('Error obteniendo conteo de productos:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const totalCount = countResult[0].total;

        // Consulta principal con paginación
        const query = `
            SELECT 
                CODIGO_BARRA,
                COD_INTERNO,
                COD_IVA,
                ${precioColumn} AS PRECIO,
                COSTO,
                porc_impint,
                COD_DPTO,
                PESABLE,
                STOCK,
                art_desc_vta,
                HABILITADO
            FROM articulo 
            WHERE HABILITADO = 'S'
            ORDER BY ${precioColumn} DESC 
            LIMIT ? OFFSET ?
        `;

        db.query(query, [limit, offset], (err, results) => {
            if (err) {
                console.error('Error ejecutando la consulta de productos principales:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            
            const response = createPaginatedResponse(results, page, limit, totalCount);
            res.json(response);
        });
    });
};

// FILTRADO POR CATEGORÍAS
const filtradoCategorias = (req, res) => {
    const categoryName = req.params.categoryId;
    const precioColumn = getPrecioColumn();
    
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    // Primero obtener el total de productos en la categoría
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM articulo ar 
        INNER JOIN clasif c ON c.DAT_CLASIF = ar.COD_DPTO AND c.COD_CLASIF = 1
        WHERE c.NOM_CLASIF = ? AND ar.HABILITADO = 'S'
    `;

    db.query(countQuery, [categoryName], (err, countResult) => {
        if (err) {
            console.error('Error obteniendo conteo de productos por categoría:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const totalCount = countResult[0].total;

        // Consulta principal con paginación
        const query = `
            SELECT 
                ar.CODIGO_BARRA,
                ar.COD_INTERNO,
                ar.COD_IVA,
                ar.${precioColumn} AS PRECIO,
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
            ORDER BY ar.art_desc_vta ASC
            LIMIT ? OFFSET ?
        `;

        db.query(query, [categoryName, limit, offset], (err, results) => {
            if (err) {
                console.error('Error ejecutando la consulta de categorías:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            
            const response = createPaginatedResponse(results, page, limit, totalCount);
            res.json(response);
        });
    });
};

// BÚSQUEDA DE PRODUCTOS
const buscarProductos = (req, res) => {
    const searchTerm = req.query.q;
    const precioColumn = getPrecioColumn();
    
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({ error: 'Término de búsqueda muy corto' });
    }

    const searchPattern = `%${searchTerm}%`;
    const exactStart = `${searchTerm}%`;

    // Primero obtener el total de productos que coinciden
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM articulo
        WHERE (art_desc_vta LIKE ? OR CODIGO_BARRA LIKE ? OR NOMBRE LIKE ?)
        AND HABILITADO = 'S'
    `;

    db.query(countQuery, [searchPattern, searchPattern, searchPattern], (err, countResult) => {
        if (err) {
            console.error('Error obteniendo conteo de búsqueda:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }

        const totalCount = countResult[0].total;

        // Consulta principal con paginación
        const query = `
            SELECT 
                CODIGO_BARRA,
                COD_INTERNO,
                COD_IVA,
                ${precioColumn} AS PRECIO,
                COSTO,
                porc_impint,
                COD_DPTO,
                PESABLE,
                STOCK,
                art_desc_vta
            FROM articulo
            WHERE (art_desc_vta LIKE ? OR CODIGO_BARRA LIKE ? OR NOMBRE LIKE ?)
            AND HABILITADO = 'S'
            ORDER BY 
                CASE 
                    WHEN art_desc_vta LIKE ? THEN 1
                    WHEN CODIGO_BARRA LIKE ? THEN 2
                    ELSE 3
                END,
                art_desc_vta ASC
            LIMIT ? OFFSET ?
        `;

        db.query(query, [searchPattern, searchPattern, searchPattern, exactStart, exactStart, limit, offset], (err, results) => {
            if (err) {
                console.error('Error ejecutando la búsqueda:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            
            const response = createPaginatedResponse(results, page, limit, totalCount);
            res.json(response);
        });
    });
};


// OBTENER CATEGORÍAS
const obtenerCategorias = (req, res) => {
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
        ORDER BY c.NOM_CLASIF ASC;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de categorías:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// ARTÍCULOS CHECKOUT (productos sugeridos)

// FUNCIÓN BACKEND CORREGIDA
const articulosCheckout = (req, res) => {
    const ivaValue = parseInt(process.env.IVA) || 0;
    const precioColumn = `PRECIO_SIN_IVA_${ivaValue}`;
    
    // Obtener códigos de barra del carrito desde query parameters
    const cartCodes = req.query.cartCodes ? req.query.cartCodes.split(',') : [];
    
    console.log('🛒 Códigos del carrito recibidos:', cartCodes);
    
    // Si no hay items en el carrito, mostrar productos aleatorios
    if (cartCodes.length === 0) {
        const fallbackQuery = `
            SELECT 
                CODIGO_BARRA,
                COD_INTERNO,
                COD_IVA,
                ${precioColumn} AS PRECIO,
                COSTO,
                porc_impint,
                COD_DPTO,
                PESABLE,
                STOCK,
                art_desc_vta
            FROM articulo 
            WHERE HABILITADO = 'S'
            ORDER BY RAND()
            LIMIT 6;
        `;
        
        db.query(fallbackQuery, (err, results) => {
            if (err) {
                console.error('Error ejecutando consulta fallback:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            console.log('✅ Productos aleatorios encontrados:', results.length);
            return res.json(results);
        });
        return;
    }

    // Construir placeholders para cada uso en la consulta
    const placeholders1 = cartCodes.map(() => '?').join(','); // Para NOT IN
    const placeholders2 = cartCodes.map(() => '?').join(','); // Para categorías
    const placeholders3 = cartCodes.map(() => '?').join(','); // Para ORDER BY
    
    // Consulta más simple y robusta
    const smartQuery = `
        SELECT DISTINCT
            a.CODIGO_BARRA,
            a.COD_INTERNO,
            a.COD_IVA,
            ${precioColumn} AS PRECIO,
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
        ORDER BY RAND()
        LIMIT 6;
    `;

    // Crear array de parámetros (duplicar cartCodes para cada placeholder)
    const queryParams = [...cartCodes, ...cartCodes];
    
    console.log('📋 Ejecutando consulta de misma categoría...');
    console.log('🔧 Parámetros:', queryParams);
    
    db.query(smartQuery, queryParams, (err, results) => {
        if (err) {
            console.error('Error ejecutando consulta de categoría:', err);
            
            // Fallback: buscar productos con palabras clave similares
            const keywordQuery = `
                SELECT DISTINCT
                    a.CODIGO_BARRA,
                    a.COD_INTERNO,
                    a.COD_IVA,
                    ${precioColumn} AS PRECIO,
                    a.COSTO,
                    a.porc_impint,
                    a.COD_DPTO,
                    a.PESABLE,
                    a.STOCK,
                    a.art_desc_vta
                FROM articulo a
                WHERE a.HABILITADO = 'S'
                AND a.CODIGO_BARRA NOT IN (${placeholders1})
                AND EXISTS (
                    SELECT 1 FROM articulo cart_item
                    WHERE cart_item.CODIGO_BARRA IN (${placeholders2})
                    AND a.art_desc_vta LIKE CONCAT('%', 
                        SUBSTRING_INDEX(cart_item.art_desc_vta, ' ', 1), '%')
                    AND cart_item.HABILITADO = 'S'
                )
                ORDER BY RAND()
                LIMIT 6;
            `;
            
            db.query(keywordQuery, queryParams, (keywordErr, keywordResults) => {
                if (keywordErr) {
                    console.error('Error en consulta de palabras clave:', keywordErr);
                    
                    // Último fallback: productos aleatorios excluyendo carrito
                    const finalFallbackQuery = `
                        SELECT 
                            CODIGO_BARRA,
                            COD_INTERNO,
                            COD_IVA,
                            ${precioColumn} AS PRECIO,
                            COSTO,
                            porc_impint,
                            COD_DPTO,
                            PESABLE,
                            STOCK,
                            art_desc_vta
                        FROM articulo 
                        WHERE HABILITADO = 'S'
                        AND CODIGO_BARRA NOT IN (${placeholders1})
                        ORDER BY RAND()
                        LIMIT 6;
                    `;
                    
                    db.query(finalFallbackQuery, cartCodes, (finalErr, finalResults) => {
                        if (finalErr) {
                            console.error('Error en fallback final:', finalErr);
                            return res.status(500).json({ error: 'Error en el servidor' });
                        }
                        console.log('✅ Productos fallback final encontrados:', finalResults.length);
                        return res.json(finalResults);
                    });
                    return;
                }
                console.log('✅ Productos por palabras clave encontrados:', keywordResults.length);
                return res.json(keywordResults);
            });
            return;
        }
        
        // Si no encontró productos de la misma categoría, buscar aleatorios
        if (results.length === 0) {
            const randomQuery = `
                SELECT 
                    CODIGO_BARRA,
                    COD_INTERNO,
                    COD_IVA,
                    ${precioColumn} AS PRECIO,
                    COSTO,
                    porc_impint,
                    COD_DPTO,
                    PESABLE,
                    STOCK,
                    art_desc_vta
                FROM articulo 
                WHERE HABILITADO = 'S'
                AND CODIGO_BARRA NOT IN (${placeholders1})
                ORDER BY RAND()
                LIMIT 6;
            `;
            
            db.query(randomQuery, cartCodes, (randomErr, randomResults) => {
                if (randomErr) {
                    console.error('Error en consulta aleatoria:', randomErr);
                    return res.status(500).json({ error: 'Error en el servidor' });
                }
                console.log('✅ Productos aleatorios (sin categoría) encontrados:', randomResults.length);
                return res.json(randomResults);
            });
            return;
        }
        
        console.log('✅ Productos de misma categoría encontrados:', results.length);
        res.json(results);
    });
};




// GESTIÓN DE CARRITO MEJORADA
const enviarCarrito = (req, res) => {
    const { cod_interno, codigo_barra, cantidad, precio, id_cliente } = req.body;

    // Si no hay cliente (sesión anónima), usar sesiones
    if (!id_cliente) {
        if (!req.session.cart) {
            req.session.cart = [];
        }
        
        // Buscar si el producto ya existe en el carrito
        const existingItem = req.session.cart.find(item => item.codigo_barra === codigo_barra);
        
        if (existingItem) {
            existingItem.cantidad += cantidad;
            existingItem.total = existingItem.cantidad * existingItem.precio;
        } else {
            req.session.cart.push({
                cod_interno,
                codigo_barra,
                cantidad,
                precio,
                total: cantidad * precio
            });
        }
        
        return res.json({ success: true, message: 'Producto añadido al carrito' });
    }

    // Si hay cliente registrado, usar base de datos
    const insertQuery = `
        INSERT INTO carrito_cont (idcarrito, cod_interno, codigo_barra, cantidad, precio)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        cantidad = cantidad + VALUES(cantidad);
    `;

    db.query(insertQuery, [id_cliente, cod_interno, codigo_barra, cantidad, precio], (err, result) => {
        if (err) {
            console.error('Error añadiendo al carrito:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Producto añadido al carrito' });
    });
};

const obtenerCarrito = (req, res) => {
    const { id_cliente } = req.query;

    // Si no hay cliente, devolver carrito de sesión
    if (!id_cliente) {
        return res.json(req.session.cart || []);
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
        WHERE cc.idcarrito = ?;
    `;

    db.query(query, [id_cliente], (err, results) => {
        if (err) {
            console.error('Error obteniendo carrito:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
};

// CALCULAR ENVÍO (mantener igual)
let storeCoordinates = { lat: 0, lng: 0 };

const getStoreCoordinates = async () => {
    const address = process.env.STORE_ADDRESS;
    try {
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${process.env.OPENCAGE_API_KEY}`);
        if (response.data.results.length === 0) {
            console.error('Dirección de la tienda no válida');
            return;
        }
        const { lat, lng } = response.data.results[0].geometry;
        storeCoordinates = { lat, lng };
        console.log('Coordenadas de la tienda obtenidas:', storeCoordinates);
    } catch (error) {
        console.error('Error al obtener las coordenadas de la tienda:', error);
    }
};

getStoreCoordinates();

const calculateShipping = async (req, res) => {
    const { address } = req.body;

    try {
        const encodedAddress = encodeURIComponent(address);
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${encodedAddress}&key=${process.env.OPENCAGE_API_KEY}`);

        if (response.data.results.length === 0) {
            return res.status(400).json({ message: 'Dirección no válida' });
        }

        const validResults = response.data.results.map(result => {
            const { lat, lng } = result.geometry;
            const distance = getDistanceFromLatLonInKm(storeCoordinates.lat, storeCoordinates.lng, lat, lng);
            const shippingCost = calculateShippingCost(distance);
            return {
                formatted: result.formatted,
                distance,
                shippingCost
            };
        });

        res.json({ results: validResults });
    } catch (error) {
        console.error('Error al calcular el envío:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distancia en km
    return Math.round(d * 100) / 100; // Redondear a 2 decimales
};

const deg2rad = (deg) => {
    return deg * (Math.PI/180);
};

const calculateShippingCost = (distance) => {
    const baseCost = parseFloat(process.env.STORE_DELIVERY_BASE) || 500; // Base por defecto
    const costPerKm = parseFloat(process.env.STORE_DELIVERY_KM) || 100; // Por km por defecto
    
    // Costo mínimo para distancias muy cortas
    const minCost = baseCost;
    const calculatedCost = baseCost + (distance * costPerKm);
    
    return Math.max(minCost, calculatedCost);
};



// MERCADOPAGO (mantener igual)
const client = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const createPreferenceORIGINAL = async (req, res) => {
    const nombreTienda = process.env.STORE_NAME || 'Mi Tienda';
    
    try {
        const body = {
            items: [
                {
                    title: `Pedido de ${nombreTienda}`,
                    quantity: 1,
                    unit_price: Number(req.body.total),
                    currency_id: "ARS"
                }
            ],
            // ✅ URLs FIJAS Y CORRECTAS
            back_urls: {
                success: "http://localhost:3000/confirmacion",
                failure: "http://localhost:3000/confirmacion", 
                pending: "http://localhost:3000/confirmacion"
            },
            auto_return: "approved",
            // Configuraciones adicionales
            payment_methods: {
                excluded_payment_methods: [],
                excluded_payment_types: [],
                installments: 12
            }
        };

        console.log('🏪 Creando preferencia para:', nombreTienda);
        console.log('💰 Total:', req.body.total);
        console.log('🔗 URLs de retorno:', body.back_urls);

        const preference = new mercadopago.Preference(client);
        const result = await preference.create({ body });
        
        console.log('✅ Preferencia creada exitosamente:', result.id);
        
        res.json({ 
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });
        
    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        
        res.status(500).json({ 
            error: "Error al crear la preferencia",
            details: error.message
        });
    }
};

const createPreference = async (req, res) => {
    const nombreTienda = process.env.STORE_NAME || 'Mi Tienda';
    
    try {
        const body = {
            items: [
                {
                    title: `Pedido de ${nombreTienda}`,
                    quantity: 1,
                    unit_price: Number(req.body.total),
                    currency_id: "ARS"
                }
            ],
            // ✅ URLs sin auto_return (déjalo que maneje MercadoPago)
            back_urls: {
                success: "http://localhost:3000/confirmacion",
                failure: "http://localhost:3000/confirmacion", 
                pending: "http://localhost:3000/confirmacion"
            }
            // ⭐ QUITAR auto_return completamente
        };

        console.log('🏪 Creando preferencia para:', nombreTienda);
        console.log('💰 Total:', req.body.total);

        const preference = new mercadopago.Preference(client);
        const result = await preference.create({ body });
        
        console.log('✅ Preferencia creada exitosamente:', result.id);
        
        res.json({ 
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });
        
    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        res.status(500).json({ 
            error: "Error al crear la preferencia",
            details: error.message
        });
    }
};


// VARIABLES DE ENTORNO (mantener igual)
const variablesEnv = (req, res) => {
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
        pageStatus: process.env.PAGE_STATUS,
        userName: process.env.USER_NAME,
        password: process.env.PASSWORD,
        sessionSecret: process.env.SESSION_SECRET,
        openCageApiKey: process.env.OPENCAGE_API_KEY,
        mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    };
    res.json(config);
};

// EMAIL (mantener igual)
const MailPedidoRealizado = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;

    let htmlTemplate = fs.readFileSync(path.join(__dirname, '../resources/email_template/pedido_realizado.html'), 'utf8');

    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `<tr>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.name}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.quantity}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                $${item.price}
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
            user: 'faausc@gmail.com',
            pass: 'qkbjcnmfgxoljgln'
        },
        tls: {
            rejectUnauthorized: false,
        }
    });

    await transporter.sendMail({
        from: storeName + ' - ' + storeMail,
        to: clientMail,
        subject: 'Pedido realizado con éxito!',
        html: htmlTemplate,
        attachments: [
            {
                filename: 'logo.jpg',
                path: path.join(__dirname, '../resources/img/logo.jpg'),
                cid: 'logo'
            }
        ]
    });
};

// GESTIÓN DE PEDIDOS MEJORADA
const insertarPedido = (pedidoData, callback) => {
    const { cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local } = pedidoData;

    const insertPedidoQuery = `
        INSERT INTO pedidos 
        (fecha, cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local) 
        VALUES 
        (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const pedidoValues = [cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local];

    db.query(insertPedidoQuery, pedidoValues, (err, result) => {
        if (err) {
            console.error('Error al insertar el pedido:', err);
            return callback(err);
        }
        callback(null, result.insertId);
    });
};

const insertarProductos = (pedidoId, productos, callback) => {
    if (!productos || productos.length === 0) {
        return callback(new Error('No hay productos para insertar'));
    }

    const insertProductoQuery = `
        INSERT INTO pedidos_contenido (id_pedido, codigo_barra, nombre_producto, cantidad, precio) 
        VALUES ?
    `;

    const productosValues = productos.map(producto => [
        pedidoId,
        producto.codigo_barra,
        producto.nombre_producto,
        producto.cantidad,
        producto.precio
    ]);

    db.query(insertProductoQuery, [productosValues], (err, result) => {
        if (err) {
            console.error('Error al insertar los productos del pedido:', err);
            return callback(err);
        }
        callback(null);
    });
};

const nuevoPedido = (req, res) => {
    const { cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local, productos } = req.body;

    // Validaciones básicas
    if (!cliente || !direccion_cliente || !telefono_cliente || !email_cliente || !productos || productos.length === 0) {
        return res.status(400).json({ success: false, message: 'Datos incompletos del pedido' });
    }

    insertarPedido({
        cliente,
        direccion_cliente,
        telefono_cliente,
        email_cliente,
        cantidad_productos,
        monto_total,
        costo_envio,
        medio_pago: medio_pago || 'No especificado',
        estado: estado || 'pendiente',
        notas_local
    }, (err, pedidoId) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al insertar el pedido', error: err.message });
        }

        insertarProductos(pedidoId, productos, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al insertar los productos del pedido', error: err.message });
            }

            res.json({ 
                success: true, 
                message: 'Pedido y productos insertados correctamente',
                pedido_id: pedidoId
            });
        });
    });
};

// GESTIÓN DE IMÁGENES (mantener igual pero mejorar)
const publicidadPath = path.join(__dirname, "../resources/publicidad");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, publicidadPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});
const upload = multer({ storage });

const getImagenesPublicidad = (req, res) => {
    fs.readdir(publicidadPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "No se pueden obtener las imágenes" });
        }
        const imagenes = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
                            .map(file => `/publicidad/${file}`);
        res.json(imagenes);
    });
};

const subirImagenPublicidad = (req, res) => {
    upload.single("imagen")(req, res, (err) => {
        if (err) {
            return res.status(500).json({ error: "Error al subir la imagen" });
        }
        res.json({ message: "Imagen subida correctamente", url: `/publicidad/${req.file.filename}` });
    });
};

const eliminarImagenPublicidad = (req, res) => {
    const nombreImagen = req.params.nombreImagen;
    const rutaImagen = path.join(publicidadPath, nombreImagen);

    fs.unlink(rutaImagen, (err) => {
        if (err) {
            return res.status(500).json({ error: "No se pudo eliminar la imagen" });
        }
        res.json({ message: "Imagen eliminada correctamente" });
    });
};

const storageImg = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../resources/img_art"));
    },
    filename: (req, file, cb) => {
        const codigo_barra = req.body.codigo_barra;
        cb(null, `${codigo_barra}${path.extname(file.originalname)}`);
    }
});
const uploadImg = multer({ storage: storageImg }).single("imagen");

const verificarImagenArticulo = (req, res) => {
    const codigo_barra = req.body.codigo_barra;
    const imagePath = path.join(__dirname, `../resources/img_art/${codigo_barra}.jpg`);

    fs.access(imagePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.json({ existe: false });
        }
        res.json({ existe: true });
    });
};

const subirImagenArticulo = (req, res) => {
    uploadImg(req, res, (err) => {
        if (err) {
            return res.status(500).json({ error: "Error al subir la imagen" });
        }

        if (!req.body.codigo_barra) {
            return res.status(400).json({ error: "Código de barra no recibido en el servidor" });
        }
        res.json({ mensaje: "Imagen subida correctamente" });
    });
};

// NUEVAS FUNCIONES PARA GESTIÓN DE OFERTAS Y DESTACADOS
const gestionarOfertasDestacados = (req, res) => {
    const { codigo_barra, precio, precio_desc, categoria, fecha_fin, orden } = req.body;
    
    if (!codigo_barra || !precio || !categoria) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Primero obtener información del artículo
    const getArticuloQuery = `SELECT art_desc_vta FROM articulo WHERE CODIGO_BARRA = ?`;
    
    db.query(getArticuloQuery, [codigo_barra], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }

        const art_desc_vta = results[0].art_desc_vta;

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

        db.query(insertQuery, [codigo_barra, art_desc_vta, precio, precio_desc, categoria, fecha_fin, orden || 0], (err, result) => {
            if (err) {
                console.error('Error al gestionar oferta/destacado:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            res.json({ success: true, message: 'Oferta/Destacado gestionado correctamente' });
        });
    });
};

const obtenerOfertasDestacados = (req, res) => {
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

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error obteniendo ofertas/destacados:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
};

const eliminarOfertaDestacado = (req, res) => {
    const { id } = req.params;
    
    const query = `UPDATE articulo_temp SET activo = 0 WHERE id = ?`;
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error eliminando oferta/destacado:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Oferta/Destacado eliminado correctamente' });
    });
};



const searchAddresses = async (req, res) => {
    const { query, country = 'ar', limit = 5 } = req.body;

    if (!query || query.length < 3) {
        return res.status(400).json({ 
            message: 'Query debe tener al menos 3 caracteres',
            results: []
        });
    }

    try {
        // Usar OpenCage Geosearch para autocompletado (no Geocoding)
        const geosearchUrl = `https://api.opencagedata.com/geosearch/v1/json`;
        
        const params = new URLSearchParams({
            q: query,
            key: process.env.OPENCAGE_API_KEY,
            limit: limit,
            countrycode: country,
            language: 'es',
            // Agregar bias hacia Argentina/Córdoba
            proximity: '-31.4201,-64.1888', // Coordenadas de Córdoba
            min_confidence: 3 // Mínima confianza para resultados
        });

        const response = await axios.get(`${geosearchUrl}?${params}`);
        
        if (response.data.results && response.data.results.length > 0) {
            // Procesar resultados y calcular costo de envío
            const processedResults = await Promise.all(
                response.data.results.map(async (result) => {
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
                        components: result.components
                    };
                })
            );

            res.json({ 
                results: processedResults,
                success: true
            });
        } else {
            // Si no hay resultados con geosearch, intentar con geocoding como fallback
            const fallbackResults = await fallbackGeocodingSearch(query);
            res.json({ 
                results: fallbackResults,
                success: true,
                fallback: true
            });
        }
    } catch (error) {
        console.error('Error en búsqueda de direcciones:', error);
        
        // Fallback si falla geosearch
        try {
            const fallbackResults = await fallbackGeocodingSearch(query);
            res.json({ 
                results: fallbackResults,
                success: true,
                fallback: true
            });
        } catch (fallbackError) {
            console.error('Error en fallback:', fallbackError);
            res.status(500).json({ 
                message: 'Error al buscar direcciones',
                results: []
            });
        }
    }
};



const fallbackGeocodingSearch = async (query) => {
    try {
        // Mejorar el query para geocoding
        const enhancedQuery = enhanceAddressQuery(query);
        
        const response = await axios.get(
            `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(enhancedQuery)}&key=${process.env.OPENCAGE_API_KEY}&countrycode=ar&language=es&limit=5`
        );

        if (response.data.results && response.data.results.length > 0) {
            return response.data.results.map(result => {
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
                    components: result.components
                };
            });
        }
        
        return [];
    } catch (error) {
        console.error('Error en fallback geocoding:', error);
        return [];
    }
};

const enhanceAddressQuery = (query) => {
    let enhanced = query.toLowerCase().trim();
    
    // Mapeo de abreviaciones comunes
    const commonAbbreviations = {
        'av': 'avenida',
        'av.': 'avenida',
        'ave': 'avenida',
        'st': 'street',
        'st.': 'street',
        'blvd': 'boulevard',
        'blvd.': 'boulevard'
    };
    
    // Reemplazar abreviaciones
    Object.keys(commonAbbreviations).forEach(abbr => {
        const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
        enhanced = enhanced.replace(regex, commonAbbreviations[abbr]);
    });
    
    // Si no contiene "córdoba" o "argentina", agregarlos
    if (!enhanced.includes('córdoba') && !enhanced.includes('cordoba')) {
        enhanced += ', córdoba';
    }
    
    if (!enhanced.includes('argentina')) {
        enhanced += ', argentina';
    }
    
    return enhanced;
};




// Cache en memoria para evitar verificaciones repetidas
const imageCache = new Map();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutos

const getProductImage = async (req, res) => {
    const { codigo_barra } = req.params;
    
    if (!codigo_barra) {
        return res.status(400).json({ error: 'Código de barra requerido' });
    }

    // Verificar cache
    const cacheKey = `image_${codigo_barra}`;
    const cached = imageCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return res.json({
            success: true,
            imageUrl: cached.url,
            source: cached.source,
            fromCache: true
        });
    }

    try {
        // 1. PRIMERA OPCIÓN: Verificar imagen externa (web)
        const externalUrl = `https://www.rsoftware.com.ar/imgart/${codigo_barra}.png`;
        const externalExists = await checkImageExists(externalUrl);
        
        if (externalExists) {
            // Guardar en cache
            imageCache.set(cacheKey, {
                url: externalUrl,
                source: 'external',
                timestamp: Date.now()
            });
            
            return res.json({
                success: true,
                imageUrl: externalUrl,
                source: 'external'
            });
        }

        // 2. SEGUNDA OPCIÓN: Verificar imagen en almacenamiento interno
        const internalImagePath = path.join(__dirname, '../resources/img_art', `${codigo_barra}.png`);
        const internalImageJpgPath = path.join(__dirname, '../resources/img_art', `${codigo_barra}.jpg`);
        
        // Verificar si existe PNG o JPG en almacenamiento interno
        let internalUrl = null;
        if (fs.existsSync(internalImagePath)) {
            internalUrl = `/images/products/${codigo_barra}.png`;
        } else if (fs.existsSync(internalImageJpgPath)) {
            internalUrl = `/images/products/${codigo_barra}.jpg`;
        }
        
        if (internalUrl) {
            // Construir URL completa para el frontend
            // Usar la URL base del servidor, no NEXT_PUBLIC_API_URL
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const fullInternalUrl = `${baseUrl}${internalUrl}`;
            
            // Guardar en cache
            imageCache.set(cacheKey, {
                url: fullInternalUrl,
                source: 'internal',
                timestamp: Date.now()
            });
            
            return res.json({
                success: true,
                imageUrl: fullInternalUrl,
                source: 'internal'
            });
        }

        // 3. TERCERA OPCIÓN: Imagen genérica (placeholder)
        // Construir URL completa para el placeholder también
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const placeholderUrl = `${baseUrl}/images/placeholder.png`;
        
        // Guardar en cache (con menos tiempo para placeholders)
        imageCache.set(cacheKey, {
            url: placeholderUrl,
            source: 'placeholder',
            timestamp: Date.now()
        });
        
        return res.json({
            success: true,
            imageUrl: placeholderUrl,
            source: 'placeholder'
        });

    } catch (error) {
        console.error('Error getting product image:', error);
        
        // En caso de error, devolver placeholder con URL completa
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const placeholderUrl = `${baseUrl}/images/placeholder.png`;
        
        return res.json({
            success: true,
            imageUrl: placeholderUrl,
            source: 'placeholder',
            error: 'Error retrieving image'
        });
    }
};

// Función helper para verificar si una imagen externa existe
const checkImageExists = async (url) => {
    try {
        const response = await axios.head(url, {
            timeout: 5000, // 5 segundos timeout
            validateStatus: function (status) {
                return status === 200;
            }
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
};

// Función para limpiar cache (opcional, para mantenimiento)
const clearImageCache = (req, res) => {
    imageCache.clear();
    res.json({ 
        success: true, 
        message: 'Cache de imágenes limpiado',
        timestamp: new Date().toISOString()
    });
};

// Función para obtener estadísticas del cache (opcional, para debug)
const getImageCacheStats = (req, res) => {
    const stats = {
        totalCached: imageCache.size,
        cacheEntries: [],
        cacheSize: imageCache.size
    };

    // Solo en desarrollo, mostrar entradas del cache
    if (process.env.NODE_ENV === 'development') {
        imageCache.forEach((value, key) => {
            stats.cacheEntries.push({
                key,
                source: value.source,
                timestamp: new Date(value.timestamp).toISOString(),
                age: Date.now() - value.timestamp
            });
        });
    }

    res.json(stats);
};

// Función para servir imágenes internas directamente
const serveInternalImage = (req, res) => {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, '../resources/img_art', filename);
    
    // Verificar que el archivo existe y es una imagen
    if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Verificar extensión
    const ext = path.extname(filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        return res.status(400).json({ error: 'Formato de imagen no válido' });
    }

    // Configurar headers apropiados
    const contentType = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }[ext] || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año

    // Enviar la imagen
    const imageStream = fs.createReadStream(imagePath);
    imageStream.pipe(res);
};



module.exports = {
    articulosOferta,
    articulosDestacados,
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
    getImagenesPublicidad,
    subirImagenPublicidad,
    eliminarImagenPublicidad,
    verificarImagenArticulo,
    subirImagenArticulo,
    gestionarOfertasDestacados,
    obtenerOfertasDestacados,
    eliminarOfertaDestacado,
    searchAddresses,
    getProductImage,
    clearImageCache,
    getImageCacheStats,
    serveInternalImage
};