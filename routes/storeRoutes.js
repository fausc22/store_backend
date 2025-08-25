const express = require('express');
const storeController = require('../controllers/storeController');

const router = express.Router();

// RUTAS EXISTENTES (las que ya tienes)
router.get('/articulosOF', storeController.articulosOferta);
router.get('/articulosDEST', storeController.articulosDestacados);

router.get('/productosMAIN/:page?/:limit?', storeController.productosMain);
router.get('/buscar/:searchTerm/:page?/:limit?', storeController.buscarProductos);
router.get('/articulos/:categoryId/:page?/:limit?', storeController.filtradoCategorias);

router.get('/productosMAIN', storeController.productosMain);
router.get('/articulos/:categoryId', storeController.filtradoCategorias);
router.get('/buscar', storeController.buscarProductos);
router.get('/categorias', storeController.obtenerCategorias);
router.get('/articulosCheckout', storeController.articulosCheckout);

router.post('/cart', storeController.enviarCarrito);
router.get('/cart', storeController.obtenerCarrito);

router.post('/calculateShipping', storeController.calculateShipping);
router.post('/create_preference', storeController.createPreference);
router.get('/variablesenv', storeController.variablesEnv);

router.post('/mailPedidoRealizado', storeController.MailPedidoRealizado);
router.post('/NuevoPedido', storeController.nuevoPedido);

router.get("/getShowcase", storeController.getShowcase);
router.post("/subirImagenPublicidad", storeController.subirImagenPublicidad);
router.delete("/eliminarImagenPublicidad/:nombreImagen", storeController.eliminarImagenPublicidad);

router.get("/verificarImagen/:codigo_barra", storeController.verificarImagenArticulo);
router.post("/subirImagenArticulo", storeController.subirImagenArticulo);

// 🆕 NUEVAS RUTAS QUE TE FALTAN - Sistema de Ofertas y Destacados
router.post('/ofertas-destacados', storeController.gestionarOfertasDestacados);
router.get('/ofertas-destacados', storeController.obtenerOfertasDestacados);
router.delete('/ofertas-destacados/:id', storeController.eliminarOfertaDestacado);


router.post('/searchAddresses', storeController.searchAddresses);
router.post('/reverseGeocode', storeController.reverseGeocode);
// Ruta principal para obtener imagen de producto
router.get('/image/:codigo_barra', storeController.getProductImage);
// Ruta para servir imágenes internas directamente
router.get('/images/products/:filename', storeController.serveInternalImage);
// Rutas de utilidad (opcionales)
router.delete('/cache/images', storeController.clearImageCache);
router.get('/cache/images/stats', storeController.getImageCacheStats);





module.exports = router;