// controllers/imagenController.js - VERSIÓN CORREGIDA PARA PRODUCCIÓN
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');

// ==============================================
// SISTEMA DE LOGS MEJORADO
// ==============================================
const logImagen = (message, level = 'info', operation = 'IMAGEN') => {
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

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==============================================
// CONFIGURACIÓN DE DIRECTORIOS CON VERIFICACIÓN
// ==============================================

const publicidadPath = path.join(__dirname, "../resources/showcase");
const productosPath = path.join(__dirname, "../resources/img_art");

const crearDirectorios = async () => {
    try {
        // Crear directorio de publicidad
        if (!fsSync.existsSync(publicidadPath)) {
            await fs.mkdir(publicidadPath, { recursive: true, mode: 0o755 });
            logImagen(`✅ Directorio de publicidad creado: ${publicidadPath}`, 'success', 'SETUP');
        } else {
            logImagen(`📁 Directorio de publicidad existe: ${publicidadPath}`, 'info', 'SETUP');
        }
        
        // Verificar permisos de escritura
        await fs.access(publicidadPath, fs.constants.W_OK);
        logImagen(`✅ Permisos de escritura verificados para publicidad`, 'success', 'SETUP');
        
        // Crear directorio de productos
        if (!fsSync.existsSync(productosPath)) {
            await fs.mkdir(productosPath, { recursive: true, mode: 0o755 });
            logImagen(`✅ Directorio de productos creado: ${productosPath}`, 'success', 'SETUP');
        } else {
            logImagen(`📁 Directorio de productos existe: ${productosPath}`, 'info', 'SETUP');
        }
        
        // Verificar permisos de escritura
        await fs.access(productosPath, fs.constants.W_OK);
        logImagen(`✅ Permisos de escritura verificados para productos`, 'success', 'SETUP');
        
    } catch (error) {
        logImagen(`❌ Error crítico configurando directorios: ${error.message}`, 'error', 'SETUP');
        throw error; // Es crítico que falle si no se pueden crear directorios
    }
};

// Inicializar directorios
crearDirectorios().catch(error => {
    console.error('❌ Error fatal en configuración de directorios:', error);
    process.exit(1);
});

// ==============================================
// CONFIGURACIÓN MULTER MEJORADA PARA PUBLICIDAD
// ==============================================

const storagePublicidad = multer.diskStorage({
    destination: (req, file, cb) => {
        logImagen(`📂 Configurando destino para: ${file.originalname}`, 'info', 'MULTER');
        
        // Verificar que el directorio existe
        if (!fsSync.existsSync(publicidadPath)) {
            const error = new Error(`Directorio de destino no existe: ${publicidadPath}`);
            logImagen(`❌ ${error.message}`, 'error', 'MULTER');
            return cb(error);
        }
        
        cb(null, publicidadPath);
    },
    filename: (req, file, cb) => {
        try {
            const timestamp = Date.now();
            const extension = path.extname(file.originalname).toLowerCase();
            const nombreBase = path.basename(file.originalname, extension)
                .replace(/[^a-zA-Z0-9.-]/g, '_')
                .substring(0, 30);
            
            const nombreFinal = `publicidad-${timestamp}-${nombreBase}${extension}`;
            
            logImagen(`📝 Nombre de archivo generado: ${nombreFinal}`, 'info', 'MULTER');
            cb(null, nombreFinal);
        } catch (error) {
            logImagen(`❌ Error generando nombre de archivo: ${error.message}`, 'error', 'MULTER');
            cb(error);
        }
    },
});

// Configuración de multer con mejor manejo de errores
const uploadPublicidad = multer({ 
    storage: storagePublicidad,
    limits: { 
        fileSize: 5 * 1024 * 1024,  // 5MB
        files: 1,                   // Solo 1 archivo
        fields: 10,                 // Máximo 10 campos
        fieldSize: 1024 * 1024      // 1MB por campo
    },
    fileFilter: (req, file, cb) => {
        logImagen(`🔍 Validando archivo: ${file.originalname}, tipo: ${file.mimetype}`, 'info', 'MULTER');
        
        const allowedTypes = /jpeg|jpg|png|webp/;
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        
        const mimetype = allowedMimeTypes.includes(file.mimetype.toLowerCase());
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            logImagen(`✅ Archivo válido: ${file.originalname}`, 'success', 'MULTER');
            return cb(null, true);
        }
        
        const error = new Error(`Archivo no válido: ${file.originalname}. Solo se permiten: JPG, PNG, WEBP`);
        logImagen(`❌ ${error.message}`, 'error', 'MULTER');
        cb(error);
    }
}).single("imagen"); // IMPORTANTE: debe coincidir con el nombre del campo en el frontend

