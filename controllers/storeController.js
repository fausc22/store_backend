// controllers/storeController.js
const db = require('./db');
const axios = require('axios');
const mercadopago = require('mercadopago');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { create } = require('domain');
const multer = require("multer");
require('dotenv').config();

// Función helper para calcular IVA
const calcularIVA = (ivaValue) => {
    switch (ivaValue) {
        case 0: return 1.21;   // IVA 21%
        case 1: return 1.105;  // IVA 10.5%
        case 2: return 1.00;   // Sin IVA
        default: return 1.21;  // Valor por defecto
    }
};

// ARTÍCULOS EN OFERTA
// const articulosOferta = (req, res) => {
//     const ivaValue = parseInt(process.env.IVA);
//     const IVA = calcularIVA(ivaValue);

//     const query = `
//         SELECT 
//             at.CODIGO_BARRA,
//             at.art_desc_vta,
//             ROUND(at.PRECIO * ?, 2) AS PRECIO,
//             at.PRECIO_DESC,
//             a.STOCK,
//             a.PESABLE,
//             a.COD_INTERNO
//         FROM articulo_temp at
//         INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
//         WHERE at.cat = '1' 
//         AND at.activo = 1 
//         AND a.HABILITADO = 'S'
//         AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
//         ORDER BY at.orden ASC, at.fecha_inicio DESC;
//     `;

//     db.query(query, [IVA], (err, results) => {
//         if (err) {
//             console.error('Error ejecutando la consulta de ofertas:', err);
//             res.status(500).json({ error: 'Error en el servidor' });
//             return;
//         }
//         res.json(results);
//     });
// };


