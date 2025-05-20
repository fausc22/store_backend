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

let IVA = '';  // Cambia const a let para poder reasignar
const ivaValue = parseInt(process.env.IVA);  // Asegúrate de convertir el valor a número



const articulosOferta = (req, res, ivaValue) => {
    let IVA;

    if (ivaValue === 0) {
        IVA = 1.21; // Multiplicador para IVA 21%
    } else if (ivaValue === 1) {
        IVA = 1.105; // Multiplicador para IVA 10.5%
    } else if (ivaValue === 2) {
        IVA = 1.00; // Multiplicador para sin IVA
    } else {
        IVA = 1.21; // Valor por defecto si es inválido
    }

    const query = `
        SELECT 
            CODIGO_BARRA, 
            art_desc_vta, 
            ROUND(SUM(PRECIO * ?), 2) AS PRECIO, 
            PRECIO_DESC 
        FROM articulo_temp 
        WHERE cat = '1' 
        GROUP BY CODIGO_BARRA, art_desc_vta, PRECIO_DESC;

    `;

    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};



//DESTACADOS DE LA PAGINA HOME
const articulosDestacados = (req, res, ivaValue) => {

    let IVA;

    if (ivaValue === 0) {
        IVA = 1.21; // Multiplicador para IVA 21%
    } else if (ivaValue === 1) {
        IVA = 1.105; // Multiplicador para IVA 10.5%
    } else if (ivaValue === 2) {
        IVA = 1.00; // Multiplicador para sin IVA
    } else {
        IVA = 1.21; // Valor por defecto si es inválido
    }

    const query = `SELECT 
            CODIGO_BARRA, 
            art_desc_vta, 
            ROUND(SUM(PRECIO * ?), 2) AS PRECIO, 
            PRECIO_DESC 
        FROM articulo_temp 
        WHERE cat = '2' 
        GROUP BY CODIGO_BARRA, art_desc_vta, PRECIO_DESC;`;
    db.query(query, [IVA], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};


const productosMain = (req, res) => {
    const query = `SELECT CODIGO_BARRA, COD_INTERNO, COD_IVA, PRECIO, COSTO, porc_impint, COD_DPTO, PESABLE, STOCK, art_desc_vta FROM articulo LIMIT 16`;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};




// Ruta para obtener productos por categoría
const filtradoCategorias = (req, res) => {
    const categoryName = req.params.categoryId;
    const query = `
        select ar.CODIGO_BARRA, ar.COD_INTERNO, ar.COD_IVA, ar.PRECIO, ar.COSTO, ar.porc_impint, ar.COD_DPTO, ar.PESABLE, ar.STOCK, ar.art_desc_vta
from articulo ar 
where ar.cod_dpto = (select dat_clasif from clasif where nom_clasif = ? and cod_clasif=1 limit 1) order by ar.art_desc_vta asc;
    `;
    db.query(query, [categoryName], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};


// Ruta para buscar productos
const buscarProductos = (req, res) => {
    const searchTerm = req.query.q;
    const query = `
        SELECT CODIGO_BARRA, COD_INTERNO, COD_IVA, PRECIO, COSTO, porc_impint, COD_DPTO, PESABLE, STOCK, art_desc_vta
        FROM articulo
        WHERE art_desc_vta LIKE ?;
    `;
    db.query(query, [`%${searchTerm}%`], (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};


//CARGAR CATEGORIAS EN LA BARRA DE SECCIONES
const obtenerCategorias = (req, res) => {
    const query = `
        SELECT id_clasif, NOM_CLASIF
        FROM clasif WHERE COD_CLASIF = 1 ORDER BY NOM_CLASIF ASC;
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};


//OBTENER ARTICULOS CHECKOUT
const articulosCheckout = (req, res) => {
    const query = `SELECT CODIGO_BARRA, COD_INTERNO, COD_IVA, PRECIO, COSTO, porc_impint, COD_DPTO, PESABLE, STOCK, art_desc_vta FROM articulo WHERE art_desc_vta LIKE '%COCA COLA%' LIMIT 4`;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error ejecutando la consulta:', err);
            res.status(500).send('Error en el servidor');
            return;
        }
        res.json(results);
    });
};


//ENVIAR CARRITO
const enviarCarrito = (req, res) => {
    const { name, quantity, total, price } = req.body;
    if (!req.session.cart) {
        req.session.cart = [];
    }
    req.session.cart.push({ name, quantity, total, price });
    console.log('Carrito actualizado:', req.session.cart); // Log para depuración
    res.send('Artículo añadido al carrito');
};


const obtenerCarrito = (req, res) => {
    console.log('Obteniendo carrito:', req.session.cart); // Log para depuración
    res.json(req.session.cart || []);
};


// Agrega estas variables al inicio del archivo
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
// Llama a esta función al iniciar el servidor o cuando sea necesario
getStoreCoordinates();
const calculateShipping = async (req, res) => {
    const { address } = req.body;
    console.log('Received Address:', address);

    try {
        const encodedAddress = encodeURIComponent(address);
        const response = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${encodedAddress}&key=${process.env.OPENCAGE_API_KEY}`);
        console.log('OpenCage Response:', response.data);

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

        if (validResults.length === 0) {
            return res.status(400).json({ message: 'No se encontró una dirección válida.' });
        }

        res.json({ results: validResults });
    } catch (error) {
        console.error('Error al calcular el envío:', error);
        if (error.response && error.response.data) {
            console.error('Error Response Data:', error.response.data);
        }
        res.status(500).json({ message: 'Error en el servidor' });
    }
};

// Funciones auxiliares para calcular la distancia y el costo de envío
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

//FUNCION PAGO 
// Configura Mercado Pago
const client = new mercadopago.MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const createPreference = async (req, res) => {
        
    try {
        const body = {
            items: [
                {
                    title:"PuntoSur MultiMercado",
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
        res.json({
            id: result.id,
        });
    } catch (error){
        console.log(error);
        res.status(500).json({
            error: "Error al crear la preferencia",
        });
    }
    
};

// Configuración de la ruta para obtener las variables de entorno
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





const MailPedidoRealizado = async (req, res) => {
    const { storeName, name, clientMail, items, subtotal, shippingCost, total, storeMail, storePhone } = req.body;

    // Leer el archivo HTML
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
        subject: 'Pedido realizado con éxito!',
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
        callback(null, result.insertId); // Devolver el ID del pedido recién insertado
    });
};

// Función para insertar los productos del pedido
const insertarProductos = (pedidoId, productos, callback) => {
    const insertProductoQuery = `
        INSERT INTO pedidos_contenido (id_pedido, codigo_barra, nombre_producto, cantidad, precio) 
        VALUES (?, ?, ?, ?, ?)
    `;

    for (let producto of productos) {
        const { codigo_barra, nombre_producto, cantidad, precio } = producto;
        const productoValues = [pedidoId, codigo_barra, nombre_producto, cantidad, precio];

        db.query(insertProductoQuery, productoValues, (err, result) => {
            if (err) {
                console.error('Error al insertar el producto del pedido:', err);
                return callback(err);
            }
        });
    }
    callback(null); // Llamar al callback sin errores cuando todos los productos se hayan insertado
};

const nuevoPedido = (req, res) => {
    const { cliente, direccion_cliente, telefono_cliente, email_cliente, cantidad_productos, monto_total, costo_envio, medio_pago, estado, notas_local, productos } = req.body;

    insertarPedido({
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
    }, (err, pedidoId) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al insertar el pedido' });
        }

        insertarProductos(pedidoId, productos, (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al insertar los productos del pedido' });
            }

            res.json({ success: true, message: 'Pedido y productos insertados correctamente' });
        });
    });

};

// 📂 Ruta donde se guardan las imágenes
const publicidadPath = path.join(__dirname, "../resources/publicidad");

// 🔹 Configuración de `multer` para subir imágenes
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
        const imagenes = files.map(file => `/publicidad/${file}`); // Construye la URL pública
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
    subirImagenArticulo
};
