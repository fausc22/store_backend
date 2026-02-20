// controllers/adminController.js - VERSIÓN CORREGIDA PARA BD
const { executeQuery, logConnection, pool } = require('./dbPS');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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


const getPrecioCalculadoSQL = () => {
    return `
        CASE 
            WHEN a.COD_IVA = 0 THEN ROUND(a.precio_sin_iva_4 * 1.21, 2) + ROUND(a.costo * a.porc_impint / 100, 2)
            WHEN a.COD_IVA = 1 THEN ROUND(a.precio_sin_iva_4 * 1.105, 2) + ROUND(a.costo * a.porc_impint / 100, 2)
            WHEN a.COD_IVA = 2 THEN ROUND(a.precio_sin_iva_4, 2) + ROUND(a.costo * a.porc_impint / 100, 2)
            ELSE ROUND(a.precio_sin_iva_4 * 1.21, 2) + ROUND(a.costo * a.porc_impint / 100, 2)
        END
    `;
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
        // Buscar usuario en la base de datos
        const usuarios = await executeQuery(
            'SELECT id, usuario, password, rol FROM usuarios WHERE usuario = ?',
            [username],
            'LOGIN_CHECK'
        );

        if (!usuarios || usuarios.length === 0) {
            const duration = Date.now() - startTime;
            logAdmin(`Login fallido para ${username}: Usuario no encontrado (${duration}ms)`, 'warn', 'AUTH');
            return res.status(401).json({ 
                message: 'Usuario o contraseña incorrectos',
                timestamp: new Date().toISOString()
            });
        }

        const usuario = usuarios[0];

        // Verificar contraseña con bcrypt
        const passwordMatch = await bcrypt.compare(password, usuario.password);

        if (!passwordMatch) {
            const duration = Date.now() - startTime;
            logAdmin(`Login fallido para ${username}: Contraseña incorrecta (${duration}ms)`, 'warn', 'AUTH');
            return res.status(401).json({ 
                message: 'Usuario o contraseña incorrectos',
                timestamp: new Date().toISOString()
            });
        }

        // Generar JWT con el rol del usuario
        // Si rememberMe está activado, el token dura 7 días, sino 4 horas
        const rememberMe = req.body.rememberMe !== false; // Por defecto true
        const expiresIn = rememberMe ? '7d' : '4h';
        
        const JWT_SECRET = process.env.JWT_SECRET || 'tu_secret_key_cambiar_en_produccion';
        const token = jwt.sign(
            { 
                id: usuario.id,
                usuario: usuario.usuario,
                rol: usuario.rol
            },
            JWT_SECRET,
            { expiresIn: expiresIn }
        );

        const duration = Date.now() - startTime;
        logAdmin(`✅ Login exitoso para ${username} (rol: ${usuario.rol}) (${duration}ms)`, 'success', 'AUTH');
        
        res.json({ 
            message: 'Login exitoso',
            token: token,
            usuario: {
                id: usuario.id,
                usuario: usuario.usuario,
                rol: usuario.rol
            },
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

// Middleware simple para verificar que el usuario sea admin
const verificarAdmin = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                message: 'Token de autenticación requerido',
                timestamp: new Date().toISOString()
            });
        }

        const token = authHeader.substring(7); // Remover "Bearer "
        const JWT_SECRET = process.env.JWT_SECRET || 'tu_secret_key_cambiar_en_produccion';
        
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.rol !== 'admin') {
                logAdmin(`Acceso denegado: Usuario ${decoded.usuario} (rol: ${decoded.rol}) intentó acceder a endpoint admin`, 'warn', 'AUTH');
                return res.status(403).json({ 
                    message: 'Acceso denegado: Se requiere rol de administrador',
                    timestamp: new Date().toISOString()
                });
            }
            req.user = decoded; // Agregar usuario decodificado al request
            next();
        } catch (jwtError) {
            logAdmin(`Token inválido o expirado: ${jwtError.message}`, 'warn', 'AUTH');
            return res.status(401).json({ 
                message: 'Token inválido o expirado',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        logAdmin(`Error en verificación de admin: ${error.message}`, 'error', 'AUTH');
        return res.status(500).json({ 
            message: 'Error al verificar permisos',
            timestamp: new Date().toISOString()
        });
    }
};

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
            storeDeliveryMaxKm: config.STORE_DELIVERY_MAX_KM || '0',
            mercadoPagoToken: config.MERCADOPAGO_ACCESS_TOKEN,
            iva: config.IVA,
            pageStatus: config.PAGE_STATUS,
            horaInicio: config.HORA_INICIO,
            horaFin: config.HORA_FIN
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

        // Actualizar configuración
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
            ...(config.hasOwnProperty('storeDeliveryMaxKm') && { STORE_DELIVERY_MAX_KM: String(config.storeDeliveryMaxKm ?? '0') }),
            ...(config.mercadoPagoToken && { MERCADOPAGO_ACCESS_TOKEN: config.mercadoPagoToken }),
            ...(config.iva && { IVA: config.iva }),
            ...(config.pageStatus && { PAGE_STATUS: config.pageStatus }),
            ...(config.horaInicio && { HORA_INICIO: config.horaInicio }),
            ...(config.horaFin && { HORA_FIN: config.horaFin })
        };

        // Crear el contenido del archivo .env
        const updatedContent = Object.keys(updatedConfig)
            .map(key => `${key}=${updatedConfig[key]}`)
            .join('\n');

        await fs.writeFile(envPath, updatedContent, 'utf8');

        // Actualizar TODAS las variables en process.env inmediatamente
        if (config.storeName) {
            process.env.STORE_NAME = config.storeName;
        }
        if (config.storeAddress) {
            process.env.STORE_ADDRESS = config.storeAddress;
        }
        if (config.storePhone) {
            process.env.STORE_PHONE = config.storePhone;
        }
        if (config.storeDescription) {
            process.env.STORE_DESCRIPTION = config.storeDescription;
        }
        if (config.storeInstagram) {
            process.env.STORE_INSTAGRAM = config.storeInstagram;
        }
        if (config.storeEmail) {
            process.env.STORE_EMAIL = config.storeEmail;
        }
        if (config.storeDeliveryBase) {
            process.env.STORE_DELIVERY_BASE = config.storeDeliveryBase;
        }
        if (config.storeDeliveryKm) {
            process.env.STORE_DELIVERY_KM = config.storeDeliveryKm;
        }
        if (config.hasOwnProperty('storeDeliveryMaxKm')) {
            process.env.STORE_DELIVERY_MAX_KM = String(config.storeDeliveryMaxKm ?? '0');
        }
        if (config.mercadoPagoToken) {
            process.env.MERCADOPAGO_ACCESS_TOKEN = config.mercadoPagoToken;
        }
        if (config.iva) {
            process.env.IVA = config.iva;
        }
        if (config.pageStatus) {
            process.env.PAGE_STATUS = config.pageStatus;
        }
        if (config.horaInicio) {
            process.env.HORA_INICIO = config.horaInicio;
        }
        if (config.horaFin) {
            process.env.HORA_FIN = config.horaFin;
        }

        logAdmin('✅ Configuración guardada y variables actualizadas en memoria', 'success', 'CONFIG');
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
    try {
        // 🔑 CRÍTICO: Parsear correctamente el ultimo_id recibido
        // Si es undefined, null, NaN o string vacía, usar 0
        let ultimo_id = parseInt(req.query.ultimo_id);
        if (isNaN(ultimo_id) || ultimo_id === null || ultimo_id === undefined) {
            ultimo_id = 0;
        }

        console.log(`🔍 [BACKEND] Verificando pedidos. Ultimo_id recibido: ${ultimo_id} (tipo: ${typeof ultimo_id})`);

        const query = `
            SELECT
                id_pedido,
                fecha,
                cliente,
                cantidad_productos,
                monto_total,
                telefono_cliente,
                direccion_cliente,
                email_cliente,
                estado
            FROM pedidos
            WHERE estado IN ('pendiente', 'confirmado')
            ORDER BY fecha DESC
            LIMIT 1
        `;

        const results = await executeQuery(query, [], 'PEDIDOS_CHECK');

        console.log(`📊 [BACKEND] Pedidos encontrados: ${results.length}`);

        // 🔑 CRÍTICO: Si no hay pedidos, retornar inmediatamente sin nuevos pedidos
        if (results.length === 0) {
            console.log(`✅ [BACKEND] No hay pedidos pendientes`);
            res.json({
                nuevo_pedido: false,
                ultimo_id: ultimo_id
            });
            return;
        }

        // 🔑 CRÍTICO: Obtener el ID del pedido más reciente de forma segura
        const pedidoActual = results[0];
        const pedidoActualId = parseInt(pedidoActual.id_pedido);

        console.log(`📋 [BACKEND] Pedido más reciente: #${pedidoActualId}, Cliente: ${pedidoActual.cliente}`);

        // 🔑 CRÍTICO: Determinar si es un pedido nuevo
        // Un pedido es nuevo si su ID es MAYOR que el ultimo_id conocido
        const esNuevoPedido = pedidoActualId > ultimo_id;

        console.log(`🔢 [BACKEND] Comparación: ${pedidoActualId} > ${ultimo_id} = ${esNuevoPedido}`);

        if (esNuevoPedido) {
            console.log(`🚨 [BACKEND] NUEVO PEDIDO DETECTADO: #${pedidoActualId} (anterior: #${ultimo_id})`);

            res.json({
                nuevo_pedido: true,
                pedido: pedidoActual,
                ultimo_id: pedidoActualId
            });
        } else {
            // No hay nuevos pedidos - El pedido actual es el mismo que el último conocido
            console.log(`✅ [BACKEND] Sin nuevos pedidos. Actual: #${pedidoActualId}, Último conocido: #${ultimo_id}`);

            res.json({
                nuevo_pedido: false,
                // 🔑 Retornar el ID actual para que el frontend lo actualice
                ultimo_id: pedidoActualId
            });
        }

    } catch (error) {
        console.error(`❌ [BACKEND] Error en check de pedidos:`, error);
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

// Función auxiliar para formatear dirección (solo calle y número)
const formatearDireccionCorta = (direccionCompleta) => {
    if (!direccionCompleta) return '';
    
    // Tomar solo la primera parte antes de la primera coma
    // Ejemplo: "Catamarca 955, General Paz, Córdoba, Argentina" -> "Catamarca 955"
    const partes = direccionCompleta.split(',');
    const direccionCorta = partes[0].trim();
    
    // Limitar a 100 caracteres por seguridad (ajusta según tu columna DB)
    return direccionCorta.substring(0, 100);
};

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

        // 4. 🔴 CAMBIO AQUÍ: SI EL NUEVO ESTADO ES "confirmado", INSERTAR EN TABLAS DE CARRITO
        let insertadoEnCarrito = false;
        if (estado.toLowerCase() === 'confirmado') {  // ✅ CAMBIADO DE 'entregado' A 'confirmado'
            logAdmin(`Verificando si pedido ${pedidoId} ya existe en carrito`, 'info', 'CARRITO');
            
            // Verificar si ya existe en carrito (evitar duplicados)
            const [carritoExistente] = await connection.execute(`
                SELECT idcarrito FROM carrito WHERE idcarrito = ?
            `, [pedidoId]);

            if (carritoExistente.length > 0) {
                logAdmin(`⚠️ Pedido ${pedidoId} YA EXISTE en carrito - omitiendo inserción`, 'warn', 'CARRITO');
                insertadoEnCarrito = false;
            } else {
                logAdmin(`✅ Insertando pedido ${pedidoId} en historial de carrito`, 'info', 'CARRITO');
                
                // Formatear dirección para que quepa en la columna de carrito
                const direccionFormateada = formatearDireccionCorta(pedidoActual.direccion_cliente);
                logAdmin(`📍 Dirección original: "${pedidoActual.direccion_cliente}"`, 'info', 'CARRITO');
                logAdmin(`📍 Dirección formateada: "${direccionFormateada}"`, 'info', 'CARRITO');
                
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
                    pedidoActual.id_pedido,
                    2,  // ✅ CAMBIADO: status = 2 para "confirmado" (antes era 3 para "completado")
                    pedidoActual.email_cliente,
                    pedidoActual.cantidad_productos,
                    pedidoActual.monto_total,
                    pedidoActual.fecha,
                    pedidoActual.cliente,
                    direccionFormateada,  // ✅ USAR DIRECCIÓN FORMATEADA (solo calle y número)
                    pedidoActual.telefono_cliente,
                    pedidoActual.email_cliente,
                    pedidoActual.medio_pago,
                    ''
                ]);

                if (carritoInsert.affectedRows === 0) {
                    await connection.rollback();
                    return res.status(500).json({ 
                        success: false,
                        error: 'Error al insertar en tabla carrito',
                        timestamp: new Date().toISOString()
                    });
                }

                // 4.2. Obtener productos del pedido
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
                        pedidoActual.id_pedido,
                        producto.cod_interno || 0,
                        producto.codigo_barra,
                        producto.cantidad,
                        producto.precio
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
                insertadoEnCarrito = true;
            }
        }

        // 5. 🆕 NUEVO: Si pasa de "confirmado" a "entregado", actualizar status en carrito
        if (estadoAnterior.toLowerCase() === 'confirmado' && estado.toLowerCase() === 'entregado') {
            logAdmin(`Actualizando status de carrito ${pedidoId} a entregado`, 'info', 'CARRITO');
            
            const [updateCarrito] = await connection.execute(`
                UPDATE carrito SET status = 3 WHERE idcarrito = ?
            `, [pedidoId]);

            if (updateCarrito.affectedRows > 0) {
                logAdmin(`✅ Status de carrito ${pedidoId} actualizado a entregado (status=3)`, 'success', 'CARRITO');
            }
        }

        // 6. Confirmar toda la transacción
        await connection.commit();

        const response = {
            success: true,
            message: estado.toLowerCase() === 'confirmado' 
                ? insertadoEnCarrito 
                    ? `Pedido confirmado e insertado en historial de ventas`
                    : `Pedido confirmado (ya existía en historial)`
                : estado.toLowerCase() === 'entregado'
                ? `Pedido marcado como entregado`
                : `Estado del pedido actualizado de '${estadoAnterior}' a '${estado}'`,
            data: {
                pedido_id: pedidoId,
                cliente: pedidoActual.cliente,
                estado_anterior: estadoAnterior,
                estado_nuevo: estado,
                notas: notas || null,
                insertado_en_carrito: insertadoEnCarrito,
                ya_existia_en_carrito: estado.toLowerCase() === 'confirmado' && !insertadoEnCarrito,
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
    const { 
        nombre, 
        art_desc_vta,
        costo, 
        precio, 
        precio_sin_iva, 
        precio_sin_iva_1,
        precio_sin_iva_2,
        precio_sin_iva_3,
        precio_sin_iva_4, 
        categoria,
        cod_dpto,
        cod_rubro,
        cod_subrubro,
        cod_interno,
        marca,
        stock,
        pesable,
        cod_iva,
        porc_impint,
        impuesto_interno,
        habilitado
    } = req.body;
    
    logAdmin(`Actualizando producto: ${productoId}`, 'info', 'PRODUCTOS');
    
    const nombreProducto = nombre || art_desc_vta;
    if (!productoId || !nombreProducto) {
        return res.status(400).json({ 
            error: 'ID de producto y nombre son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Construir query dinámicamente con todos los campos disponibles
        const updateFields = [];
        const updateValues = [];
        
        if (nombreProducto !== undefined) {
            updateFields.push('art_desc_vta = ?');
            updateValues.push(nombreProducto);
            updateFields.push('NOMBRE = ?');
            updateValues.push(nombreProducto);
        }
        
        if (costo !== undefined) {
            updateFields.push('COSTO = ?');
            updateValues.push(parseFloat(costo) || 0);
        }
        
        if (precio !== undefined) {
            updateFields.push('PRECIO = ?');
            updateValues.push(parseFloat(precio) || 0);
        }
        
        if (precio_sin_iva !== undefined) {
            updateFields.push('PRECIO_SIN_IVA = ?');
            updateValues.push(parseFloat(precio_sin_iva) || 0);
        }
        
        if (precio_sin_iva_1 !== undefined) {
            updateFields.push('PRECIO_SIN_IVA_1 = ?');
            updateValues.push(parseFloat(precio_sin_iva_1) || 0);
        }
        
        if (precio_sin_iva_2 !== undefined) {
            updateFields.push('PRECIO_SIN_IVA_2 = ?');
            updateValues.push(parseFloat(precio_sin_iva_2) || 0);
        }
        
        if (precio_sin_iva_3 !== undefined) {
            updateFields.push('PRECIO_SIN_IVA_3 = ?');
            updateValues.push(parseFloat(precio_sin_iva_3) || 0);
        }
        
        if (precio_sin_iva_4 !== undefined) {
            updateFields.push('PRECIO_SIN_IVA_4 = ?');
            updateValues.push(parseFloat(precio_sin_iva_4) || 0);
        }
        
        const deptoValue = cod_dpto || categoria;
        if (deptoValue !== undefined && deptoValue !== null && deptoValue !== '') {
            updateFields.push('COD_DPTO = ?');
            updateValues.push(deptoValue);
        }
        
        if (cod_rubro !== undefined && cod_rubro !== null && cod_rubro !== '') {
            updateFields.push('COD_RUBRO = ?');
            updateValues.push(cod_rubro);
        }
        
        if (cod_subrubro !== undefined && cod_subrubro !== null && cod_subrubro !== '') {
            updateFields.push('COD_SUBRUBRO = ?');
            updateValues.push(cod_subrubro);
        }
        
        if (cod_interno !== undefined) {
            updateFields.push('COD_INTERNO = ?');
            updateValues.push(parseInt(cod_interno) || 0);
        }
        
        if (marca !== undefined) {
            updateFields.push('marca = ?');
            updateValues.push(marca || null);
        }
        
        if (stock !== undefined) {
            updateFields.push('STOCK = ?');
            updateValues.push(parseInt(stock) || 0);
        }
        
        if (pesable !== undefined) {
            updateFields.push('PESABLE = ?');
            updateValues.push(parseInt(pesable) || 0);
        }
        
        if (cod_iva !== undefined) {
            updateFields.push('COD_IVA = ?');
            updateValues.push(parseInt(cod_iva) || 0);
        }
        
        if (porc_impint !== undefined) {
            updateFields.push('porc_impint = ?');
            updateValues.push(parseFloat(porc_impint) || 0);
        }
        
        if (impuesto_interno !== undefined) {
            updateFields.push('impuesto_interno = ?');
            updateValues.push(parseFloat(impuesto_interno) || 0);
        }
        
        if (habilitado !== undefined) {
            updateFields.push('HABILITADO = ?');
            updateValues.push(habilitado);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ 
                error: 'No se proporcionaron campos para actualizar',
                timestamp: new Date().toISOString()
            });
        }
        
        updateValues.push(productoId);
        
        const query = `
            UPDATE articulo 
            SET ${updateFields.join(', ')}
            WHERE CODIGO_BARRA = ?
        `;
        
        const result = await executeQuery(
            query, 
            updateValues,
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
    const { id_pedido, codigo_barra, nombre_producto, cantidad } = req.body;

    logAdmin(`Agregando producto al pedido: ${id_pedido}`, 'info', 'PEDIDOS');

    if (!id_pedido || !codigo_barra || !nombre_producto || !cantidad) {
        return res.status(400).json({ 
            success: false,
            error: 'Todos los campos son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
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

        // 2. Verificar duplicados
        const [duplicateCheck] = await connection.execute(
            `SELECT COUNT(*) as count FROM pedidos_contenido WHERE id_pedido = ? AND codigo_barra = ?`,
            [id_pedido, codigo_barra]
        );

        if (duplicateCheck[0].count > 0) {
            await connection.rollback();
            return res.status(409).json({ 
                success: false,
                error: 'Este producto ya está en el pedido.',
                timestamp: new Date().toISOString()
            });
        }

        // 3. 🔴 OBTENER PRECIO CALCULADO DINÁMICAMENTE
        const precioSQL = getPrecioCalculadoSQL();
        
        const [articuloResult] = await connection.execute(`
            SELECT 
                COD_INTERNO,
                ${precioSQL} AS precio_calculado
            FROM articulo a
            WHERE CODIGO_BARRA = ?
        `, [codigo_barra]);

        if (articuloResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false,
                error: 'Producto no encontrado en inventario',
                timestamp: new Date().toISOString()
            });
        }

        const cod_interno = articuloResult[0].COD_INTERNO || null;
        const precioCalculado = parseFloat(articuloResult[0].precio_calculado) || 0; // ✅ USAR ESTE

        const cantidadNum = parseInt(cantidad);

        // 4. Insertar producto con precio calculado
        const [insertResult] = await connection.execute(`
            INSERT INTO pedidos_contenido (id_pedido, codigo_barra, cod_interno, nombre_producto, cantidad, precio) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            id_pedido, 
            codigo_barra, 
            cod_interno,
            nombre_producto, 
            cantidadNum, 
            precioCalculado // ✅ PRECIO CALCULADO DINÁMICAMENTE
        ]);

        // 5. Actualizar totales del pedido
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

        // 6. Obtener totales actualizados
        const [totalResult] = await connection.execute(
            `SELECT monto_total, cantidad_productos FROM pedidos WHERE id_pedido = ?`,
            [id_pedido]
        );

        await connection.commit();

        const response = {
            success: true,
            message: 'Producto agregado y totales actualizados correctamente',
            data: {
                producto_id: insertResult.insertId,
                pedido_id: id_pedido,
                cod_interno: cod_interno,
                precio_usado: precioCalculado, // ✅ INFORMAR PRECIO USADO
                totales_actualizados: {
                    monto_total: totalResult[0].monto_total,
                    cantidad_productos: totalResult[0].cantidad_productos
                }
            },
            timestamp: new Date().toISOString()
        };

        logAdmin(`✅ Producto agregado al pedido ${id_pedido} con precio calculado ${precioCalculado}`, 'success', 'PEDIDOS');
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
            SELECT 
                at.CODIGO_BARRA, 
                at.COD_INTERNO,
                at.art_desc_vta AS nombre, 
                at.PRECIO, 
                at.PRECIO_DESC,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS STOCK
            FROM articulo_temp at
            LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '1' AND at.activo = 1
            AND a.HABILITADO = 'S'
            AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
            ORDER BY at.orden, at.fecha_inicio DESC
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
            SELECT 
                at.CODIGO_BARRA, 
                at.COD_INTERNO,
                at.art_desc_vta AS nombre, 
                at.PRECIO, 
                at.PRECIO_DESC,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS STOCK
            FROM articulo_temp at
            LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '2' AND at.activo = 1
            AND a.HABILITADO = 'S'
            AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
            ORDER BY at.orden, at.fecha_inicio DESC
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
        // ✅ OBTENER PRECIO CALCULADO DINÁMICAMENTE
        const precioSQL = getPrecioCalculadoSQL();
        
        const checkQuery = `
            SELECT 
                COD_INTERNO,
                ${precioSQL} AS precio_calculado
            FROM articulo a 
            WHERE CODIGO_BARRA = ? 
            LIMIT 1
        `;
        
        const checkResult = await executeQuery(checkQuery, [CODIGO_BARRA], 'CHECK_ARTICULO');
        
        if (!checkResult || checkResult.length === 0) {
            return res.status(404).json({ 
                error: 'El artículo no existe en el inventario principal',
                timestamp: new Date().toISOString()
            });
        }

        const COD_INTERNO = checkResult[0].COD_INTERNO || 0;
        const precioCalculado = parseFloat(checkResult[0].precio_calculado) || 0; // ✅ PRECIO CORRECTO

        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, COD_INTERNO, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, ?, '1', 1)
            ON DUPLICATE KEY UPDATE 
                COD_INTERNO = VALUES(COD_INTERNO),
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1,
                cat = '1'
        `;

        await executeQuery(query, [CODIGO_BARRA, COD_INTERNO, nombre, precioCalculado, precioCalculado], 'INSERT_OFERTA');

        logAdmin(`✅ Artículo ${CODIGO_BARRA} agregado a ofertas con precio calculado: ${precioCalculado}`, 'success', 'OFERTAS');
        res.json({ 
            success: true, 
            message: 'Artículo agregado a oferta',
            cod_interno: COD_INTERNO,
            precio_calculado: precioCalculado, // ✅ INFORMAR PRECIO USADO
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
        // ✅ OBTENER PRECIO CALCULADO DINÁMICAMENTE
        const precioSQL = getPrecioCalculadoSQL();
        
        const checkQuery = `
            SELECT 
                COD_INTERNO,
                ${precioSQL} AS precio_calculado
            FROM articulo a 
            WHERE CODIGO_BARRA = ? 
            LIMIT 1
        `;
        
        const checkResult = await executeQuery(checkQuery, [CODIGO_BARRA], 'CHECK_ARTICULO');
        
        if (!checkResult || checkResult.length === 0) {
            return res.status(404).json({ 
                error: 'El artículo no existe en el inventario principal',
                timestamp: new Date().toISOString()
            });
        }

        const COD_INTERNO = checkResult[0].COD_INTERNO || 0;
        const precioCalculado = parseFloat(checkResult[0].precio_calculado) || 0; // ✅ PRECIO CORRECTO

        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, COD_INTERNO, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, ?, '2', 1)
            ON DUPLICATE KEY UPDATE 
                COD_INTERNO = VALUES(COD_INTERNO),
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1,
                cat = '2'
        `;

        await executeQuery(query, [CODIGO_BARRA, COD_INTERNO, nombre, precioCalculado, precioCalculado], 'INSERT_DESTACADO');

        logAdmin(`✅ Artículo ${CODIGO_BARRA} agregado a destacados con precio calculado: ${precioCalculado}`, 'success', 'DESTACADOS');
        res.json({ 
            success: true, 
            message: 'Artículo agregado a destacados',
            cod_interno: COD_INTERNO,
            precio_calculado: precioCalculado, // ✅ INFORMAR PRECIO USADO
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
            host: 'mail.mycarrito.com.ar',
    port: 587, // usa STARTTLS
    secure: false, // true solo si usás el 465
    auth: {
      user: process.env.EMAIL_USER, // ej: puntosur@mail.mycarrito.com.ar
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
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
        const storeMostrarNuevo = process.env.EMAIL_USER;
        await transporter.sendMail({
            from: `${storeName || 'PuntoSur'} <${storeMostrarNuevo}>`,
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
        const storeMostrarNuevo = process.env.EMAIL_USER;
        await transporter.sendMail({
            from: `${storeName || 'PuntoSur'} <${storeMostrarNuevo}>`,
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
        const storeMostrarNuevo = process.env.EMAIL_USER;
        await transporter.sendMail({
            from: `${storeName || 'PuntoSur'} <${storeMostrarNuevo}>`,
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
        storeDeliveryMaxKm: process.env.STORE_DELIVERY_MAX_KM || '0',
        iva: process.env.IVA,
        pageStatus: process.env.PAGE_STATUS,
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
        const precioSQL = getPrecioCalculadoSQL();
        
        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                COALESCE(a.COSTO, 0) AS costo, 
                ${precioSQL} AS precio,
                COALESCE(a.precio_sin_iva_4, 0) AS precio_sin_iva_4,
                a.COD_DPTO AS categoria_id,
                COALESCE(c.NOM_CLASIF, 'Sin categoría') AS categoria,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS stock,
                COALESCE(a.HABILITADO, 'S') AS habilitado,
                COALESCE(a.marca, '') AS marca,
                a.COD_INTERNO AS cod_interno,
                a.COD_IVA,
                a.porc_impint
            FROM articulo a
            LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
            WHERE a.HABILITADO IN ('S', 'N')
            ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
        `;
        
        const results = await executeQuery(query, [], 'TODOS_PRODUCTOS');
        
        const productosFormateados = results.map(producto => ({
            ...producto,
            costo: parseFloat(producto.costo) || 0,
            precio: parseFloat(producto.precio) || 0,
            precio_sin_iva_4: parseFloat(producto.precio_sin_iva_4) || 0,
            stock: parseInt(producto.stock) || 0,
            categoria: producto.categoria || 'Sin categoría'
        }));
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${productosFormateados.length} productos obtenidos (${duration}ms)`, 'success', 'PRODUCTOS');
        
        res.json(productosFormateados);
    } catch (error) {
        logAdmin(`❌ Error obteniendo todos los productos: ${error.message}`, 'error', 'PRODUCTOS');
        res.status(500).json({ 
            error: 'Error al obtener productos',
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
        const precioSQL = getPrecioCalculadoSQL();
        
        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                COALESCE(a.COSTO, 0) AS costo, 
                ${precioSQL} AS precio,
                a.COD_DPTO AS categoria_id,
                COALESCE(c.NOM_CLASIF, 'Sin categoría') AS categoria,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS stock,
                COALESCE(a.HABILITADO, 'S') AS habilitado,
                COALESCE(a.marca, '') AS marca,
                a.COD_INTERNO AS cod_interno,
                a.COD_IVA,
                a.porc_impint
            FROM articulo a
            LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
            WHERE (a.art_desc_vta LIKE ? OR a.NOMBRE LIKE ? OR a.CODIGO_BARRA LIKE ?)
            AND a.HABILITADO = 'S'
            AND (${precioSQL}) > 0
            AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
            ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
            LIMIT 50
        `;
        
        const searchPattern = `%${searchTerm}%`;
        const results = await executeQuery(query, [searchPattern, searchPattern, searchPattern], 'BUSCAR_PRODUCTOS');
        
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
        art_desc_vta,
        costo, 
        precio, 
        precio_sin_iva,
        precio_sin_iva_1,
        precio_sin_iva_2,
        precio_sin_iva_3,
        precio_sin_iva_4, 
        categoria,
        cod_dpto,
        cod_rubro,
        cod_subrubro,
        cod_interno,
        marca,
        stock, 
        pesable,
        cod_iva,
        porc_impint,
        impuesto_interno,
        habilitado 
    } = req.body;
    
    logAdmin(`Creando nuevo producto: ${codigo_barra}`, 'info', 'PRODUCTOS');
    
    const nombreProducto = nombre || art_desc_vta;
    if (!codigo_barra || !nombreProducto) {
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

        const deptoValue = cod_dpto || categoria || '';
        
        const query = `
            INSERT INTO articulo (
                CODIGO_BARRA, 
                COD_INTERNO,
                art_desc_vta, 
                NOMBRE,
                marca,
                COSTO, 
                PRECIO, 
                PRECIO_SIN_IVA,
                PRECIO_SIN_IVA_1,
                PRECIO_SIN_IVA_2,
                PRECIO_SIN_IVA_3,
                PRECIO_SIN_IVA_4, 
                COD_DPTO,
                COD_RUBRO,
                COD_SUBRUBRO,
                STOCK,
                PESABLE,
                COD_IVA,
                porc_impint,
                impuesto_interno,
                HABILITADO
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            codigo_barra,
            parseInt(cod_interno) || 0,
            nombreProducto,
            nombreProducto, // NOMBRE también se llena con el mismo valor
            marca || null,
            parseFloat(costo) || 0,
            parseFloat(precio) || 0,
            parseFloat(precio_sin_iva) || 0,
            parseFloat(precio_sin_iva_1) || 0,
            parseFloat(precio_sin_iva_2) || 0,
            parseFloat(precio_sin_iva_3) || 0,
            parseFloat(precio_sin_iva_4) || 0,
            deptoValue,
            cod_rubro || null,
            cod_subrubro || null,
            parseInt(stock) || 0,
            parseInt(pesable) || 0,
            parseInt(cod_iva) || 0,
            parseFloat(porc_impint) || 0,
            parseFloat(impuesto_interno) || 0,
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
        const precioSQL = getPrecioCalculadoSQL();
        
        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                a.COSTO AS costo, 
                ${precioSQL} AS precio,
                a.precio_sin_iva_4 AS precio_sin_iva_4,
                a.COD_DPTO AS categoria,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS stock,
                a.HABILITADO AS habilitado,
                a.COD_INTERNO AS cod_interno,
                a.COD_IVA,
                a.porc_impint
            FROM articulo a
            WHERE a.CODIGO_BARRA = ?
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
            SELECT DISTINCT 
                COD_DPTO as categoria, 
                COUNT(DISTINCT CODIGO_BARRA) as total_productos
            FROM articulo 
            WHERE HABILITADO = 'S' 
            AND COD_DPTO IS NOT NULL 
            AND COD_DPTO != ''
            AND (
                CASE 
                    WHEN COD_IVA = 0 THEN round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 1 THEN round(precio_sin_iva_4 * 1.105, 2) + round(costo * porc_impint / 100, 2)
                    WHEN COD_IVA = 2 THEN precio_sin_iva_4
                    ELSE round(precio_sin_iva_4 * 1.21, 2) + round(costo * porc_impint / 100, 2)
                END
            ) > 0
            AND CAST(COALESCE(STOCK, '0') AS UNSIGNED) > 0
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
                    SUM(CASE WHEN CAST(COALESCE(STOCK, '0') AS UNSIGNED) > 0 THEN 1 ELSE 0 END) as con_stock,
                    SUM(CASE WHEN CAST(COALESCE(STOCK, '0') AS UNSIGNED) = 0 THEN 1 ELSE 0 END) as sin_stock,
                    SUM(CASE WHEN CAST(COALESCE(STOCK, '0') AS UNSIGNED) > 0 AND CAST(COALESCE(STOCK, '0') AS UNSIGNED) <= 10 THEN 1 ELSE 0 END) as stock_bajo,
                    SUM(CAST(COALESCE(STOCK, '0') AS UNSIGNED)) as stock_total,
                    AVG(CAST(COALESCE(STOCK, '0') AS UNSIGNED)) as stock_promedio
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
        const precioSQL = getPrecioCalculadoSQL();
        
        let whereConditions = [];
        let params = [];

        if (termino && termino.trim().length >= 2) {
            const searchPattern = `%${termino.trim()}%`;
            whereConditions.push(`(a.art_desc_vta LIKE ? OR a.NOMBRE LIKE ? OR a.CODIGO_BARRA LIKE ?)`);
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (categoria) {
            whereConditions.push(`a.COD_DPTO = ?`);
            params.push(categoria);
        }

        if (estado) {
            switch (estado) {
                case 'habilitado':
                    whereConditions.push(`a.HABILITADO = 'S'`);
                    break;
                case 'deshabilitado':
                    whereConditions.push(`a.HABILITADO = 'N'`);
                    break;
                case 'en_stock':
                    whereConditions.push(`CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0`);
                    break;
                case 'sin_stock':
                    whereConditions.push(`CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) = 0`);
                    break;
                case 'stock_bajo':
                    whereConditions.push(`CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0 AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) <= 10`);
                    break;
            }
        }

        if (stockMinimo) {
            whereConditions.push(`CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) >= ?`);
            params.push(parseInt(stockMinimo));
        }

        if (stockMaximo) {
            whereConditions.push(`CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) <= ?`);
            params.push(parseInt(stockMaximo));
        }

        // Para filtrar por precio CALCULADO
        if (precioMinimo) {
            whereConditions.push(`(${precioSQL}) >= ?`);
            params.push(parseFloat(precioMinimo));
        }

        if (precioMaximo) {
            whereConditions.push(`(${precioSQL}) <= ?`);
            params.push(parseFloat(precioMaximo));
        }

        if (whereConditions.length === 0) {
            whereConditions.push(`a.HABILITADO IN ('S', 'N')`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const limitValue = Math.min(parseInt(limite) || 50, 200);
        const offset = ((parseInt(pagina) || 1) - 1) * limitValue;

        const query = `
            SELECT 
                COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
                a.CODIGO_BARRA AS codigo_barra, 
                a.COSTO AS costo, 
                ${precioSQL} AS precio,
                a.precio_sin_iva_4 AS precio_sin_iva_4,
                a.COD_DPTO AS categoria,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS stock,
                a.HABILITADO AS habilitado,
                a.COD_INTERNO AS cod_interno,
                a.COD_IVA,
                a.porc_impint
            FROM articulo a
            ${whereClause}
            ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
            LIMIT ? OFFSET ?
        `;

        params.push(limitValue, offset);

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM articulo a
            ${whereClause}
        `;

        const countParams = params.slice(0, -2);

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
            filtros: filtros
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
                c.DAT_CLASIF,
                COUNT(DISTINCT a.CODIGO_BARRA) as cantidad_productos
            FROM clasif c
            LEFT JOIN articulo a ON (
                c.DAT_CLASIF = a.COD_DPTO 
                OR a.COD_RUBRO LIKE CONCAT(c.DAT_CLASIF, '%')
                OR a.COD_SUBRUBRO LIKE CONCAT(c.DAT_CLASIF, '%')
            )
            AND a.HABILITADO = 'S'
            AND (
                CASE 
                    WHEN a.COD_IVA = 0 THEN round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 1 THEN round(a.precio_sin_iva_4 * 1.105, 2) + round(a.costo * a.porc_impint / 100, 2)
                    WHEN a.COD_IVA = 2 THEN a.precio_sin_iva_4
                    ELSE round(a.precio_sin_iva_4 * 1.21, 2) + round(a.costo * a.porc_impint / 100, 2)
                END
            ) > 0
            AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
            WHERE c.COD_CLASIF = 1 
            GROUP BY c.id_clasif, c.NOM_CLASIF, c.DAT_CLASIF
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

const articulosLiquidacion = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Obteniendo artículos en liquidación', 'info', 'LIQUIDACION');
    
    try {
        const query = `
            SELECT 
                at.CODIGO_BARRA, 
                at.COD_INTERNO,
                at.art_desc_vta AS nombre, 
                at.PRECIO, 
                at.PRECIO_DESC,
                CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS STOCK
            FROM articulo_temp at
            LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
            WHERE at.cat = '3' AND at.activo = 1
            AND a.HABILITADO = 'S'
            AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
            ORDER BY at.orden, at.fecha_inicio DESC
        `;
        
        const results = await executeQuery(query, [], 'ARTICULOS_LIQUIDACION');
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ ${results.length} artículos en liquidación obtenidos (${duration}ms)`, 'success', 'LIQUIDACION');
        
        res.json(results);
    } catch (error) {
        logAdmin(`❌ Error obteniendo artículos en liquidación: ${error.message}`, 'error', 'LIQUIDACION');
        res.status(500).json({ 
            error: 'Error al obtener artículos en liquidación',
            timestamp: new Date().toISOString()
        });
    }
});

// Resto de funciones de liquidación (actualizar precio, eliminar)
const actualizarPrecioLiquidacion = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA, PRECIO_DESC } = req.body;

    logAdmin(`Actualizando precio de liquidación: ${CODIGO_BARRA}`, 'info', 'LIQUIDACION');

    if (!CODIGO_BARRA || !PRECIO_DESC) {
        return res.status(400).json({ 
            error: 'Código de barra y precio de descuento son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE articulo_temp SET PRECIO_DESC = ? WHERE CODIGO_BARRA = ? AND cat = '3'`;
        const result = await executeQuery(query, [PRECIO_DESC, CODIGO_BARRA], 'UPDATE_PRECIO_LIQUIDACION');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Artículo en liquidación no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Precio de liquidación actualizado para ${CODIGO_BARRA}`, 'success', 'LIQUIDACION');
        res.json({ 
            success: true, 
            message: 'Precio de liquidación actualizado',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando precio de liquidación ${CODIGO_BARRA}: ${error.message}`, 'error', 'LIQUIDACION');
        res.status(500).json({ 
            error: 'Error al actualizar precio de liquidación',
            timestamp: new Date().toISOString()
        });
    }
});

