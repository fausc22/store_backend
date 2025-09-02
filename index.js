require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const https = require('https');
const fs = require('fs');
const { initializeDatabase, logConnection, getPoolStats } = require('./controllers/dbPS');

const app = express();
const port = 3002;

// ==============================================
// SISTEMA DE LOGS CENTRALIZADO
// ==============================================
const logApp = (message, level = 'info', module = 'APP') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${module}-${level.toUpperCase()}] ${message}`;
    
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
// CONFIGURACIÓN DE CORS MEJORADA
// ==============================================
const allowedOrigins = [
    'http://localhost:3000/',
    'http://localhost:3000',
    'http://localhost:3001/',
    'https://vps-5234411-x.dattaweb.com/',
    'https://vps-5234411-x.dattaweb.com'
];

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir requests sin origin (mobile apps, postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            logApp(`✅ CORS permitido para origen: ${origin}`, 'info', 'CORS');
            callback(null, true);
        } else {
            logApp(`❌ CORS bloqueado para origen: ${origin}`, 'warn', 'CORS');
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // Para soportar navegadores legacy
};

app.use(cors(corsOptions));

// ==============================================
// CONFIGURACIÓN DE LOGGING DE REQUESTS
// ==============================================
// Morgan personalizado para logs de requests
morgan.token('real-ip', (req) => {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
});

morgan.token('response-time-colored', (req, res) => {
    const responseTime = parseInt(morgan['response-time'](req, res));
    if (responseTime > 1000) return `\x1b[31m${responseTime}ms\x1b[0m`; // Rojo si > 1s
    if (responseTime > 500) return `\x1b[33m${responseTime}ms\x1b[0m`;  // Amarillo si > 500ms
    return `\x1b[32m${responseTime}ms\x1b[0m`; // Verde si < 500ms
});

const morganFormat = ':real-ip - :method :url :status :response-time-colored - :user-agent';

app.use(morgan(morganFormat, {
    stream: {
        write: (message) => {
            // Limpiar el mensaje y loggearlo con nuestro sistema
            const cleanMessage = message.trim();
            if (cleanMessage.includes(' 5')) {
                logApp(`🔴 ${cleanMessage}`, 'error', 'HTTP');
            } else if (cleanMessage.includes(' 4')) {
                logApp(`🟡 ${cleanMessage}`, 'warn', 'HTTP');
            } else {
                logApp(`🟢 ${cleanMessage}`, 'info', 'HTTP');
            }
        }
    }
}));

// ==============================================
// CONFIGURACIÓN DE SESIONES MEJORADA
// ==============================================
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    name: 'tienda_session_id', // Nombre personalizado para seguridad
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS en producción
        httpOnly: true, // Prevenir XSS
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax' // Protección CSRF
    }
};

app.use(session(sessionConfig));
logApp('✅ Configuración de sesiones aplicada', 'success', 'SESSION');

// ==============================================
// MIDDLEWARE DE PARSING
// ==============================================
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        // Log de payloads grandes
        if (buf.length > 1024 * 1024) { // > 1MB
            logApp(`⚠️  Payload grande recibido: ${(buf.length / 1024 / 1024).toFixed(2)}MB`, 'warn', 'PAYLOAD');
        }
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
}));

// ==============================================
// MIDDLEWARE DE SEGURIDAD
// ==============================================
// Headers de seguridad básicos
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rate limiting básico (middleware simple)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos

// Configuración de límites por tipo de endpoint
const RATE_LIMITS = {
    // Navegación general - muy permisivo
    general: {
        max: 5000,  // 5000 requests por 15 minutos (≈5.5 requests/segundo)
        routes: ['/store/productos', '/store/categorias', '/store/buscar', '/store/ofertas', '/store/destacados']
    },
    // Imágenes - muy permisivo para carga de productos
    images: {
        max: 3000,  // 3000 requests por 15 minutos
        routes: ['/images/', '/showcase/', '/store/imagen-producto']
    },
    // Carrito y checkout - moderado
    cart: {
        max: 1000,  // 1000 requests por 15 minutos
        routes: ['/store/carrito', '/store/checkout', '/store/calcular-envio']
    },
    // Operaciones sensibles - más restrictivo
    sensitive: {
        max: 200,   // 200 requests por 15 minutos
        routes: ['/store/pedido', '/store/pago', '/store/email']
    }
    
};

// Función para determinar el tipo de endpoint
const getEndpointType = (path) => {
    for (const [type, config] of Object.entries(RATE_LIMITS)) {
        if (config.routes.some(route => path.startsWith(route))) {
            return type;
        }
    }
    return 'general'; // Por defecto
};

// Middleware de rate limiting mejorado
app.use((req, res, next) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
    const now = Date.now();
    const endpointType = getEndpointType(req.path);
    const limit = RATE_LIMITS[endpointType].max;
    
    // Clave única por IP y tipo de endpoint
    const key = `${clientIp}_${endpointType}`;
    
    if (!requestCounts.has(key)) {
        requestCounts.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW, type: endpointType });
    } else {
        const clientData = requestCounts.get(key);
        if (now > clientData.resetTime) {
            clientData.count = 1;
            clientData.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            clientData.count++;
        }
        
        if (clientData.count > limit) {
            logApp(`🚫 Rate limit excedido para IP: ${clientIp}, tipo: ${endpointType}, límite: ${limit}`, 'warn', 'SECURITY');
            return res.status(429).json({ 
                error: 'Demasiadas peticiones, intenta más tarde',
                type: endpointType,
                limit: limit,
                retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
                message: endpointType === 'general' ? 
                    'Navegación muy intensa, por favor espera un momento' :
                    endpointType === 'sensitive' ?
                    'Demasiadas operaciones sensibles, espera antes de continuar' :
                    'Límite de peticiones alcanzado'
            });
        }
    }
    
    // Headers informativos
    res.setHeader('X-RateLimit-Type', endpointType);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - (requestCounts.get(key)?.count || 0)));
    
    next();
});

// Limpiar el mapa de rate limiting cada hora
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, data] of requestCounts.entries()) {
        if (now > data.resetTime) {
            requestCounts.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        logApp(`🧹 Cache de rate limiting limpiado. ${cleanedCount} entradas removidas. Activas: ${requestCounts.size}`, 'info', 'MAINTENANCE');
    }
}, 60 * 60 * 1000);

// ==============================================
// SERVIR ARCHIVOS ESTÁTICOS
// ==============================================
const staticOptions = {
    maxAge: '1d', // Cache por 1 día
    etag: true,
    lastModified: true
};

app.use("/showcase", express.static("resources/showcase", staticOptions));
app.use("/images/products", express.static("resources/img_art", staticOptions));
app.use("/images", express.static("public/images", staticOptions));




logApp('✅ Rutas estáticas configuradas', 'success', 'STATIC');

// ==============================================
// IMPORTAR Y CONFIGURAR RUTAS
// ==============================================
const storeRoutes = require('./routes/storeRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/store', storeRoutes);
app.use('/admin', adminRoutes);

logApp('✅ Rutas de API configuradas', 'success', 'ROUTES');

// ==============================================
// RUTA DE HEALTH CHECK
// ==============================================
app.get('/health', async (req, res) => {
    try {
        const dbStats = getPoolStats();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        const healthData = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            environment: process.env.NODE_ENV || 'development',
            database: {
                status: 'connected',
                pool: dbStats
            },
            memory: {
                used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
            },
            server: {
                port: port,
                pid: process.pid
            }
        };
        
        res.status(200).json(healthData);
    } catch (error) {
        logApp(`❌ Health check falló: ${error.message}`, 'error', 'HEALTH');
        res.status(503).json({
            status: 'ERROR',
            message: 'Service temporarily unavailable',
            timestamp: new Date().toISOString()
        });
    }
});








// ==============================================
// MIDDLEWARE DE MANEJO DE ERRORES GLOBAL
// ==============================================
app.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    logApp(`❌ Error no manejado [${errorId}]: ${error.message}`, 'error', 'ERROR');
    logApp(`🔍 Stack trace [${errorId}]: ${error.stack}`, 'error', 'ERROR');
    logApp(`🌐 Request info [${errorId}]: ${req.method} ${req.url} from ${req.ip}`, 'error', 'ERROR');
    
    // No enviar stack trace en producción
    const errorResponse = {
        error: 'Error interno del servidor',
        errorId: errorId,
        timestamp: timestamp
    };
    
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = error.message;
        errorResponse.stack = error.stack;
    }
    
    res.status(500).json(errorResponse);
});

// ==============================================
// RUTA 404 - NO ENCONTRADA
// ==============================================
app.use('*', (req, res) => {
    logApp(`🔍 Ruta no encontrada: ${req.method} ${req.originalUrl} desde ${req.ip}`, 'warn', 'NOT_FOUND');
    res.status(404).json({
        error: 'Ruta no encontrada',
        method: req.method,
        url: req.originalUrl,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
            '/health',
            '/store/*',
            '/admin/*'
        ]
    });
});

// ==============================================
// INICIALIZACIÓN DEL SERVIDOR
// ==============================================
const startServer = async () => {
    try {
        logApp('🚀 Iniciando servidor de la tienda online...', 'info', 'STARTUP');
        
        // Inicializar base de datos
        await initializeDatabase();
        
        // Solo servidor HTTP (puerto 4000)
        const server = app.listen(port, '0.0.0.0', () => {
            logApp(`🌟 ¡Servidor HTTP iniciado exitosamente!`, 'success', 'STARTUP');
            logApp(`🔗 URL local: http://localhost:${port}`, 'info', 'STARTUP');
            logApp(`🔗 URL red: http://vps-5234411-x.dattaweb.com:${port}`, 'info', 'STARTUP');
            logApp(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`, 'info', 'STARTUP');
            logApp(`🏪 Tienda: ${process.env.STORE_NAME || 'PuntoSur'}`, 'info', 'STARTUP');
            
            // Logs de configuración importante
            logApp(`⚙️  Configuraciones cargadas:`, 'info', 'CONFIG');
            logApp(`   - IVA: ${process.env.IVA || 'No configurado'}%`, 'info', 'CONFIG');
            logApp(`   - Envío base: $${process.env.STORE_DELIVERY_BASE || 'No configurado'}`, 'info', 'CONFIG');
            logApp(`   - Estado página: ${process.env.PAGE_STATUS || 'No configurado'}`, 'info', 'CONFIG');
        });
        
        // Configurar timeout del servidor
        server.timeout = 30000;
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;
        
        // Manejo de cierre limpio
        process.on('SIGINT', () => {
            logApp('🛑 Señal SIGINT recibida, cerrando servidor...', 'warn', 'SHUTDOWN');
            server.close(() => {
                logApp('✅ Servidor cerrado limpiamente', 'success', 'SHUTDOWN');
                process.exit(0);
            });
        });
        
        process.on('SIGTERM', () => {
            logApp('🛑 Señal SIGTERM recibida, cerrando servidor...', 'warn', 'SHUTDOWN');
            server.close(() => {
                logApp('✅ Servidor cerrado limpiamente', 'success', 'SHUTDOWN');
                process.exit(0);
            });
        });
        
        // Logs periódicos de estadísticas
        setInterval(() => {
            const uptime = process.uptime();
            const memoryUsage = process.memoryUsage();
            logApp(`📊 Estadísticas del servidor:`, 'info', 'STATS');
            logApp(`   - Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`, 'info', 'STATS');
            logApp(`   - Memoria: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB usada de ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`, 'info', 'STATS');
            logApp(`   - IPs activas en rate limit: ${requestCounts.size}`, 'info', 'STATS');
        }, 30 * 60 * 1000); // Cada 30 minutos
        
    } catch (error) {
        logApp(`💥 Error crítico iniciando servidor: ${error.message}`, 'error', 'STARTUP');
        logApp(`🔍 Stack trace: ${error.stack}`, 'error', 'STARTUP');
        process.exit(1);
    }
};

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    logApp(`💥 Excepción no capturada: ${error.message}`, 'error', 'CRITICAL');
    logApp(`🔍 Stack trace: ${error.stack}`, 'error', 'CRITICAL');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logApp(`💥 Promise rechazada no manejada en: ${promise}`, 'error', 'CRITICAL');
    logApp(`🔍 Razón: ${reason}`, 'error', 'CRITICAL');
    process.exit(1);
});

// Iniciar el servidor
startServer();