// controllers/imagenController.js - Gestión de imágenes de publicidad y productos
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// ==============================================
// SISTEMA DE LOGS PARA IMAGENES
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

// Wrapper para manejo de errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==============================================
// CONFIGURACIÓN DE DIRECTORIOS
// ==============================================

// Crear directorios si no existen
const publicidadPath = path.join(__dirname, "../resources/showcase");
const productosPath = path.join(__dirname, "../resources/img_art");

const crearDirectorios = async () => {
    try {
        if (!fsSync.existsSync(publicidadPath)) {
            await fs.mkdir(publicidadPath, { recursive: true });
            logImagen('✅ Directorio de publicidad creado', 'success', 'SETUP');
        }
        
        if (!fsSync.existsSync(productosPath)) {
            await fs.mkdir(productosPath, { recursive: true });
            logImagen('✅ Directorio de productos creado', 'success', 'SETUP');
        }
    } catch (error) {
        logImagen(`❌ Error creando directorios: ${error.message}`, 'error', 'SETUP');
    }
};

// Inicializar directorios
crearDirectorios();

// ==============================================
// CONFIGURACIÓN MULTER PARA PUBLICIDAD
// ==============================================

const storagePublicidad = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, publicidadPath);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const extension = path.extname(file.originalname);
        const nombreLimpio = file.originalname
            .replace(/[^a-zA-Z0-9.-]/g, '_')
            .substring(0, 50);
        cb(null, `publicidad-${timestamp}-${nombreLimpio}`);
    },
});

const uploadPublicidad = multer({ 
    storage: storagePublicidad,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB para imágenes
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        
        cb(new Error("Archivo no válido. Solo se permiten: JPG, PNG, WEBP"));
    }
}).single("imagen");

// ==============================================
// CONFIGURACIÓN MULTER PARA PRODUCTOS
// ==============================================

const storageProducto = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, productosPath);
    },
    filename: (req, file, cb) => {
        const codigoBarra = req.body.codigo_barra;
        const extension = path.extname(file.originalname);
        
        if (!codigoBarra) {
            return cb(new Error("Código de barra es requerido"));
        }
        
        // Nombre del archivo será el código de barra
        cb(null, `${codigoBarra}${extension}`);
    },
});

const uploadProducto = multer({ 
    storage: storageProducto,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB para imágenes
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        
        cb(new Error("Archivo no válido. Solo se permiten: JPG, PNG, WEBP"));
    }
}).single("imagen");

// ==============================================
// FUNCIONES HELPER
// ==============================================

// Función para eliminar archivo
const eliminarArchivo = async (rutaArchivo) => {
    try {
        if (fsSync.existsSync(rutaArchivo)) {
            await fs.unlink(rutaArchivo);
            logImagen(`🗑️ Archivo eliminado: ${path.basename(rutaArchivo)}`, 'info', 'FILE');
            return true;
        }
        return false;
    } catch (error) {
        logImagen(`❌ Error eliminando archivo: ${error.message}`, 'error', 'FILE');
        return false;
    }
};

// Función para obtener lista de archivos en directorio
const obtenerArchivosDirectorio = async (directorio) => {
    try {
        const archivos = await fs.readdir(directorio);
        return archivos.filter(archivo => {
            const extension = path.extname(archivo).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
        });
    } catch (error) {
        logImagen(`❌ Error leyendo directorio: ${error.message}`, 'error', 'FILE');
        return [];
    }
};

// ==============================================
// CONTROLADORES PARA IMÁGENES DE PUBLICIDAD
// ==============================================

/**
 * Subir imagen de publicidad
 * POST /admin/subir-imagen-publicidad
 */
const subirImagenPublicidad = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('Iniciando subida de imagen de publicidad', 'info', 'PUBLICIDAD');
    
    uploadPublicidad(req, res, async (err) => {
        if (err) {
            logImagen(`❌ Error en upload: ${err.message}`, 'error', 'PUBLICIDAD');
            return res.status(400).json({ 
                success: false, 
                message: err.message 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se subió ningún archivo' 
            });
        }
        
        try {
            const duration = Date.now() - startTime;
            const rutaRelativa = `/showcase/${req.file.filename}`;
            
            logImagen(`✅ Imagen de publicidad subida exitosamente (${duration}ms): ${req.file.filename}`, 'success', 'PUBLICIDAD');
            
            res.json({ 
                success: true, 
                message: 'Imagen de publicidad subida exitosamente',
                data: {
                    nombreArchivo: req.file.filename,
                    nombreOriginal: req.file.originalname,
                    tamaño: req.file.size,
                    ruta: rutaRelativa,
                    tipo: req.file.mimetype
                }
            });
            
        } catch (error) {
            logImagen(`❌ Error procesando imagen de publicidad: ${error.message}`, 'error', 'PUBLICIDAD');
            await eliminarArchivo(req.file.path);
            
            res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor' 
            });
        }
    });
});