// ==============================================
// CONTROLADOR MEJORADO PARA PUBLICIDAD
// ==============================================

const subirImagenPublicidad = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('🚀 Iniciando subida de imagen de publicidad', 'info', 'PUBLICIDAD');
    logImagen(`📊 Headers recibidos: ${JSON.stringify(req.headers, null, 2)}`, 'info', 'DEBUG');
    
    // VERIFICACIÓN MEJORADA DE CONTENT-TYPE
    const contentType = req.headers['content-type'] || req.headers['Content-Type'];
    logImagen(`🔍 Content-Type recibido: "${contentType}"`, 'info', 'DEBUG');
    
    // Verificar que sea multipart/form-data (puede tener boundary)
    if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) {
        logImagen(`❌ Content-Type inválido: ${contentType}`, 'error', 'PUBLICIDAD');
        logImagen(`📊 Todos los headers: ${JSON.stringify(req.headers)}`, 'error', 'DEBUG');
        
        return res.status(400).json({ 
            success: false, 
            message: `Content-Type debe ser multipart/form-data. Recibido: ${contentType}`,
            received: contentType,
            allHeaders: req.headers
        });
    }
    
    logImagen(`✅ Content-Type válido: ${contentType}`, 'success', 'PUBLICIDAD');
    
    // WRAPPER PARA BETTER ERROR HANDLING
    uploadPublicidad(req, res, async (err) => {
        const duration = Date.now() - startTime;
        
        if (err) {
            // Log detallado del error
            logImagen(`❌ Error de multer: ${err.message}`, 'error', 'PUBLICIDAD');
            logImagen(`🔍 Tipo de error: ${err.constructor.name}`, 'error', 'PUBLICIDAD');
            logImagen(`🔍 Stack: ${err.stack}`, 'error', 'PUBLICIDAD');
            
            // Diferentes tipos de errores de multer
            if (err instanceof multer.MulterError) {
                switch (err.code) {
                    case 'LIMIT_FILE_SIZE':
                        logImagen(`❌ Archivo demasiado grande (${duration}ms)`, 'error', 'PUBLICIDAD');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Archivo demasiado grande. Máximo 5MB permitido.' 
                        });
                    case 'LIMIT_FILE_COUNT':
                        logImagen(`❌ Demasiados archivos (${duration}ms)`, 'error', 'PUBLICIDAD');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Solo se permite un archivo por vez.' 
                        });
                    case 'LIMIT_UNEXPECTED_FILE':
                        logImagen(`❌ Campo de archivo inesperado (${duration}ms)`, 'error', 'PUBLICIDAD');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Campo de archivo no válido. Use "imagen".' 
                        });
                    default:
                        logImagen(`❌ Error de multer: ${err.message} (${duration}ms)`, 'error', 'PUBLICIDAD');
                        return res.status(400).json({ 
                            success: false, 
                            message: `Error de upload: ${err.message}` 
                        });
                }
            } else {
                logImagen(`❌ Error genérico: ${err.message} (${duration}ms)`, 'error', 'PUBLICIDAD');
                return res.status(400).json({ 
                    success: false, 
                    message: err.message 
                });
            }
        }
        
        // VERIFICAR QUE EL ARCHIVO FUE RECIBIDO
        logImagen(`🔍 req.file: ${JSON.stringify(req.file, null, 2)}`, 'info', 'DEBUG');
        logImagen(`🔍 req.body: ${JSON.stringify(req.body, null, 2)}`, 'info', 'DEBUG');
        
        if (!req.file) {
            logImagen(`❌ No se recibió archivo (${duration}ms)`, 'error', 'PUBLICIDAD');
            
            return res.status(400).json({ 
                success: false, 
                message: 'No se subió ningún archivo. Verifica que el campo se llame "imagen".',
                debug: {
                    contentType: req.headers['content-type'],
                    bodyKeys: Object.keys(req.body || {}),
                    hasFile: !!req.file,
                    hasFiles: !!req.files,
                    multerProcessed: true // Si llegamos aquí, multer procesó la request
                }
            });
        }
        
        // Resto del código sin cambios...
        try {
            const rutaRelativa = `/showcase/${req.file.filename}`;
            
            // VERIFICAR QUE EL ARCHIVO SE GUARDÓ CORRECTAMENTE
            if (!fsSync.existsSync(req.file.path)) {
                throw new Error('El archivo no se guardó correctamente en el sistema de archivos');
            }
            
            // OBTENER INFO DEL ARCHIVO
            const stats = await fs.stat(req.file.path);
            
            logImagen(`✅ Imagen de publicidad subida exitosamente (${duration}ms): ${req.file.filename}`, 'success', 'PUBLICIDAD');
            logImagen(`📊 Archivo guardado: ${req.file.path} (${stats.size} bytes)`, 'info', 'PUBLICIDAD');
            
            res.json({ 
                success: true, 
                message: 'Imagen de publicidad subida exitosamente',
                data: {
                    nombreArchivo: req.file.filename,
                    nombreOriginal: req.file.originalname,
                    tamaño: req.file.size,
                    tamañoReal: stats.size,
                    ruta: rutaRelativa,
                    rutaCompleta: req.file.path,
                    tipo: req.file.mimetype,
                    tiempoSubida: `${duration}ms`
                }
            });
            
        } catch (error) {
            logImagen(`❌ Error post-upload: ${error.message} (${duration}ms)`, 'error', 'PUBLICIDAD');
            
            // Limpiar archivo si hay error
            if (req.file && req.file.path && fsSync.existsSync(req.file.path)) {
                try {
                    await fs.unlink(req.file.path);
                    logImagen(`🧹 Archivo limpiado tras error: ${req.file.filename}`, 'info', 'PUBLICIDAD');
                } catch (cleanupError) {
                    logImagen(`⚠️ No se pudo limpiar archivo: ${cleanupError.message}`, 'warn', 'PUBLICIDAD');
                }
            }
            
            res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor al procesar la imagen',
                details: process.env.NODE_ENV !== 'production' ? error.message : undefined
            });
        }
    });
});

