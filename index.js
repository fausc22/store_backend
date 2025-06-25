require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors'); // Añadido para manejar CORS
const app = express();
const axios = require('axios');
const port = process.env.PORT || 3001; // Puerto en el que correrá la aplicación

// Importar rutas
const storeRoutes = require('./routes/storeRoutes');
const adminRoutes = require('./routes/adminRoutes'); 

// Configurar middleware de CORS
const allowedOrigins = ['http://localhost:3000', 'http://localhost:5174', 'https://tienda-front-lyart.vercel.app'];

const corsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true
};

app.use(cors(corsOptions));

// Configurar middleware de sesiones
app.use(session({
    secret: process.env.SESSION_SECRET, // Clave secreta para firmar la cookie de sesión
    resave: false,
    saveUninitialized: true
}));




// Configurar middleware para parsear JSON
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Servir imágenes de la carpeta 'resources/publicidad'
app.use("/publicidad", express.static("resources/publicidad"));


// Usar las rutas importadas
app.use('/store', storeRoutes);
app.use('/admin', adminRoutes); 

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});
