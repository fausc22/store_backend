// controllers/adminController.js - VERSIÓN CORREGIDA PARA BD
const { executeQuery, logConnection, pool } = require('./dbPS');
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


const getParametersFromPath = (req) => {
    // Para búsqueda simple
    const searchTerm = req.params.searchTerm || '';
    
    // Para filtros complejos (si usas JSON encoded en el futuro)
    let filtros = {};
    if (req.params.filtrosEncoded) {
        try {
            filtros = JSON.parse(decodeURIComponent(req.params.filtrosEncoded));
        } catch (error) {
            console.warn('Error parseando filtros:', error);
        }
    }
    
    return {
        searchTerm: searchTerm.trim(),
        ...filtros
    };
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
// GESTIÓN DE PEDIDOS OPTIMIZADA - CORREGIDA
// ==============================================

const pedidosPendientes = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo pedidos pendientes', 'info', 'PEDIDOS');
    
    try {
        const query = `
            SELECT 
                id_pedido, 
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
            WHERE estado IN ('pendiente', 'confirmado') 
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

const pedidosPendientesCheck = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Consulta optimizada solo para checkeo - campos mínimos
        const query = `
            SELECT 
                id_pedido, 
                fecha, 
                cliente, 
                cantidad_productos, 
                monto_total,
                telefono_cliente,
                estado
            FROM pedidos 
            WHERE estado IN ('pendiente', 'confirmado') 
            ORDER BY fecha DESC
            LIMIT 50
        `;

        const results = await executeQuery(query, [], 'PEDIDOS_CHECK');
        
        const duration = Date.now() - startTime;
        console.log(`✅ Check de pedidos completado (${duration}ms) - ${results.length} pedidos`);
        
        res.json(results);
    } catch (error) {
        console.error(`❌ Error en check de pedidos: ${error.message}`);
        res.status(500).json({ 
            error: 'Error al verificar pedidos',
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
                id_pedido, 
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
            WHERE estado = 'entregado'
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
            success: false,
            error: 'ID de pedido inválido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Query mejorada que incluye stock actual del producto
        const query = `
            SELECT 
                pc.id, 
                pc.codigo_barra, 
                pc.cod_interno, 
                pc.nombre_producto, 
                pc.cantidad, 
                pc.precio, 
                pc.subtotal,
                COALESCE(a.STOCK, 0) as stock_actual,
                p.estado as estado_pedido
            FROM pedidos_contenido pc
            JOIN pedidos p ON pc.id_pedido = p.id_pedido
            LEFT JOIN articulo a ON pc.codigo_barra = a.CODIGO_BARRA
            WHERE pc.id_pedido = ?
            ORDER BY pc.id ASC
        `;
        
        const results = await executeQuery(query, [pedidoId], 'PRODUCTOS_PEDIDO_MEJORADO');
        
        const duration = Date.now() - startTime;
        
        const response = {
            success: true,
            data: results,
            meta: {
                pedido_id: pedidoId,
                total_productos: results.length,
                estado_pedido: results.length > 0 ? results[0].estado_pedido : null,
                total_cantidad: results.reduce((sum, p) => sum + (parseInt(p.cantidad) || 0), 0),
                total_monto: results.reduce((sum, p) => sum + (parseFloat(p.subtotal) || 0), 0)
            },
            timestamp: new Date().toISOString()
        };
        
        logAdmin(`✅ ${results.length} productos del pedido ${pedidoId} obtenidos (${duration}ms)`, 'success', 'PEDIDOS');
        res.json(response);
        
    } catch (error) {
        logAdmin(`❌ Error obteniendo productos del pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener productos del pedido',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarEstadoPedidoProcesado = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    const { estado, notas } = req.body;
    
    logAdmin(`Actualizando estado del pedido ${pedidoId} a: ${estado}`, 'info', 'PEDIDOS');
    
    if (!pedidoId || !estado) {
        return res.status(400).json({ 
            success: false,
            error: 'ID de pedido y estado son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Verificar que el pedido existe y obtener datos completos
        const [pedidoResult] = await connection.execute(`
            SELECT * FROM pedidos WHERE id_pedido = ?
        `, [pedidoId]);

        if (pedidoResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const pedidoActual = pedidoResult[0];
        const estadoAnterior = pedidoActual.estado;

        // 2. Validar transiciones de estado
        const transicionesPermitidas = {
            'pendiente': ['confirmado', 'Anulado'],
            'confirmado': ['entregado', 'Anulado'],
            'entregado': ['confirmado'],
            'Anulado': ['pendiente']
        };

        const estadosPermitidos = transicionesPermitidas[estadoAnterior.toLowerCase()] || [];
        
        if (!estadosPermitidos.includes(estado) && estadoAnterior !== estado) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false,
                error: `Transición no permitida de '${estadoAnterior}' a '${estado}'`,
                transiciones_permitidas: estadosPermitidos,
                timestamp: new Date().toISOString()
            });
        }

        // 3. Actualizar el estado del pedido
        const updateQuery = notas ? 
            `UPDATE pedidos SET estado = ?, notas_local = ?, fecha_actualizacion = NOW() WHERE id_pedido = ?` :
            `UPDATE pedidos SET estado = ?, fecha_actualizacion = NOW() WHERE id_pedido = ?`;
        
        const updateParams = notas ? [estado, notas, pedidoId] : [estado, pedidoId];

        const [updateResult] = await connection.execute(updateQuery, updateParams);

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'No se pudo actualizar el pedido',
                timestamp: new Date().toISOString()
            });
        }

        // 4. SI EL NUEVO ESTADO ES "entregado", INSERTAR EN TABLAS DE CARRITO
        if (estado.toLowerCase() === 'entregado') {
            logAdmin(`Insertando pedido ${pedidoId} en historial de carrito`, 'info', 'CARRITO');
            
            // 4.1. Insertar en tabla carrito
            const [carritoInsert] = await connection.execute(`
                INSERT INTO carrito (
                    idcarrito, 
                    status, 
                    id_cliente, 
                    cantidad, 
                    Total, 
                    fecha, 
                    cli_nombre, 
                    cli_direccion, 
                    cli_tel, 
                    cli_email, 
                    medio_pago, 
                    data_pago
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                pedidoActual.id_pedido,           // idcarrito (usamos el ID del pedido)
                3,                                // status (3 para completado)
                pedidoActual.email_cliente,       // id_cliente (usamos email como ID)
                pedidoActual.cantidad_productos,  // cantidad
                pedidoActual.monto_total,         // Total
                pedidoActual.fecha,               // fecha
                pedidoActual.cliente,             // cli_nombre
                pedidoActual.direccion_cliente,   // cli_direccion
                pedidoActual.telefono_cliente,    // cli_tel
                pedidoActual.email_cliente,       // cli_email
                pedidoActual.medio_pago,          // medio_pago
                ''                                // data_pago (vacío por ahora)
            ]);

            if (carritoInsert.affectedRows === 0) {
                await connection.rollback();
                return res.status(500).json({ 
                    success: false,
                    error: 'Error al insertar en tabla carrito',
                    timestamp: new Date().toISOString()
                });
            }

            // 4.2. Obtener productos del pedido para insertar en carrito_cont
            const [productosResult] = await connection.execute(`
                SELECT * FROM pedidos_contenido WHERE id_pedido = ?
            `, [pedidoId]);

            // 4.3. Insertar cada producto en carrito_cont
            for (const producto of productosResult) {
                const [contInsert] = await connection.execute(`
                    INSERT INTO carrito_cont (
                        idcarrito, 
                        cod_interno, 
                        codigo_barra, 
                        cantidad, 
                        precio
                    ) VALUES (?, ?, ?, ?, ?)
                `, [
                    pedidoActual.id_pedido,           // idcarrito (referencia al carrito padre)
                    producto.cod_interno || 0,        // cod_interno (0 si es NULL)
                    producto.codigo_barra,            // codigo_barra
                    producto.cantidad,                // cantidad
                    producto.precio                   // precio
                ]);

                if (contInsert.affectedRows === 0) {
                    await connection.rollback();
                    return res.status(500).json({ 
                        success: false,
                        error: `Error al insertar producto ${producto.nombre_producto} en carrito_cont`,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            logAdmin(`✅ Pedido ${pedidoId} insertado en carrito con ${productosResult.length} productos`, 'success', 'CARRITO');
        }

        // 5. Confirmar toda la transacción
        await connection.commit();

        const response = {
            success: true,
            message: estado.toLowerCase() === 'entregado' 
                ? `Pedido marcado como entregado e insertado en historial de ventas`
                : `Estado del pedido actualizado de '${estadoAnterior}' a '${estado}'`,
            data: {
                pedido_id: pedidoId,
                cliente: pedidoActual.cliente,
                estado_anterior: estadoAnterior,
                estado_nuevo: estado,
                notas: notas || null,
                insertado_en_carrito: estado.toLowerCase() === 'entregado',
                fecha_actualizacion: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        };

        logAdmin(`✅ Estado del pedido ${pedidoId} actualizado de '${estadoAnterior}' a '${estado}'`, 'success', 'PEDIDOS');
        res.json(response);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        logAdmin(`❌ Error actualizando estado del pedido ${pedidoId}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            success: false,
            error: 'Error interno al actualizar el estado del pedido',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            connection.release();
        }
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
            `DELETE FROM pedidos WHERE id_pedido = ?`,
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
// GESTIÓN DE PRODUCTOS OPTIMIZADA - CORREGIDA
// ==============================================



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
            SET art_desc_vta = ?, COSTO = ?, PRECIO = ?, PRECIO_SIN_IVA = ?, PRECIO_SIN_IVA_4 = ?, COD_DPTO = ? 
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
            success: false,
            error: 'ID del producto, nombre, cantidad y precio son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Verificar que el producto existe y obtener info del pedido
        const [productoResult] = await connection.execute(`
            SELECT pc.*, p.estado, p.id_pedido 
            FROM pedidos_contenido pc 
            JOIN pedidos p ON pc.id_pedido = p.id_pedido 
            WHERE pc.id = ?
        `, [productoId]);

        if (productoResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const producto = productoResult[0];
        const id_pedido = producto.id_pedido;

        // 2. Verificar que el pedido puede ser modificado
        const estadoPedido = producto.estado.toLowerCase();
        const estadosModificables = ['pendiente', 'confirmado'];
        
        if (!estadosModificables.includes(estadoPedido)) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false,
                error: `No se puede modificar un pedido con estado: ${estadoPedido}`,
                timestamp: new Date().toISOString()
            });
        }

        // 3. CALCULAR SUBTOTAL en backend por seguridad
        const precioNum = parseFloat(precio);
        const cantidadNum = parseInt(cantidad);
        const subtotalCalculado = precioNum * cantidadNum;

        // 4. Actualizar producto
        const [updateResult] = await connection.execute(`
            UPDATE pedidos_contenido 
            SET nombre_producto = ?, cantidad = ?, precio = ? 
            WHERE id = ?
        `, [nombre_producto, cantidadNum, precioNum, productoId]);

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'No se pudo actualizar el producto',
                timestamp: new Date().toISOString()
            });
        }

        // 5. ACTUALIZAR TOTALES DEL PEDIDO INMEDIATAMENTE
        await connection.execute(`
            UPDATE pedidos 
            SET 
                monto_total = (
                    SELECT COALESCE(SUM(subtotal), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                cantidad_productos = (
                    SELECT COALESCE(SUM(cantidad), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                fecha_actualizacion = NOW()
            WHERE id_pedido = ?
        `, [id_pedido, id_pedido, id_pedido]);

        // 6. Obtener los totales actualizados
        const [totalResult] = await connection.execute(
            `SELECT monto_total, cantidad_productos FROM pedidos WHERE id_pedido = ?`,
            [id_pedido]
        );

        // 7. Confirmar transacción
        await connection.commit();

        const response = {
            success: true,
            message: 'Producto actualizado y totales recalculados correctamente',
            data: {
                producto_id: productoId,
                pedido_id: id_pedido,
                subtotal_calculado: subtotalCalculado,
                totales_actualizados: {
                    monto_total: totalResult[0].monto_total,
                    cantidad_productos: totalResult[0].cantidad_productos
                }
            },
            timestamp: new Date().toISOString()
        };

        logAdmin(`✅ Producto ${productoId} actualizado y totales recalculados`, 'success', 'PRODUCTOS');
        res.json(response);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        logAdmin(`❌ Error actualizando producto ${productoId}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            success: false,
            error: 'Error interno al actualizar el producto',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            connection.release();
        }
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
        const query = `UPDATE pedidos SET monto_total = ?, cantidad_productos = ? WHERE id_pedido = ?`;
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
    const { id_pedido, codigo_barra, nombre_producto, cantidad, precio, subtotal } = req.body;

    logAdmin(`Agregando producto al pedido: ${id_pedido}`, 'info', 'PEDIDOS');

    if (!id_pedido || !codigo_barra || !nombre_producto || !cantidad || !precio) {
        return res.status(400).json({ 
            success: false,
            error: 'Todos los campos son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
        // Iniciar transacción para consistencia
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Verificar que el pedido existe y obtener su estado
        const [pedidoResult] = await connection.execute(
            `SELECT id_pedido, estado FROM pedidos WHERE id_pedido = ?`,
            [id_pedido]
        );

        if (pedidoResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        // 2. Verificar que el pedido puede ser modificado
        const estadoPedido = pedidoResult[0].estado.toLowerCase();
        const estadosModificables = ['pendiente', 'confirmado'];
        
        if (!estadosModificables.includes(estadoPedido)) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false,
                error: `No se puede modificar un pedido con estado: ${estadoPedido}`,
                timestamp: new Date().toISOString()
            });
        }

        // 3. Verificar que el producto no esté ya en el pedido (evitar duplicados)
        const [duplicateCheck] = await connection.execute(
            `SELECT COUNT(*) as count FROM pedidos_contenido WHERE id_pedido = ? AND codigo_barra = ?`,
            [id_pedido, codigo_barra]
        );

        if (duplicateCheck[0].count > 0) {
            await connection.rollback();
            return res.status(409).json({ 
                success: false,
                error: 'Este producto ya está en el pedido. Use la función editar para modificar la cantidad.',
                timestamp: new Date().toISOString()
            });
        }

        // 4. Obtener cod_interno del producto desde la tabla articulo
        const [articuloResult] = await connection.execute(
            `SELECT COD_INTERNO FROM articulo WHERE CODIGO_BARRA = ?`,
            [codigo_barra]
        );

        const cod_interno = articuloResult.length > 0 ? articuloResult[0].COD_INTERNO : null;

        // 5. CALCULAR SUBTOTAL en el backend por seguridad
        const precioNum = parseFloat(precio);
        const cantidadNum = parseInt(cantidad);
        const subtotalCalculado = precioNum * cantidadNum;

        // 6. Insertar producto con cod_interno
        const [insertResult] = await connection.execute(`
            INSERT INTO pedidos_contenido (id_pedido, codigo_barra, cod_interno, nombre_producto, cantidad, precio) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            id_pedido, 
            codigo_barra, 
            cod_interno,
            nombre_producto, 
            cantidadNum, 
            precioNum
            // NO enviar subtotalCalculado - la BD lo calculará automáticamente
        ]);

        // 7. ACTUALIZAR TOTALES DEL PEDIDO INMEDIATAMENTE
        const [updateResult] = await connection.execute(`
            UPDATE pedidos 
            SET 
                monto_total = (
                    SELECT COALESCE(SUM(subtotal), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                cantidad_productos = (
                    SELECT COALESCE(SUM(cantidad), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                fecha_actualizacion = NOW()
            WHERE id_pedido = ?
        `, [id_pedido, id_pedido, id_pedido]);

        // 8. Obtener los totales actualizados para respuesta
        const [totalResult] = await connection.execute(
            `SELECT monto_total, cantidad_productos FROM pedidos WHERE id_pedido = ?`,
            [id_pedido]
        );

        // 9. Confirmar transacción
        await connection.commit();

        const response = {
            success: true,
            message: 'Producto agregado y totales actualizados correctamente',
            data: {
                producto_id: insertResult.insertId,
                pedido_id: id_pedido,
                cod_interno: cod_interno,
                subtotal_calculado: subtotalCalculado,
                totales_actualizados: {
                    monto_total: totalResult[0].monto_total,
                    cantidad_productos: totalResult[0].cantidad_productos
                }
            },
            timestamp: new Date().toISOString()
        };

        logAdmin(`✅ Producto agregado al pedido ${id_pedido} y totales actualizados`, 'success', 'PEDIDOS');
        res.json(response);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        logAdmin(`❌ Error agregando producto al pedido ${id_pedido}: ${error.message}`, 'error', 'PEDIDOS');
        res.status(500).json({ 
            success: false,
            error: 'Error interno al agregar el producto',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

const eliminarProducto = asyncHandler(async (req, res) => {
    const productoId = req.params.id;

    logAdmin(`Eliminando producto: ${productoId}`, 'info', 'PRODUCTOS');

    if (!productoId || isNaN(productoId)) {
        return res.status(400).json({ 
            success: false,
            error: 'ID de producto inválido',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Obtener información del producto y pedido ANTES de eliminarlo
        const [productoResult] = await connection.execute(`
            SELECT pc.*, p.estado, p.id_pedido 
            FROM pedidos_contenido pc 
            JOIN pedidos p ON pc.id_pedido = p.id_pedido 
            WHERE pc.id = ?
        `, [productoId]);

        if (productoResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const producto = productoResult[0];
        const id_pedido = producto.id_pedido;

        // 2. Verificar que el pedido puede ser modificado
        const estadoPedido = producto.estado.toLowerCase();
        const estadosModificables = ['pendiente', 'confirmado'];
        
        if (!estadosModificables.includes(estadoPedido)) {
            await connection.rollback();
            return res.status(400).json({ 
                success: false,
                error: `No se puede modificar un pedido con estado: ${estadoPedido}`,
                timestamp: new Date().toISOString()
            });
        }

        // 3. Eliminar el producto
        const [deleteResult] = await connection.execute(
            `DELETE FROM pedidos_contenido WHERE id = ?`,
            [productoId]
        );

        if (deleteResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'No se pudo eliminar el producto',
                timestamp: new Date().toISOString()
            });
        }

        // 4. ACTUALIZAR TOTALES DEL PEDIDO INMEDIATAMENTE
        await connection.execute(`
            UPDATE pedidos 
            SET 
                monto_total = (
                    SELECT COALESCE(SUM(subtotal), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                cantidad_productos = (
                    SELECT COALESCE(SUM(cantidad), 0) 
                    FROM pedidos_contenido 
                    WHERE id_pedido = ?
                ),
                fecha_actualizacion = NOW()
            WHERE id_pedido = ?
        `, [id_pedido, id_pedido, id_pedido]);

        // 5. Obtener los totales actualizados
        const [totalResult] = await connection.execute(
            `SELECT monto_total, cantidad_productos FROM pedidos WHERE id_pedido = ?`,
            [id_pedido]
        );

        // 6. Confirmar transacción
        await connection.commit();

        const response = {
            success: true,
            message: 'Producto eliminado y totales actualizados correctamente',
            data: {
                producto_eliminado: {
                    id: productoId,
                    nombre: producto.nombre_producto,
                    cantidad: producto.cantidad,
                    subtotal_eliminado: producto.subtotal
                },
                pedido_id: id_pedido,
                totales_actualizados: {
                    monto_total: totalResult[0].monto_total,
                    cantidad_productos: totalResult[0].cantidad_productos
                }
            },
            timestamp: new Date().toISOString()
        };

        logAdmin(`✅ Producto ${productoId} eliminado y totales actualizados`, 'success', 'PRODUCTOS');
        res.json(response);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        logAdmin(`❌ Error eliminando producto ${productoId}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            success: false,
            error: 'Error interno al eliminar el producto',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


// ==============================================
// GESTIÓN DE OFERTAS Y DESTACADOS - CORREGIDA
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
        // Verificar si el artículo existe en la tabla principal
        const checkQuery = `SELECT COUNT(*) as count FROM articulo WHERE CODIGO_BARRA = ?`;
        const checkResult = await executeQuery(checkQuery, [CODIGO_BARRA], 'CHECK_ARTICULO');
        
        if (checkResult[0].count === 0) {
            return res.status(404).json({ 
                error: 'El artículo no existe en el inventario principal',
                timestamp: new Date().toISOString()
            });
        }

        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, '1', 1)
            ON DUPLICATE KEY UPDATE 
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1,
                cat = '1'
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
        // Verificar si el artículo existe en la tabla principal
        const checkQuery = `SELECT COUNT(*) as count FROM articulo WHERE CODIGO_BARRA = ?`;
        const checkResult = await executeQuery(checkQuery, [CODIGO_BARRA], 'CHECK_ARTICULO');
        
        if (checkResult[0].count === 0) {
            return res.status(404).json({ 
                error: 'El artículo no existe en el inventario principal',
                timestamp: new Date().toISOString()
            });
        }

        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, '2', 1)
            ON DUPLICATE KEY UPDATE 
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1,
                cat = '2'
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
        emailTransporter = nodemailer.createTransport({
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

        // ITEMS CON ESTILOS MEJORADOS
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.name || item.nombre_producto}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.quantity || item.cantidad}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
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

// FUNCIÓN PEDIDO EN CAMINO

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

        // ITEMS CON ESTILOS MEJORADOS
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.name || item.nombre_producto}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.quantity || item.cantidad}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
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


const MailPedidoRetiro = asyncHandler(async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone, desde, hasta } = req.body;
    
    logAdmin(`Enviando email de pedido listo para retirar a: ${clientMail}`, 'info', 'EMAIL');

    if (!clientMail || !name || !items || !Array.isArray(items)) {
        return res.status(400).json({ 
            error: 'Datos incompletos para envío de email de retiro',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const templatePath = path.join(__dirname, '../resources/email_template/pedido_retiro.html');
        let htmlTemplate = await fs.readFile(templatePath, 'utf8');

        // ITEMS CON ESTILOS MEJORADOS
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.name || item.nombre_producto}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.quantity || item.cantidad}
                </td>
                <td style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #6b7280; padding: 16px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
                    ${item.price || item.precio}
                </td>
            </tr>`;
        });

        htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName || 'PuntoSur')
                                    .replace(/{{storeAddress}}/g, process.env.STORE_ADDRESS || 'Dirección no disponible')
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
            subject: 'Tu pedido está listo para retirar!',
            html: htmlTemplate,
            attachments: [
                {
                    filename: 'logo.jpg',
                    path: logoPath,
                    cid: 'logo'
                }
            ]
        });

        logAdmin(`✅ Email de pedido listo para retirar enviado a: ${clientMail}`, 'success', 'EMAIL');
        res.json({ 
            success: true, 
            message: 'Email de retiro enviado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error enviando email de pedido listo para retirar a ${clientMail}: ${error.message}`, 'error', 'EMAIL');
        res.status(500).json({ 
            error: 'Error al enviar email de pedido listo para retirar',
            timestamp: new Date().toISOString()
        });
    }
});

// Alias para compatibilidad
const actualizarEstadoPedidoEnCamino = actualizarEstadoPedidoProcesado;

// ==============================================
// ESTADÍSTICAS OPTIMIZADAS - CORREGIDAS
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
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
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



//NUEVAS FUNCIONES PARA INTERFAZ PRODUCTOS
const obtenerTodosLosProductos = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo todos los productos', 'info', 'PRODUCTOS');
    
    try {
        // Usar la columna de precio correcta según IVA configurado
        const ivaLevel = parseInt(process.env.IVA) || 0;
        let precioColumn = 'PRECIO_SIN_IVA';
        
        if (ivaLevel === 1) precioColumn = 'PRECIO_SIN_IVA_1';
        else if (ivaLevel === 2) precioColumn = 'PRECIO_SIN_IVA_2';
        else if (ivaLevel === 3) precioColumn = 'PRECIO_SIN_IVA_3';
        else if (ivaLevel === 4) precioColumn = 'PRECIO_SIN_IVA_4';
        
        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                COALESCE(a.COSTO, 0) AS costo, 
                COALESCE(a.PRECIO, 0) AS precio,
                COALESCE(a.${precioColumn}, 0) AS precio_sin_iva, 
                COALESCE(a.PRECIO_SIN_IVA_4, 0) AS precio_sin_iva_4,
                a.COD_DPTO AS categoria_id,
                COALESCE(c.NOM_CLASIF, 'Sin categoría') AS categoria,
                COALESCE(a.STOCK, '0') AS stock,
                COALESCE(a.HABILITADO, 'S') AS habilitado,
                COALESCE(a.marca, '') AS marca,
                a.COD_INTERNO AS cod_interno
            FROM articulo a
            LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
            WHERE a.HABILITADO IN ('S', 'N')
            ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
            LIMIT 1000
        `;
        
        const results = await executeQuery(query, [], 'TODOS_PRODUCTOS');
        
        // Procesar los resultados para asegurar tipos correctos
        const productosFormateados = results.map(producto => ({
            ...producto,
            costo: parseFloat(producto.costo) || 0,
            precio: parseFloat(producto.precio) || 0,
            precio_sin_iva: parseFloat(producto.precio_sin_iva) || 0,
            precio_sin_iva_4: parseFloat(producto.precio_sin_iva_4) || 0,
            stock: parseInt(producto.stock) || 0,
            categoria: producto.categoria || 'Sin categoría'
        }));
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${productosFormateados.length} productos obtenidos (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(productosFormateados);
    } catch (error) {
        logAdmin(`❌ Error obteniendo todos los productos: ${error.message}`, 'error', 'PRODUCTOS');
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Error al obtener productos',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

// También actualizar la función de búsqueda existente
const buscarProductoEnPedido = asyncHandler(async (req, res) => {
    const searchTerm = req.params.searchTerm?.trim() || '';
    const startTime = Date.now();
    
    logAdmin(`Buscando productos: "${searchTerm}"`, 'info', 'PRODUCTOS');
    
    if (searchTerm.length < 2) {
        return res.status(400).json({ 
            error: 'Término de búsqueda debe tener al menos 2 caracteres',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Usar la columna de precio correcta según IVA configurado
        const ivaLevel = parseInt(process.env.IVA) || 0;
        let precioColumn = 'PRECIO_SIN_IVA';
        
        if (ivaLevel === 1) precioColumn = 'PRECIO_SIN_IVA_1';
        else if (ivaLevel === 2) precioColumn = 'PRECIO_SIN_IVA_2';
        else if (ivaLevel === 3) precioColumn = 'PRECIO_SIN_IVA_3';
        else if (ivaLevel === 4) precioColumn = 'PRECIO_SIN_IVA_4';
        
        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                COALESCE(a.COSTO, 0) AS costo, 
                COALESCE(a.${precioColumn}, 0) AS precio, 
                a.COD_DPTO AS categoria_id,
                COALESCE(c.NOM_CLASIF, 'Sin categoría') AS categoria,
                COALESCE(a.STOCK, '0') AS stock,
                COALESCE(a.HABILITADO, 'S') AS habilitado,
                COALESCE(a.marca, '') AS marca
            FROM articulo a
            LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
            WHERE (a.art_desc_vta LIKE ? OR a.NOMBRE LIKE ? OR a.CODIGO_BARRA LIKE ?)
            AND a.HABILITADO = 'S'
            ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
            LIMIT 50
        `;
        
        const searchPattern = `%${searchTerm}%`;
        const results = await executeQuery(query, [searchPattern, searchPattern, searchPattern], 'BUSCAR_PRODUCTOS');
        
        // Procesar los resultados
        const productosFormateados = results.map(producto => ({
            ...producto,
            costo: parseFloat(producto.costo) || 0,
            precio: parseFloat(producto.precio) || 0,
            stock: parseInt(producto.stock) || 0,
            categoria: producto.categoria || 'Sin categoría'
        }));
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${productosFormateados.length} productos encontrados para "${searchTerm}" (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(productosFormateados);
    } catch (error) {
        logAdmin(`❌ Error buscando productos "${searchTerm}": ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al buscar productos',
            timestamp: new Date().toISOString()
        });
    }
});

const crearProducto = asyncHandler(async (req, res) => {
    const { 
        codigo_barra, 
        nombre, 
        costo, 
        precio, 
        precio_sin_iva, 
        precio_sin_iva_4, 
        categoria, 
        stock, 
        descripcion, 
        habilitado 
    } = req.body;
    
    logAdmin(`Creando nuevo producto: ${codigo_barra}`, 'info', 'PRODUCTOS');
    
    if (!codigo_barra || !nombre) {
        return res.status(400).json({ 
            error: 'Código de barra y nombre son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Verificar si el producto ya existe
        const checkQuery = `SELECT COUNT(*) as count FROM articulo WHERE CODIGO_BARRA = ?`;
        const checkResult = await executeQuery(checkQuery, [codigo_barra], 'CHECK_PRODUCTO_EXISTE');
        
        if (checkResult[0].count > 0) {
            logAdmin(`❌ Producto ${codigo_barra} ya existe`, 'warn', 'PRODUCTOS');
            return res.status(409).json({ 
                error: 'Ya existe un producto con ese código de barra',
                timestamp: new Date().toISOString()
            });
        }

        const query = `
            INSERT INTO articulo (
                CODIGO_BARRA, 
                art_desc_vta, 
                NOMBRE,
                COSTO, 
                PRECIO, 
                PRECIO_SIN_IVA, 
                PRECIO_SIN_IVA_4, 
                COD_DPTO, 
                STOCK, 
                DESCRIPCION,
                HABILITADO
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            codigo_barra,
            nombre,
            nombre, // NOMBRE también se llena con el mismo valor
            parseFloat(costo) || 0,
            parseFloat(precio) || 0,
            parseFloat(precio_sin_iva) || 0,
            parseFloat(precio_sin_iva_4) || 0,
            categoria || '',
            parseInt(stock) || 0,
            descripcion || '',
            habilitado || 'S'
        ];

        const result = await executeQuery(query, values, 'CREATE_PRODUCTO');

        logAdmin(`✅ Producto ${codigo_barra} creado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Producto creado correctamente',
            id: result.insertId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error creando producto ${codigo_barra}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al crear el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerProductoPorCodigo = asyncHandler(async (req, res) => {
    const codigoBarra = req.params.codigo;
    const startTime = Date.now();
    
    logAdmin(`Obteniendo producto por código: ${codigoBarra}`, 'info', 'PRODUCTOS');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Usar la columna de precio correcta según IVA configurado
        const ivaLevel = parseInt(process.env.IVA) || 0;
        let precioColumn = 'PRECIO_SIN_IVA';
        
        if (ivaLevel === 1) precioColumn = 'PRECIO_SIN_IVA_1';
        else if (ivaLevel === 2) precioColumn = 'PRECIO_SIN_IVA_2';
        else if (ivaLevel === 3) precioColumn = 'PRECIO_SIN_IVA_3';
        else if (ivaLevel === 4) precioColumn = 'PRECIO_SIN_IVA_4';
        
        const query = `
            SELECT 
                COALESCE(art_desc_vta, NOMBRE) AS nombre, 
                CODIGO_BARRA AS codigo_barra, 
                COSTO AS costo, 
                PRECIO AS precio,
                ${precioColumn} AS precio_sin_iva, 
                PRECIO_SIN_IVA_4 AS precio_sin_iva_4,
                COD_DPTO AS categoria,
                STOCK AS stock,
                HABILITADO AS habilitado,
                DESCRIPCION AS descripcion
            FROM articulo 
            WHERE CODIGO_BARRA = ?
        `;
        
        const results = await executeQuery(query, [codigoBarra], 'GET_PRODUCTO_BY_CODE');
        
        const duration = Date.now() - startTime;
        
        if (results.length === 0) {
            logAdmin(`❌ Producto ${codigoBarra} no encontrado (${duration}ms)`, 'warn', 'PRODUCTOS');
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Producto ${codigoBarra} obtenido (${duration}ms)`, 'success', 'PRODUCTOS');
        res.json(results[0]);
    } catch (error) {
        logAdmin(`❌ Error obteniendo producto ${codigoBarra}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al obtener el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarProductoCompleto = asyncHandler(async (req, res) => {
    const codigoBarra = req.params.codigo;
    
    logAdmin(`Eliminando producto: ${codigoBarra}`, 'info', 'PRODUCTOS');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Verificar si el producto existe
        const checkQuery = `SELECT COUNT(*) as count FROM articulo WHERE CODIGO_BARRA = ?`;
        const checkResult = await executeQuery(checkQuery, [codigoBarra], 'CHECK_PRODUCTO_EXISTE');
        
        if (checkResult[0].count === 0) {
            logAdmin(`❌ Producto ${codigoBarra} no encontrado`, 'warn', 'PRODUCTOS');
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        // En lugar de eliminar completamente, mejor deshabilitar el producto
        const query = `UPDATE articulo SET HABILITADO = 'N' WHERE CODIGO_BARRA = ?`;
        const result = await executeQuery(query, [codigoBarra], 'DISABLE_PRODUCTO');

        if (result.affectedRows === 0) {
            logAdmin(`❌ No se pudo deshabilitar el producto ${codigoBarra}`, 'warn', 'PRODUCTOS');
            return res.status(404).json({ 
                error: 'No se pudo eliminar el producto',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Producto ${codigoBarra} deshabilitado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Producto eliminado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando producto ${codigoBarra}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al eliminar el producto',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerCategoriasProductos = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo categorías de productos', 'info', 'PRODUCTOS');
    
    try {
        const query = `
            SELECT DISTINCT COD_DPTO as categoria, COUNT(*) as total_productos
            FROM articulo 
            WHERE HABILITADO = 'S' AND COD_DPTO IS NOT NULL AND COD_DPTO != ''
            GROUP BY COD_DPTO
            ORDER BY total_productos DESC, COD_DPTO ASC
        `;
        
        const results = await executeQuery(query, [], 'GET_CATEGORIAS');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} categorías obtenidas (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo categorías: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al obtener categorías',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerEstadisticasProductos = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo estadísticas de productos', 'info', 'PRODUCTOS');
    
    try {
        // Ejecutar múltiples consultas en paralelo
        const [
            totalResult,
            stockResult,
            precioResult,
            categoriasResult
        ] = await Promise.all([
            // Total de productos
            executeQuery(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN HABILITADO = 'S' THEN 1 ELSE 0 END) as habilitados,
                    SUM(CASE WHEN HABILITADO = 'N' THEN 1 ELSE 0 END) as deshabilitados
                 FROM articulo`,
                [],
                'STATS_TOTAL'
            ),
            // Estadísticas de stock
            executeQuery(
                `SELECT 
                    SUM(CASE WHEN STOCK > 0 THEN 1 ELSE 0 END) as con_stock,
                    SUM(CASE WHEN STOCK = 0 THEN 1 ELSE 0 END) as sin_stock,
                    SUM(CASE WHEN STOCK > 0 AND STOCK <= 10 THEN 1 ELSE 0 END) as stock_bajo,
                    SUM(STOCK) as stock_total,
                    AVG(STOCK) as stock_promedio
                 FROM articulo WHERE HABILITADO = 'S'`,
                [],
                'STATS_STOCK'
            ),
            // Estadísticas de precios
            executeQuery(
                `SELECT 
                    AVG(PRECIO) as precio_promedio,
                    MIN(PRECIO) as precio_minimo,
                    MAX(PRECIO) as precio_maximo,
                    SUM(PRECIO * STOCK) as valor_inventario
                 FROM articulo WHERE HABILITADO = 'S' AND PRECIO > 0`,
                [],
                'STATS_PRECIOS'
            ),
            // Top categorías
            executeQuery(
                `SELECT COD_DPTO as categoria, COUNT(*) as total
                 FROM articulo 
                 WHERE HABILITADO = 'S' AND COD_DPTO IS NOT NULL AND COD_DPTO != ''
                 GROUP BY COD_DPTO 
                 ORDER BY total DESC 
                 LIMIT 10`,
                [],
                'STATS_CATEGORIAS'
            )
        ]);

        const estadisticas = {
            totales: {
                total: totalResult[0]?.total || 0,
                habilitados: totalResult[0]?.habilitados || 0,
                deshabilitados: totalResult[0]?.deshabilitados || 0
            },
            stock: {
                con_stock: stockResult[0]?.con_stock || 0,
                sin_stock: stockResult[0]?.sin_stock || 0,
                stock_bajo: stockResult[0]?.stock_bajo || 0,
                stock_total: stockResult[0]?.stock_total || 0,
                stock_promedio: Math.round(stockResult[0]?.stock_promedio || 0)
            },
            precios: {
                precio_promedio: Math.round((precioResult[0]?.precio_promedio || 0) * 100) / 100,
                precio_minimo: precioResult[0]?.precio_minimo || 0,
                precio_maximo: precioResult[0]?.precio_maximo || 0,
                valor_inventario: Math.round((precioResult[0]?.valor_inventario || 0) * 100) / 100
            },
            categorias_top: categoriasResult || []
        };

        const duration = Date.now() - startTime;
        logAdmin(`✅ Estadísticas de productos obtenidas (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(estadisticas);
    } catch (error) {
        logAdmin(`❌ Error obteniendo estadísticas de productos: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al obtener estadísticas de productos',
            timestamp: new Date().toISOString()
        });
    }
});