/**
 * Obtener lista de imágenes de publicidad
 * GET /admin/imagenes-publicidad
 */
const obtenerImagenesPublicidad = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('Obteniendo lista de imágenes de publicidad', 'info', 'PUBLICIDAD');
    
    try {
        const archivos = await obtenerArchivosDirectorio(publicidadPath);
        
        // Mapear archivos con información adicional
        const imagenesInfo = await Promise.all(
            archivos.map(async (archivo) => {
                try {
                    const rutaCompleta = path.join(publicidadPath, archivo);
                    const stats = await fs.stat(rutaCompleta);
                    
                    return {
                        nombre: archivo,
                        ruta: `/showcase/${archivo}`,
                        tamaño: stats.size,
                        fechaCreacion: stats.birthtime,
                        fechaModificacion: stats.mtime
                    };
                } catch (error) {
                    logImagen(`⚠️ Error obteniendo info de ${archivo}: ${error.message}`, 'warn', 'PUBLICIDAD');
                    return {
                        nombre: archivo,
                        ruta: `/showcase/${archivo}`,
                        tamaño: 0,
                        fechaCreacion: null,
                        fechaModificacion: null
                    };
                }
            })
        );
        
        // Ordenar por fecha de creación (más recientes primero)
        imagenesInfo.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
        
        const duration = Date.now() - startTime;
        logImagen(`✅ ${imagenesInfo.length} imágenes de publicidad obtenidas (${duration}ms)`, 'success', 'PUBLICIDAD');
        
        res.json(imagenesInfo.map(img => img.ruta)); // Mantener compatibilidad con frontend existente
        
    } catch (error) {
        logImagen(`❌ Error obteniendo imágenes de publicidad: ${error.message}`, 'error', 'PUBLICIDAD');
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener imágenes de publicidad' 
        });
    }
});

/**
 * Eliminar imagen de publicidad
 * DELETE /admin/eliminar-imagen-publicidad/:nombreArchivo
 */
const eliminarImagenPublicidad = asyncHandler(async (req, res) => {
    const { nombreArchivo } = req.params;
    
    logImagen(`Eliminando imagen de publicidad: ${nombreArchivo}`, 'info', 'PUBLICIDAD');
    
    if (!nombreArchivo) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre de archivo es requerido' 
        });
    }
    
    try {
        const rutaArchivo = path.join(publicidadPath, nombreArchivo);
        
        // Verificar que el archivo existe
        if (!fsSync.existsSync(rutaArchivo)) {
            return res.status(404).json({ 
                success: false, 
                message: 'Imagen no encontrada' 
            });
        }
        
        // Eliminar archivo
        const eliminado = await eliminarArchivo(rutaArchivo);
        
        if (eliminado) {
            logImagen(`✅ Imagen de publicidad eliminada: ${nombreArchivo}`, 'success', 'PUBLICIDAD');
            res.json({ 
                success: true, 
                message: 'Imagen eliminada exitosamente',
                data: { nombreArchivo }
            });
        } else {
            throw new Error('No se pudo eliminar el archivo');
        }
        
    } catch (error) {
        logImagen(`❌ Error eliminando imagen de publicidad ${nombreArchivo}: ${error.message}`, 'error', 'PUBLICIDAD');
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar la imagen' 
        });
    }
});

// ==============================================
// CONTROLADORES PARA IMÁGENES DE PRODUCTOS
// ==============================================

/**
 * Subir imagen de producto
 * POST /admin/subir-imagen-producto
 */
