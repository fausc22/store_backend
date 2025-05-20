
const express = require('express');
const storeController = require('../controllers/storeController');

const router = express.Router();

router.get('/articulosOF', storeController.articulosOferta);

router.get('/articulosDEST', storeController.articulosDestacados);

router.get('/productosMAIN', storeController.productosMain);

router.get('/articulos/:categoryId', storeController.filtradoCategorias);

router.get('/buscar', storeController.buscarProductos);

router.get('/categorias', storeController.obtenerCategorias);

router.get('/artCHECKOUT', storeController.articulosCheckout);


router.post('/cart', storeController.enviarCarrito);
router.get('/cart', storeController.obtenerCarrito);

router.post('/calculateShipping', storeController.calculateShipping);

router.post('/create_preference', storeController.createPreference);
router.get('/variablesenv', storeController.variablesEnv);

router.post('/mailPedidoRealizado', storeController.MailPedidoRealizado);

router.post('/NuevoPedido', storeController.nuevoPedido);

router.get("/getImagenesPublicidad", storeController.getImagenesPublicidad);

router.post("/subirImagenPublicidad", storeController.subirImagenPublicidad);

router.delete("/eliminarImagenPublicidad/:nombreImagen", storeController.eliminarImagenPublicidad);

router.get("/verificarImagen/:codigo_barra", storeController.verificarImagenArticulo);

router.post("/subirImagenArticulo", storeController.subirImagenArticulo);

module.exports = router;