const eliminarArticuloLiquidacion = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA } = req.params;

    logAdmin(`Eliminando artículo de liquidación: ${CODIGO_BARRA}`, 'info', 'LIQUIDACION');

    if (!CODIGO_BARRA) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const query = `UPDATE articulo_temp SET activo = 0 WHERE CODIGO_BARRA = ? AND cat = '3'`;
        const result = await executeQuery(query, [CODIGO_BARRA], 'DELETE_LIQUIDACION');

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                error: 'Artículo en liquidación no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        logAdmin(`✅ Artículo ${CODIGO_BARRA} eliminado de liquidación exitosamente`, 'success', 'LIQUIDACION');
        res.json({ 
            success: true, 
            message: 'Artículo eliminado de liquidación',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando artículo de liquidación ${CODIGO_BARRA}: ${error.message}`, 'error', 'LIQUIDACION');
        res.status(500).json({ 
            error: 'Error al eliminar artículo de liquidación',
            timestamp: new Date().toISOString()
        });
    }
});

const agregarArticuloLiquidacion = asyncHandler(async (req, res) => {
    const { CODIGO_BARRA, nombre, PRECIO } = req.body;

    logAdmin(`Agregando artículo a liquidación: ${CODIGO_BARRA}`, 'info', 'LIQUIDACION');

    if (!CODIGO_BARRA || !nombre || !PRECIO) {
        return res.status(400).json({ 
            error: 'Código de barra, nombre y precio son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // ✅ OBTENER PRECIO CALCULADO DINÁMICAMENTE
        const precioSQL = getPrecioCalculadoSQL();
        
        const checkQuery = `
            SELECT 
                COD_INTERNO,
                ${precioSQL} AS precio_calculado
            FROM articulo a 
            WHERE CODIGO_BARRA = ? 
            LIMIT 1
        `;
        
        const checkResult = await executeQuery(checkQuery, [CODIGO_BARRA], 'CHECK_ARTICULO');
        
        if (!checkResult || checkResult.length === 0) {
            return res.status(404).json({ 
                error: 'El artículo no existe en el inventario principal',
                timestamp: new Date().toISOString()
            });
        }

        const COD_INTERNO = checkResult[0].COD_INTERNO || 0;
        const precioCalculado = parseFloat(checkResult[0].precio_calculado) || 0; // ✅ PRECIO CORRECTO

        const query = `
            INSERT INTO articulo_temp (CODIGO_BARRA, COD_INTERNO, art_desc_vta, PRECIO, PRECIO_DESC, cat, activo) 
            VALUES (?, ?, ?, ?, ?, '3', 1)
            ON DUPLICATE KEY UPDATE 
                COD_INTERNO = VALUES(COD_INTERNO),
                PRECIO = VALUES(PRECIO), 
                PRECIO_DESC = VALUES(PRECIO_DESC),
                activo = 1,
                cat = '3'
        `;

        await executeQuery(query, [CODIGO_BARRA, COD_INTERNO, nombre, precioCalculado, precioCalculado], 'INSERT_LIQUIDACION');

        logAdmin(`✅ Artículo ${CODIGO_BARRA} agregado a liquidación con precio calculado: ${precioCalculado}`, 'success', 'LIQUIDACION');
        res.json({ 
            success: true, 
            message: 'Artículo agregado a liquidación',
            cod_interno: COD_INTERNO,
            precio_calculado: precioCalculado, // ✅ INFORMAR PRECIO USADO
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error agregando artículo a liquidación ${CODIGO_BARRA}: ${error.message}`, 'error', 'LIQUIDACION');
        res.status(500).json({ 
            error: 'Error al agregar artículo a liquidación',
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// ACTUALIZACIÓN MASIVA DE ARTÍCULOS DESDE JSON
// ==============================================

const actualizarArticulosDesdeJSON = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logAdmin('Iniciando actualización masiva de artículos desde JSON', 'info', 'ACTUALIZACION_MASIVA');
    
    try {
        const { type, records } = req.body;
        
        // Validar estructura del JSON
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                error: 'El JSON debe contener un array "records" con al menos un artículo',
                timestamp: new Date().toISOString()
            });
        }
        
        logAdmin(`Procesando ${records.length} artículos del tipo: ${type || 'N/A'}`, 'info', 'ACTUALIZACION_MASIVA');
        
        // Contadores para el resumen
        let actualizados = 0;
        let creados = 0;
        let errores = 0;
        const erroresDetalle = [];
        
        // Función helper para convertir valores numéricos (maneja comas como separador decimal)
        const parseNumeric = (value) => {
            if (value === null || value === undefined || value === '') return 0;
            if (typeof value === 'number') return value;
            // Reemplazar todas las comas por puntos y limpiar espacios
            const str = String(value).trim().replace(/,/g, '.');
            const num = parseFloat(str);
            return isNaN(num) ? 0 : num;
        };
        
        // Función helper para convertir valores enteros
        const parseIntSafe = (value) => {
            if (value === null || value === undefined || value === '') return 0;
            if (typeof value === 'number') return Math.floor(value);
            // Reemplazar todas las comas por puntos y limpiar espacios
            const str = String(value).trim().replace(/,/g, '.');
            const num = parseInt(str, 10);
            return isNaN(num) ? 0 : num;
        };
        
        // Procesar cada registro
        for (const record of records) {
            try {
                const codigoBarra = record.codigo_barra;
                
                if (!codigoBarra) {
                    errores++;
                    erroresDetalle.push({
                        registro: record,
                        error: 'Código de barra faltante'
                    });
                    continue;
                }
                
                // Preparar los valores para la actualización
                const valores = {
                    cod_interno: record.cod_interno ? parseIntSafe(record.cod_interno) : null,
                    art_desc_vta: record.art_desc_vta || null,
                    marca: record.marca || null,
                    precio: parseNumeric(record.precio),
                    stock: parseIntSafe(record.stock),
                    pesable: record.pesable ? parseIntSafe(record.pesable) : 0,
                    costo: parseNumeric(record.costo),
                    cod_iva: record.cod_iva ? parseIntSafe(record.cod_iva) : 0,
                    habilitado: record.habilitado || 'S',
                    porc_impint: parseNumeric(record.porc_impint),
                    precio_sin_iva: parseNumeric(record.precio_sin_iva),
                    precio_sin_iva_1: parseNumeric(record.precio_sin_iva_1),
                    precio_sin_iva_2: parseNumeric(record.precio_sin_iva_2),
                    precio_sin_iva_3: parseNumeric(record.precio_sin_iva_3),
                    precio_sin_iva_4: parseNumeric(record.precio_sin_iva_4),
                    cod_dpto: (record.depto || record.cod_dpto || record.COD_DPTO) ? parseIntSafe(record.depto || record.cod_dpto || record.COD_DPTO) : null,
                    cod_rubro: record.rubro ? parseIntSafe(record.rubro) : null,
                    cod_subrubro: record.subrubro ? parseIntSafe(record.subrubro) : null,
                    impuesto_interno: parseNumeric(record.impuesto_interno)
                };
                
                // Construir la query de actualización
                const updateFields = [];
                const updateValues = [];
                
                if (valores.cod_interno !== null) {
                    updateFields.push('COD_INTERNO = ?');
                    updateValues.push(valores.cod_interno);
                }
                if (valores.art_desc_vta !== null) {
                    updateFields.push('art_desc_vta = ?');
                    updateValues.push(valores.art_desc_vta);
                }
                if (valores.marca !== null) {
                    updateFields.push('marca = ?');
                    updateValues.push(valores.marca);
                }
                updateFields.push('PRECIO = ?');
                updateValues.push(valores.precio);
                updateFields.push('STOCK = ?');
                updateValues.push(valores.stock);
                updateFields.push('PESABLE = ?');
                updateValues.push(valores.pesable);
                updateFields.push('COSTO = ?');
                updateValues.push(valores.costo);
                updateFields.push('COD_IVA = ?');
                updateValues.push(valores.cod_iva);
                updateFields.push('HABILITADO = ?');
                updateValues.push(valores.habilitado);
                updateFields.push('porc_impint = ?');
                updateValues.push(valores.porc_impint);
                updateFields.push('PRECIO_SIN_IVA = ?');
                updateValues.push(valores.precio_sin_iva);
                updateFields.push('PRECIO_SIN_IVA_1 = ?');
                updateValues.push(valores.precio_sin_iva_1);
                updateFields.push('PRECIO_SIN_IVA_2 = ?');
                updateValues.push(valores.precio_sin_iva_2);
                updateFields.push('PRECIO_SIN_IVA_3 = ?');
                updateValues.push(valores.precio_sin_iva_3);
                updateFields.push('PRECIO_SIN_IVA_4 = ?');
                updateValues.push(valores.precio_sin_iva_4);
                
                // Actualizar COD_DPTO si está presente
                if (valores.cod_dpto !== null) {
                    updateFields.push('COD_DPTO = ?');
                    updateValues.push(valores.cod_dpto);
                }
                // Actualizar COD_RUBRO si está presente
                if (valores.cod_rubro !== null) {
                    updateFields.push('COD_RUBRO = ?');
                    updateValues.push(valores.cod_rubro);
                }
                // Actualizar COD_SUBRUBRO si está presente
                if (valores.cod_subrubro !== null) {
                    updateFields.push('COD_SUBRUBRO = ?');
                    updateValues.push(valores.cod_subrubro);
                }
                // Actualizar impuesto_interno
                updateFields.push('impuesto_interno = ?');
                updateValues.push(valores.impuesto_interno);
                
                // Agregar el código de barra al final para el WHERE
                updateValues.push(codigoBarra);
                
                const query = `
                    UPDATE articulo 
                    SET ${updateFields.join(', ')}
                    WHERE CODIGO_BARRA = ?
                `;
                
                const result = await executeQuery(query, updateValues, 'UPDATE_ARTICULO_MASIVO');
                
                if (result.affectedRows === 0) {
                    // Si no existe el artículo, crearlo como nuevo
                    try {
                        // Preparar valores para el INSERT
                        const nombreProducto = valores.art_desc_vta || 'Sin nombre';
                        
                        const insertQuery = `
                            INSERT INTO articulo (
                                CODIGO_BARRA,
                                COD_INTERNO,
                                art_desc_vta,
                                NOMBRE,
                                marca,
                                PRECIO,
                                STOCK,
                                PESABLE,
                                COSTO,
                                COD_IVA,
                                HABILITADO,
                                porc_impint,
                                PRECIO_SIN_IVA,
                                PRECIO_SIN_IVA_1,
                                PRECIO_SIN_IVA_2,
                                PRECIO_SIN_IVA_3,
                                PRECIO_SIN_IVA_4,
                                COD_DPTO,
                                COD_RUBRO,
                                COD_SUBRUBRO,
                                impuesto_interno
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;
                        
                        const insertValues = [
                            codigoBarra,
                            valores.cod_interno || 0,
                            nombreProducto,
                            nombreProducto, // NOMBRE también se llena con el mismo valor
                            valores.marca || null,
                            valores.precio,
                            valores.stock,
                            valores.pesable,
                            valores.costo,
                            valores.cod_iva,
                            valores.habilitado,
                            valores.porc_impint,
                            valores.precio_sin_iva,
                            valores.precio_sin_iva_1,
                            valores.precio_sin_iva_2,
                            valores.precio_sin_iva_3,
                            valores.precio_sin_iva_4,
                            valores.cod_dpto,
                            valores.cod_rubro,
                            valores.cod_subrubro,
                            valores.impuesto_interno
                        ];
                        
                        await executeQuery(insertQuery, insertValues, 'INSERT_ARTICULO_MASIVO');
                        creados++;
                        logAdmin(`✨ Artículo creado: ${codigoBarra} - ${nombreProducto}`, 'info', 'ACTUALIZACION_MASIVA');
                        
                        if (creados % 10 === 0) {
                            logAdmin(`✨ ${creados} artículos creados...`, 'info', 'ACTUALIZACION_MASIVA');
                        }
                    } catch (insertError) {
                        errores++;
                        erroresDetalle.push({
                            codigo_barra: codigoBarra,
                            error: `Error al crear artículo: ${insertError.message}`
                        });
                        logAdmin(`❌ Error creando artículo ${codigoBarra}: ${insertError.message}`, 'error', 'ACTUALIZACION_MASIVA');
                    }
                } else {
                    actualizados++;
                    if (actualizados % 10 === 0) {
                        logAdmin(`✅ ${actualizados} artículos actualizados...`, 'info', 'ACTUALIZACION_MASIVA');
                    }
                }
                
            } catch (error) {
                errores++;
                erroresDetalle.push({
                    codigo_barra: record.codigo_barra || 'N/A',
                    error: error.message
                });
                logAdmin(`❌ Error actualizando artículo ${record.codigo_barra || 'N/A'}: ${error.message}`, 'error', 'ACTUALIZACION_MASIVA');
            }
        }
        
        const duration = Date.now() - startTime;
        logAdmin(`✅ Actualización masiva completada: ${actualizados} actualizados, ${creados} creados, ${errores} errores (${duration}ms)`, 'success', 'ACTUALIZACION_MASIVA');
        
        res.json({
            success: true,
            message: 'Actualización masiva completada',
            resumen: {
                total: records.length,
                actualizados: actualizados,
                creados: creados,
                errores: errores
            },
            errores: erroresDetalle.length > 0 ? erroresDetalle : undefined,
            duracion_ms: duration,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logAdmin(`❌ Error en actualización masiva: ${error.message}`, 'error', 'ACTUALIZACION_MASIVA');
        res.status(500).json({
            error: 'Error procesando la actualización masiva',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const generarTicketHTML = asyncHandler(async (req, res) => {
    const pedidoId = req.params.id;
    const startTime = Date.now();
    
    logAdmin(`Generando ticket HTML para pedido: ${pedidoId}`, 'info', 'TICKET');
    
    if (!pedidoId || isNaN(pedidoId)) {
        return res.status(400).json({ 
            success: false,
            error: 'ID de pedido inválido',
            timestamp: new Date().toISOString()
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Obtener datos del pedido
        const [pedidoResult] = await connection.execute(`
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
            WHERE id_pedido = ?
        `, [pedidoId]);

        if (pedidoResult.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Pedido no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const pedido = pedidoResult[0];

        // 2. Obtener productos del pedido
        const [productosResult] = await connection.execute(`
            SELECT 
                nombre_producto,
                cantidad,
                precio,
                subtotal
            FROM pedidos_contenido
            WHERE id_pedido = ?
            ORDER BY id ASC
        `, [pedidoId]);

        // 3. Leer template HTML
        const templatePath = path.join(__dirname, '../resources/ticket/ticket.html');
        let htmlTemplate = await fs.readFile(templatePath, 'utf8');

        // 4. Generar filas de productos
        let productosRows = '';
        productosResult.forEach(producto => {
            const precioUnitario = parseFloat(producto.precio).toFixed(2);
            const subtotal = parseFloat(producto.subtotal).toFixed(2);
            
            productosRows += `
                <tr>
                    <td class="col-cant">${producto.cantidad}</td>
                    <td class="col-nombre">${producto.nombre_producto}</td>
                    <td class="col-precio">$ ${subtotal}</td>
                </tr>
            `;
        });

        // 5. Formatear fecha y hora
        const fechaPedido = new Date(pedido.fecha);
        const fecha = fechaPedido.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const hora = fechaPedido.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // 6. Calcular subtotal (total - envío)
        const subtotal = (parseFloat(pedido.monto_total) - parseFloat(pedido.costo_envio || 0)).toFixed(2);
        const costoEnvio = parseFloat(pedido.costo_envio || 0).toFixed(2);
        const total = parseFloat(pedido.monto_total).toFixed(2);

        // 7. Generar sección de notas si existen
        let notasSection = '';
        if (pedido.notas_local && pedido.notas_local.trim() !== '') {
            notasSection = `
                <div class="section border-top">
                    <p><strong>NOTAS:</strong></p>
                    <p>${pedido.notas_local}</p>
                </div>
            `;
        }

        // 8. Reemplazar todos los placeholders
        htmlTemplate = htmlTemplate
            // Datos de la tienda
            .replace(/{{store_name}}/g, process.env.STORE_NAME || 'PuntoSur')
            .replace(/{{store_address}}/g, process.env.STORE_ADDRESS || 'Dirección no disponible')
            .replace(/{{store_phone}}/g, process.env.STORE_PHONE || 'Tel. no disponible')
            .replace(/{{store_email}}/g, process.env.STORE_EMAIL || 'Email no disponible')
            .replace(/{{store_instagram}}/g, process.env.STORE_INSTAGRAM || '@tienda')
            
            // Datos del pedido
            .replace(/{{pedido_id}}/g, pedido.id_pedido)
            .replace(/{{fecha}}/g, fecha)
            .replace(/{{hora}}/g, hora)
            .replace(/{{estado}}/g, pedido.estado.toUpperCase())
            
            // Datos del cliente
            .replace(/{{client_name}}/g, pedido.cliente || 'N/A')
            .replace(/{{client_address}}/g, pedido.direccion_cliente || 'N/A')
            .replace(/{{client_phone}}/g, pedido.telefono_cliente || 'N/A')
            .replace(/{{client_email}}/g, pedido.email_cliente || 'N/A')
            
            // Productos y totales
            .replace(/{{productos_rows}}/g, productosRows)
            .replace(/{{subtotal}}/g, subtotal)
            .replace(/{{costo_envio}}/g, costoEnvio)
            .replace(/{{total}}/g, total)
            
            // Método de pago
            .replace(/{{medio_pago}}/g, pedido.medio_pago || 'No especificado')
            
            // Notas
            .replace(/{{notas_section}}/g, notasSection);

        const duration = Date.now() - startTime;
        logAdmin(`✅ Ticket HTML generado para pedido ${pedidoId} (${duration}ms)`, 'success', 'TICKET');

        // 9. Enviar respuesta
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(htmlTemplate);

    } catch (error) {
        logAdmin(`❌ Error generando ticket para pedido ${pedidoId}: ${error.message}`, 'error', 'TICKET');
        res.status(500).json({ 
            success: false,
            error: 'Error interno al generar el ticket',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


const buscarProductosNuevo = asyncHandler(async (req, res) => {
  const searchTerm = req.query.q?.trim() || '';
  const startTime = Date.now();

  logAdmin(`Buscando productos global: "${searchTerm}"`, 'info', 'PRODUCTOS');

  if (searchTerm.length < 2) {
    return res.status(400).json({
      error: 'El término de búsqueda debe tener al menos 2 caracteres',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const precioSQL = getPrecioCalculadoSQL();

    const query = `
      SELECT 
        COALESCE(a.art_desc_vta, a.NOMBRE) AS nombre, 
        a.CODIGO_BARRA AS codigo_barra, 
        COALESCE(a.COSTO, 0) AS costo, 
        ${precioSQL} AS precio,
        a.COD_DPTO AS categoria_id,
        COALESCE(c.NOM_CLASIF, 'Sin categoría') AS categoria,
        CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) AS stock,
        COALESCE(a.HABILITADO, 'S') AS habilitado,
        COALESCE(a.marca, '') AS marca,
        a.COD_INTERNO AS cod_interno,
        a.COD_IVA,
        a.porc_impint
      FROM articulo a
      LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
      WHERE (
        a.art_desc_vta LIKE ? 
        OR a.NOMBRE LIKE ? 
        OR a.CODIGO_BARRA LIKE ?
      )
      AND a.HABILITADO = 'S'
      AND (${precioSQL}) > 0
      AND CAST(COALESCE(a.STOCK, '0') AS UNSIGNED) > 0
      ORDER BY COALESCE(a.art_desc_vta, a.NOMBRE) ASC
      LIMIT 50
    `;

    const searchPattern = `%${searchTerm}%`;
    const results = await executeQuery(query, [searchPattern, searchPattern, searchPattern], 'BUSCAR_PRODUCTOS');

    const productosFormateados = results.map((p) => ({
      ...p,
      costo: parseFloat(p.costo) || 0,
      precio: parseFloat(p.precio) || 0,
      stock: parseInt(p.stock) || 0,
      categoria: p.categoria || 'Sin categoría',
    }));

    const duration = Date.now() - startTime;
    logAdmin(`✅ ${productosFormateados.length} productos encontrados para "${searchTerm}" (${duration}ms)`, 'success', 'PRODUCTOS');

    res.json(productosFormateados);
  } catch (error) {
    logAdmin(`❌ Error buscando productos "${searchTerm}": ${error.message}`, 'error', 'PRODUCTOS');
    res.status(500).json({
      error: 'Error al buscar productos',
      timestamp: new Date().toISOString(),
    });
  }
});

// ==============================================
// GESTIÓN DE USUARIOS (CRUD)
// ==============================================

// Listar todos los usuarios
const listarUsuarios = asyncHandler(async (req, res) => {
    logAdmin('Listando usuarios', 'info', 'USUARIOS');
    
    try {
        const usuarios = await executeQuery(
            'SELECT id, usuario, rol, created_at, updated_at FROM usuarios ORDER BY created_at DESC',
            [],
            'LISTAR_USUARIOS'
        );

        logAdmin(`✅ ${usuarios.length} usuarios listados`, 'success', 'USUARIOS');
        res.json({
            usuarios: usuarios,
            total: usuarios.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error listando usuarios: ${error.message}`, 'error', 'USUARIOS');
        res.status(500).json({ 
            message: 'Error al listar usuarios',
            timestamp: new Date().toISOString()
        });
    }
});