// ==============================================
// CONFIGURACIÓN PARA PRODUCTOS (SIMILAR)
// ==============================================

const storageProducto = multer.diskStorage({
    destination: (req, file, cb) => {
        logImagen(`📂 Configurando destino para producto: ${file.originalname}`, 'info', 'MULTER');
        
        if (!fsSync.existsSync(productosPath)) {
            const error = new Error(`Directorio de destino no existe: ${productosPath}`);
            logImagen(`❌ ${error.message}`, 'error', 'MULTER');
            return cb(error);
        }
        
        cb(null, productosPath);
    },
    filename: (req, file, cb) => {
        try {
            const codigoBarra = req.body.codigo_barra;
            const extension = path.extname(file.originalname).toLowerCase();
            
            if (!codigoBarra) {
                throw new Error("Código de barra es requerido");
            }
            
            const nombreFinal = `${codigoBarra}${extension}`;
            logImagen(`📝 Nombre de archivo de producto: ${nombreFinal}`, 'info', 'MULTER');
            cb(null, nombreFinal);
        } catch (error) {
            logImagen(`❌ Error generando nombre para producto: ${error.message}`, 'error', 'MULTER');
            cb(error);
        }
    },
});

const uploadProducto = multer({ 
    storage: storageProducto,
    limits: { 
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 10,
        fieldSize: 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        logImagen(`🔍 Validando archivo de producto: ${file.originalname}`, 'info', 'MULTER');
        
        const allowedTypes = /jpeg|jpg|png|webp/;
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        
        const mimetype = allowedMimeTypes.includes(file.mimetype.toLowerCase());
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            logImagen(`✅ Archivo de producto válido: ${file.originalname}`, 'success', 'MULTER');
            return cb(null, true);
        }
        
        const error = new Error(`Archivo no válido: ${file.originalname}. Solo se permiten: JPG, PNG, WEBP`);
        logImagen(`❌ ${error.message}`, 'error', 'MULTER');
        cb(error);
    }
}).single("imagen");

