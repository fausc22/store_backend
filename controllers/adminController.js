const db = require('./db');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { create } = require('domain');
const dotenv = require('dotenv');


const usernameEnv = process.env.USER_NAME; // Usuario preconfigurado
const passwordEnv = process.env.PASSWORD; // Contraseña encriptada

const loginCheck = (req, res) => {
    const { username, password } = req.body;

    // Validar usuario
    if (username !== usernameEnv) {
        return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }

    // Validar contraseña
    if (password !== passwordEnv) {
        return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }

    

    res.json({ message: 'Login exitoso'});
};


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
            costo_envio, 
            medio_pago, 
            estado,
            notas_local
        FROM pedidos WHERE estado  = 'PENDIENTE' OR estado  = 'En proceso' 
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
            costo_envio, 
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
    const { monto_total, cantidad_productos } = req.body; // Ahora recibimos también la cantidad de productos

    const query = `UPDATE pedidos SET monto_total = ?, cantidad_productos = ? WHERE id = ?`;

    db.query(query, [monto_total, cantidad_productos, pedidoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al actualizar el pedido", error });
        }

        res.json({ success: true, message: "Pedido actualizado correctamente" });
    });
};


const eliminarPedido = (req, res) => {
    const pedidoId = req.params.id;
    

    const query = `DELETE FROM pedidos WHERE id = ?`;

    db.query(query, [pedidoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al eliminar el pedido" });
        }

        res.json({ success: true, message: "Pedido eliminado correctamente" });
    });
};