const subirImagenProducto = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    logImagen('Iniciando subida de imagen de producto', 'info', 'PRODUCTO');
    
    uploadProducto(req, res, async (err) => {
        if (err) {
            logImagen(`❌ Error en upload: ${err.message}`, 'error', 'PRODUCTO');
            return res.status(400).json({ 
                success: false, 
                message: err.message 
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se subió ningún archivo' 
            });
        }
        
        try {
            const codigoBarra = req.body.codigo_barra;
            const duration = Date.now() - startTime;
            const rutaRelativa = `/images/products/${req.file.filename}`;
            
            logImagen(`✅ Imagen de producto subida exitosamente (${duration}ms): ${codigoBarra} -> ${req.file.filename}`, 'success', 'PRODUCTO');
            
            res.json({ 
                success: true, 
                message: 'Imagen de producto subida exitosamente',
                data: {
                    codigoBarra,
                    nombreArchivo: req.file.filename,
                    nombreOriginal: req.file.originalname,
                    tamaño: req.file.size,
                    ruta: rutaRelativa,
                    tipo: req.file.mimetype
                }
            });
            
        } catch (error) {
            logImagen(`❌ Error procesando imagen de producto: ${error.message}`, 'error', 'PRODUCTO');
            await eliminarArchivo(req.file.path);
            
            res.status(500).json({ 
                success: false, 
                message: 'Error interno del servidor' 
            });
        }
    });
});

/**
 * Verificar si existe imagen de producto
 * GET /admin/verificar-imagen-producto/:codigoBarra
 */
const verificarImagenProducto = asyncHandler(async (req, res) => {
    const { codigoBarra } = req.params;
    
    logImagen(`Verificando imagen para producto: ${codigoBarra}`, 'info', 'PRODUCTO');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            success: false, 
            message: 'Código de barra es requerido' 
        });
    }
    
    try {
        // Buscar archivo con cualquier extensión válida
        const extensiones = ['.jpg', '.jpeg', '.png', '.webp'];
        let archivoEncontrado = null;
        let rutaCompleta = null;
        
        for (const ext of extensiones) {
            const nombreArchivo = `${codigoBarra}${ext}`;
            const ruta = path.join(productosPath, nombreArchivo);
            
            if (fsSync.existsSync(ruta)) {
                archivoEncontrado = nombreArchivo;
                rutaCompleta = ruta;
                break;
            }
        }
        
        const existe = !!archivoEncontrado;
        let infoArchivo = null;
        
        if (existe) {
            const stats = await fs.stat(rutaCompleta);
            infoArchivo = {
                nombreArchivo: archivoEncontrado,
                tamaño: stats.size,
                fechaCreacion: stats.birthtime,
                fechaModificacion: stats.mtime,
                ruta: `/images/products/${archivoEncontrado}`
            };
        }
        
        logImagen(`📸 Imagen para ${codigoBarra}: ${existe ? 'Existe' : 'No existe'}`, 'info', 'PRODUCTO');
        
        res.json({ 
            success: true, 
            data: {
                codigoBarra,
                existe,
                archivo: infoArchivo
            }
        });
        
    } catch (error) {
        logImagen(`❌ Error verificando imagen del producto ${codigoBarra}: ${error.message}`, 'error', 'PRODUCTO');
        res.status(500).json({ 
            success: false, 
            message: 'Error al verificar imagen del producto' 
        });
    }
});

/**
 * Eliminar imagen de producto
 * DELETE /admin/eliminar-imagen-producto/:codigoBarra
 */
const eliminarImagenProducto = asyncHandler(async (req, res) => {
    const { codigoBarra } = req.params;
    
    logImagen(`Eliminando imagen de producto: ${codigoBarra}`, 'info', 'PRODUCTO');
    
    if (!codigoBarra) {
        return res.status(400).json({ 
            success: false, 
            message: 'Código de barra es requerido' 
        });
    }
    
    try {
        // Buscar y eliminar archivo con cualquier extensión válida
        const extensiones = ['.jpg', '.jpeg', '.png', '.webp'];
        let archivoEliminado = false;
        let nombreArchivo = null;
        
        for (const ext of extensiones) {
            const nombre = `${codigoBarra}${ext}`;
            const rutaArchivo = path.join(productosPath, nombre);
            
            if (fsSync.existsSync(rutaArchivo)) {
                const eliminado = await eliminarArchivo(rutaArchivo);
                if (eliminado) {
                    archivoEliminado = true;
                    nombreArchivo = nombre;
                    break;
                }
            }
        }
        
        if (archivoEliminado) {
            logImagen(`✅ Imagen de producto eliminada: ${codigoBarra} -> ${nombreArchivo}`, 'success', 'PRODUCTO');
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
        logImagen(`❌ Error eliminando imagen del producto ${codigoBarra}: ${error.message}`, 'error', 'PRODUCTO');
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar imagen del producto' 
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
    eliminarImagenProducto
};