
const express = require('express');
const adminController = require('../controllers/adminController');
const router = express.Router();

// ==============================================
// MIDDLEWARE DE LOGGING PARA ADMIN
// ==============================================
router.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[35m[${timestamp}] [ADMIN-ROUTE] ${req.method} ${req.originalUrl}\x1b[0m`);
    next();
});

// ==============================================
// RUTAS DE AUTENTICACIÓN Y CONFIGURACIÓN
// ==============================================

// Autenticación
router.post('/loginCheck', adminController.loginCheck);
router.post('/login', adminController.login); // Alias para compatibilidad

// Configuración de la tienda
router.get('/getConfig', adminController.obtenerConfig);
router.post('/saveConfig', adminController.saveConfig);
router.get('/variablesenv', adminController.variablesEnv);

// ==============================================
// RUTAS DE GESTIÓN DE PEDIDOS
// ==============================================

// Consulta de pedidos
router.get('/pedidos-pendientes', adminController.pedidosPendientes);
router.get('/pedidos-entregados', adminController.pedidosEntregados);
router.get('/pedidos-productos/:id', adminController.productosPedido);

// Modificación de pedidos
router.put('/actualizar-pedido/:id', adminController.actualizarPedido);
router.put('/actualizar-pedido-procesado/:id', adminController.actualizarEstadoPedidoProcesado);
router.put('/actualizar-pedido-camino/:id', adminController.actualizarEstadoPedidoEnCamino);
router.delete('/eliminarPedido/:id', adminController.eliminarPedido);

// Gestión de productos en pedidos
router.post('/agregar-producto', adminController.agregarProductoAlPedido);
router.put('/actualizar-producto/:id', adminController.actualizarProducto);
router.delete('/eliminar-producto/:id', adminController.eliminarProducto);

// ==============================================
// RUTAS DE GESTIÓN DE PRODUCTOS
// ==============================================

// Búsqueda y modificación de productos
router.get('/productos', adminController.buscarProductoEnPedido);
router.put('/actualizarInfoProducto/:id', adminController.actualizarInfoProducto);

// ==============================================
// RUTAS DE OFERTAS Y DESTACADOS
// ==============================================

// Consulta de ofertas y destacados
router.get('/productosOferta', adminController.articulosOferta);
router.get('/productosDest', adminController.articulosDest);

// Gestión de ofertas
router.post('/agregarArticuloOferta', adminController.agregarArticuloOferta);
router.put('/actualizarPrecioOferta', adminController.actualizarPrecioOferta);
router.delete('/eliminarArticuloOferta/:CODIGO_BARRA', adminController.eliminarArticuloOferta);

// Gestión de destacados
router.post('/agregarArticuloDest', adminController.agregarArticuloDest);
router.delete('/eliminarArticuloDest/:CODIGO_BARRA', adminController.eliminarArticuloDest);

// ==============================================
// RUTAS DE SISTEMA DE EMAILS
// ==============================================

// Emails de notificación
router.post('/mailPedidoConfirmado', adminController.MailPedidoProcesado);
router.post('/mailPedidoEnCamino', adminController.MailPedidoEnCamino);

// ==============================================
// RUTAS DE ESTADÍSTICAS Y REPORTES
// ==============================================

// Estadísticas del negocio
router.get('/getStats', adminController.obtenerStats);

// ==============================================
// MIDDLEWARE DE MANEJO DE ERRORES ESPECÍFICO
// ==============================================
router.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    console.error(`\x1b[31m[${timestamp}] [ADMIN-ERROR] [${errorId}] ${error.message}\x1b[0m`);
    console.error(`\x1b[31m[${timestamp}] [ADMIN-ERROR] [${errorId}] Request: ${req.method} ${req.originalUrl}\x1b[0m`);
    
    // No enviar detalles del error en producción para admin
    const errorResponse = {
        error: 'Error en el panel de administración',
        errorId: errorId,
        timestamp: timestamp,
        endpoint: req.originalUrl
    };
    
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = error.message;
        errorResponse.stack = error.stack;
    }
    
    res.status(500).json(errorResponse);
});

// ==============================================
// RUTA 404 ESPECÍFICA PARA ADMIN
// ==============================================
router.use('*', (req, res) => {
    const timestamp = new Date().toISOString();
    console.warn(`\x1b[33m[${timestamp}] [ADMIN-404] Ruta no encontrada: ${req.method} ${req.originalUrl}\x1b[0m`);
    
    res.status(404).json({
        error: 'Ruta de administración no encontrada',
        method: req.method,
        url: req.originalUrl,
        timestamp: timestamp,
        availableEndpoints: [
            'POST /admin/loginCheck - Autenticación',
            'GET /admin/pedidos-pendientes - Pedidos pendientes',
            'GET /admin/pedidos-entregados - Pedidos entregados',
            'GET /admin/productosOferta - Productos en oferta',
            'GET /admin/productosDest - Productos destacados',
            'GET /admin/getStats - Estadísticas',
            'GET /admin/variablesenv - Variables de configuración'
        ]
    });
});

module.exports = router;