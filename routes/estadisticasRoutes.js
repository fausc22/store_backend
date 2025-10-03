// routes/estadisticasRoutes.js
const express = require('express');
const router = express.Router();

// Importar controladores de estadísticas
const {
    obtenerEstadisticasCompletas,
    obtenerMetricasRapidas,
    compararPeriodos,
    obtenerEstadisticasProducto
} = require('../controllers/estadisticaController');

// ==============================================
// MIDDLEWARE DE VALIDACIÓN
// ==============================================

// Middleware para validar formato de fechas
const validarFechas = (req, res, next) => {
    const { fechaInicio, fechaFin } = req.query;
    
    if (fechaInicio && !fechaInicio.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return res.status(400).json({
            error: 'Formato de fechaInicio inválido. Use YYYY-MM-DD',
            timestamp: new Date().toISOString()
        });
    }
    
    if (fechaFin && !fechaFin.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return res.status(400).json({
            error: 'Formato de fechaFin inválido. Use YYYY-MM-DD',
            timestamp: new Date().toISOString()
        });
    }
    
    next();
};

// Middleware para validar código de barra
const validarCodigoBarra = (req, res, next) => {
    const { codigoBarra } = req.params;
    
    if (!codigoBarra || codigoBarra.trim().length === 0) {
        return res.status(400).json({
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }
    
    // Sanitizar código de barra (solo alfanuméricos)
    req.params.codigoBarra = codigoBarra.replace(/[^a-zA-Z0-9]/g, '');
    
    if (req.params.codigoBarra.length === 0) {
        return res.status(400).json({
            error: 'Código de barra contiene caracteres inválidos',
            timestamp: new Date().toISOString()
        });
    }
    
    next();
};

// Middleware para validar parámetros de comparación
const validarComparacion = (req, res, next) => {
    const { fechaInicio1, fechaFin1, fechaInicio2, fechaFin2 } = req.query;
    
    // Verificar que se proporcionen ambos períodos
    if (!fechaInicio1 || !fechaFin1 || !fechaInicio2 || !fechaFin2) {
        return res.status(400).json({
            error: 'Se requieren fechaInicio1, fechaFin1, fechaInicio2 y fechaFin2 para la comparación',
            timestamp: new Date().toISOString()
        });
    }
    
    // Validar formato de todas las fechas
    const fechas = [fechaInicio1, fechaFin1, fechaInicio2, fechaFin2];
    const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
    
    for (const fecha of fechas) {
        if (!fecha.match(formatoFecha)) {
            return res.status(400).json({
                error: 'Formato de fecha inválido. Use YYYY-MM-DD para todas las fechas',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    next();
};

// Middleware para logs de acceso a estadísticas
const logAccesoEstadisticas = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const endpoint = req.originalUrl;
    
    console.log(`[${timestamp}] [ESTADISTICAS-ACCESS] IP: ${ip} | Endpoint: ${endpoint}`);
    next();
};

// ==============================================
// RUTAS PRINCIPALES
// ==============================================

/**
 * @route   GET /api/estadisticas/completas
 * @desc    Obtener estadísticas completas del negocio
 * @access  Private (requiere autenticación admin)
 * @params  fechaInicio (opcional) - Formato: YYYY-MM-DD
 *          fechaFin (opcional) - Formato: YYYY-MM-DD
 * @example GET /api/estadisticas/completas?fechaInicio=2024-01-01&fechaFin=2024-12-31
 */
router.get('/completas', 
    logAccesoEstadisticas,
    validarFechas,
    obtenerEstadisticasCompletas
);

/**
 * @route   GET /api/estadisticas/rapidas
 * @desc    Obtener métricas rápidas para dashboard
 * @access  Private (requiere autenticación admin)
 * @example GET /api/estadisticas/rapidas
 */
router.get('/rapidas', 
    logAccesoEstadisticas,
    obtenerMetricasRapidas
);

/**
 * @route   GET /api/estadisticas/comparar
 * @desc    Comparar dos períodos de tiempo
 * @access  Private (requiere autenticación admin)
 * @params  fechaInicio1, fechaFin1 - Primer período
 *          fechaInicio2, fechaFin2 - Segundo período
 * @example GET /api/estadisticas/comparar?fechaInicio1=2024-01-01&fechaFin1=2024-01-31&fechaInicio2=2024-02-01&fechaFin2=2024-02-29
 */
router.get('/comparar',
    logAccesoEstadisticas,
    validarComparacion,
    compararPeriodos
);

/**
 * @route   GET /api/estadisticas/producto/:codigoBarra
 * @desc    Obtener estadísticas de un producto específico
 * @access  Private (requiere autenticación admin)
 * @params  codigoBarra - Código de barra del producto
 *          fechaInicio (opcional) - Formato: YYYY-MM-DD
 *          fechaFin (opcional) - Formato: YYYY-MM-DD
 * @example GET /api/estadisticas/producto/1234567890123?fechaInicio=2024-01-01&fechaFin=2024-12-31
 */
router.get('/producto/:codigoBarra',
    logAccesoEstadisticas,
    validarCodigoBarra,
    validarFechas,
    obtenerEstadisticasProducto
);

// ==============================================
// RUTAS ADICIONALES ÚTILES
// ==============================================

/**
 * @route   GET /api/estadisticas/health
 * @desc    Endpoint de salud para verificar el estado del servicio
 * @access  Public
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Estadísticas API',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * @route   GET /api/estadisticas/info
 * @desc    Información sobre los endpoints disponibles
 * @access  Private
 */
router.get('/info', logAccesoEstadisticas, (req, res) => {
    res.json({
        service: 'API de Estadísticas del Negocio',
        version: '1.0.0',
        endpoints: {
            '/completas': {
                method: 'GET',
                description: 'Estadísticas completas del negocio',
                parameters: ['fechaInicio?', 'fechaFin?'],
                example: '/api/estadisticas/completas?fechaInicio=2024-01-01&fechaFin=2024-12-31'
            },
            '/rapidas': {
                method: 'GET',
                description: 'Métricas rápidas para dashboard',
                parameters: [],
                example: '/api/estadisticas/rapidas'
            },
            '/comparar': {
                method: 'GET',
                description: 'Comparar dos períodos de tiempo',
                parameters: ['fechaInicio1', 'fechaFin1', 'fechaInicio2', 'fechaFin2'],
                example: '/api/estadisticas/comparar?fechaInicio1=2024-01-01&fechaFin1=2024-01-31&fechaInicio2=2024-02-01&fechaFin2=2024-02-29'
            },
            '/producto/:codigoBarra': {
                method: 'GET',
                description: 'Estadísticas de un producto específico',
                parameters: ['codigoBarra', 'fechaInicio?', 'fechaFin?'],
                example: '/api/estadisticas/producto/1234567890123?fechaInicio=2024-01-01&fechaFin=2024-12-31'
            }
        },
        timestamp: new Date().toISOString()
    });
});

// ==============================================
// MANEJO DE ERRORES
// ==============================================

// Middleware para manejar rutas no encontradas
router.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint de estadísticas no encontrado',
        availableEndpoints: [
            '/api/estadisticas/completas',
            '/api/estadisticas/rapidas',
            '/api/estadisticas/comparar',
            '/api/estadisticas/producto/:codigoBarra',
            '/api/estadisticas/health',
            '/api/estadisticas/info'
        ],
        timestamp: new Date().toISOString()
    });
});

// Middleware para manejo de errores específicos de estadísticas
router.use((error, req, res, next) => {
    console.error(`[${new Date().toISOString()}] [ESTADISTICAS-ERROR] ${error.message}`);
    console.error('Stack trace:', error.stack);
    
    // Errores de base de datos
    if (error.code === 'ER_BAD_DB_ERROR') {
        return res.status(503).json({
            error: 'Servicio de base de datos no disponible',
            timestamp: new Date().toISOString()
        });
    }
    
    // Errores de timeout
    if (error.code === 'ETIMEDOUT') {
        return res.status(504).json({
            error: 'Timeout en consulta de estadísticas',
            timestamp: new Date().toISOString()
        });
    }
    
    // Error genérico
    res.status(500).json({
        error: 'Error interno en el servicio de estadísticas',
        timestamp: new Date().toISOString(),
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

module.exports = router;