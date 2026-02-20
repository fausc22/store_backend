// Script para crear usuario inicial en la base de datos
// Uso: node create_initial_user.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { executeQuery } = require('./controllers/dbPS');

async function createInitialUser() {
    try {
        console.log('🔐 Creando usuario inicial...\n');

        // Datos del usuario admin
        const usuarioAdmin = process.env.ADMIN_USER || 'pedro';
        const passwordAdmin = process.env.ADMIN_PASSWORD || 'Puntosur*3299';
        const rolAdmin = 'admin';

        // Datos del usuario kiosco (opcional)
        const usuarioKiosco = process.env.KIOSCO_USER || 'puntosur';
        const passwordKiosco = process.env.KIOSCO_PASSWORD || 'kiosco2025';
        const rolKiosco = 'kiosco';

        // Hashear contraseñas
        console.log('🔑 Hasheando contraseñas...');
        const hashAdmin = await bcrypt.hash(passwordAdmin, 10);
        const hashKiosco = await bcrypt.hash(passwordKiosco, 10);

        // Verificar si la tabla existe
        try {
            await executeQuery('SELECT 1 FROM usuarios LIMIT 1', [], 'CHECK_TABLE');
            console.log('✅ Tabla usuarios existe\n');
        } catch (error) {
            console.error('❌ Error: La tabla usuarios no existe. Por favor ejecuta primero el script SQL: create_usuarios_table.sql');
            process.exit(1);
        }

        // Verificar si ya existe el usuario admin
        const existingAdmin = await executeQuery(
            'SELECT id FROM usuarios WHERE usuario = ?',
            [usuarioAdmin],
            'CHECK_ADMIN'
        );

        if (existingAdmin && existingAdmin.length > 0) {
            console.log(`⚠️  El usuario admin "${usuarioAdmin}" ya existe. Actualizando...`);
            await executeQuery(
                'UPDATE usuarios SET password = ?, rol = ? WHERE usuario = ?',
                [hashAdmin, rolAdmin, usuarioAdmin],
                'UPDATE_ADMIN'
            );
            console.log(`✅ Usuario admin actualizado: ${usuarioAdmin}`);
        } else {
            await executeQuery(
                'INSERT INTO usuarios (usuario, password, rol) VALUES (?, ?, ?)',
                [usuarioAdmin, hashAdmin, rolAdmin],
                'CREATE_ADMIN'
            );
            console.log(`✅ Usuario admin creado: ${usuarioAdmin}`);
        }

        // Crear usuario kiosco
        const existingKiosco = await executeQuery(
            'SELECT id FROM usuarios WHERE usuario = ?',
            [usuarioKiosco],
            'CHECK_KIOSCO'
        );

        if (existingKiosco && existingKiosco.length > 0) {
            console.log(`⚠️  El usuario kiosco "${usuarioKiosco}" ya existe. Actualizando...`);
            await executeQuery(
                'UPDATE usuarios SET password = ?, rol = ? WHERE usuario = ?',
                [hashKiosco, rolKiosco, usuarioKiosco],
                'UPDATE_KIOSCO'
            );
            console.log(`✅ Usuario kiosco actualizado: ${usuarioKiosco}`);
        } else {
            await executeQuery(
                'INSERT INTO usuarios (usuario, password, rol) VALUES (?, ?, ?)',
                [usuarioKiosco, hashKiosco, rolKiosco],
                'CREATE_KIOSCO'
            );
            console.log(`✅ Usuario kiosco creado: ${usuarioKiosco}`);
        }

        console.log('\n📋 Resumen de credenciales:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`👤 Admin:`);
        console.log(`   Usuario: ${usuarioAdmin}`);
        console.log(`   Password: ${passwordAdmin}`);
        console.log(`   Rol: ${rolAdmin}`);
        console.log('');
        console.log(`👤 Kiosco:`);
        console.log(`   Usuario: ${usuarioKiosco}`);
        console.log(`   Password: ${passwordKiosco}`);
        console.log(`   Rol: ${rolKiosco}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ Usuarios creados exitosamente!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creando usuarios:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Ejecutar
createInitialUser();

