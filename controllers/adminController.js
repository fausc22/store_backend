// controllers/adminController.js - VERSIÓN OPTIMIZADA
const { executeQuery, logConnection } = require('./db');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
require('dotenv').config();

// ==============================================
// SISTEMA DE LOGS PARA CONTROLADOR ADMIN
// ==============================================
const logAdmin = (message, level = 'info', operation = 'ADMIN') => {
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

// Wrapper para manejo de errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==============================================
// AUTENTICACIÓN Y CONFIGURACIÓN
// ==============================================

const loginCheck = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const startTime = Date.now();
    
    logAdmin(`Intento de login para usuario: ${username}`, 'info', 'AUTH');
    
    // Validaciones básicas
    if (!username || !password) {
        logAdmin('Login fallido: Credenciales incompletas', 'warn', 'AUTH');
        return res.status(400).json({ 
            message: 'Usuario y contraseña son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const usernameEnv = process.env.USER_NAME;
        const passwordEnv = process.env.PASSWORD;

        if (!usernameEnv || !passwordEnv) {
            logAdmin('Error: Variables de entorno de autenticación no configuradas', 'error', 'AUTH');
            return res.status(500).json({ 
                message: 'Error de configuración del servidor',
                timestamp: new Date().toISOString()
            });
        }

        // Validar credenciales
        if (username !== usernameEnv || password !== passwordEnv) {
            const duration = Date.now() - startTime;
            logAdmin(`Login fallido para ${username} (${duration}ms)`, 'warn', 'AUTH');
            return res.status(401).json({ 
                message: 'Usuario o contraseña incorrectos',
                timestamp: new Date().toISOString()
            });
        }

        const duration = Date.now() - startTime;
        logAdmin(`✅ Login exitoso para ${username} (${duration}ms)`, 'success', 'AUTH');
        
        res.json({ 
            message: 'Login exitoso',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        logAdmin(`❌ Error en login (${duration}ms): ${error.message}`, 'error', 'AUTH');
        res.status(500).json({ 
            message: 'Error interno del servidor',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerConfig = asyncHandler(async (req, res) => {
    logAdmin('Obteniendo configuración del .env', 'info', 'CONFIG');
    
    try {
        const envPath = path.resolve(__dirname, '../.env');
        const envContent = await fs.readFile(envPath, 'utf8');
        const config = dotenv.parse(envContent);

        const response = {
            storeName: config.STORE_NAME,
            storeAddress: config.STORE_ADDRESS,
            storePhone: config.STORE_PHONE,
            storeDescription: config.STORE_DESCRIPTION,
            storeInstagram: config.STORE_INSTAGRAM,
            storeEmail: config.STORE_EMAIL,
            storeDeliveryBase: config.STORE_DELIVERY_BASE,
            storeDeliveryKm: config.STORE_DELIVERY_KM,
            mercadoPagoToken: config.MERCADOPAGO_ACCESS_TOKEN,
            iva: config.IVA,
            pageStatus: config.PAGE_STATUS,
            userName: config.USER_NAME,
            passWord: config.PASSWORD
        };

        logAdmin('✅ Configuración obtenida exitosamente', 'success', 'CONFIG');
        res.json(response);
    } catch (error) {
        logAdmin(`❌ Error obteniendo configuración: ${error.message}`, 'error', 'CONFIG');
        res.status(500).json({ 
            error: 'Error al obtener la configuración',
            timestamp: new Date().toISOString()
        });
    }
});

const saveConfig = asyncHandler(async (req, res) => {
    const config = req.body;
    
    logAdmin('Guardando configuración del .env', 'info', 'CONFIG');
    
    if (!config || Object.keys(config).length === 0) {
        return res.status(400).json({ 
            error: 'Configuración vacía o inválida',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const envPath = path.resolve(__dirname, '../.env');
        const existingContent = await fs.readFile(envPath, 'utf8');
        const existingConfig = dotenv.parse(existingContent);

        // Actualizar solo las variables que están en el request
        const updatedConfig = {
            ...existingConfig,
            ...(config.storeName && { STORE_NAME: config.storeName }),
            ...(config.storeAddress && { STORE_ADDRESS: config.storeAddress }),
            ...(config.storePhone && { STORE_PHONE: config.storePhone }),
            ...(config.storeDescription && { STORE_DESCRIPTION: config.storeDescription }),
            ...(config.storeInstagram && { STORE_INSTAGRAM: config.storeInstagram }),
            ...(config.storeEmail && { STORE_EMAIL: config.storeEmail }),
            ...(config.storeDeliveryBase && { STORE_DELIVERY_BASE: config.storeDeliveryBase }),
            ...(config.storeDeliveryKm && { STORE_DELIVERY_KM: config.storeDeliveryKm }),
            ...(config.mercadoPagoToken && { MERCADOPAGO_ACCESS_TOKEN: config.mercadoPagoToken }),
            ...(config.iva && { IVA: config.iva }),
            ...(config.pageStatus && { PAGE_STATUS: config.pageStatus }),
            ...(config.userName && { USER_NAME: config.userName }),
            ...(config.passWord && { PASSWORD: config.passWord })
        };

        // Crear el contenido del archivo .env
        const updatedContent = Object.keys(updatedConfig)
            .map(key => `${key}=${updatedConfig[key]}`)
            .join('\n');

        await fs.writeFile(envPath, updatedContent, 'utf8');
        
        logAdmin('✅ Configuración guardada exitosamente', 'success', 'CONFIG');
        res.json({ 
            message: 'Configuración guardada exitosamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error guardando configuración: ${error.message}`, 'error', 'CONFIG');
        res.status(500).json({ 
            error: 'Error al guardar la configuración',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// GESTIÓN DE PEDIDOS OPTIMIZADA
// ==============================================

const pedidosPendientes = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo pedidos pendientes', 'info', 'PEDIDOS');
    
    try {
        const query = `
            SELECT 
                id, 
                fecha, 
                cliente, 
                direccion_cliente, 
                telefono_cliente, 
                email_cliente, 
                cantidad_productos, 
                monto_total,
                costo_envio, 
                medio_pago, 
                estado,
                notas_local
            FROM pedidos 
            WHERE estado IN ('PENDIENTE', 'En proceso') 
            ORDER BY fecha DESC
        `;

        const results = await executeQuery(query, [], 'PEDIDOS_PENDIENTES');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} pedidos pendientes obtenidos (${duration}ms)`, 'success', 'PEDIDOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo pedidos pendientes: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al obtener los pedidos pendientes',
            timestamp: new Date().toISOString()
        });
    }
});

const pedidosEntregados = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo pedidos entregados', 'info', 'PEDIDOS');
    
    try {
        const query = `
            SELECT 
                id, 
                fecha, 
                cliente, 
                direccion_cliente, 
                telefono_cliente, 
                email_cliente, 
                cantidad_productos, 
                monto_total,
                costo_envio, 
                medio_pago, 
                estado,
                notas_local
            FROM pedidos 
            WHERE estado = 'ENTREGADO'
            ORDER BY fecha DESC
        `;

        const results = await executeQuery(query, [], 'PEDIDOS_ENTREGADOS');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} pedidos entregados obtenidos (${duration}ms)`, 'success', 'PEDIDOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo pedidos entregados: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al obtener los pedidos entregados',
            timestamp: new Date().toISOString()
        });
    }
});

const productosPedido = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    const startTime = Date.now();
    
    logAdmin(`Obteniendo productos del pedido: ${pedidoId}`, 'info', 'PEDIDOS');
    
    if (!pedidoId || isNaN(pedidoId)) {
        return res.status(400).json({ 
            error: 'ID de pedido inválido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `
            SELECT id, codigo_barra, nombre_producto, cantidad, precio, (cantidad * precio) as subtotal
            FROM pedidos_contenido
            WHERE id_pedido = ?
            ORDER BY id
        `;
        
        const results = await executeQuery(query, [pedidoId], 'PRODUCTOS_PEDIDO');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} productos del pedido ${pedidoId} obtenidos (${duration}ms)`, 'success', 'PEDIDOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo productos del pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al obtener productos del pedido',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarEstadoPedidoProcesado = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    const { estado } = req.body;
    
    logAdmin(`Actualizando estado del pedido ${pedidoId} a: ${estado}`, 'info', 'PEDIDOS');
    
    if (!pedidoId || !estado) {
        return res.status(400).json({ 
            error: 'ID de pedido y estado son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE pedidos SET estado = ? WHERE id = ?`;
        const result = await executeQuery(query, [estado, pedidoId], 'UPDATE_ESTADO_PEDIDO');
        
        if (result.affectedRows === 0) {
            logAdmin(`❌ Pedido ${pedidoId} no encontrado`, 'warn', 'PEDIDOS');
            return res.status(404).json({ 
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Estado del pedido ${pedidoId} actualizado a '${estado}'`, 'success', 'PEDIDOS');
        res.json({ 
            success: true, 
            message: `Estado del pedido actualizado a '${estado}'`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando estado del pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al actualizar el estado del pedido',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarPedido = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    
    logAdmin(`Eliminando pedido: ${pedidoId}`, 'info', 'PEDIDOS');
    
    if (!pedidoId || isNaN(pedidoId)) {
        return res.status(400).json({ 
            error: 'ID de pedido inválido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Primero eliminar productos del pedido
        await executeQuery(
            `DELETE FROM pedidos_contenido WHERE id_pedido = ?`,
            [pedidoId],
            'DELETE_PRODUCTOS_PEDIDO'
        );

        // Luego eliminar el pedido
        const result = await executeQuery(
            `DELETE FROM pedidos WHERE id = ?`,
            [pedidoId],
            'DELETE_PEDIDO'
        );

        if (result.affectedRows === 0) {
            logAdmin(`❌ Pedido ${pedidoId} no encontrado`, 'warn', 'PEDIDOS');
            return res.status(404).json({ 
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Pedido ${pedidoId} eliminado exitosamente`, 'success', 'PEDIDOS');
        res.json({ 
            success: true, 
            message: 'Pedido eliminado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al eliminar el pedido',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// GESTIÓN DE PRODUCTOS OPTIMIZADA
// ==============================================

const buscarProductoEnPedido = asyncHandler(async (req, res) => {
    const searchTerm = req.query.search?.trim() || '';
    const startTime = Date.now();
    
    logAdmin(`Buscando productos: "${searchTerm}"`, 'info', 'PRODUCTOS');
    
    if (searchTerm.length < 2) {
        return res.status(400).json({ 
            error: 'Término de búsqueda debe tener al menos 2 caracteres',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const precioColumn = `PRECIO_SIN_IVA_${parseInt(process.env.IVA) || 0}`;
        
        const query = `
            SELECT 
                art_desc_vta AS nombre, 
                CODIGO_BARRA AS codigo_barra, 
                COSTO AS costo, 
                ${precioColumn} AS precio, 
                COD_DPTO AS categoria,
                STOCK AS stock
            FROM articulo 
            WHERE art_desc_vta LIKE ? 
            AND HABILITADO = 'S'
            ORDER BY art_desc_vta ASC
            LIMIT 50
        `;
        
        const results = await executeQuery(query, [`%${searchTerm}%`], 'BUSCAR_PRODUCTOS');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} productos encontrados para "${searchTerm}" (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error buscando productos "${searchTerm}": ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al buscar productos',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarInfoProducto = asyncHandler(async (req, res) => {
    const productoId = req.params.id;
    const { nombre, costo, precio, precio_sin_iva, precio_sin_iva_4, categoria } = req.body;
    
    logAdmin(`Actualizando producto: ${productoId}`, 'info', 'PRODUCTOS');
    
    if (!productoId || !nombre) {
        return res.status(400).json({ 
            error: 'ID de producto y nombre son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `
            UPDATE articulo 
            SET art_desc_vta = ?, costo = ?, precio = ?, precio_sin_iva = ?, precio_sin_iva_4 = ?, COD_DPTO = ? 
            WHERE CODIGO_BARRA = ?
        `;
        
        const result = await executeQuery(
            query, 
            [nombre, costo, precio, precio_sin_iva, precio_sin_iva_4, categoria, productoId],
            'UPDATE_PRODUCTO'
        );

        if (result.affectedRows === 0) {
            logAdmin(`❌ Producto ${productoId} no encontrado`, 'warn', 'PRODUCTOS');
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Producto ${productoId} actualizado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Producto actualizado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando producto ${productoId}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al actualizar el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarProducto = asyncHandler(async (req, res) => {
    const productoId = req.params.id;
    const { nombre_producto, cantidad, precio } = req.body;

    logAdmin(`Actualizando producto en pedido: ${productoId}`, 'info', 'PRODUCTOS');

    if (!productoId || !nombre_producto || !cantidad || !precio) {
        return res.status(400).json({ 
            error: 'Todos los campos son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE pedidos_contenido SET nombre_producto = ?, cantidad = ?, precio = ? WHERE id = ?`;
        const result = await executeQuery(query, [nombre_producto, cantidad, precio, productoId], 'UPDATE_PRODUCTO_PEDIDO');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Producto en pedido ${productoId} actualizado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Producto actualizado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando producto en pedido ${productoId}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al actualizar el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarPedido = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    const { monto_total, cantidad_productos } = req.body;

    logAdmin(`Actualizando totales del pedido: ${pedidoId}`, 'info', 'PEDIDOS');

    if (!pedidoId || monto_total === undefined || cantidad_productos === undefined) {
        return res.status(400).json({ 
            error: 'ID del pedido, monto total y cantidad de productos son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE pedidos SET monto_total = ?, cantidad_productos = ? WHERE id = ?`;
        const result = await executeQuery(query, [monto_total, cantidad_productos, pedidoId], 'UPDATE_PEDIDO');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Totales del pedido ${pedidoId} actualizados exitosamente`, 'success', 'PEDIDOS');
        res.json({ 
            success: true, 
            message: 'Pedido actualizado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al actualizar el pedido',
            timestamp: new Date().toISOString()
        });
    }
});

const agregarProductoAlPedido = asyncHandler(async (req, res) => {
    const { id_pedido, codigo_barra, nombre_producto, cantidad, precio } = req.body;

    logAdmin(`Agregando producto al pedido: ${id_pedido}`, 'info', 'PEDIDOS');

    if (!id_pedido || !codigo_barra || !nombre_producto || !cantidad || !precio) {
        return res.status(400).json({ 
            error: 'Todos los campos son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Insertar producto
        const insertQuery = `
            INSERT INTO pedidos_contenido (id_pedido, codigo_barra, nombre_producto, cantidad, precio) 
            VALUES (?, ?, ?, ?, ?)
        `;
        
        await executeQuery(insertQuery, [id_pedido, codigo_barra, nombre_producto, cantidad, precio], 'INSERT_PRODUCTO_PEDIDO');

        // Actualizar totales del pedido
        const updateQuery = `
            UPDATE pedidos 
            SET monto_total = (
                SELECT SUM(cantidad * precio) 
                FROM pedidos_contenido 
                WHERE id_pedido = ?
            ),
            cantidad_productos = (
                SELECT SUM(cantidad) 
                FROM pedidos_contenido 
                WHERE id_pedido = ?
            )
            WHERE id = ?
        `;

        await executeQuery(updateQuery, [id_pedido, id_pedido, id_pedido], 'UPDATE_TOTALES_PEDIDO');

        logAdmin(`✅ Producto agregado al pedido ${id_pedido} y totales actualizados`, 'success', 'PEDIDOS');
        res.json({ 
            success: true, 
            message: 'Producto agregado y pedido actualizado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error agregando producto al pedido ${id_pedido}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            error: 'Error al agregar el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarProducto = asyncHandler(async (req, res) => {
    const productoId = req.params.id;

    logAdmin(`Eliminando producto: ${productoId}`, 'info', 'PRODUCTOS');

    if (!productoId || isNaN(productoId)) {
        return res.status(400).json({ 
            error: 'ID de producto inválido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `DELETE FROM pedidos_contenido WHERE id = ?`;
        const result = await executeQuery(query, [productoId], 'DELETE_PRODUCTO');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Producto ${productoId} eliminado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Producto eliminado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando producto ${productoId}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al eliminar el producto',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// GESTIÓN DE OFERTAS Y DESTACADOS OPTIMIZADA
// ==============================================

const articulosOferta = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo artículos en oferta', 'info', 'OFERTAS');
    
    try {
        const query = `
            SELECT CODIGO_BARRA, art_desc_vta AS nombre, PRECIO, PRECIO_DESC 
            FROM articulo_temp 
            WHERE cat = '1' AND activo = 1
            ORDER BY orden, fecha_inicio DESC
        `;
        
        const results = await executeQuery(query, [], 'ARTICULOS_OFERTA');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} artículos en oferta obtenidos (${duration}ms)`, 'success', 'OFERTAS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo artículos en oferta: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error al obtener artículos en oferta',
            timestamp: new Date().toISOString()
        });
    }
});

const articulosDest = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo artículos destacados', 'info', 'DESTACADOS');
    
    try {
        const query = `
            SELECT CODIGO_BARRA, art_desc_vta AS nombre, PRECIO, PRECIO_DESC 
            FROM articulo_temp 
            WHERE cat = '2' AND activo = 1
            ORDER BY orden, fecha_inicio DESC
        `;
        
        const results = await executeQuery(query, [], 'ARTICULOS_DESTACADOS');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} artículos destacados obtenidos (${duration}ms)`, 'success', 'DESTACADOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo artículos destacados: ${error.message}`, 'error', 'DESTACADOS');
        res.status(500).json({ 
            error: 'Error al obtener artículos destacados',
            timestamp: new Date().toISOString()
        });
    }
});

const agregarArticuloOferta = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA, nombre, PRECIO } = req.body;

    logAdmin(`Agregando artículo a ofertas: ${CODIGO_BARRA}`, 'info', 'OFERTAS');

    if (!CODIGO_BARRA || !nombre || !PRECIO) {
        return res.status(400).json({ 
            error: 'Código de barra, nombre y precio son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, 1, 1)
            ON DUPLICATE KEY UPDATE 
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1
        `;

        await executeQuery(query, [CODIGO_BARRA, nombre, PRECIO, PRECIO], 'INSERT_OFERTA');

        logAdmin(`✅ Artículo ${CODIGO_BARRA} agregado a ofertas exitosamente`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Artículo agregado a oferta',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error agregando artículo a ofertas ${CODIGO_BARRA}: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error al agregar artículo a oferta',
            timestamp: new Date().toISOString()
        });
    }
});

const agregarArticuloDest = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA, nombre, PRECIO } = req.body;

    logAdmin(`Agregando artículo a destacados: ${CODIGO_BARRA}`, 'info', 'DESTACADOS');

    if (!CODIGO_BARRA || !nombre || !PRECIO) {
        return res.status(400).json({ 
            error: 'Código de barra, nombre y precio son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, 2, 1)
            ON DUPLICATE KEY UPDATE 
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1
        `;

        await executeQuery(query, [CODIGO_BARRA, nombre, PRECIO, PRECIO], 'INSERT_DESTACADO');

        logAdmin(`✅ Artículo ${CODIGO_BARRA} agregado a destacados exitosamente`, 'success', 'DESTACADOS');
        res.json({ 
            success: true, 
            message: 'Artículo agregado a destacados',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error agregando artículo a destacados ${CODIGO_BARRA}: ${error.message}`, 'error', 'DESTACADOS');
        res.status(500).json({ 
            error: 'Error al agregar artículo a destacados',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarPrecioOferta = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA, PRECIO_DESC } = req.body;

    logAdmin(`Actualizando precio de oferta: ${CODIGO_BARRA}`, 'info', 'OFERTAS');

    if (!CODIGO_BARRA || !PRECIO_DESC) {
        return res.status(400).json({ 
            error: 'Código de barra y precio de descuento son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE articulo_temp SET PRECIO_DESC = ? WHERE CODIGO_BARRA = ? AND cat = '1'`;
        const result = await executeQuery(query, [PRECIO_DESC, CODIGO_BARRA], 'UPDATE_PRECIO_OFERTA');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Artículo en oferta no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Precio de oferta actualizado para ${CODIGO_BARRA}`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Precio de oferta actualizado',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando precio de oferta ${CODIGO_BARRA}: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error al actualizar precio de oferta',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarArticuloOferta = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA } = req.params;

    logAdmin(`Eliminando artículo de ofertas: ${CODIGO_BARRA}`, 'info', 'OFERTAS');

    if (!CODIGO_BARRA) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE articulo_temp SET activo = 0 WHERE CODIGO_BARRA = ? AND cat = '1'`;
        const result = await executeQuery(query, [CODIGO_BARRA], 'DELETE_OFERTA');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Artículo en oferta no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Artículo ${CODIGO_BARRA} eliminado de ofertas exitosamente`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Artículo eliminado de oferta',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando artículo de ofertas ${CODIGO_BARRA}: ${error.message}`, 'error', 'OFERTAS');
        res.status(500).json({ 
            error: 'Error al eliminar artículo de oferta',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarArticuloDest = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA } = req.params;

    logAdmin(`Eliminando artículo de destacados: ${CODIGO_BARRA}`, 'info', 'DESTACADOS');

    if (!CODIGO_BARRA) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE articulo_temp SET activo = 0 WHERE CODIGO_BARRA = ? AND cat = '2'`;
        const result = await executeQuery(query, [CODIGO_BARRA], 'DELETE_DESTACADO');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Artículo destacado no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Artículo ${CODIGO_BARRA} eliminado de destacados exitosamente`, 'success', 'DESTACADOS');
        res.json({ 
            success: true, 
            message: 'Artículo eliminado de destacados',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando artículo de destacados ${CODIGO_BARRA}: ${error.message}`, 'error', 'DESTACADOS');
        res.status(500).json({ 
            error: 'Error al eliminar artículo de destacados',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// SISTEMA DE EMAILS OPTIMIZADO
// ==============================================

// Configuración centralizada del transportador de email
let emailTransporter = null;

const getEmailTransporter = () => {
    if (!emailTransporter) {
        emailTransporter = nodemailer.createTransporter({
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
    }
    return emailTransporter;
};

const MailPedidoProcesado = asyncHandler(async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;
    
    logAdmin(`Enviando email de pedido procesado a: ${clientMail}`, 'info', 'EMAIL');

    if (!clientMail || !name || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
            error: 'Datos incompletos para envío de email',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const templatePath = path.join(__dirname, '../resources/email_template/pedido_confirmado.html');
        let htmlTemplate = await fs.readFile(templatePath, 'utf8');

        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.name || item.nombre_producto}
                </td>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.quantity || item.cantidad}
                </td>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.price || item.precio}
                </td>
            </tr>`;
        });

        htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName || 'PuntoSur')
                                   .replace(/{{name}}/g, name)
                                   .replace(/{{items}}/g, itemsHtml)
                                   .replace(/{{subtotal}}/g, subtotal || 0)
                                   .replace(/{{shippingCost}}/g, shippingCost || 0)
                                   .replace(/{{total}}/g, total || 0)
                                   .replace(/{{storeMail}}/g, storeMail || process.env.STORE_EMAIL)
                                   .replace(/{{storePhone}}/g, storePhone || process.env.STORE_PHONE);

        const transporter = getEmailTransporter();
        const logoPath = path.join(__dirname, '../resources/img/logo.jpg');

        await transporter.sendMail({
            from: `${storeName || 'PuntoSur'} <${storeMail || process.env.STORE_EMAIL}>`,
            to: clientMail,
            subject: 'Pedido confirmado con éxito!',
            html: htmlTemplate,
            attachments: [
                {
                    filename: 'logo.jpg',
                    path: logoPath,
                    cid: 'logo'
                }
            ]
        });

        logAdmin(`✅ Email de pedido procesado enviado a: ${clientMail}`, 'success', 'EMAIL');
        res.json({ 
            success: true, 
            message: 'Email enviado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error enviando email a ${clientMail}: ${error.message}`, 'error', 'EMAIL');
        res.status(500).json({ 
            error: 'Error al enviar email de confirmación',
            timestamp: new Date().toISOString()
        });
    }
});

const MailPedidoEnCamino = asyncHandler(async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone, desde, hasta } = req.body;
    
    logAdmin(`Enviando email de pedido en camino a: ${clientMail}`, 'info', 'EMAIL');

    if (!clientMail || !name || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
            error: 'Datos incompletos para envío de email',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const templatePath = path.join(__dirname, '../resources/email_template/pedido_camino.html');
        let htmlTemplate = await fs.readFile(templatePath, 'utf8');

        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.name || item.nombre_producto}
                </td>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.quantity || item.cantidad}
                </td>
                <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                    ${item.price || item.precio}
                </td>
            </tr>`;
        });

        htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName || 'PuntoSur')
                                   .replace(/{{name}}/g, name)
                                   .replace(/{{items}}/g, itemsHtml)
                                   .replace(/{{subtotal}}/g, subtotal || 0)
                                   .replace(/{{shippingCost}}/g, shippingCost || 0)
                                   .replace(/{{total}}/g, total || 0)
                                   .replace(/{{storeMail}}/g, storeMail || process.env.STORE_EMAIL)
                                   .replace(/{{storePhone}}/g, storePhone || process.env.STORE_PHONE)
                                   .replace(/{{horarioInicio}}/g, desde || '9:00')
                                   .replace(/{{horarioFin}}/g, hasta || '18:00');

        const transporter = getEmailTransporter();
        const logoPath = path.join(__dirname, '../resources/img/logo.jpg');

        await transporter.sendMail({
            from: `${storeName || 'PuntoSur'} <${storeMail || process.env.STORE_EMAIL}>`,
            to: clientMail,
            subject: 'Tu pedido está en camino!',
            html: htmlTemplate,
            attachments: [
                {
                    filename: 'logo.jpg',
                    path: logoPath,
                    cid: 'logo'
                }
            ]
        });

        logAdmin(`✅ Email de pedido en camino enviado a: ${clientMail}`, 'success', 'EMAIL');
        res.json({ 
            success: true, 
            message: 'Email enviado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error enviando email de pedido en camino a ${clientMail}: ${error.message}`, 'error', 'EMAIL');
        res.status(500).json({ 
            error: 'Error al enviar email de pedido en camino',
            timestamp: new Date().toISOString()
        });
    }
});

// Alias para compatibilidad
const actualizarEstadoPedidoEnCamino = actualizarEstadoPedidoProcesado;

// ==============================================
// ESTADÍSTICAS OPTIMIZADAS
// ==============================================

const getWhereClause = (fechaInicio, fechaFin) => {
    if (fechaInicio && fechaFin) {
        return `WHERE p.fecha BETWEEN ? AND ?`;
    }
    return "";
};

const obtenerStats = asyncHandler(async (req, res) => {
    const { fechaInicio, fechaFin } = req.query;
    const startTime = Date.now();
    
    logAdmin(`Obteniendo estadísticas - Fechas: ${fechaInicio || 'sin inicio'} a ${fechaFin || 'sin fin'}`, 'info', 'STATS');

    try {
        const whereClause = getWhereClause(fechaInicio, fechaFin);
        const dateParams = fechaInicio && fechaFin ? [fechaInicio, fechaFin] : [];

        // Ejecutar todas las consultas en paralelo para mejor rendimiento
        const [
            ingresosResult,
            productosMasVendidos,
            clientesTop,
            ventasPorCiudad,
            ventasPorMes
        ] = await Promise.all([
            // Ingresos totales
            executeQuery(
                `SELECT COALESCE(SUM(monto_total), 0) as total FROM pedidos p ${whereClause}`,
                dateParams,
                'STATS_INGRESOS'
            ),
            // Productos más vendidos
            executeQuery(
                `SELECT pc.nombre_producto, SUM(pc.cantidad) as cantidad 
                 FROM pedidos_contenido pc 
                 JOIN pedidos p ON pc.id_pedido = p.id
                 ${whereClause}
                 GROUP BY pc.nombre_producto
                 ORDER BY cantidad DESC 
                 LIMIT 5`,
                dateParams,
                'STATS_PRODUCTOS'
            ),
            // Clientes top
            executeQuery(
                `SELECT p.cliente, COUNT(*) as total_pedidos, SUM(p.monto_total) as total_gastado
                 FROM pedidos p 
                 ${whereClause}
                 GROUP BY p.cliente 
                 ORDER BY total_gastado DESC 
                 LIMIT 5`,
                dateParams,
                'STATS_CLIENTES'
            ),
            // Ventas por ciudad (usando dirección como aproximación)
            executeQuery(
                `SELECT p.direccion_cliente, COUNT(*) as pedidos, SUM(p.monto_total) as total 
                 FROM pedidos p 
                 ${whereClause}
                 GROUP BY p.direccion_cliente
                 ORDER BY total DESC
                 LIMIT 10`,
                dateParams,
                'STATS_CIUDADES'
            ),
            // Ventas por mes
            executeQuery(
                `SELECT DATE_FORMAT(p.fecha, '%Y-%m') as mes, 
                        COUNT(*) as pedidos,
                        SUM(p.monto_total) as total 
                 FROM pedidos p 
                 ${whereClause}
                 GROUP BY mes
                 ORDER BY mes ASC`,
                dateParams,
                'STATS_MESES'
            )
        ]);

        const stats = {
            ingresos: ingresosResult[0]?.total || 0,
            productosMasVendidos: productosMasVendidos || [],
            clientesTop: clientesTop || [],
            ventasPorCiudad: ventasPorCiudad || [],
            ventasPorMes: ventasPorMes || [],
            periodo: {
                fechaInicio: fechaInicio || 'Sin límite',
                fechaFin: fechaFin || 'Sin límite'
            }
        };

        const duration = Date.now() - startTime;
        logAdmin(`✅ Estadísticas obtenidas exitosamente (${duration}ms)`, 'success', 'STATS');
        
        res.json(stats);
    } catch (error) {
        logAdmin(`❌ Error obteniendo estadísticas: ${error.message}`, 'error', 'STATS');
        res.status(500).json({ 
            error: 'Error al obtener estadísticas',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// FUNCIÓN DE VARIABLES DE ENTORNO
// ==============================================

const variablesEnv = (req, res) => {
    logAdmin('Obteniendo variables de entorno para admin', 'info', 'CONFIG');
    
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
    
    logAdmin('✅ Variables de entorno para admin enviadas', 'success', 'CONFIG');
    res.json(config);
};

// Función legacy para compatibilidad
const login = loginCheck;

// ==============================================
// EXPORTAR TODOS LOS CONTROLADORES
// ==============================================

module.exports = {
    // Autenticación y configuración
    loginCheck,
    login, // Alias para compatibilidad
    obtenerConfig,
    saveConfig,
    variablesEnv,
    
    // Gestión de pedidos
    pedidosPendientes,
    pedidosEntregados,
    productosPedido,
    actualizarEstadoPedidoProcesado,
    actualizarEstadoPedidoEnCamino,
    eliminarPedido,
    actualizarPedido,
    agregarProductoAlPedido,
    
    // Gestión de productos
    buscarProductoEnPedido,
    actualizarInfoProducto,
    actualizarProducto,
    eliminarProducto,
    
    // Gestión de ofertas y destacados
    articulosOferta,
    articulosDest,
    agregarArticuloOferta,
    agregarArticuloDest,
    actualizarPrecioOferta,
    eliminarArticuloOferta,
    eliminarArticuloDest,
    
    // Sistema de emails
    MailPedidoProcesado,
    MailPedidoEnCamino,
    
    // Estadísticas
    obtenerStats
};