const subirImagenProducto = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('🚀 Iniciando subida de imagen de producto', 'info', 'PRODUCTO');
    logImagen(`📊 Headers recibidos: ${JSON.stringify(req.headers, null, 2)}`, 'info', 'DEBUG');
    
    // VERIFICACIÓN MEJORADA DE CONTENT-TYPE
    const contentType = req.headers['content-type'] || req.headers['Content-Type'];
    logImagen(`🔍 Content-Type recibido: "${contentType}"`, 'info', 'DEBUG');
    
    // Verificar que sea multipart/form-data (puede tener boundary)
    if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) {
        logImagen(`❌ Content-Type inválido para producto: ${contentType}`, 'error', 'PRODUCTO');
        logImagen(`📊 Todos los headers: ${JSON.stringify(req.headers)}`, 'error', 'DEBUG');
        
        return res.status(400).json({ 
            success: false, 
            message: `Content-Type debe ser multipart/form-data. Recibido: ${contentType}`,
            received: contentType,
            allHeaders: req.headers
        });
    }
    
    logImagen(`✅ Content-Type válido para producto: ${contentType}`, 'success', 'PRODUCTO');
    
    // WRAPPER PARA BETTER ERROR HANDLING
    uploadProducto(req, res, async (err) => {
        const duration = Date.now() - startTime;
        
        if (err) {
            // Log detallado del error
            logImagen(`❌ Error de multer en producto: ${err.message}`, 'error', 'PRODUCTO');
            logImagen(`🔍 Tipo de error: ${err.constructor.name}`, 'error', 'PRODUCTO');
            logImagen(`🔍 Stack: ${err.stack}`, 'error', 'PRODUCTO');
            
            // Diferentes tipos de errores de multer
            if (err instanceof multer.MulterError) {
                switch (err.code) {
                    case 'LIMIT_FILE_SIZE':
                        logImagen(`❌ Archivo de producto demasiado grande (${duration}ms)`, 'error', 'PRODUCTO');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Archivo demasiado grande. Máximo 5MB permitido.' 
                        });
                    case 'LIMIT_FILE_COUNT':
                        logImagen(`❌ Demasiados archivos de producto (${duration}ms)`, 'error', 'PRODUCTO');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Solo se permite un archivo por vez.' 
                        });
                    case 'LIMIT_UNEXPECTED_FILE':
                        logImagen(`❌ Campo de archivo inesperado en producto (${duration}ms)`, 'error', 'PRODUCTO');
                        return res.status(400).json({ 
                            success: false, 
                            message: 'Campo de archivo no válido. Use "imagen".' 
                        });
                    default:
                        logImagen(`❌ Error de multer en producto: ${err.message} (${duration}ms)`, 'error', 'PRODUCTO');
                        return res.status(400).json({ 
                            success: false, 
                            message: `Error de upload: ${err.message}` 
                        });
                }
            } else {
                logImagen(`❌ Error genérico en producto: ${err.message} (${duration}ms)`, 'error', 'PRODUCTO');
                return res.status(400).json({ 
                    success: false, 
                    message: err.message 
                });
            }
        }
        
        // VERIFICAR QUE EL ARCHIVO FUE RECIBIDO
        logImagen(`🔍 req.file producto: ${JSON.stringify(req.file, null, 2)}`, 'info', 'DEBUG');
        logImagen(`🔍 req.body producto: ${JSON.stringify(req.body, null, 2)}`, 'info', 'DEBUG');
        
        if (!req.file) {
            logImagen(`❌ No se recibió archivo de producto (${duration}ms)`, 'error', 'PRODUCTO');
            
            return res.status(400).json({ 
                success: false, 
                message: 'No se subió ningún archivo. Verifica que el campo se llame "imagen".',
                debug: {
                    contentType: req.headers['content-type'],
                    bodyKeys: Object.keys(req.body || {}),
                    hasFile: !!req.file,
                    hasFiles: !!req.files,
                    multerProcessed: true, // Si llegamos aquí, multer procesó la request
                    codigoBarra: req.body.codigo_barra
                }
            });
        }
        
        try {
            const codigoBarra = req.body.codigo_barra;
            const rutaRelativa = `/images/products/${req.file.filename}`;
            
            // Verificar que tenemos el código de barra
            if (!codigoBarra) {
                logImagen(`❌ Código de barra faltante en producto`, 'error', 'PRODUCTO');
                
                // Limpiar archivo subido
                if (req.file.path && fsSync.existsSync(req.file.path)) {
                    await fs.unlink(req.file.path);
                    logImagen(`🧹 Archivo limpiado por falta de código de barra`, 'info', 'PRODUCTO');
                }
                
                return res.status(400).json({
                    success: false,
                    message: 'Código de barra es requerido para imagen de producto'
                });
            }
            
            // VERIFICAR QUE EL ARCHIVO SE GUARDÓ CORRECTAMENTE
            if (!fsSync.existsSync(req.file.path)) {
                throw new Error('El archivo no se guardó correctamente en el sistema de archivos');
            }
            
            // OBTENER INFO DEL ARCHIVO
            const stats = await fs.stat(req.file.path);
            
            logImagen(`✅ Imagen de producto subida exitosamente (${duration}ms): ${codigoBarra} -> ${req.file.filename}`, 'success', 'PRODUCTO');
            logImagen(`📊 Archivo de producto guardado: ${req.file.path} (${stats.size} bytes)`, 'info', 'PRODUCTO');
            
            res.json({ 
                success: true, 
                message: 'Imagen de producto subida exitosamente',
                data: {
                    codigoBarra,
                    nombreArchivo: req.file.filename,
                    nombreOriginal: req.file.originalname,
                    tamaño: req.file.size,
                    tamañoReal: stats.size,
                    ruta: rutaRelativa,
                    rutaCompleta: req.file.path,
                    tipo: req.file.mimetype,
                    tiempoSubida: `${duration}ms`
                }
            });
            
        } catch (error) {
            logImagen(`❌ Error post-upload producto: ${error.message} (${duration}ms)`, 'error', 'PRODUCTO');
            logImagen(`🔍 Stack trace producto: ${error.stack}`, 'error', 'PRODUCTO');
            
            // Limpiar archivo si hay error
            if (req.file && req.file.path && fsSync.existsSync(req.file.path)) {
                try {
                    await fs.unlink(req.file.path);
                    logImagen(`🧹 Archivo de producto limpiado tras error: ${req.file.filename}`, 'info', 'PRODUCTO');
                } catch (cleanupError) {
                    logImagen(`⚠️ No se pudo limpiar archivo de producto: ${cleanupError.message}`, 'warn', 'PRODUCTO');
                }
            }
            
            res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor al procesar la imagen del producto',
                details: process.env.NODE_ENV !== 'production' ? error.message : undefined
            });
        }
    });
});

