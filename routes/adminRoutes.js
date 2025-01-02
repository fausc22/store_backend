const express = require('express');
const adminController = require('../controllers/adminController');

const router = express.Router();


router.get('/getConfig', adminController.obtenerConfig);

router.post('/saveConfig', adminController.saveConfig);

router.post('/loginCheck', adminController.login);

router.get('/pedidos-pendientes', adminController.pedidosPendientes);

router.get('/pedidos-entregados', adminController.pedidosEntregados);

router.get('/pedidos-productos/:id', adminController.productosPedido);

router.get('/productos', adminController.buscarProductoEnPedido);

router.put('/actualizar-producto/:id', adminController.actualizarProducto);

router.put('/actualizar-pedido/:id', adminController.actualizarPedido);

router.put('/actualizarInfoProducto/:id', adminController.actualizarInfoProducto);

router.post('/mailPedidoConfirmado', adminController.MailPedidoProcesado);

router.get('/variablesenv', adminController.variablesEnv);

router.put('/actualizar-pedido/:id', adminController.actualizarEstadoPedidoProcesado);

router.post('/mailPedidoEnCamino', adminController.MailPedidoEnCamino);

router.put('/actualizar-pedido-camino/:id', adminController.actualizarEstadoPedidoEnCamino);






module.exports = router;