// controllers/horariosController.js
const { executeQuery, pool } = require('./dbPS');

const logHorarios = (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [HORARIOS-${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
        console.error('\x1b[31m%s\x1b[0m', logMessage);
    } else if (level === 'success') {
        console.log('\x1b[32m%s\x1b[0m', logMessage);
    } else {
        console.log('\x1b[36m%s\x1b[0m', logMessage);
    }
};

// ========================================
// OBTENER CONFIGURACIÓN DE HORARIOS
// ========================================
const obtenerHorarios = async (req, res) => {
    try {
        logHorarios('Obteniendo configuración de horarios', 'info');
        
        // Obtener horarios regulares
        const horariosQuery = `
            SELECT id, dia_semana, hora_apertura, hora_cierre, activo, orden
            FROM horarios_tienda
            ORDER BY dia_semana, orden
        `;
        const horarios = await executeQuery(horariosQuery, [], 'GET_HORARIOS');
        
        // Obtener excepciones activas
        const excepcionesQuery = `
            SELECT id, fecha, descripcion, cerrado, hora_apertura, hora_cierre, activo
            FROM horarios_excepciones
            WHERE activo = 1 AND fecha >= CURDATE()
            ORDER BY fecha
        `;
        const excepciones = await executeQuery(excepcionesQuery, [], 'GET_EXCEPCIONES');
        
        // Obtener estado general (PAGE_STATUS del .env)
        const estadoGeneral = process.env.PAGE_STATUS || 'ACTIVA';
        
        logHorarios(`✅ Horarios obtenidos: ${horarios.length} franjas, ${excepciones.length} excepciones`, 'success');
        
        res.json({
            success: true,
            data: {
                horarios: horarios,
                excepciones: excepciones,
                estadoGeneral: estadoGeneral
            }
        });
    } catch (error) {
        logHorarios(`❌ Error obteniendo horarios: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: 'Error al obtener configuración de horarios'
        });
    }
};

// ========================================
// ACTUALIZAR HORARIOS DE UN DÍA
// ========================================
const actualizarHorarioDia = async (req, res) => {
    const { dia_semana, franjas } = req.body;
    
    if (dia_semana === undefined || !Array.isArray(franjas)) {
        return res.status(400).json({
            success: false,
            error: 'Día de semana y franjas horarias son requeridos'
        });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        logHorarios(`Actualizando horarios para día ${dia_semana}`, 'info');
        
        // 🆕 VALIDACIÓN MEJORADA: Permitir horarios que cruzan medianoche
        for (let i = 0; i < franjas.length; i++) {
            const franja = franjas[i];
            
            // Solo validar si la franja está activa
            if (franja.activo) {
                const apertura = franja.hora_apertura;
                const cierre = franja.hora_cierre;
                
                // Si cierre es menor que apertura, asumimos que cruza medianoche
                // Ej: 08:00 - 01:00 (válido, cierra al día siguiente)
                // No validamos nada, permitimos cualquier combinación
                
                logHorarios(`  Franja ${i + 1}: ${apertura} - ${cierre} ${cierre < apertura ? '(cruza medianoche)' : ''}`, 'info');
            }
        }
        
        // Eliminar franjas existentes para este día
        await connection.execute(
            `DELETE FROM horarios_tienda WHERE dia_semana = ?`,
            [dia_semana]
        );
        
        // Insertar nuevas franjas
        for (let i = 0; i < franjas.length; i++) {
            const franja = franjas[i];
            await connection.execute(
                `INSERT INTO horarios_tienda (dia_semana, hora_apertura, hora_cierre, activo, orden)
                 VALUES (?, ?, ?, ?, ?)`,
                [dia_semana, franja.hora_apertura, franja.hora_cierre, franja.activo ? 1 : 0, i]
            );
        }
        
        await connection.commit();
        
        logHorarios(`✅ Horarios actualizados para día ${dia_semana}`, 'success');
        
        res.json({
            success: true,
            message: 'Horarios actualizados correctamente'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        logHorarios(`❌ Error actualizando horarios: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: 'Error al actualizar horarios'
        });
    } finally {
        if (connection) connection.release();
    }
};