// ==============================================
// MANTENER LAS FUNCIONES EXISTENTES
// ==============================================

const obtenerImagenesPublicidad = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('📋 Obteniendo lista de imágenes de publicidad', 'info', 'PUBLICIDAD');
    
    try {
        const archivos = await fs.readdir(publicidadPath);
        const imagenesValidas = archivos.filter(archivo => {
            const extension = path.extname(archivo).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
        });
        
        const imagenesConRuta = imagenesValidas.map(archivo => `/showcase/${archivo}`);
        
        const duration = Date.now() - startTime;
        logImagen(`✅ ${imagenesConRuta.length} imágenes obtenidas (${duration}ms)`, 'success', 'PUBLICIDAD');
        
        res.json(imagenesConRuta);
    } catch (error) {
        logImagen(`❌ Error obteniendo imágenes: ${error.message}`, 'error', 'PUBLICIDAD');
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener imágenes de publicidad' 
        });
    }
});

const eliminarImagenPublicidad = asyncHandler(async (req, res) => {
    const { nombreArchivo } = req.params;
    
    logImagen(`🗑️ Eliminando imagen de publicidad: ${nombreArchivo}`, 'info', 'PUBLICIDAD');
    
    if (!nombreArchivo) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre de archivo es requerido' 
        });
    }
    
    try {
        const rutaArchivo = path.join(publicidadPath, nombreArchivo);
        
        if (!fsSync.existsSync(rutaArchivo)) {
            return res.status(404).json({ 
                success: false, 
                message: 'Imagen no encontrada' 
            });
        }
        
        await fs.unlink(rutaArchivo);
        
        logImagen(`✅ Imagen eliminada: ${nombreArchivo}`, 'success', 'PUBLICIDAD');
        res.json({ 
            success: true, 
            message: 'Imagen eliminada exitosamente',
            data: { nombreArchivo }
        });
        
    } catch (error) {
        logImagen(`❌ Error eliminando imagen: ${error.message}`, 'error', 'PUBLICIDAD');
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar la imagen' 
        });
    }
});

