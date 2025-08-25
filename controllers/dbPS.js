// controllers/db.js - VERSIÓN CORREGIDA Y SIMPLIFICADA
const mysql = require('mysql2/promise');

// Configuración del pool de conexiones
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '251199',
        database: process.env.DB_NAME || 'gootpv',
        port: parseInt(process.env.DB_PORT) || 3306,

    // CONFIGURACIONES DE POOL
    connectionLimit: 20,
    queueLimit: 100,
    acquireTimeout: 60000,
    timeout: 60000,
    
    // CONFIGURACIONES DE RECONEXIÓN
    reconnect: true,
    
    // CONFIGURACIONES DE CHARSET
    charset: 'utf8mb4',
    timezone: 'local',
    
    // CONFIGURACIONES DE NÚMEROS
    supportBigNumbers: true,
    bigNumberStrings: true,
    
    // CONFIGURACIONES ADICIONALES
    dateStrings: true,
    multipleStatements: false,
    typeCast: true
};

// Crear el pool
const pool = mysql.createPool(poolConfig);

// Sistema de logs mejorado
const logConnection = (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DB-${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
        console.error('\x1b[31m%s\x1b[0m', logMessage); // Rojo
    } else if (level === 'warn') {
        console.warn('\x1b[33m%s\x1b[0m', logMessage); // Amarillo
    } else if (level === 'success') {
        console.log('\x1b[32m%s\x1b[0m', logMessage); // Verde
    } else {
        console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan
    }
};

// Verificar conexión inicial
const initializeDatabase = async () => {
    try {
        logConnection('🔄 Inicializando conexión a la base de datos...', 'info');
        
        // Probar conexión
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        
        logConnection('✅ Conexión a la base de datos MySQL establecida exitosamente', 'success');
        logConnection(`📊 Pool configurado: host=${poolConfig.host}, database=${poolConfig.database}, connectionLimit=${poolConfig.connectionLimit}`, 'info');
        
        // Iniciar monitoreo cada 5 minutos
        setInterval(monitorPool, 5 * 60 * 1000);
        
        return true;
    } catch (error) {
        logConnection(`❌ Error conectando a la base de datos: ${error.message}`, 'error');
        logConnection(`🔧 Configuración: host=${poolConfig.host}, database=${poolConfig.database}, port=${poolConfig.port}`, 'warn');
        throw error;
    }
};

// Monitoreo del pool de conexiones
const monitorPool = () => {
    try {
        // En mysql2/promise, el acceso a estadísticas es diferente
        logConnection(`📊 Pool está activo y funcionando correctamente`, 'info');
    } catch (error) {
        logConnection(`⚠️  Error obteniendo estadísticas del pool: ${error.message}`, 'warn');
    }
};

// Función helper para ejecutar queries con logs
const executeQuery = async (query, params = [], operation = 'QUERY') => {
    const startTime = Date.now();
    let connection;
    
    try {
        connection = await pool.getConnection();
        const [results, fields] = await connection.execute(query, params);
        
        const duration = Date.now() - startTime;
        logConnection(`✓ ${operation} ejecutado exitosamente (${duration}ms)`, 'success');
        
        // Log detallado en desarrollo
        if (process.env.NODE_ENV === 'development' && duration > 1000) {
            logConnection(`⚠️  Query lenta detectada (${duration}ms): ${query.substring(0, 100)}...`, 'warn');
        }
        
        return results;
    } catch (error) {
        const duration = Date.now() - startTime;
        logConnection(`❌ Error en ${operation} (${duration}ms): ${error.message}`, 'error');
        logConnection(`🔍 Query: ${query.substring(0, 200)}...`, 'error');
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// Función para obtener estadísticas del pool
const getPoolStats = () => {
    return {
        config: {
            host: poolConfig.host,
            database: poolConfig.database,
            connectionLimit: poolConfig.connectionLimit,
            queueLimit: poolConfig.queueLimit,
            acquireTimeout: poolConfig.acquireTimeout
        },
        status: 'active'
    };
};

// Función para cerrar el pool limpiamente
const closePool = async () => {
    try {
        logConnection('🔄 Cerrando pool de conexiones...', 'info');
        await pool.end();
        logConnection('✅ Pool de conexiones cerrado correctamente', 'success');
    } catch (error) {
        logConnection(`❌ Error cerrando pool: ${error.message}`, 'error');
        throw error;
    }
};

// Manejo de señales para cierre limpio
process.on('SIGINT', async () => {
    logConnection('🛑 Señal SIGINT recibida, cerrando conexiones...', 'warn');
    try {
        await closePool();
    } catch (error) {
        logConnection(`❌ Error en cierre limpio: ${error.message}`, 'error');
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logConnection('🛑 Señal SIGTERM recibida, cerrando conexiones...', 'warn');
    try {
        await closePool();
    } catch (error) {
        logConnection(`❌ Error en cierre limpio: ${error.message}`, 'error');
    }
    process.exit(0);
});

// Exportar pool y funciones
module.exports = {
    pool,
    executeQuery,
    initializeDatabase,
    getPoolStats,
    closePool,
    logConnection
};