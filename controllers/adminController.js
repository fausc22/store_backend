const db = require('./db');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { create } = require('domain');
const dotenv = require('dotenv');


const obtenerConfig = (req, res) => {
    const envPath = path.resolve(__dirname, '../.env');
    const config = dotenv.parse(fs.readFileSync(envPath));

    const response = {
        storeName: config.STORE_NAME,
        storeAddress: config.STORE_ADDRESS,
        storePhone: config.STORE_PHONE,
        storeDescription: config.STORE_DESCRIPTION,
        storeInstagram: config.STORE_INSTAGRAM,
        storeEmail: config.STORE_EMAIL,
        storeDeliveryBase: config.STORE_DELIVERY_BASE,
        storeDeliveryKm: config.STORE_DELIVERY_KM,
        mercadoPagoToken: config.MERCADOPAGO_ACCESS_TOKEN,
        iva: config.IVA,
        pageStatus: config.PAGE_STATUS,
        userName: config.USER_NAME,
        passWord: config.PASSWORD
    };

    res.json(response);
};

const saveConfig = (req, res) => {
    const config = req.body;
    const envPath = path.resolve(__dirname, '../.env');
    const existingConfig = dotenv.parse(fs.readFileSync(envPath));

    // Actualizar solo las variables que están en el request
    existingConfig.STORE_NAME = config.storeName || existingConfig.STORE_NAME;
    existingConfig.STORE_ADDRESS = config.storeAddress || existingConfig.STORE_ADDRESS;
    existingConfig.MERCADOPAGO_ACCESS_TOKEN = config.mercadoPagoToken || existingConfig.MERCADOPAGO_ACCESS_TOKEN;
    existingConfig.IVA = config.iva || existingConfig.IVA;
    existingConfig.PAGE_STATUS = config.pageStatus || existingConfig.PAGE_STATUS;
    existingConfig.USER_NAME = config.userName || existingConfig.USER_NAME;
    existingConfig.PASSWORD = config.passWord || existingConfig.PASSWORD;

    // Crear el contenido del archivo .env
    const updatedConfig = Object.keys(existingConfig).map(key => `${key}=${existingConfig[key]}`).join('\n');

    fs.writeFile(envPath, updatedConfig, (err) => {
        if (err) {
            console.error('Error al guardar el archivo de configuración', err);
            return res.status(500).send('Error al guardar el archivo de configuración');
        }

        res.send('Configuración guardada exitosamente');
    });
};


const login = (req, res) => {
    const { username, password } = req.body;
    const envPath = path.resolve(__dirname, '../.env');
    const config = dotenv.parse(fs.readFileSync(envPath));

    const envUsername = config.USER_NAME;
    const envPassword = config.PASSWORD;

    if (username === envUsername && password === envPassword) {
        res.status(200).json({ message: 'Solicitud aprobada' });
    } else {
        res.status(401).json({ message: 'Solicitud denegada. Si olvido sus datos, consulte con el proveedor.' });
    }
};


const pedidosPendientes = (req, res) => {
    const query = `
        SELECT 
            id, 
            fecha, 
            cliente, 
            direccion_cliente, 
            telefono_cliente, 
            email_cliente, 
            cantidad_productos, 
            monto_total, 
            medio_pago, 
            estado,
            notas_local
        FROM pedidos WHERE estado  = 'PENDIENTE' OR estado  = 'EN proceso' 
        `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los pedidos pendientes:', err);
            res.status(500).send('Error al obtener los pedidos pendientes');
        } else {
            res.json(results);
        }
    });
};

const pedidosEntregados = (req, res) => {
    const query = `
        SELECT 
            id, 
            fecha, 
            cliente, 
            direccion_cliente, 
            telefono_cliente, 
            email_cliente, 
            cantidad_productos, 
            monto_total, 
            medio_pago, 
            estado,
            notas_local
        FROM pedidos WHERE estado = 'ENTREGADO'
        `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los pedidos pendientes:', err);
            res.status(500).send('Error al obtener los pedidos pendientes');
        } else {
            res.json(results);
        }
    });
};

const productosPedido = (req, res) => {
    const pedidoId = req.params.id;

    // Consulta SQL para obtener productos del pedido
    const query = `
        SELECT id, codigo_barra, nombre_producto, cantidad, precio FROM pedidos_contenido
        WHERE id_pedido = ?
    `;
    
    db.query(query, [pedidoId], (err, results) => {
        if (err) {
            console.error('Error al obtener productos del pedido:', err);
            return res.status(500).json({ error: 'Error al obtener productos del pedido' });
        }
        res.json(results);
    });
};