const verificarImagenProducto = asyncHandler(async (req, res) => {
    const { codigoBarra } = req.params;
    
    logImagen(`🔍 Verificando imagen para producto: ${codigoBarra}`, 'info', 'PRODUCTO');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            success: false, 
            message: 'Código de barra es requerido' 
        });
    }
    
    try {
        const extensiones = ['.jpg', '.jpeg', '.png', '.webp'];
        let archivoEncontrado = null;
        
        for (const ext of extensiones) {
            const nombreArchivo = `${codigoBarra}${ext}`;
            const ruta = path.join(productosPath, nombreArchivo);
            
            if (fsSync.existsSync(ruta)) {
                archivoEncontrado = nombreArchivo;
                break;
            }
        }
        
        const existe = !!archivoEncontrado;
        
        logImagen(`📸 Imagen para ${codigoBarra}: ${existe ? 'Existe' : 'No existe'}`, 'info', 'PRODUCTO');
        
        res.json({ 
            success: true, 
            data: {
                codigoBarra,
                existe,
                archivo: archivoEncontrado ? {
                    nombreArchivo: archivoEncontrado,
                    ruta: `/images/products/${archivoEncontrado}`
                } : null
            }
        });
        
    } catch (error) {
        logImagen(`❌ Error verificando imagen: ${error.message}`, 'error', 'PRODUCTO');
        res.status(500).json({ 
            success: false, 
            message: 'Error al verificar imagen del producto' 
        });
    }
});