const articulosOferta = (req, res) => {
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    const query = `SELECT CODIGO_BARRA, 
    COD_INTERNO, COD_IVA, PRECIO, COSTO, porc_impint, 
    COD_DPTO, PESABLE, STOCK, art_desc_vta FROM articulo LIMIT 8`;

    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de ofertas:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// ARTÍCULOS DESTACADOS DE LA PÁGINA HOME
const articulosDestacados = (req, res) => {
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    const query = `
        SELECT 
            at.CODIGO_BARRA,
            at.art_desc_vta,
            ROUND(at.PRECIO * ?, 2) AS PRECIO,
            at.PRECIO_DESC,
            a.STOCK,
            a.PESABLE,
            a.COD_INTERNO
        FROM articulo_temp at
        INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
        WHERE at.cat = '2' 
        AND at.activo = 1 
        AND a.HABILITADO = 'S'
        AND (at.fecha_fin IS NULL OR at.fecha_fin > NOW())
        ORDER BY at.orden ASC, at.fecha_inicio DESC;
    `;

    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de destacados:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// PRODUCTOS PRINCIPALES (HOME)
const productosMain = (req, res) => {
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    const query = `
        SELECT 
            CODIGO_BARRA,
            COD_INTERNO,
            COD_IVA,
            ROUND(PRECIO * ?, 2) AS PRECIO,
            COSTO,
            porc_impint,
            COD_DPTO,
            PESABLE,
            STOCK,
            art_desc_vta,
            HABILITADO
        FROM articulo 
        WHERE HABILITADO = 'S'
        ORDER BY art_desc_vta ASC 
        LIMIT 16;
    `;

    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de productos principales:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// FILTRADO POR CATEGORÍAS
const filtradoCategorias = (req, res) => {
    const categoryName = req.params.categoryId;
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    const query = `
        SELECT 
            ar.CODIGO_BARRA,
            ar.COD_INTERNO,
            ar.COD_IVA,
            ROUND(ar.PRECIO * ?, 2) AS PRECIO,
            ar.COSTO,
            ar.porc_impint,
            ar.COD_DPTO,
            ar.PESABLE,
            ar.STOCK,
            ar.art_desc_vta,
            c.NOM_CLASIF as categoria_nombre
        FROM articulo ar 
        INNER JOIN clasif c ON c.DAT_CLASIF = ar.COD_DPTO AND c.COD_CLASIF = 1
        WHERE c.NOM_CLASIF = ? 
        AND ar.HABILITADO = 'S'
        ORDER BY ar.art_desc_vta ASC;
    `;

    db.query(query, [IVA, categoryName], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de categorías:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// BÚSQUEDA DE PRODUCTOS
const buscarProductos = (req, res) => {
    const searchTerm = req.query.q;
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({ error: 'Término de búsqueda muy corto' });
    }

    const query = `
        SELECT 
            CODIGO_BARRA,
            COD_INTERNO,
            COD_IVA,
            ROUND(PRECIO * ?, 2) AS PRECIO,
            COSTO,
            porc_impint,
            COD_DPTO,
            PESABLE,
            STOCK,
            art_desc_vta
        FROM articulo
        WHERE (art_desc_vta LIKE ? OR CODIGO_BARRA LIKE ? OR NOMBRE LIKE ?)
        AND HABILITADO = 'S'
        ORDER BY 
            CASE 
                WHEN art_desc_vta LIKE ? THEN 1
                WHEN CODIGO_BARRA LIKE ? THEN 2
                ELSE 3
            END,
            art_desc_vta ASC
        LIMIT 50;
    `;

    const searchPattern = `%${searchTerm}%`;
    const exactStart = `${searchTerm}%`;

    db.query(query, [IVA, searchPattern, searchPattern, searchPattern, exactStart, exactStart], (err, results) => {
        if (err) {
            console.error('Error ejecutando la búsqueda:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// OBTENER CATEGORÍAS
const obtenerCategorias = (req, res) => {
    const query = `
        SELECT 
            c.id_clasif,
            c.NOM_CLASIF,
            COUNT(a.COD_INTERNO) as cantidad_productos
        FROM clasif c
        LEFT JOIN articulo a ON c.DAT_CLASIF = a.COD_DPTO AND a.HABILITADO = 'S'
        WHERE c.COD_CLASIF = 1 
        GROUP BY c.id_clasif, c.NOM_CLASIF
        HAVING cantidad_productos > 0
        ORDER BY c.NOM_CLASIF ASC;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de categorías:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// ARTÍCULOS CHECKOUT (productos sugeridos)
const articulosCheckout = (req, res) => {
    const ivaValue = parseInt(process.env.IVA);
    const IVA = calcularIVA(ivaValue);

    const query = `
        SELECT 
            CODIGO_BARRA,
            COD_INTERNO,
            COD_IVA,
            ROUND(PRECIO * ?, 2) AS PRECIO,
            COSTO,
            porc_impint,
            COD_DPTO,
            PESABLE,
            STOCK,
            art_desc_vta
        FROM articulo 
        WHERE art_desc_vta LIKE '%COCA COLA%' 
        AND HABILITADO = 'S'
        LIMIT 4;
    `;

    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta de checkout:', err);
            res.status(500).json({ error: 'Error en el servidor' });
            return;
        }
        res.json(results);
    });
};

// GESTIÓN DE CARRITO MEJORADA
const enviarCarrito = (req, res) => {
    const { cod_interno, codigo_barra, cantidad, precio, id_cliente } = req.body;

    // Si no hay cliente (sesión anónima), usar sesiones
    if (!id_cliente) {
        if (!req.session.cart) {
            req.session.cart = [];
        }
        
        // Buscar si el producto ya existe en el carrito
        const existingItem = req.session.cart.find(item => item.codigo_barra === codigo_barra);
        
        if (existingItem) {
            existingItem.cantidad += cantidad;
            existingItem.total = existingItem.cantidad * existingItem.precio;
        } else {
            req.session.cart.push({
                cod_interno,
                codigo_barra,
                cantidad,
                precio,
                total: cantidad * precio
            });
        }
        
        return res.json({ success: true, message: 'Producto añadido al carrito' });
    }

    // Si hay cliente registrado, usar base de datos
    const insertQuery = `
        INSERT INTO carrito_cont (idcarrito, cod_interno, codigo_barra, cantidad, precio)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        cantidad = cantidad + VALUES(cantidad);
    `;

    db.query(insertQuery, [id_cliente, cod_interno, codigo_barra, cantidad, precio], (err, result) => {
        if (err) {
            console.error('Error añadiendo al carrito:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Producto añadido al carrito' });
    });
};

const obtenerCarrito = (req, res) => {
    const { id_cliente } = req.query;

    // Si no hay cliente, devolver carrito de sesión
    if (!id_cliente) {
        return res.json(req.session.cart || []);
    }

    // Si hay cliente, obtener de base de datos
    const query = `
        SELECT 
            cc.cod_interno,
            cc.codigo_barra,
            cc.cantidad,
            cc.precio,
            a.art_desc_vta as nombre,
            (cc.cantidad * cc.precio) as total
        FROM carrito_cont cc
        INNER JOIN articulo a ON cc.codigo_barra = a.CODIGO_BARRA
        WHERE cc.idcarrito = ?;
    `;

    db.query(query, [id_cliente], (err, results) => {
        if (err) {
            console.error('Error obteniendo carrito:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
};

// CALCULAR ENVÍO (mantener igual)
let storeCoordinates = { lat: 0, lng: 0 };

const getStoreCoordinates = async () => {
    const address = process.env.STORE_ADDRESS;
    try {
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${process.env.OPENCAGE_API_KEY}`);
        if (response.data.results.length === 0) {
            console.error('Dirección de la tienda no válida');
            return;
        }
        const { lat, lng } = response.data.results[0].geometry;
        storeCoordinates = { lat, lng };
        console.log('Coordenadas de la tienda obtenidas:', storeCoordinates);
    } catch (error) {
        console.error('Error al obtener las coordenadas de la tienda:', error);
    }
};

getStoreCoordinates();

const calculateShipping = async (req, res) => {
    const { address } = req.body;

    try {
        const encodedAddress = encodeURIComponent(address);
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${encodedAddress}&key=${process.env.OPENCAGE_API_KEY}`);

        if (response.data.results.length === 0) {
            return res.status(400).json({ message: 'Dirección no válida' });
        }

        const validResults = response.data.results.map(result => {
            const { lat, lng } = result.geometry;
            const distance = getDistanceFromLatLonInKm(storeCoordinates.lat, storeCoordinates.lng, lat, lng);
            const shippingCost = calculateShippingCost(distance);
            return {
                formatted: result.formatted,
                distance,
                shippingCost
            };
        });

        res.json({ results: validResults });
    } catch (error) {
        console.error('Error al calcular el envío:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
};

const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
};

const calculateShippingCost = (distance) => {
    const baseCost = parseFloat(process.env.STORE_DELIVERY_BASE);
    const costPerKm = parseFloat(process.env.STORE_DELIVERY_KM);
    return baseCost + (distance * costPerKm);
};

// MERCADOPAGO (mantener igual)
const client = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const createPreference = async (req, res) => {
    try {
        const body = {
            items: [
                {
                    title: "PuntoSur MultiMercado",
                    quantity: 1,
                    unit_price: Number(req.body.total),
                    currency_id: "ARS"
                },
            ],
            back_urls: {
                success: "localhost:5173/confirmacion",
                failure: "localhost/confirmacion",
                pending: "localhost/confirmacion",
            },
            auto_return: "approved",
        };

        const preference = new mercadopago.Preference(client);
        const result = await preference.create({ body });
        res.json({ id: result.id });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Error al crear la preferencia" });
    }
};

// VARIABLES DE ENTORNO (mantener igual)
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

// EMAIL (mantener igual)
const MailPedidoRealizado = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;

    let htmlTemplate = fs.readFileSync(path.join(__dirname, '../resources/email_template/pedido_realizado.html'), 'utf8');

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

    htmlTemplate = htmlTemplate.replace(/{{storeName}}/g, storeName)
                               .replace(/{{name}}/g, name)
                               .replace(/{{items}}/g, itemsHtml)
                               .replace(/{{subtotal}}/g, subtotal)
                               .replace(/{{shippingCost}}/g, shippingCost)
                               .replace(/{{total}}/g, total)
                               .replace(/{{storeMail}}/g, storeMail)
                               .replace(/{{storePhone}}/g, storePhone);

    let transporter = nodemailer.createTransporter({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: 'faausc@gmail.com',
            pass: 'qkbjcnmfgxoljgln'
        },
        tls: {
            rejectUnauthorized: false,
        }
    });

    await transporter.sendMail({
        from: storeName + ' - ' + storeMail,
        to: clientMail,
        subject: 'Pedido realizado con éxito!',
        html: htmlTemplate,
        attachments: [
            {
                filename: 'logo.jpg',
                path: path.join(__dirname, '../resources/img/logo.jpg'),
                cid: 'logo'
            }
        ]
    });
};

// GESTIÓN DE PEDIDOS MEJORADA
const insertarPedido = (pedidoData, callback) => {
    const { cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local } = pedidoData;

    const insertPedidoQuery = `
        INSERT INTO pedidos 
        (fecha, cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local) 
        VALUES 
        (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const pedidoValues = [cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local];

    db.query(insertPedidoQuery, pedidoValues, (err, result) => {
        if (err) {
            console.error('Error al insertar el pedido:', err);
            return callback(err);
        }
        callback(null, result.insertId);
    });
};

const insertarProductos = (pedidoId, productos, callback) => {
    if (!productos || productos.length === 0) {
        return callback(new Error('No hay productos para insertar'));
    }

    const insertProductoQuery = `
        INSERT INTO pedidos_contenido (id_pedido, codigo_barra, nombre_producto, cantidad, precio) 
        VALUES ?
    `;

    const productosValues = productos.map(producto => [
        pedidoId,
        producto.codigo_barra,
        producto.nombre_producto,
        producto.cantidad,
        producto.precio
    ]);

    db.query(insertProductoQuery, [productosValues], (err, result) => {
        if (err) {
            console.error('Error al insertar los productos del pedido:', err);
            return callback(err);
        }
        callback(null);
    });
};

const nuevoPedido = (req, res) => {
    const { cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local, productos } = req.body;

    // Validaciones básicas
    if (!cliente || !direccion_cliente || !telefono_cliente || !email_cliente || !productos || productos.length === 0) {
        return res.status(400).json({ success: false, message: 'Datos incompletos del pedido' });
    }

    insertarPedido({
        cliente,
        direccion_cliente,
        telefono_cliente,
        email_cliente,
        cantidad_productos,
        monto_total,
        costo_envio,
        medio_pago: medio_pago || 'No especificado',
        estado: estado || 'pendiente',
        notas_local
    }, (err, pedidoId) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al insertar el pedido', error: err.message });
        }

        insertarProductos(pedidoId, productos, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al insertar los productos del pedido', error: err.message });
            }

            res.json({ 
                success: true, 
                message: 'Pedido y productos insertados correctamente',
                pedido_id: pedidoId
            });
        });
    });
};

// GESTIÓN DE IMÁGENES (mantener igual pero mejorar)
const publicidadPath = path.join(__dirname, "../resources/publicidad");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, publicidadPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});
const upload = multer({ storage });

const getImagenesPublicidad = (req, res) => {
    fs.readdir(publicidadPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "No se pueden obtener las imágenes" });
        }
        const imagenes = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
                            .map(file => `/publicidad/${file}`);
        res.json(imagenes);
    });
};