const buscarProductoEnPedido = (req, res) => {
    const searchTerm = req.query.search || '';
    const query = `
        SELECT 
            art_desc_vta AS nombre, 
            CODIGO_BARRA AS codigo_barra, 
            COSTO AS costo, 
            PRECIO AS precio, 
            PRECIO_SIN_IVA AS precio_sin_iva, 
            PRECIO_SIN_IVA_4 AS precio_sin_iva_4, 
            COD_DPTO AS categoria 
        FROM articulo 
        WHERE art_desc_vta LIKE ?;
    `;
    db.query(query, [`%${searchTerm}%`], (err, results) => {
        if (err) {
            console.error('Error al obtener los productos:', err);
            res.status(500).send('Error al obtener los productos');
        } else {
            res.json(results);
        }
    });
};


// Actualizar un producto en la base de datos
const actualizarProducto = (req, res) => {
    const productoId = req.params.id;
    const { nombre_producto, cantidad, precio } = req.body;

    const query = `UPDATE pedidos_contenido SET nombre_producto = ?, cantidad = ?, precio = ? WHERE id = ?`;

    db.query(query, [nombre_producto, cantidad, precio, productoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al actualizar el producto" });
        }

        res.json({ success: true, message: "Producto actualizado correctamente" });
    });
};

// Actualizar el total del pedido en la base de datos
const actualizarPedido = (req, res) => {
    const pedidoId = req.params.id;
    const { monto_total } = req.body;

    const query = `UPDATE pedidos SET monto_total = ? WHERE id = ?`;

    db.query(query, [monto_total, pedidoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al actualizar el pedido" });
        }

        res.json({ success: true, message: "Pedido actualizado correctamente" });
    });
};



const actualizarInfoProducto = (req, res) => {
    const productoId = req.params.id;
    const { nombre, costo, precio, precio_sin_iva, precio_sin_iva_4, categoria } = req.body;

    

    const query = `UPDATE articulo SET art_desc_vta = ?, costo = ?, precio = ?, precio_sin_iva = ?, precio_sin_iva_4 = ?, COD_DPTO = ? WHERE CODIGO_BARRA = ?`;

    db.query(query, [nombre, costo, precio, precio_sin_iva, precio_sin_iva_4, categoria, productoId], (error, results) => {
        if (error) {
            console.error("Error en la consulta:", error);
            return res.status(500).json({ success: false, message: "Error al actualizar el producto" });
        }

        res.json({ success: true, message: "Producto actualizado correctamente" });
    });
};

const variablesEnv = (req, res) => {
    const config = {
      storeName: process.env.STORE_NAME,
      storeAddress: process.env.STORE_ADDRESS,
      storePhone: process.env.STORE_PHONE,
      storeDescription: process.env.STORE_DESCRIPTION,
      storeInstagram: process.env.STORE_INSTAGRAM,
      storeEmail: process.env.STORE_EMAIL,
      storeDeliveryBase: process.env.STORE_DELIVERY_BASE,
      storeDeliveryKm: process.env.STORE_DELIVERY_KM,
      iva: process.env.IVA,
      pageStatus: process.env.PAGE_STATUS,
      userName: process.env.USER_NAME,
      password: process.env.PASSWORD,
      sessionSecret: process.env.SESSION_SECRET,
      openCageApiKey: process.env.OPENCAGE_API_KEY,
      mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
    };
    res.json(config);
  };