const eliminarImagenProducto = asyncHandler(async (req, res) => {
    const { codigoBarra } = req.params;
    
    logImagen(`🗑️ Eliminando imagen de producto: ${codigoBarra}`, 'info', 'PRODUCTO');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            success: false, 
            message: 'Código de barra es requerido' 
        });
    }
    
    try {
        const extensiones = ['.jpg', '.jpeg', '.png', '.webp'];
        let archivoEliminado = false;
        let nombreArchivo = null;
        
        for (const ext of extensiones) {
            const nombre = `${codigoBarra}${ext}`;
            const rutaArchivo = path.join(productosPath, nombre);
            
            if (fsSync.existsSync(rutaArchivo)) {
                await fs.unlink(rutaArchivo);
                archivoEliminado = true;
                nombreArchivo = nombre;
                break;
            }
        }
        
        if (archivoEliminado) {
            logImagen(`✅ Imagen de producto eliminada: ${codigoBarra}`, 'success', 'PRODUCTO');
            res.json({ 
                success: true, 
                message: 'Imagen de producto eliminada exitosamente',
                data: { codigoBarra, nombreArchivo }
            });
        } else {
            return res.status(404).json({ 
                success: false, 
                message: 'Imagen del producto no encontrada' 
            });
        }
        
    } catch (error) {
        logImagen(`❌ Error eliminando imagen de producto: ${error.message}`, 'error', 'PRODUCTO');
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar imagen del producto' 
        });
    }
});