const actualizarStockProducto = asyncHandler(async (req, res) => {
    const codigoBarra = req.params.codigo;
    const { stock, operacion } = req.body; // operacion puede ser 'set', 'add', 'subtract'
    
    logAdmin(`Actualizando stock del producto: ${codigoBarra}`, 'info', 'PRODUCTOS');
    
    if (!codigoBarra || stock === undefined) {
        return res.status(400).json({ 
            error: 'Código de barra y stock son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        let query;
        let params;
        const stockValue = parseInt(stock) || 0;
        
        switch (operacion) {
            case 'add':
                query = `UPDATE articulo SET STOCK = STOCK + ? WHERE CODIGO_BARRA = ?`;
                params = [stockValue, codigoBarra];
                break;
            case 'subtract':
                query = `UPDATE articulo SET STOCK = GREATEST(0, STOCK - ?) WHERE CODIGO_BARRA = ?`;
                params = [stockValue, codigoBarra];
                break;
            case 'set':
            default:
                query = `UPDATE articulo SET STOCK = ? WHERE CODIGO_BARRA = ?`;
                params = [stockValue, codigoBarra];
                break;
        }

        const result = await executeQuery(query, params, 'UPDATE_STOCK');

        if (result.affectedRows === 0) {
            logAdmin(`❌ Producto ${codigoBarra} no encontrado`, 'warn', 'PRODUCTOS');
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Stock del producto ${codigoBarra} actualizado exitosamente`, 'success', 'PRODUCTOS');
        res.json({ 
            success: true, 
            message: 'Stock actualizado correctamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando stock del producto ${codigoBarra}: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al actualizar el stock',
            timestamp: new Date().toISOString()
        });
    }
});

const buscarProductosAvanzado = asyncHandler(async (req, res) => {
    const filtrosDecoded = decodeURIComponent(req.params.filtrosEncoded);
    const filtros = JSON.parse(filtrosDecoded);
    const { 
        termino, 
        categoria, 
        estado, 
        stockMinimo, 
        stockMaximo, 
        precioMinimo, 
        precioMaximo,
        limite = 50,
        pagina = 1
    } = filtros;
    
    const startTime = Date.now();
    logAdmin(`Búsqueda avanzada de productos`, 'info', 'PRODUCTOS');
    
    try {
        // Usar la columna de precio correcta según IVA configurado
        const ivaLevel = parseInt(process.env.IVA) || 0;
        let precioColumn = 'PRECIO_SIN_IVA';
        
        if (ivaLevel === 1) precioColumn = 'PRECIO_SIN_IVA_1';
        else if (ivaLevel === 2) precioColumn = 'PRECIO_SIN_IVA_2';
        else if (ivaLevel === 3) precioColumn = 'PRECIO_SIN_IVA_3';
        else if (ivaLevel === 4) precioColumn = 'PRECIO_SIN_IVA_4';

        // Construir consulta dinámica
        let whereConditions = [];
        let params = [];

        // Búsqueda por término
        if (termino && termino.trim().length >= 2) {
            const searchPattern = `%${termino.trim()}%`;
            whereConditions.push(`(art_desc_vta LIKE ? OR NOMBRE LIKE ? OR CODIGO_BARRA LIKE ?)`);
            params.push(searchPattern, searchPattern, searchPattern);
        }

        // Filtros adicionales
        if (categoria) {
            whereConditions.push(`COD_DPTO = ?`);
            params.push(categoria);
        }

        if (estado) {
            switch (estado) {
                case 'habilitado':
                    whereConditions.push(`HABILITADO = 'S'`);
                    break;
                case 'deshabilitado':
                    whereConditions.push(`HABILITADO = 'N'`);
                    break;
                case 'en_stock':
                    whereConditions.push(`STOCK > 0`);
                    break;
                case 'sin_stock':
                    whereConditions.push(`STOCK = 0`);
                    break;
                case 'stock_bajo':
                    whereConditions.push(`STOCK > 0 AND STOCK <= 10`);
                    break;
            }
        }

        if (stockMinimo) {
            whereConditions.push(`STOCK >= ?`);
            params.push(parseInt(stockMinimo));
        }

        if (stockMaximo) {
            whereConditions.push(`STOCK <= ?`);
            params.push(parseInt(stockMaximo));
        }

        if (precioMinimo) {
            whereConditions.push(`PRECIO >= ?`);
            params.push(parseFloat(precioMinimo));
        }

        if (precioMaximo) {
            whereConditions.push(`PRECIO <= ?`);
            params.push(parseFloat(precioMaximo));
        }

        // Si no hay condiciones, agregar una condición por defecto
        if (whereConditions.length === 0) {
            whereConditions.push(`HABILITADO IN ('S', 'N')`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Paginación
        const limitValue = Math.min(parseInt(limite) || 50, 200); // Máximo 200 por página
        const offset = (parseInt(pagina) || 1 - 1) * limitValue;

        const query = `
            SELECT 
                COALESCE(art_desc_vta, NOMBRE) AS nombre, 
                CODIGO_BARRA AS codigo_barra, 
                COSTO AS costo, 
                PRECIO AS precio,
                ${precioColumn} AS precio_sin_iva, 
                PRECIO_SIN_IVA_4 AS precio_sin_iva_4,
                COD_DPTO AS categoria,
                STOCK AS stock,
                HABILITADO AS habilitado,
                DESCRIPCION AS descripcion
            FROM articulo 
            ${whereClause}
            ORDER BY COALESCE(art_desc_vta, NOMBRE) ASC
            LIMIT ? OFFSET ?
        `;

        params.push(limitValue, offset);

        // También obtener el total para la paginación
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM articulo 
            ${whereClause}
        `;

        const countParams = params.slice(0, -2); // Remover LIMIT y OFFSET

        const [results, countResult] = await Promise.all([
            executeQuery(query, params, 'BUSQUEDA_AVANZADA'),
            executeQuery(countQuery, countParams, 'COUNT_BUSQUEDA')
        ]);

        const total = countResult[0]?.total || 0;
        const totalPaginas = Math.ceil(total / limitValue);

        const duration = Date.now() - startTime;
        logAdmin(`✅ Búsqueda avanzada completada: ${results.length} resultados (${duration}ms)`, 'success', 'PRODUCTOS');

        res.json({
            productos: results,
            paginacion: {
                pagina: parseInt(pagina) || 1,
                limite: limitValue,
                total: total,
                totalPaginas: totalPaginas,
                hayAnterior: (parseInt(pagina) || 1) > 1,
                haySiguiente: (parseInt(pagina) || 1) < totalPaginas
            },
            filtros: {
                termino: termino || '',
                categoria: categoria || '',
                estado: estado || '',
                stockMinimo: stockMinimo || '',
                stockMaximo: stockMaximo || '',
                precioMinimo: precioMinimo || '',
                precioMaximo: precioMaximo || ''
            }
        });
    } catch (error) {
        logAdmin(`❌ Error en búsqueda avanzada: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error en la búsqueda de productos',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerCategoriasAdmin = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo categorías', 'info', 'CATEGORIAS');
    
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
        
        const results = await executeQuery(query, [], 'CATEGORIAS_ADMIN');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} categorías obtenidas (${duration}ms)`, 'success', 'CATEGORIAS');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo categorías: ${error.message}`, 'error', 'CATEGORIAS');
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Error obteniendo categorías',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});






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
    MailPedidoRetiro,
    // Estadísticas
    obtenerStats,


    obtenerTodosLosProductos,
    crearProducto,
    obtenerProductoPorCodigo,
    eliminarProductoCompleto,
    obtenerCategoriasProductos,
    obtenerEstadisticasProductos,
    actualizarStockProducto,
    buscarProductosAvanzado,
    obtenerCategoriasAdmin,
    pedidosPendientesCheck
};