// Crear nuevo usuario
const crearUsuario = asyncHandler(async (req, res) => {
    const { usuario, password, rol } = req.body;
    
    logAdmin(`Creando usuario: ${usuario}`, 'info', 'USUARIOS');
    
    // Validaciones
    if (!usuario || !password || !rol) {
        return res.status(400).json({ 
            message: 'Usuario, contraseña y rol son requeridos',
            timestamp: new Date().toISOString()
        });
    }

    if (rol !== 'admin' && rol !== 'kiosco') {
        return res.status(400).json({ 
            message: 'Rol debe ser "admin" o "kiosco"',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Verificar si el usuario ya existe
        const usuariosExistentes = await executeQuery(
            'SELECT id FROM usuarios WHERE usuario = ?',
            [usuario],
            'VERIFICAR_USUARIO'
        );

        if (usuariosExistentes && usuariosExistentes.length > 0) {
            logAdmin(`Usuario ${usuario} ya existe`, 'warn', 'USUARIOS');
            return res.status(409).json({ 
                message: 'El usuario ya existe',
                timestamp: new Date().toISOString()
            });
        }

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear usuario
        const resultado = await executeQuery(
            'INSERT INTO usuarios (usuario, password, rol) VALUES (?, ?, ?)',
            [usuario, hashedPassword, rol],
            'CREAR_USUARIO'
        );

        logAdmin(`✅ Usuario ${usuario} creado exitosamente (ID: ${resultado.insertId})`, 'success', 'USUARIOS');
        
        res.status(201).json({
            message: 'Usuario creado exitosamente',
            usuario: {
                id: resultado.insertId,
                usuario: usuario,
                rol: rol
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error creando usuario: ${error.message}`, 'error', 'USUARIOS');
        res.status(500).json({ 
            message: 'Error al crear usuario',
            timestamp: new Date().toISOString()
        });
    }
});

// Actualizar contraseña de usuario
const actualizarPasswordUsuario = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    logAdmin(`Actualizando contraseña del usuario ID: ${id}`, 'info', 'USUARIOS');
    
    if (!password) {
        return res.status(400).json({ 
            message: 'La contraseña es requerida',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Verificar que el usuario existe
        const usuarios = await executeQuery(
            'SELECT id FROM usuarios WHERE id = ?',
            [id],
            'VERIFICAR_USUARIO_ID'
        );

        if (!usuarios || usuarios.length === 0) {
            return res.status(404).json({ 
                message: 'Usuario no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        // Hashear nueva contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Actualizar contraseña
        await executeQuery(
            'UPDATE usuarios SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [hashedPassword, id],
            'ACTUALIZAR_PASSWORD'
        );

        logAdmin(`✅ Contraseña actualizada para usuario ID: ${id}`, 'success', 'USUARIOS');
        
        res.json({
            message: 'Contraseña actualizada exitosamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error actualizando contraseña: ${error.message}`, 'error', 'USUARIOS');
        res.status(500).json({ 
            message: 'Error al actualizar contraseña',
            timestamp: new Date().toISOString()
        });
    }
});

// Eliminar usuario
const eliminarUsuario = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    logAdmin(`Eliminando usuario ID: ${id}`, 'info', 'USUARIOS');
    
    try {
        // Verificar que el usuario existe
        const usuarios = await executeQuery(
            'SELECT id, usuario FROM usuarios WHERE id = ?',
            [id],
            'VERIFICAR_USUARIO_ID'
        );

        if (!usuarios || usuarios.length === 0) {
            return res.status(404).json({ 
                message: 'Usuario no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const usuarioEliminado = usuarios[0];

        // Eliminar usuario
        await executeQuery(
            'DELETE FROM usuarios WHERE id = ?',
            [id],
            'ELIMINAR_USUARIO'
        );

        logAdmin(`✅ Usuario ${usuarioEliminado.usuario} (ID: ${id}) eliminado`, 'success', 'USUARIOS');
        
        res.json({
            message: 'Usuario eliminado exitosamente',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logAdmin(`❌ Error eliminando usuario: ${error.message}`, 'error', 'USUARIOS');
        res.status(500).json({ 
            message: 'Error al eliminar usuario',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = {
    // Autenticación y configuración
    loginCheck,
    verificarAdmin,
    
    // Gestión de usuarios (CRUD)
    listarUsuarios,
    crearUsuario,
    actualizarPasswordUsuario,
    eliminarUsuario,
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
    pedidosPendientesCheck,

    // Liquidación
    articulosLiquidacion,
    agregarArticuloLiquidacion,
    actualizarPrecioLiquidacion,
    eliminarArticuloLiquidacion,
    getPrecioCalculadoSQL,
    generarTicketHTML,
    buscarProductosNuevo,
    
    // Actualización masiva
    actualizarArticulosDesdeJSON
};