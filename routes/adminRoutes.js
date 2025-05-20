const express = require('express');
const adminController = require('../controllers/adminController');
const router = express.Router();


router.post('/loginCheck', adminController.loginCheck);

router.get('/getConfig', adminController.obtenerConfig);

router.post('/saveConfig', adminController.saveConfig);



router.get('/pedidos-pendientes', adminController.pedidosPendientes);

router.get('/pedidos-entregados', adminController.pedidosEntregados);

router.get('/pedidos-productos/:id', adminController.productosPedido);

router.get('/productos', adminController.buscarProductoEnPedido);

router.put('/actualizar-producto/:id', adminController.actualizarProducto);

router.put('/actualizar-pedido/:id', adminController.actualizarPedido);

router.put('/actualizarInfoProducto/:id',  adminController.actualizarInfoProducto);

router.post('/mailPedidoConfirmado', adminController.MailPedidoProcesado);

router.get('/variablesenv', adminController.variablesEnv);

router.put('/actualizar-pedido-procesado/:id', adminController.actualizarEstadoPedidoProcesado);

router.post('/mailPedidoEnCamino', adminController.MailPedidoEnCamino);

router.put('/actualizar-pedido-camino/:id', adminController.actualizarEstadoPedidoEnCamino);

router.delete('/eliminarPedido/:id', adminController.eliminarPedido);

router.post('/agregar-producto', adminController.agregarProductoAlPedido);

router.delete('/eliminar-producto/:id', adminController.eliminarProducto);

router.get("/productosOferta", adminController.articulosOferta);

router.get("/productosDest", adminController.articulosDest);

router.post("/agregarArticuloOferta", adminController.agregarArticuloOferta);

router.post("/agregarArticuloDest", adminController.agregarArticuloDest);

router.put("/actualizarPrecioOferta", adminController.actualizarPrecioOferta);

router.delete("/eliminarArticuloOferta/:CODIGO_BARRA", adminController.eliminarArticuloOferta);

router.delete("/eliminarArticuloDest/:CODIGO_BARRA", adminController.eliminarArticuloDest);

router.get("/getStats", adminController.obtenerStats);






module.exports = router;