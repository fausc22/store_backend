const express = require('express');
const storeController = require('../controllers/storeController');
const horariosController = require('../controllers/horariosController'); // 🆕 AGREGAR ESTA LÍNEA

const router = express.Router();

// ==============================================
// MIDDLEWARE DE LOGGING PARA STORE
// ==============================================
router.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[36m[${timestamp}] [STORE-ROUTE] ${req.method} ${req.originalUrl}\x1b[0m`);
    next();
});

// ==============================================
// RUTAS DE PRODUCTOS Y CATEGORÍAS
// ==============================================

// Productos por categorías especiales
router.get('/articulosOF', storeController.articulosOferta);
router.get('/articulosLI', storeController.articulosLiquidacion);
router.get('/articulosDEST', storeController.articulosDestacados);

// Productos principales y búsqueda (con paginación)
router.get('/productosMAIN/:page?/:limit?', storeController.productosMain);
router.get('/buscar/:searchTerm/:page?/:limit?', storeController.buscarProductos);
router.get('/articulos/:categoryId/:page?/:limit?', storeController.filtradoCategorias);
router.get('/rubro/:rubroName/:page?/:limit?', storeController.filtradoPorRubro);

// Productos principales (sin paginación - alias)
router.get('/productosMAIN', storeController.productosMain);
router.get('/articulos/:categoryId', storeController.filtradoCategorias);
router.get('/buscar', storeController.buscarProductos);

// Categorías y productos relacionados
router.get('/categorias', storeController.obtenerCategorias);
router.get('/rubros/:deptoName', storeController.obtenerRubrosDeDepto);
router.get('/articulosCheckout', storeController.articulosCheckout);

// ==============================================
// RUTAS DE CARRITO Y PEDIDOS
// ==============================================

// Carrito
router.post('/cart', storeController.enviarCarrito);
router.get('/cart', storeController.obtenerCarrito);

// Cálculo de envío y pagos (Fase 3: quote es la fuente de total)
router.post('/calculateShipping', storeController.calculateShipping);
router.get('/promo-rules/summary', storeController.promoRulesSummary);
router.post('/pricing/quote', storeController.pricingQuote);
router.post('/coupons/validate', storeController.validateCouponStore);
router.post('/create_preference', storeController.createPreference);

// Pedidos
router.post('/NuevoPedido', storeController.nuevoPedido);

// Emails
router.post('/mailPedidoRealizado', storeController.MailPedidoRealizado);

// ==============================================
// RUTAS DE IMÁGENES
// ==============================================

// Imágenes de publicidad (showcase)
router.get("/getShowcase", storeController.getShowcase);
router.post("/subirImagenPublicidad", storeController.subirImagenPublicidad);
router.delete("/eliminarImagenPublicidad/:nombreImagen", storeController.eliminarImagenPublicidad);
router.get('/showcase/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'uploads', 'publicidad', filename);
    
    console.log('📦 Showcase file:', filename);
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ No encontrado:', filePath);
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const ext = path.extname(filename).toLowerCase();
    const esVideo = ['.mp4', '.webm', '.ogg', '.mov'].includes(ext);

    if (esVideo) {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mov': 'video/quicktime'
      };
      const mimeType = mimeTypes[ext] || 'video/mp4';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*'
        });

        console.log(`✅ Video streaming: ${start}-${end}/${fileSize}`);
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',  // ← CRÍTICO
          'Access-Control-Allow-Origin': '*'
        });

        console.log(`✅ Video completo: ${fileSize} bytes`);
        fs.createReadStream(filePath).pipe(res);
      }
    } else {
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*'
      });

      console.log(`✅ Imagen: ${filename}`);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Imágenes de productos
router.get("/verificarImagen/:codigo_barra", storeController.verificarImagenArticulo);
router.post("/subirImagenArticulo", storeController.subirImagenArticulo);

// ==============================================
// RUTAS DE OFERTAS Y DESTACADOS (si las necesitas)
// ==============================================
router.post('/ofertas-destacados', storeController.gestionarOfertasDestacados);
router.get('/ofertas-destacados', storeController.obtenerOfertasDestacados);
router.delete('/ofertas-destacados/:id', storeController.eliminarOfertaDestacado);

// ==============================================
// RUTAS DE GEOCODING (Mapbox/Google Maps)
// ==============================================
router.post('/searchAddresses', storeController.searchAddresses);
router.post('/reverseGeocode', storeController.reverseGeocode);

// ==============================================
// RUTAS DE CONFIGURACIÓN
// ==============================================
router.get('/variablesenv', storeController.variablesEnv);

// ==============================================
// 🆕 RUTAS DE HORARIOS (ACTUALIZADO)
// ==============================================

// Verificar estado actual de la tienda (horarios + PAGE_STATUS)
router.get('/horario', horariosController.verificarEstadoActual);

// Versión simplificada (solo devuelve si está abierto/cerrado)
router.get('/horario/simple', async (req, res) => {
  try {
    // Reutilizar la función principal pero devolver solo lo básico
    const estadoCompleto = await new Promise((resolve, reject) => {
      const mockRes = {
        json: (data) => resolve(data),
        status: (code) => ({
          json: (data) => reject(data)
        })
      };
      horariosController.verificarEstadoActual(req, mockRes);
    });
    
    // Devolver solo lo esencial
    res.json({
      estaAbierto: estadoCompleto.estaAbierto,
      bloqueado: estadoCompleto.bloqueado || false,
      pageStatus: estadoCompleto.pageStatus || 'ACTIVA'
    });
  } catch (error) {
    console.error('❌ Error en /horario/simple:', error);
    res.json({ 
      estaAbierto: true, 
      bloqueado: false,
      pageStatus: 'ACTIVA',
      error: true 
    });
  }
});

// ==============================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ==============================================
router.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    console.error(`\x1b[31m[${timestamp}] [STORE-ERROR] [${errorId}] ${error.message}\x1b[0m`);
    console.error(`\x1b[31m[${timestamp}] [STORE-ERROR] [${errorId}] Request: ${req.method} ${req.originalUrl}\x1b[0m`);
    
    const errorResponse = {
        error: 'Error procesando la solicitud',
        errorId: errorId,
        timestamp: timestamp
    };
    
    if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = error.message;
    }
    
    res.status(500).json(errorResponse);
});

// ==============================================
// RUTA 404 PARA STORE
// ==============================================
router.use('*', (req, res) => {
    const timestamp = new Date().toISOString();
    console.warn(`\x1b[33m[${timestamp}] [STORE-404] Ruta no encontrada: ${req.method} ${req.originalUrl}\x1b[0m`);
    
    res.status(404).json({
        error: 'Ruta no encontrada en la tienda',
        method: req.method,
        url: req.originalUrl,
        timestamp: timestamp
    });
});

module.exports = router;