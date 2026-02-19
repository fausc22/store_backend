
const express = require('express');
const adminController = require('../controllers/adminController');
const imagenController = require('../controllers/imagenController');
const horariosController = require('../controllers/horariosController');
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
// RUTAS DE GESTIÓN DE USUARIOS (CRUD)
// Solo accesible para usuarios con rol admin
// ==============================================

router.get('/usuarios', adminController.verificarAdmin, adminController.listarUsuarios);
router.post('/usuarios', adminController.verificarAdmin, adminController.crearUsuario);
router.put('/usuarios/:id/password', adminController.verificarAdmin, adminController.actualizarPasswordUsuario);
router.delete('/usuarios/:id', adminController.verificarAdmin, adminController.eliminarUsuario);

// ==============================================
// RUTAS DE GESTIÓN DE PEDIDOS
// ==============================================

// Consulta de pedidos
router.get('/pedidos-pendientes', adminController.pedidosPendientes);
router.get('/pedidos-entregados', adminController.pedidosEntregados);
router.get('/pedidos-productos/:id', adminController.productosPedido);
router.get('/pedidos-pendientes-check', adminController.pedidosPendientesCheck);

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

// Búsqueda de productos (DEBE IR PRIMERO para que no confunda con :codigo)
router.get('/productos/:searchTerm', adminController.buscarProductoEnPedido);
router.get('/buscar-productos/:searchTerm', adminController.buscarProductoEnPedido);

// CRUD de productos individuales (usando rutas más específicas)
router.get('/producto/detalle/:codigo', adminController.obtenerProductoPorCodigo);
router.post('/productos', adminController.crearProducto);
router.put('/actualizarInfoProducto/:id', adminController.actualizarInfoProducto);
router.delete('/producto/:codigo', adminController.eliminarProductoCompleto);

// Obtener todos los productos
router.get('/productos-todos', adminController.obtenerTodosLosProductos);

// Búsqueda avanzada de productos con filtros
router.get('/productos-busqueda-avanzada/:filtrosEncoded', adminController.buscarProductosAvanzado);

// Gestión de stock específica
router.put('/producto/:codigo/stock', adminController.actualizarStockProducto);

// Actualización masiva de artículos desde JSON
router.post('/art-json', adminController.actualizarArticulosDesdeJSON);

// Utilidades de productos
router.get('/categorias', adminController.obtenerCategoriasAdmin);
router.get('/productos-categorias', adminController.obtenerCategoriasProductos);
router.get('/productos-estadisticas', adminController.obtenerEstadisticasProductos);





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
router.post('/mailPedidoRetiro', adminController.MailPedidoRetiro);

// ==============================================
// RUTAS DE ESTADÍSTICAS Y REPORTES
// ==============================================



 //Imágenes de publicidad
router.post('/subir-imagen-publicidad', imagenController.subirImagenPublicidad);
router.post('/subir-imagen-publicidad-base64', imagenController.subirImagenPublicidadBase64);
router.get('/imagenes-publicidad', imagenController.obtenerImagenesPublicidad);
router.delete('/eliminar-imagen-publicidad/:nombreArchivo', imagenController.eliminarImagenPublicidad);

// Imágenes de productos
router.post('/subir-imagen-producto', imagenController.subirImagenProducto);
router.post('/subir-imagen-producto-base64', imagenController.subirImagenProductoBase64);
router.get('/verificar-imagen-producto/:codigoBarra', imagenController.verificarImagenProducto);
router.delete('/eliminar-imagen-producto/:codigoBarra', imagenController.eliminarImagenProducto);


router.get('/productosLiquidacion', adminController.articulosLiquidacion);
router.post('/agregarArticuloLiquidacion', adminController.agregarArticuloLiquidacion);
router.put('/actualizarPrecioLiquidacion', adminController.actualizarPrecioLiquidacion);
router.delete('/eliminarArticuloLiquidacion/:CODIGO_BARRA', adminController.eliminarArticuloLiquidacion);


router.get('/pedido/:id/ticket', adminController.generarTicketHTML);





// Rutas de horarios
router.get('/horarios', horariosController.obtenerHorarios);
router.put('/horarios/dia', horariosController.actualizarHorarioDia);
router.post('/horarios/excepcion', horariosController.agregarExcepcion);
router.delete('/horarios/excepcion/:id', horariosController.eliminarExcepcion);
router.get('/horarios/estado', horariosController.verificarEstadoActual);
// En la sección de imágenes, agregar:
router.post('/subir-video-publicidad-base64', imagenController.subirVideoPublicidadBase64);
router.post('/subir-archivo-publicidad-base64', imagenController.subirArchivoPublicidadBase64);

router.post('/guardar-orden-showcase', imagenController.guardarOrdenShowcase);
router.get('/obtener-orden-showcase', imagenController.obtenerOrdenShowcase);

router.get('/buscar-productos-nuevo', adminController.buscarProductosNuevo);


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
            'GET /admin/variablesenv - Variables de configuración'
        ]
    });
});










module.exports = router;