// ========================================
// AGREGAR EXCEPCIÓN (FERIADO/VACACIONES)
// ========================================
const agregarExcepcion = async (req, res) => {
    const { fecha, descripcion, cerrado, hora_apertura, hora_cierre } = req.body;
    
    if (!fecha || !descripcion) {
        return res.status(400).json({
            success: false,
            error: 'Fecha y descripción son requeridas'
        });
    }
    
    try {
        logHorarios(`Agregando excepción para fecha ${fecha}`, 'info');
        
        const query = `
            INSERT INTO horarios_excepciones (fecha, descripcion, cerrado, hora_apertura, hora_cierre, activo)
            VALUES (?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                descripcion = VALUES(descripcion),
                cerrado = VALUES(cerrado),
                hora_apertura = VALUES(hora_apertura),
                hora_cierre = VALUES(hora_cierre),
                activo = 1
        `;
        
        await executeQuery(query, [
            fecha,
            descripcion,
            cerrado ? 1 : 0,
            hora_apertura || null,
            hora_cierre || null
        ], 'INSERT_EXCEPCION');
        
        logHorarios(`✅ Excepción agregada para ${fecha}`, 'success');
        
        res.json({
            success: true,
            message: 'Excepción agregada correctamente'
        });
    } catch (error) {
        logHorarios(`❌ Error agregando excepción: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: 'Error al agregar excepción'
        });
    }
};

// ========================================
// ELIMINAR EXCEPCIÓN
// ========================================
const eliminarExcepcion = async (req, res) => {
    const { id } = req.params;
    
    try {
        logHorarios(`Eliminando excepción ${id}`, 'info');
        
        await executeQuery(
            `DELETE FROM horarios_excepciones WHERE id = ?`,
            [id],
            'DELETE_EXCEPCION'
        );
        
        logHorarios(`✅ Excepción ${id} eliminada`, 'success');
        
        res.json({
            success: true,
            message: 'Excepción eliminada correctamente'
        });
    } catch (error) {
        logHorarios(`❌ Error eliminando excepción: ${error.message}`, 'error');
        res.status(500).json({
            success: false,
            error: 'Error al eliminar excepción'
        });
    }
};

// ========================================
// VERIFICAR SI LA TIENDA ESTÁ ABIERTA AHORA
// ========================================
const verificarEstadoActual = async (req, res) => {
    try {
        const ahora = new Date();
        const diaActual = ahora.getDay(); // 0=Domingo, 1=Lunes, ...
        const horaActual = ahora.toTimeString().slice(0, 8); // HH:MM:SS
        const fechaActual = ahora.toISOString().slice(0, 10); // YYYY-MM-DD
        
        // 1. Verificar estado general (PAGE_STATUS)
        const estadoGeneral = process.env.PAGE_STATUS || 'ACTIVA';
        
        // 🆕 SI ESTÁ INACTIVA → BLOQUEO TOTAL
        if (estadoGeneral === 'INACTIVA') {
            return res.json({
                estaAbierto: false,
                bloqueado: true, // ← NUEVO
                pageStatus: 'INACTIVA', // ← NUEVO
                razon: 'Tienda inactiva',
                mensaje: 'La tienda está temporalmente inactiva. No es posible realizar pedidos en este momento.'
            });
        }
        
        // 🆕 SI ESTÁ ACTIVA → VERIFICAR HORARIOS
        if (estadoGeneral === 'ACTIVA') {
            // 2. Verificar excepciones para hoy
            const excepcionQuery = `
                SELECT cerrado, hora_apertura, hora_cierre, descripcion
                FROM horarios_excepciones
                WHERE fecha = ? AND activo = 1
                LIMIT 1
            `;
            const excepciones = await executeQuery(excepcionQuery, [fechaActual], 'CHECK_EXCEPCION');
            
            if (excepciones.length > 0) {
                const excepcion = excepciones[0];
                
                if (excepcion.cerrado) {
                    return res.json({
                        estaAbierto: false,
                        bloqueado: false, // ← Permite continuar
                        pageStatus: 'ACTIVA',
                        razon: 'Excepción de horario',
                        mensaje: `Cerrado hoy: ${excepcion.descripcion}`,
                        horarios: {
                            apertura: null,
                            cierre: null
                        }
                    });
                }
                
                // Hay horario especial para hoy
                if (horaActual >= excepcion.hora_apertura && horaActual < excepcion.hora_cierre) {
                    return res.json({
                        estaAbierto: true,
                        bloqueado: false,
                        pageStatus: 'ACTIVA',
                        razon: 'Horario especial',
                        mensaje: `Estamos abiertos (horario especial)`,
                        horarios: {
                            apertura: excepcion.hora_apertura,
                            cierre: excepcion.hora_cierre,
                            aperturaFormateada: formatearHora(excepcion.hora_apertura),
                            cierreFormateada: formatearHora(excepcion.hora_cierre)
                        }
                    });
                } else {
                    return res.json({
                        estaAbierto: false,
                        bloqueado: false,
                        pageStatus: 'ACTIVA',
                        razon: 'Fuera de horario especial',
                        mensaje: `Fuera de horario. Horario especial hoy: ${excepcion.hora_apertura} - ${excepcion.hora_cierre}`,
                        horarios: {
                            apertura: excepcion.hora_apertura,
                            cierre: excepcion.hora_cierre,
                            aperturaFormateada: formatearHora(excepcion.hora_apertura),
                            cierreFormateada: formatearHora(excepcion.hora_cierre)
                        }
                    });
                }
            }
            
            // 3. Verificar horarios regulares del día
            const horariosQuery = `
                SELECT hora_apertura, hora_cierre, activo
                FROM horarios_tienda
                WHERE dia_semana = ? AND activo = 1
                ORDER BY orden
            `;
            const horarios = await executeQuery(horariosQuery, [diaActual], 'CHECK_HORARIOS');
            
            if (horarios.length === 0) {
            return res.json({
                estaAbierto: false,
                bloqueado: false,
                pageStatus: 'ACTIVA',
                razon: 'Día cerrado',
                mensaje: 'Hoy permanecemos cerrados', // ← Cambiar mensaje
                horarios: {
                    apertura: null,
                    cierre: null
                },
                horariosDelDia: 'Cerrado', // 🆕 AGREGAR ESTO
                proximaApertura: null
            });
        }

            
            // Verificar si está dentro de alguna franja horaria
            for (const franja of horarios) {
                const apertura = franja.hora_apertura;
                const cierre = franja.hora_cierre;
                
                // 🆕 LÓGICA MEJORADA: Detectar si cruza medianoche
                let dentroDeHorario = false;
                
                if (cierre < apertura) {
                    // Cruza medianoche (ej: 22:00 - 02:00)
                    // Está abierto si es >= apertura O <= cierre
                    dentroDeHorario = horaActual >= apertura || horaActual < cierre;
                    
                    logHorarios(`  Franja cruza medianoche: ${apertura} - ${cierre}, actual: ${horaActual}, dentro: ${dentroDeHorario}`, 'info');
                } else {
                    // No cruza medianoche (ej: 09:00 - 22:00)
                    dentroDeHorario = horaActual >= apertura && horaActual < cierre;
                    
                    logHorarios(`  Franja normal: ${apertura} - ${cierre}, actual: ${horaActual}, dentro: ${dentroDeHorario}`, 'info');
                }
                
                if (dentroDeHorario) {
                    return res.json({
                        estaAbierto: true,
                        bloqueado: false,
                        pageStatus: 'ACTIVA',
                        razon: 'Horario regular',
                        mensaje: 'Estamos abiertos',
                        horarios: {
                            apertura: apertura,
                            cierre: cierre,
                            aperturaFormateada: formatearHora(apertura),
                            cierreFormateada: cierre < apertura 
                                ? `${formatearHora(cierre)} (día siguiente)` 
                                : formatearHora(cierre)
                        }
                    });
                }
            }
            
            // Fuera de horario - Calcular próxima apertura
            const proximaFranja = horarios.find(f => horaActual < f.hora_apertura);
            const proximaApertura = proximaFranja ? formatearHora(proximaFranja.hora_apertura) : null;
            
            // Construir string de horarios del día
            const horariosDelDia = horarios.map(h => 
                `${formatearHora(h.hora_apertura)} - ${formatearHora(h.hora_cierre)}`
            ).join(', ');
            
            return res.json({
                estaAbierto: false,
                bloqueado: false,
                pageStatus: 'ACTIVA',
                razon: 'Fuera de horario',
                mensaje: proximaApertura 
                    ? `Estamos cerrados. Abrimos a las ${proximaApertura}`
                    : 'Horario cerrado por hoy',
                horarios: {
                    apertura: proximaFranja?.hora_apertura || null,
                    cierre: proximaFranja?.hora_cierre || null,
                    aperturaFormateada: proximaApertura,
                    cierreFormateada: proximaFranja ? formatearHora(proximaFranja.hora_cierre) : null
                },
                proximaApertura: proximaApertura,
                horariosDelDia: horariosDelDia
            });
        }
        
        // Fallback por si PAGE_STATUS tiene un valor no esperado
        return res.json({
            estaAbierto: true,
            bloqueado: false,
            pageStatus: estadoGeneral,
            error: true,
            mensaje: 'Error al verificar horarios, se permite continuar'
        });
        
    } catch (error) {
        logHorarios(`❌ Error verificando estado: ${error.message}`, 'error');
        res.status(500).json({
            estaAbierto: true,
            bloqueado: false,
            pageStatus: 'ACTIVA',
            error: true,
            mensaje: 'Error al verificar horarios, se permite continuar'
        });
    }
};

// 🆕 FUNCIÓN HELPER PARA FORMATEAR HORAS
const formatearHora = (hora) => {
    if (!hora) return null;
    const [h, m] = hora.split(':');
    const hInt = parseInt(h);
    const ampm = hInt >= 12 ? 'PM' : 'AM';
    const h12 = hInt % 12 || 12;
    return `${h12}:${m} ${ampm}`;
};

module.exports = {
    obtenerHorarios,
    actualizarHorarioDia,
    agregarExcepcion,
    eliminarExcepcion,
    verificarEstadoActual
};