const subirImagenPublicidad = (req, res) => {
    upload.single("imagen")(req, res, (err) => {
        if (err) {
            return res.status(500).json({ error: "Error al subir la imagen" });
        }
        res.json({ message: "Imagen subida correctamente", url: `/publicidad/${req.file.filename}` });
    });
};

const eliminarImagenPublicidad = (req, res) => {
    const nombreImagen = req.params.nombreImagen;
    const rutaImagen = path.join(publicidadPath, nombreImagen);

    fs.unlink(rutaImagen, (err) => {
        if (err) {
            return res.status(500).json({ error: "No se pudo eliminar la imagen" });
        }
        res.json({ message: "Imagen eliminada correctamente" });
    });
};

const storageImg = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../resources/img_art"));
    },
    filename: (req, file, cb) => {
        const codigo_barra = req.body.codigo_barra;
        cb(null, `${codigo_barra}${path.extname(file.originalname)}`);
    }
});
const uploadImg = multer({ storage: storageImg }).single("imagen");

const verificarImagenArticulo = (req, res) => {
    const codigo_barra = req.body.codigo_barra;
    const imagePath = path.join(__dirname, `../resources/img_art/${codigo_barra}.jpg`);

    fs.access(imagePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.json({ existe: false });
        }
        res.json({ existe: true });
    });
};

