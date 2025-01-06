// controllers/db.js
const mysql = require('mysql2');

// const db = mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: '251199',
//     database: 'gootpv', 
// });


const db = mysql.createConnection({
    host: 'bsjulmyhtq0msiqavyc9-mysql.services.clever-cloud.com',
    user: 'u6akbkeycp6pdtu8',
    password: 'Krz6XnBJNxvWH86I07BH',
    database: 'bsjulmyhtq0msiqavyc9', 
});

db.connect(err => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

module.exports = db;