const eliminarProducto = (req, res) => {
    const productoId = req.params.id;
    

    const query = `DELETE FROM pedidos_contenido WHERE id = ?`;

    db.query(query, [productoId], (error, results) => {
        if (error) {
            return res.status(500).json({ success: false, message: "Error al eliminar el producto" });
        }

        res.json({ success: true, message: "Producto eliminado correctamente" });
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


const agregarArticuloOferta = (req, res) => {
    const { CODIGO_BARRA, nombre, PRECIO } = req.body;

    const query = `
        INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat) 
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE PRECIO = VALUES(PRECIO), PRECIO_DESC = VALUES(PRECIO_DESC);
    `;

    db.query(query, [CODIGO_BARRA, nombre, PRECIO, PRECIO], (err, result) => {
        if (err) {
            console.error("Error al insertar el artículo en oferta:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json({ success: true, message: "Artículo agregado a oferta" });
    });
};

const actualizarPrecioOferta = (req, res) => {
    const { CODIGO_BARRA, PRECIO_DESC } = req.body;

    const query = `
        UPDATE articulo_temp 
        SET PRECIO_DESC = ? 
        WHERE CODIGO_BARRA = ?;
    `;

    db.query(query, [PRECIO_DESC, CODIGO_BARRA], (err, result) => {
        if (err) {
            console.error("Error al actualizar el precio de oferta:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json({ success: true, message: "Precio de oferta actualizado" });
    });
};

const eliminarArticuloOferta = (req, res) => {
    const { CODIGO_BARRA } = req.params;

    const query = `
        DELETE FROM articulo_temp 
        WHERE CODIGO_BARRA = ?;
    `;

    db.query(query, [CODIGO_BARRA], (err, result) => {
        if (err) {
            console.error("Error al eliminar el artículo en oferta:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json({ success: true, message: "Artículo eliminado de oferta" });
    });
};

const eliminarArticuloDest = (req, res) => {
    const { CODIGO_BARRA } = req.params;

    const query = `
        DELETE FROM articulo_temp 
        WHERE CODIGO_BARRA = ?;
    `;

    db.query(query, [CODIGO_BARRA], (err, result) => {
        if (err) {
            console.error("Error al eliminar el artículo en Destacado:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json({ success: true, message: "Artículo eliminado de Destacado" });
    });
};

const agregarArticuloDest = (req, res) => {
    const { CODIGO_BARRA, nombre, PRECIO } = req.body;

    const query = `
        INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat) 
        VALUES (?, ?, ?, ?, 2)
        ON DUPLICATE KEY UPDATE PRECIO = VALUES(PRECIO), PRECIO_DESC = VALUES(PRECIO_DESC);
    `;

    db.query(query, [CODIGO_BARRA, nombre, PRECIO, PRECIO], (err, result) => {
        if (err) {
            console.error("Error al insertar el artículo en Destacados:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json({ success: true, message: "Artículo agregado a Destacados" });
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
    const pedidoId = req.params.id;
    const { estado } = req.body;

    console.log("ID recibido:", pedidoId);
    console.log("Estado recibido:", estado);

    if (!pedidoId || !estado) {
        console.error("Error: Faltan datos", { pedidoId, estado });
        return res.status(400).json({ 
            success: false, 
            message: "Faltan datos: pedidoId o estado no proporcionados." 
        });
    }

    const query = `UPDATE pedidos SET estado = ? WHERE id = ?`;

    db.query(query, [estado, pedidoId], (error, results) => {
        if (error) {
            console.error("Error en la consulta a la base de datos:", error);
            return res.status(500).json({ 
                success: false, 
                message: "Error al actualizar el estado del pedido." 
            });
        }

        if (results.affectedRows === 0) {
            console.error("Pedido no encontrado:", pedidoId);
            return res.status(404).json({ 
                success: false, 
                message: "Pedido no encontrado." 
            });
        }

        console.log(`Estado del pedido ${pedidoId} actualizado a '${estado}'`);
        res.json({ 
            success: true, 
            message: `Estado del pedido actualizado a '${estado}'.` 
        });
    });
};




const MailPedidoEnCamino = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone, desde, hasta } = req.body;

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
                               .replace(/{{storePhone}}/g, storePhone)
                               .replace(/{{horarioInicio}}/g, desde)
                               .replace(/{{horarioFin}}/g, hasta);


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
        subject: 'Tu pedido esta en camino!',
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


const agregarProductoAlPedido = (req, res) => {
    const { id_pedido, codigo_barra, nombre_producto, cantidad, precio } = req.body;
    const subtotal = cantidad * precio;

    const insertProductoQuery = `
    INSERT INTO pedidos_contenido (id_pedido, codigo_barra, nombre_producto, cantidad, precio) 
    VALUES (?, ?, ?, ?, ?)
    `;


    db.query(insertProductoQuery, [id_pedido, codigo_barra, nombre_producto, cantidad, precio], (err, result) => {

        if (err) {
            console.error('Error al insertar el producto:', err);
            return res.status(500).json({ success: false, message: 'Error al agregar el producto.' });
        }

        // 🔹 Después de insertar, actualizar el monto total del pedido
        const updateTotalQuery = `
            UPDATE pedidos 
            SET monto_total = (SELECT SUM(subtotal) FROM pedidos_contenido WHERE id_pedido = ?) 
            WHERE id = ?
        `;

        db.query(updateTotalQuery, [id_pedido, id_pedido], (err, result) => {
            if (err) {
                console.error('Error al actualizar el monto total del pedido:', err);
                return res.status(500).json({ success: false, message: 'Error al actualizar el total del pedido.' });
            }

            res.json({ success: true, message: 'Producto agregado y pedido actualizado correctamente.' });
        });
    });
};

const articulosOferta = (req, res) => {
    const query = `
        SELECT CODIGO_BARRA, art_desc_vta AS nombre, PRECIO, PRECIO_DESC 
        FROM articulo_temp WHERE cat = '1';
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error ejecutando la consulta:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json(results);
    });
};

const articulosDest = (req, res) => {
    const query = `
        SELECT CODIGO_BARRA, art_desc_vta AS nombre, PRECIO, PRECIO_DESC 
        FROM articulo_temp WHERE cat = '2';
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error("Error ejecutando la consulta:", err);
            res.status(500).send("Error en el servidor");
            return;
        }
        res.json(results);
    });
};




const getWhereClause = (fechaInicio, fechaFin) => {
    if (fechaInicio && fechaFin) {
        return `WHERE p.fecha BETWEEN '${fechaInicio}' AND '${fechaFin}'`;
    }
    return "";
};

// 🔹 Función para obtener ingresos totales
const getIngresos = async (fechaInicio, fechaFin) => {
    const whereClause = getWhereClause(fechaInicio, fechaFin);
    const query = `SELECT SUM(monto_total) as total FROM pedidos p ${whereClause}`;
    const [rows] = await db.promise().query(query);
    return rows.length > 0 ? rows[0].total || 0 : 0;
};

// 🔹 Función para obtener productos más vendidos
const getProductosMasVendidos = async (fechaInicio, fechaFin) => {
    const whereClause = getWhereClause(fechaInicio, fechaFin);
    const query = `
        SELECT pc.nombre_producto, SUM(pc.cantidad) as cantidad 
        FROM pedidos_contenido pc 
        JOIN pedidos p ON pc.id_pedido = p.id
        ${whereClause}
        GROUP BY pc.nombre_producto
        ORDER BY cantidad DESC 
        LIMIT 5
    `;
    const [rows] = await db.promise().query(query);
    return rows;
};

// 🔹 Función para obtener clientes con más compras
const getClientesTop = async (fechaInicio, fechaFin) => {
    const whereClause = getWhereClause(fechaInicio, fechaFin);
    const query = `
        SELECT p.cliente, COUNT(*) as total 
        FROM pedidos p 
        ${whereClause}
        GROUP BY p.cliente 
        ORDER BY monto_total DESC 
        LIMIT 5
    `;
    const [rows] = await db.promise().query(query);
    return rows;
};

// 🔹 Función para obtener ventas por ciudad
const getVentasPorCiudad = async (fechaInicio, fechaFin) => {
    const whereClause = getWhereClause(fechaInicio, fechaFin);
    const query = `
        SELECT p.direccion_cliente, SUM(p.monto_total) as total 
        FROM pedidos p 
        ${whereClause}
        GROUP BY p.direccion_cliente
    `;
    const [rows] = await db.promise().query(query);
    return rows;
};

// 🔹 Función para obtener ventas por mes
const getVentasPorMes = async (fechaInicio, fechaFin) => {
    const whereClause = getWhereClause(fechaInicio, fechaFin);
    const query = `
        SELECT DATE_FORMAT(p.fecha, '%Y-%m') as mes, SUM(p.monto_total) as total 
        FROM pedidos p 
        ${whereClause}
        GROUP BY mes
        ORDER BY mes ASC
    `;
    const [rows] = await db.promise().query(query);
    return rows;
};

// 🔹 Función principal que devuelve todas las estadísticas
const obtenerStats = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        const ingresos = await getIngresos(fechaInicio, fechaFin);
        const productosMasVendidos = await getProductosMasVendidos(fechaInicio, fechaFin);
        const clientesTop = await getClientesTop(fechaInicio, fechaFin);
        const ventasPorCiudad = await getVentasPorCiudad(fechaInicio, fechaFin);
        const ventasPorMes = await getVentasPorMes(fechaInicio, fechaFin);

        res.json({
            ingresos,
            productosMasVendidos,
            clientesTop,
            ventasPorCiudad,
            ventasPorMes
        });

    } catch (error) {
        console.error("Error en estadísticas:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
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
    actualizarEstadoPedidoEnCamino,
    loginCheck, 
    eliminarPedido,
    agregarProductoAlPedido,
    eliminarProducto,
    agregarArticuloOferta,
    actualizarPrecioOferta,
    eliminarArticuloOferta,
    articulosOferta, 
    agregarArticuloDest,
    articulosDest,
    eliminarArticuloDest,
    obtenerStats



};