const subirImagenArticulo = (req, res) => {
    uploadImg(req, res, (err) => {
        if (err) {
            return res.status(500).json({ error: "Error al subir la imagen" });
        }

        if (!req.body.codigo_barra) {
            return res.status(400).json({ error: "Código de barra no recibido en el servidor" });
        }
        res.json({ mensaje: "Imagen subida correctamente" });
    });
};

// NUEVAS FUNCIONES PARA GESTIÓN DE OFERTAS Y DESTACADOS
const gestionarOfertasDestacados = (req, res) => {
    const { codigo_barra, precio, precio_desc, categoria, fecha_fin, orden } = req.body;
    
    if (!codigo_barra || !precio || !categoria) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }

    // Primero obtener información del artículo
    const getArticuloQuery = `SELECT art_desc_vta FROM articulo WHERE CODIGO_BARRA = ?`;
    
    db.query(getArticuloQuery, [codigo_barra], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado' });
        }

        const art_desc_vta = results[0].art_desc_vta;

        const insertQuery = `
            INSERT INTO articulo_temp (CODIGO_BARRA, art_desc_vta, PRECIO, PRECIO_DESC, cat, fecha_fin, orden)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            PRECIO = VALUES(PRECIO),
            PRECIO_DESC = VALUES(PRECIO_DESC),
            fecha_fin = VALUES(fecha_fin),
            orden = VALUES(orden),
            activo = 1
        `;

        db.query(insertQuery, [codigo_barra, art_desc_vta, precio, precio_desc, categoria, fecha_fin, orden || 0], (err, result) => {
            if (err) {
                console.error('Error al gestionar oferta/destacado:', err);
                return res.status(500).json({ error: 'Error en el servidor' });
            }
            res.json({ success: true, message: 'Oferta/Destacado gestionado correctamente' });
        });
    });
};