const subirImagenPublicidadBase64 = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('🚀 Iniciando subida de imagen Base64 (publicidad)', 'info', 'PUBLICIDAD_BASE64');
    
    try {
        const { imagen, nombreArchivo, tipoArchivo, tamaño } = req.body;
        
        // Validar datos recibidos
        if (!imagen) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se recibió imagen en Base64' 
            });
        }
        
        if (!nombreArchivo) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nombre de archivo es requerido' 
            });
        }
        
        logImagen(`📋 Archivo recibido: ${nombreArchivo} (${tamaño} bytes)`, 'info', 'PUBLICIDAD_BASE64');
        
        // Extraer datos de la imagen Base64
        const matches = imagen.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Formato Base64 inválido' 
            });
        }
        
        const mimeType = matches[1];
        const imageData = matches[2];
        
        // Validar tipo MIME
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(mimeType.toLowerCase())) {
            return res.status(400).json({ 
                success: false, 
                message: `Tipo de archivo no permitido: ${mimeType}` 
            });
        }
        
        logImagen(`✅ Tipo MIME válido: ${mimeType}`, 'success', 'PUBLICIDAD_BASE64');
        
        // Convertir Base64 a Buffer
        const buffer = Buffer.from(imageData, 'base64');
        
        // Validar tamaño
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (buffer.length > maxSize) {
            return res.status(400).json({ 
                success: false, 
                message: 'Imagen demasiado grande. Máximo 5MB permitido' 
            });
        }
        
        logImagen(`📏 Tamaño del buffer: ${buffer.length} bytes`, 'info', 'PUBLICIDAD_BASE64');
        
        // Generar nombre único
        const timestamp = Date.now();
        const extension = path.extname(nombreArchivo).toLowerCase();
        const nombreBase = path.basename(nombreArchivo, extension)
            .replace(/[^a-zA-Z0-9.-]/g, '_')
            .substring(0, 30);
        const nombreFinal = `publicidad-${timestamp}-${nombreBase}${extension}`;
        
        // Guardar archivo
        const rutaCompleta = path.join(publicidadPath, nombreFinal);
        await fs.writeFile(rutaCompleta, buffer);
        
        // Verificar que se guardó correctamente
        const stats = await fs.stat(rutaCompleta);
        
        const duration = Date.now() - startTime;
        logImagen(`✅ Imagen guardada exitosamente (${duration}ms): ${nombreFinal}`, 'success', 'PUBLICIDAD_BASE64');
        
        const rutaRelativa = `/showcase/${nombreFinal}`;
        
        res.json({ 
            success: true, 
            message: 'Imagen de publicidad subida exitosamente',
            data: {
                nombreArchivo: nombreFinal,
                nombreOriginal: nombreArchivo,
                tamaño: stats.size,
                ruta: rutaRelativa,
                tipo: mimeType,
                tiempoSubida: `${duration}ms`
            }
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logImagen(`❌ Error en subida Base64 (${duration}ms): ${error.message}`, 'error', 'PUBLICIDAD_BASE64');
        
        res.status(500).json({ 
            success: false, 
            message: 'Error interno al procesar la imagen',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
});


const subirImagenProductoBase64 = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('🚀 Iniciando subida de imagen Base64 (producto)', 'info', 'PRODUCTO_BASE64');
    
    try {
        const { imagen, codigo_barra, nombreArchivo, tipoArchivo } = req.body;
        
        // Validar datos recibidos
        if (!imagen || !codigo_barra) {
            return res.status(400).json({ 
                success: false, 
                message: 'Imagen y código de barra son requeridos' 
            });
        }
        
        logImagen(`📋 Producto: ${codigo_barra}, Archivo: ${nombreArchivo}`, 'info', 'PRODUCTO_BASE64');
        
        // Extraer datos de la imagen Base64
        const matches = imagen.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ 
                success: false, 
                message: 'Formato Base64 inválido' 
            });
        }
        
        const mimeType = matches[1];
        const imageData = matches[2];
        
        // Validar tipo MIME
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(mimeType.toLowerCase())) {
            return res.status(400).json({ 
                success: false, 
                message: `Tipo de archivo no permitido: ${mimeType}` 
            });
        }
        
        // Convertir Base64 a Buffer
        const buffer = Buffer.from(imageData, 'base64');
        
        // Validar tamaño
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (buffer.length > maxSize) {
            return res.status(400).json({ 
                success: false, 
                message: 'Imagen demasiado grande. Máximo 5MB permitido' 
            });
        }
        
        // ✅ CONVERTIR A PNG USANDO SHARP
        logImagen(`🔄 Convirtiendo imagen de producto a PNG...`, 'info', 'PRODUCTO_BASE64');
        
        const pngBuffer = await sharp(buffer)
            .png({
                quality: 90,
                compressionLevel: 9,
                adaptiveFiltering: true
            })
            .toBuffer();
        
        logImagen(`✅ Imagen convertida a PNG - Nuevo tamaño: ${pngBuffer.length} bytes`, 'success', 'PRODUCTO_BASE64');
        
        // Nombre del archivo SIEMPRE con extensión .png
        const nombreFinal = `${codigo_barra}.png`; // ← SIEMPRE .png
        
        // Guardar archivo PNG
        const rutaCompleta = path.join(productosPath, nombreFinal);
        await fs.writeFile(rutaCompleta, pngBuffer);
        
        // Verificar que se guardó correctamente
        const stats = await fs.stat(rutaCompleta);
        
        const duration = Date.now() - startTime;
        logImagen(`✅ Imagen PNG de producto guardada exitosamente (${duration}ms): ${nombreFinal}`, 'success', 'PRODUCTO_BASE64');
        
        const rutaRelativa = `/images/products/${nombreFinal}`;
        
        res.json({ 
            success: true, 
            message: 'Imagen de producto subida y convertida a PNG exitosamente',
            data: {
                codigoBarra: codigo_barra,
                nombreArchivo: nombreFinal,
                tamaño: stats.size,
                tamañoOriginal: buffer.length,
                ruta: rutaRelativa,
                tipoOriginal: mimeType,
                tipoFinal: 'image/png',
                tiempoSubida: `${duration}ms`
            }
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        logImagen(`❌ Error en subida Base64 producto (${duration}ms): ${error.message}`, 'error', 'PRODUCTO_BASE64');
        
        res.status(500).json({ 
            success: false, 
            message: 'Error interno al procesar la imagen del producto',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
});



// ==============================================
// EXPORTAR CONTROLADORES
// ==============================================

module.exports = {
    // Publicidad
    subirImagenPublicidad,
    obtenerImagenesPublicidad,
    eliminarImagenPublicidad,
    
    // Productos
    subirImagenProducto,
    verificarImagenProducto,
    eliminarImagenProducto,

    subirImagenPublicidadBase64,
    subirImagenProductoBase64
};