const MailPedidoProcesado = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;

    // Leer el archivo HTML
    let htmlTemplate = fs.readFileSync(path.join(__dirname, '../resources/email_template/pedido_confirmado.html'), 'utf8');

    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `<tr>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.name}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.quantity}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                $${item.price}
            </td>
        </tr>`;
    });

    // Reemplazar las claves {{}} con los datos
    htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName)
                               .replace(/{{name}}/g, name)
                               .replace(/{{items}}/g, itemsHtml)
                               .replace(/{{subtotal}}/g, subtotal)
                               .replace(/{{shippingCost}}/g, shippingCost)
                               .replace(/{{total}}/g, total)
                               .replace(/{{storeMail}}/g, storeMail)
                               .replace(/{{storePhone}}/g, storePhone);


    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true para port 465, false para port 587
        auth: {
           user: 'faausc@gmail.com',
           pass: 'qkbjcnmfgxoljgln'
        },
         tls: {
            rejectUnauthorized: false, // Esto puede ser necesario si estás teniendo problemas con certificados
        }
    });

    let info = await transporter.sendMail({
        from: storeName + ' - ' + storeMail, // Reemplazar con el nombre y correo de tu tienda
        to: clientMail, // Dirección de correo del destinatario
        subject: 'Pedido confirmado con éxito!',
        html: htmlTemplate,
        attachments: [
            {
                filename: 'logo.jpg', // Reemplazar con la imagen que estás utilizando
                path: path.join(__dirname, '../resources/img/logo.jpg'),
                cid: 'logo' // Debe coincidir con el cid en la plantilla HTML
            }
        ]
    });

    
    
                    
};




const actualizarEstadoPedidoProcesado = (req, res) => {
    const pedidoId = req.params.id; // Obtener el ID del pedido desde los parámetros de la URL
    const { estado } = req.body; // Obtener el nuevo estado desde el cuerpo de la solicitud

    const query = `UPDATE pedidos SET estado = ? WHERE id = ?`;

    db.query(query, [estado, pedidoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al actualizar el estado del pedido" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Pedido no encontrado" });
        }

        res.json({ success: true, message: `Estado del pedido actualizado a '${estado}'` });
    });
};


const MailPedidoEnCamino = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;

    // Leer el archivo HTML
    let htmlTemplate = fs.readFileSync(path.join(__dirname, '../resources/email_template/pedido_camino.html'), 'utf8');

    let itemsHtml = '';
    items.forEach(item => {
        itemsHtml += `<tr>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.name}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                ${item.quantity}
            </td>
            <td align="left" bgcolor="#eeeeee" style="font-family: Open Sans, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 24px; padding: 10px;">
                $${item.price}
            </td>
        </tr>`;
    });

    // Reemplazar las claves {{}} con los datos
    htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName)
                               .replace(/{{name}}/g, name)
                               .replace(/{{items}}/g, itemsHtml)
                               .replace(/{{subtotal}}/g, subtotal)
                               .replace(/{{shippingCost}}/g, shippingCost)
                               .replace(/{{total}}/g, total)
                               .replace(/{{storeMail}}/g, storeMail)
                               .replace(/{{storePhone}}/g, storePhone);


    let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true para port 465, false para port 587
        auth: {
           user: 'faausc@gmail.com',
           pass: 'qkbjcnmfgxoljgln'
        },
         tls: {
            rejectUnauthorized: false, // Esto puede ser necesario si estás teniendo problemas con certificados
        }
    });

    let info = await transporter.sendMail({
        from: storeName + ' - ' + storeMail, // Reemplazar con el nombre y correo de tu tienda
        to: clientMail, // Dirección de correo del destinatario
        subject: 'Pedido confirmado con éxito!',
        html: htmlTemplate,
        attachments: [
            {
                filename: 'logo.jpg', // Reemplazar con la imagen que estás utilizando
                path: path.join(__dirname, '../resources/img/logo.jpg'),
                cid: 'logo' // Debe coincidir con el cid en la plantilla HTML
            }
        ]
    });

    
    
                    
};




const actualizarEstadoPedidoEnCamino = (req, res) => {
    const pedidoId = req.params.id; // Obtener el ID del pedido desde los parámetros de la URL
    const { estado } = req.body; // Obtener el nuevo estado desde el cuerpo de la solicitud

    const query = `UPDATE pedidos SET estado = ? WHERE id = ?`;

    db.query(query, [estado, pedidoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al actualizar el estado del pedido" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Pedido no encontrado" });
        }

        res.json({ success: true, message: `Estado del pedido actualizado a '${estado}'` });
    });
};




module.exports = {
    obtenerConfig,
    saveConfig,
    login,
    pedidosPendientes,
    pedidosEntregados,
    productosPedido,
    buscarProductoEnPedido,
    actualizarProducto,
    actualizarPedido,
    actualizarInfoProducto,
    MailPedidoProcesado,
    variablesEnv,
    actualizarEstadoPedidoProcesado,
    MailPedidoEnCamino,
    actualizarEstadoPedidoEnCamino



};