const obtenerOfertasDestacados = (req, res) => {
    const query = `
        SELECT 
            at.*,
            a.art_desc_vta as nombre_completo,
            a.STOCK
        FROM articulo_temp at
        INNER JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
        WHERE at.activo = 1
        ORDER BY at.cat, at.orden, at.fecha_inicio DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error obteniendo ofertas/destacados:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json(results);
    });
};

const eliminarOfertaDestacado = (req, res) => {
    const { id } = req.params;
    
    const query = `UPDATE articulo_temp SET activo = 0 WHERE id = ?`;
    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error eliminando oferta/destacado:', err);
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        res.json({ success: true, message: 'Oferta/Destacado eliminado correctamente' });
    });
};

module.exports = {
    articulosOferta,
    articulosDestacados,
    productosMain,
    filtradoCategorias,
    buscarProductos,
    obtenerCategorias,
    articulosCheckout,
    enviarCarrito,
    obtenerCarrito,
    calculateShipping,
    createPreference,
    variablesEnv,
    MailPedidoRealizado,
    nuevoPedido,
    getImagenesPublicidad,
    subirImagenPublicidad,
    eliminarImagenPublicidad,
    verificarImagenArticulo,
    subirImagenArticulo,
    gestionarOfertasDestacados,
    obtenerOfertasDestacados,
    eliminarOfertaDestacado
};