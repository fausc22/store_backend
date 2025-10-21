// controllers/estadisticasController.js
const { executeQuery, logConnection, pool } = require('./dbPS');

// ==============================================
// SISTEMA DE LOGS PARA CONTROLADOR ESTADÍSTICAS
// ==============================================
const logEstadisticas = (message, level = 'info', operation = 'ESTADISTICAS') => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${operation}-${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
        console.error('\x1b[31m%s\x1b[0m', logMessage);
    } else if (level === 'warn') {
        console.warn('\x1b[33m%s\x1b[0m', logMessage);
    } else if (level === 'success') {
        console.log('\x1b[32m%s\x1b[0m', logMessage);
    } else {
        console.log('\x1b[36m%s\x1b[0m', logMessage);
    }
};

// Wrapper para manejo de errores async
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ==============================================
// FUNCIONES AUXILIARES
// ==============================================

const validarRangoFechas = (fechaInicio, fechaFin) => {
    const ahora = new Date();
    const treintaDiasAtras = new Date(ahora.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    let inicio = fechaInicio ? new Date(fechaInicio) : treintaDiasAtras;
    let fin = fechaFin ? new Date(fechaFin) : ahora;
    
    // Validar que las fechas sean válidas
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        throw new Error('Formato de fecha inválido');
    }
    
    // Asegurar que inicio no sea mayor que fin
    if (inicio > fin) {
        [inicio, fin] = [fin, inicio];
    }
    
    // Limitar el rango máximo a 1 año
    const unAnoEnMs = 365 * 24 * 60 * 60 * 1000;
    if (fin - inicio > unAnoEnMs) {
        inicio = new Date(fin.getTime() - unAnoEnMs);
    }
    
    return {
        fechaInicio: inicio.toISOString().split('T')[0],
        fechaFin: fin.toISOString().split('T')[0],
        diasAnalizados: Math.ceil((fin - inicio) / (24 * 60 * 60 * 1000))
    };
};

const construirFiltroFechas = (fechaInicio, fechaFin) => {
    if (fechaInicio && fechaFin) {
        return {
            whereClause: `WHERE p.fecha BETWEEN ? AND ? AND p.estado = 'entregado'`,
            params: [fechaInicio, fechaFin]
        };
    }
    return {
        whereClause: `WHERE p.estado = 'entregado'`,
        params: []
    };
};

const calcularMetricasAdicionales = (datosBase) => {
    const {
        ingresos_totales = 0,
        ganancias_totales = 0,
        pedidos_totales = 0,
        productos_vendidos = 0
    } = datosBase;
    
    return {
        ticket_promedio: pedidos_totales > 0 ? Math.round((ingresos_totales / pedidos_totales) * 100) / 100 : 0,
        margen_ganancia_promedio: ingresos_totales > 0 ? Math.round((ganancias_totales / ingresos_totales) * 100 * 100) / 100 : 0,
        productos_por_pedido: pedidos_totales > 0 ? Math.round((productos_vendidos / pedidos_totales) * 100) / 100 : 0
    };
};


// Función helper para obtener datos de productos especiales
    const obtenerDatosProductosEspeciales = async (filtro) => {
        const [ofertas, destacados, liquidacion, ventasTotales] = await Promise.all([
            executeQuery(
                `SELECT at.CODIGO_BARRA as codigo_barra, at.art_desc_vta as nombre, COALESCE(a.STOCK, 0) as stock,
                COALESCE(SUM(pc.cantidad), 0) as total_vendido, COALESCE(SUM(pc.subtotal), 0) as ingresos
                FROM articulo_temp at
                LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                WHERE at.cat = '1' AND at.activo = 1
                GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                ORDER BY total_vendido DESC`,
                filtro.params, 'HELPER_OFERTAS'
            ),
            executeQuery(
                `SELECT at.CODIGO_BARRA as codigo_barra, at.art_desc_vta as nombre, COALESCE(a.STOCK, 0) as stock,
                COALESCE(SUM(pc.cantidad), 0) as total_vendido, COALESCE(SUM(pc.subtotal), 0) as ingresos
                FROM articulo_temp at
                LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                WHERE at.cat = '2' AND at.activo = 1
                GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                ORDER BY total_vendido DESC`,
                filtro.params, 'HELPER_DESTACADOS'
            ),
            executeQuery(
                `SELECT at.CODIGO_BARRA as codigo_barra, at.art_desc_vta as nombre, COALESCE(a.STOCK, 0) as stock,
                COALESCE(SUM(pc.cantidad), 0) as total_vendido, COALESCE(SUM(pc.subtotal), 0) as ingresos
                FROM articulo_temp at
                LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                WHERE at.cat = '3' AND at.activo = 1
                GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                ORDER BY total_vendido DESC`,
                filtro.params, 'HELPER_LIQUIDACION'
            ),
            executeQuery(
                `SELECT COALESCE(SUM(cantidad_productos), 0) as total_vendido FROM pedidos p ${filtro.whereClause}`,
                filtro.params, 'HELPER_TOTALES'
            )
        ]);

        const calcularResumen = (productos) => ({
            cantidad_productos: productos.length,
            total_vendido: productos.reduce((s, p) => s + (parseInt(p.total_vendido) || 0), 0),
            ingresos: Math.round(productos.reduce((s, p) => s + (parseFloat(p.ingresos) || 0), 0) * 100) / 100,
            ticket_promedio: productos.length > 0 ? Math.round((productos.reduce((s, p) => s + (parseFloat(p.ingresos) || 0), 0) / productos.reduce((s, p) => s + (parseInt(p.total_vendido) || 0), 0)) * 100) / 100 : 0,
            productos: productos
        });

        const resumenOfertas = calcularResumen(ofertas);
        const resumenDestacados = calcularResumen(destacados);
        const resumenLiquidacion = calcularResumen(liquidacion);

        const totalVendidoEspeciales = resumenOfertas.total_vendido + resumenDestacados.total_vendido + resumenLiquidacion.total_vendido;
        const totalVendidoGeneral = ventasTotales[0]?.total_vendido || 0;
        const porcentajeDelTotal = totalVendidoGeneral > 0 ? ((totalVendidoEspeciales / totalVendidoGeneral) * 100).toFixed(1) : 0;

        return {
            resumen: {
                total_productos: ofertas.length + destacados.length + liquidacion.length,
                total_vendido: totalVendidoEspeciales,
                ingresos_totales: Math.round((resumenOfertas.ingresos + resumenDestacados.ingresos + resumenLiquidacion.ingresos) * 100) / 100,
                porcentaje_del_total: parseFloat(porcentajeDelTotal)
            },
            ofertas: resumenOfertas,
            destacados: resumenDestacados,
            liquidacion: resumenLiquidacion
        };
    };

// ==============================================
// CONTROLADORES PRINCIPALES
// ==============================================

const obtenerEstadisticasCompletas = asyncHandler(async (req, res) => {
    const { fechaInicio, fechaFin } = req.query;
    const startTime = Date.now();
    
    logEstadisticas(`Obteniendo estadísticas completas - Fechas: ${fechaInicio || 'sin inicio'} a ${fechaFin || 'sin fin'}`, 'info');

    try {
        // Validar y normalizar fechas
        const rangoFechas = validarRangoFechas(fechaInicio, fechaFin);
        const filtro = construirFiltroFechas(rangoFechas.fechaInicio, rangoFechas.fechaFin);
        
        // Ejecutar todas las consultas en paralelo
        const [
            resumenResult,
            gananciasResult,
            productosMasVendidos,
            categoriasMasVendidas,
            ventasPorHora,
            ventasPorDiaSemana,
            tendenciaMensual,
            productosStockBajo,
            clientesTop
        ] = await Promise.all([
            // 1. Resumen de ingresos y pedidos
            executeQuery(
                `SELECT 
                    COALESCE(SUM(p.monto_total), 0) as ingresos_totales,
                    COUNT(p.id_pedido) as pedidos_totales,
                    COALESCE(SUM(p.cantidad_productos), 0) as productos_vendidos
                 FROM pedidos p 
                 ${filtro.whereClause}`,
                filtro.params,
                'STATS_RESUMEN'
            ),
            
            // 2. Cálculo de ganancias (precio - costo) * cantidad
            executeQuery(
                `SELECT 
                    COALESCE(SUM((pc.precio - COALESCE(a.COSTO, 0)) * pc.cantidad), 0) as ganancias_totales
                 FROM pedidos_contenido pc
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 LEFT JOIN articulo a ON pc.codigo_barra = a.CODIGO_BARRA
                 ${filtro.whereClause}`,
                filtro.params,
                'STATS_GANANCIAS'
            ),
            
            // 3. Productos más vendidos
            executeQuery(
                `SELECT 
                    pc.nombre_producto,
                    SUM(pc.cantidad) as total_vendido,
                    SUM(pc.subtotal) as ingresos_producto,
                    COUNT(DISTINCT p.id_pedido) as pedidos_con_producto
                 FROM pedidos_contenido pc 
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 ${filtro.whereClause}
                 GROUP BY pc.nombre_producto
                 ORDER BY total_vendido DESC 
                 LIMIT 10`,
                filtro.params,
                'STATS_PRODUCTOS_TOP'
            ),
            
            // 4. Categorías más vendidas
            executeQuery(
                `SELECT 
                    COALESCE(c.NOM_CLASIF, 'Sin categoría') as categoria,
                    SUM(pc.cantidad) as total_vendido,
                    SUM(pc.subtotal) as ingresos_categoria,
                    COUNT(DISTINCT pc.codigo_barra) as productos_distintos
                 FROM pedidos_contenido pc 
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 LEFT JOIN articulo a ON pc.codigo_barra = a.CODIGO_BARRA
                 LEFT JOIN clasif c ON c.DAT_CLASIF = a.COD_DPTO AND c.COD_CLASIF = 1
                 ${filtro.whereClause}
                 GROUP BY c.NOM_CLASIF
                 ORDER BY total_vendido DESC 
                 LIMIT 10`,
                filtro.params,
                'STATS_CATEGORIAS_TOP'
            ),
            
            // 5. Ventas por franja horaria
            executeQuery(
                `SELECT 
                    HOUR(p.fecha) as hora,
                    COUNT(p.id_pedido) as pedidos,
                    SUM(p.monto_total) as ingresos,
                    AVG(p.monto_total) as ticket_promedio_hora
                 FROM pedidos p 
                 ${filtro.whereClause}
                 GROUP BY HOUR(p.fecha)
                 ORDER BY pedidos DESC`,
                filtro.params,
                'STATS_HORAS'
            ),
            
            // 6. Ventas por día de la semana
            executeQuery(
                `SELECT 
                    DAYOFWEEK(p.fecha) as dia_semana,
                    CASE DAYOFWEEK(p.fecha)
                        WHEN 1 THEN 'Domingo'
                        WHEN 2 THEN 'Lunes'
                        WHEN 3 THEN 'Martes'
                        WHEN 4 THEN 'Miércoles'
                        WHEN 5 THEN 'Jueves'
                        WHEN 6 THEN 'Viernes'
                        WHEN 7 THEN 'Sábado'
                    END as nombre_dia,
                    COUNT(p.id_pedido) as pedidos,
                    SUM(p.monto_total) as ingresos,
                    AVG(p.monto_total) as ticket_promedio_dia
                 FROM pedidos p 
                 ${filtro.whereClause}
                 GROUP BY DAYOFWEEK(p.fecha), nombre_dia
                 ORDER BY pedidos DESC`,
                filtro.params,
                'STATS_DIAS_SEMANA'
            ),
            
            // 7. Tendencia mensual
            executeQuery(
                `SELECT 
                    DATE_FORMAT(p.fecha, '%Y-%m') as mes,
                    COUNT(p.id_pedido) as pedidos,
                    SUM(p.monto_total) as ingresos,
                    SUM(p.cantidad_productos) as productos_vendidos,
                    AVG(p.monto_total) as ticket_promedio_mes
                 FROM pedidos p 
                 ${filtro.whereClause}
                 GROUP BY mes
                 ORDER BY mes ASC`,
                filtro.params,
                'STATS_TENDENCIA_MENSUAL'
            ),
            
            // 8. Productos con stock bajo
            executeQuery(
                `SELECT 
                    COALESCE(a.art_desc_vta, a.NOMBRE) as nombre_producto,
                    a.CODIGO_BARRA as codigo_barra,
                    a.STOCK as stock_actual,
                    a.STOCK_MIN as stock_minimo,
                    COALESCE(v.vendido_periodo, 0) as vendido_en_periodo
                 FROM articulo a
                 LEFT JOIN (
                     SELECT 
                         pc.codigo_barra,
                         SUM(pc.cantidad) as vendido_periodo
                     FROM pedidos_contenido pc
                     JOIN pedidos p ON pc.id_pedido = p.id_pedido
                     ${filtro.whereClause}
                     GROUP BY pc.codigo_barra
                 ) v ON a.CODIGO_BARRA = v.codigo_barra
                 WHERE a.HABILITADO = 'S' 
                 AND (a.STOCK <= a.STOCK_MIN OR a.STOCK <= 10)
                 AND a.STOCK >= 0
                 ORDER BY a.STOCK ASC
                 LIMIT 15`,
                filtro.params,
                'STATS_STOCK_BAJO'
            ),
            
            // 9. Top clientes
            executeQuery(
                `SELECT 
                    p.cliente,
                    p.email_cliente,
                    COUNT(p.id_pedido) as total_pedidos,
                    SUM(p.monto_total) as total_gastado,
                    AVG(p.monto_total) as ticket_promedio_cliente,
                    MAX(p.fecha) as ultima_compra
                 FROM pedidos p 
                 ${filtro.whereClause}
                 GROUP BY p.cliente, p.email_cliente
                 ORDER BY total_gastado DESC 
                 LIMIT 10`,
                filtro.params,
                'STATS_CLIENTES_TOP'
            )
        ]);

        const [productosEspeciales] = await Promise.all([
            obtenerDatosProductosEspeciales(filtro) // Nueva función helper
        ]);

        // Extraer datos base para métricas adicionales
        const datosBase = {
            ingresos_totales: resumenResult[0]?.ingresos_totales || 0,
            ganancias_totales: gananciasResult[0]?.ganancias_totales || 0,
            pedidos_totales: resumenResult[0]?.pedidos_totales || 0,
            productos_vendidos: resumenResult[0]?.productos_vendidos || 0
        };

        // Calcular métricas adicionales
        const metricasAdicionales = calcularMetricasAdicionales(datosBase);

        // Construir respuesta completa
        const estadisticas = {
            resumen: {
                ...datosBase,
                ...metricasAdicionales
            },
            rankings: {
                productos_mas_vendidos: productosMasVendidos || [],
                categorias_mas_vendidas: categoriasMasVendidas || [],
                clientes_top: clientesTop || []
            },
            temporal: {
                ventas_por_hora: ventasPorHora || [],
                ventas_por_dia_semana: ventasPorDiaSemana || [],
                tendencia_mensual: tendenciaMensual || []
            },
            inventario: {
                productos_stock_bajo: productosStockBajo || []
            },
            productos_especiales: productosEspeciales,
            periodo: {
                fecha_inicio: rangoFechas.fechaInicio,
                fecha_fin: rangoFechas.fechaFin,
                dias_analizados: rangoFechas.diasAnalizados
            },
            meta: {
                timestamp: new Date().toISOString(),
                tiempo_consulta_ms: Date.now() - startTime
            }
        };

        const duration = Date.now() - startTime;
        logEstadisticas(`✅ Estadísticas completas obtenidas exitosamente (${duration}ms)`, 'success');
        
        res.json(estadisticas);
    } catch (error) {
        logEstadisticas(`❌ Error obteniendo estadísticas completas: ${error.message}`, 'error');
        res.status(500).json({ 
            error: 'Error al obtener estadísticas',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerMetricasRapidas = asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    logEstadisticas('Obteniendo métricas rápidas', 'info');

    try {
        // Solo las métricas más importantes para dashboard en tiempo real
        const [
            resumenHoy,
            resumenMes,
            pedidosPendientes,
            productosPopulares
        ] = await Promise.all([
            // Resumen del día actual
            executeQuery(
                `SELECT 
                    COALESCE(SUM(monto_total), 0) as ingresos_hoy,
                    COUNT(*) as pedidos_hoy
                 FROM pedidos 
                 WHERE DATE(fecha) = CURDATE() AND estado = 'entregado'`,
                [],
                'METRICS_HOY'
            ),
            
            // Resumen del mes actual
            executeQuery(
                `SELECT 
                    COALESCE(SUM(monto_total), 0) as ingresos_mes,
                    COUNT(*) as pedidos_mes
                 FROM pedidos 
                 WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE()) 
                 AND estado = 'entregado'`,
                [],
                'METRICS_MES'
            ),
            
            // Pedidos pendientes
            executeQuery(
                `SELECT COUNT(*) as pedidos_pendientes
                 FROM pedidos 
                 WHERE estado IN ('pendiente', 'confirmado')`,
                [],
                'METRICS_PENDIENTES'
            ),
            
            // Top 5 productos más vendidos del mes
            executeQuery(
                `SELECT 
                    pc.nombre_producto,
                    SUM(pc.cantidad) as cantidad_vendida
                 FROM pedidos_contenido pc
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 WHERE YEAR(p.fecha) = YEAR(CURDATE()) AND MONTH(p.fecha) = MONTH(CURDATE())
                 AND p.estado = 'entregado'
                 GROUP BY pc.nombre_producto
                 ORDER BY cantidad_vendida DESC
                 LIMIT 5`,
                [],
                'METRICS_PRODUCTOS_TOP'
            )
        ]);

        const metricas = {
            hoy: {
                ingresos: resumenHoy[0]?.ingresos_hoy || 0,
                pedidos: resumenHoy[0]?.pedidos_hoy || 0
            },
            mes_actual: {
                ingresos: resumenMes[0]?.ingresos_mes || 0,
                pedidos: resumenMes[0]?.pedidos_mes || 0
            },
            pendientes: pedidosPendientes[0]?.pedidos_pendientes || 0,
            productos_populares: productosPopulares || [],
            timestamp: new Date().toISOString()
        };

        const duration = Date.now() - startTime;
        logEstadisticas(`✅ Métricas rápidas obtenidas (${duration}ms)`, 'success');
        
        res.json(metricas);
    } catch (error) {
        logEstadisticas(`❌ Error obteniendo métricas rápidas: ${error.message}`, 'error');
        res.status(500).json({ 
            error: 'Error al obtener métricas rápidas',
            timestamp: new Date().toISOString()
        });
    }
});

const compararPeriodos = asyncHandler(async (req, res) => {
    const { 
        fechaInicio1, fechaFin1, 
        fechaInicio2, fechaFin2 
    } = req.query;
    
    const startTime = Date.now();
    
    logEstadisticas(`Comparando períodos: [${fechaInicio1}-${fechaFin1}] vs [${fechaInicio2}-${fechaFin2}]`, 'info');

    try {
        // Validar ambos períodos
        const periodo1 = validarRangoFechas(fechaInicio1, fechaFin1);
        const periodo2 = validarRangoFechas(fechaInicio2, fechaFin2);
        
        const filtro1 = construirFiltroFechas(periodo1.fechaInicio, periodo1.fechaFin);
        const filtro2 = construirFiltroFechas(periodo2.fechaInicio, periodo2.fechaFin);

        // Obtener métricas para ambos períodos
        const [
            metricasPeriodo1,
            metricasPeriodo2
        ] = await Promise.all([
            executeQuery(
                `SELECT 
                    COALESCE(SUM(p.monto_total), 0) as ingresos,
                    COUNT(p.id_pedido) as pedidos,
                    COALESCE(SUM(p.cantidad_productos), 0) as productos_vendidos,
                    COALESCE(AVG(p.monto_total), 0) as ticket_promedio
                 FROM pedidos p 
                 ${filtro1.whereClause}`,
                filtro1.params,
                'COMPARE_PERIODO1'
            ),
            executeQuery(
                `SELECT 
                    COALESCE(SUM(p.monto_total), 0) as ingresos,
                    COUNT(p.id_pedido) as pedidos,
                    COALESCE(SUM(p.cantidad_productos), 0) as productos_vendidos,
                    COALESCE(AVG(p.monto_total), 0) as ticket_promedio
                 FROM pedidos p 
                 ${filtro2.whereClause}`,
                filtro2.params,
                'COMPARE_PERIODO2'
            )
        ]);

        const datos1 = metricasPeriodo1[0] || {};
        const datos2 = metricasPeriodo2[0] || {};

        // Calcular porcentajes de cambio
        const calcularCambio = (actual, anterior) => {
            if (anterior === 0) return actual > 0 ? 100 : 0;
            return Math.round(((actual - anterior) / anterior) * 100 * 100) / 100;
        };

        const comparacion = {
            periodo1: {
                ...periodo1,
                metricas: datos1
            },
            periodo2: {
                ...periodo2,
                metricas: datos2
            },
            cambios: {
                ingresos: calcularCambio(datos1.ingresos, datos2.ingresos),
                pedidos: calcularCambio(datos1.pedidos, datos2.pedidos),
                productos_vendidos: calcularCambio(datos1.productos_vendidos, datos2.productos_vendidos),
                ticket_promedio: calcularCambio(datos1.ticket_promedio, datos2.ticket_promedio)
            },
            timestamp: new Date().toISOString()
        };

        const duration = Date.now() - startTime;
        logEstadisticas(`✅ Comparación de períodos completada (${duration}ms)`, 'success');
        
        res.json(comparacion);
    } catch (error) {
        logEstadisticas(`❌ Error comparando períodos: ${error.message}`, 'error');
        res.status(500).json({ 
            error: 'Error al comparar períodos',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerEstadisticasProducto = asyncHandler(async (req, res) => {
    const { codigoBarra } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const startTime = Date.now();
    
    logEstadisticas(`Obteniendo estadísticas del producto: ${codigoBarra}`, 'info');

    if (!codigoBarra) {
        return res.status(400).json({ 
            error: 'Código de barra es requerido',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const rangoFechas = validarRangoFechas(fechaInicio, fechaFin);
        const filtro = construirFiltroFechas(rangoFechas.fechaInicio, rangoFechas.fechaFin);
        
        // Agregar filtro de producto
        const filtroProducto = filtro.whereClause + ` AND pc.codigo_barra = ?`;
        const paramsProducto = [...filtro.params, codigoBarra];

        const [
            infoProducto,
            estadisticasVenta,
            ventasPorMes,
            clientesQueCompraron
        ] = await Promise.all([
            // Información básica del producto
            executeQuery(
                `SELECT 
                    COALESCE(art_desc_vta, NOMBRE) as nombre,
                    CODIGO_BARRA,
                    COSTO,
                    PRECIO,
                    STOCK,
                    COD_DPTO
                 FROM articulo 
                 WHERE CODIGO_BARRA = ?`,
                [codigoBarra],
                'PRODUCTO_INFO'
            ),
            
            // Estadísticas de venta
            executeQuery(
                `SELECT 
                    SUM(pc.cantidad) as total_vendido,
                    SUM(pc.subtotal) as ingresos_totales,
                    COUNT(DISTINCT p.id_pedido) as pedidos_con_producto,
                    AVG(pc.precio) as precio_promedio_venta,
                    MAX(p.fecha) as ultima_venta,
                    MIN(p.fecha) as primera_venta
                 FROM pedidos_contenido pc
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 ${filtroProducto}`,
                paramsProducto,
                'PRODUCTO_STATS'
            ),
            
            // Ventas por mes
            executeQuery(
                `SELECT 
                    DATE_FORMAT(p.fecha, '%Y-%m') as mes,
                    SUM(pc.cantidad) as cantidad_vendida,
                    SUM(pc.subtotal) as ingresos_mes
                 FROM pedidos_contenido pc
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 ${filtroProducto}
                 GROUP BY mes
                 ORDER BY mes ASC`,
                paramsProducto,
                'PRODUCTO_VENTAS_MES'
            ),
            
            // Clientes que compraron este producto
            executeQuery(
                `SELECT 
                    p.cliente,
                    COUNT(*) as veces_comprado,
                    SUM(pc.cantidad) as total_cantidad,
                    MAX(p.fecha) as ultima_compra
                 FROM pedidos_contenido pc
                 JOIN pedidos p ON pc.id_pedido = p.id_pedido
                 ${filtroProducto}
                 GROUP BY p.cliente
                 ORDER BY total_cantidad DESC
                 LIMIT 10`,
                paramsProducto,
                'PRODUCTO_CLIENTES'
            )
        ]);

        if (infoProducto.length === 0) {
            return res.status(404).json({ 
                error: 'Producto no encontrado',
                timestamp: new Date().toISOString()
            });
        }

        const estadisticasProducto = {
            producto: infoProducto[0],
            estadisticas: estadisticasVenta[0] || {},
            ventas_por_mes: ventasPorMes || [],
            clientes_top: clientesQueCompraron || [],
            periodo: rangoFechas,
            timestamp: new Date().toISOString()
        };

        const duration = Date.now() - startTime;
        logEstadisticas(`✅ Estadísticas del producto ${codigoBarra} obtenidas (${duration}ms)`, 'success');
        
        res.json(estadisticasProducto);
    } catch (error) {
        logEstadisticas(`❌ Error obteniendo estadísticas del producto ${codigoBarra}: ${error.message}`, 'error');
        res.status(500).json({ 
            error: 'Error al obtener estadísticas del producto',
            timestamp: new Date().toISOString()
        });
    }
});

const obtenerEstadisticasProductosEspeciales = asyncHandler(async (req, res) => {
    const { fechaInicio, fechaFin } = req.query;
    const startTime = Date.now();
    
    logEstadisticas('Obteniendo estadísticas de productos especiales', 'info');

    try {
        const rangoFechas = validarRangoFechas(fechaInicio, fechaFin);
        const filtro = construirFiltroFechas(rangoFechas.fechaInicio, rangoFechas.fechaFin);
        
        // Obtener datos de cada categoría especial
        const [
            ofertas,
            destacados,
            liquidacion,
            ventasTotales
        ] = await Promise.all([
            // Ofertas
            executeQuery(
                `SELECT 
                    at.CODIGO_BARRA as codigo_barra,
                    at.art_desc_vta as nombre,
                    COALESCE(a.STOCK, 0) as stock,
                    COALESCE(SUM(pc.cantidad), 0) as total_vendido,
                    COALESCE(SUM(pc.subtotal), 0) as ingresos
                 FROM articulo_temp at
                 LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                 LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                 LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                 WHERE at.cat = '1' AND at.activo = 1
                 GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                 ORDER BY total_vendido DESC`,
                filtro.params,
                'STATS_OFERTAS'
            ),
            
            // Destacados
            executeQuery(
                `SELECT 
                    at.CODIGO_BARRA as codigo_barra,
                    at.art_desc_vta as nombre,
                    COALESCE(a.STOCK, 0) as stock,
                    COALESCE(SUM(pc.cantidad), 0) as total_vendido,
                    COALESCE(SUM(pc.subtotal), 0) as ingresos
                 FROM articulo_temp at
                 LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                 LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                 LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                 WHERE at.cat = '2' AND at.activo = 1
                 GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                 ORDER BY total_vendido DESC`,
                filtro.params,
                'STATS_DESTACADOS'
            ),
            
            // Liquidación
            executeQuery(
                `SELECT 
                    at.CODIGO_BARRA as codigo_barra,
                    at.art_desc_vta as nombre,
                    COALESCE(a.STOCK, 0) as stock,
                    COALESCE(SUM(pc.cantidad), 0) as total_vendido,
                    COALESCE(SUM(pc.subtotal), 0) as ingresos
                 FROM articulo_temp at
                 LEFT JOIN articulo a ON at.CODIGO_BARRA = a.CODIGO_BARRA
                 LEFT JOIN pedidos_contenido pc ON at.CODIGO_BARRA = pc.codigo_barra
                 LEFT JOIN pedidos p ON pc.id_pedido = p.id_pedido AND ${filtro.whereClause.replace('WHERE ', '')}
                 WHERE at.cat = '3' AND at.activo = 1
                 GROUP BY at.CODIGO_BARRA, at.art_desc_vta, a.STOCK
                 ORDER BY total_vendido DESC`,
                filtro.params,
                'STATS_LIQUIDACION'
            ),
            
            // Ventas totales para calcular porcentaje
            executeQuery(
                `SELECT COALESCE(SUM(cantidad_productos), 0) as total_vendido
                 FROM pedidos p
                 ${filtro.whereClause}`,
                filtro.params,
                'STATS_VENTAS_TOTALES'
            )
        ]);

        // Calcular resúmenes
        const calcularResumen = (productos) => {
            const totalVendido = productos.reduce((sum, p) => sum + (parseInt(p.total_vendido) || 0), 0);
            const ingresos = productos.reduce((sum, p) => sum + (parseFloat(p.ingresos) || 0), 0);
            
            return {
                cantidad_productos: productos.length,
                total_vendido: totalVendido,
                ingresos: Math.round(ingresos * 100) / 100,
                ticket_promedio: totalVendido > 0 ? Math.round((ingresos / totalVendido) * 100) / 100 : 0,
                productos: productos
            };
        };

        const resumenOfertas = calcularResumen(ofertas);
        const resumenDestacados = calcularResumen(destacados);
        const resumenLiquidacion = calcularResumen(liquidacion);

        const totalVendidoEspeciales = resumenOfertas.total_vendido + 
                                       resumenDestacados.total_vendido + 
                                       resumenLiquidacion.total_vendido;
        
        const totalVendidoGeneral = ventasTotales[0]?.total_vendido || 0;
        
        const porcentajeDelTotal = totalVendidoGeneral > 0 
            ? ((totalVendidoEspeciales / totalVendidoGeneral) * 100).toFixed(1)
            : 0;

        const estadisticas = {
            productos_especiales: {
                resumen: {
                    total_productos: ofertas.length + destacados.length + liquidacion.length,
                    total_vendido: totalVendidoEspeciales,
                    ingresos_totales: Math.round((resumenOfertas.ingresos + resumenDestacados.ingresos + resumenLiquidacion.ingresos) * 100) / 100,
                    porcentaje_del_total: parseFloat(porcentajeDelTotal)
                },
                ofertas: resumenOfertas,
                destacados: resumenDestacados,
                liquidacion: resumenLiquidacion
            },
            periodo: rangoFechas,
            timestamp: new Date().toISOString()
        };

        const duration = Date.now() - startTime;
        logEstadisticas(`✅ Estadísticas de productos especiales obtenidas (${duration}ms)`, 'success');
        
        res.json(estadisticas);
    } catch (error) {
        logEstadisticas(`❌ Error obteniendo estadísticas de productos especiales: ${error.message}`, 'error');
        res.status(500).json({ 
            error: 'Error al obtener estadísticas de productos especiales',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: new Date().toISOString()
        });
    }
});

// ==============================================
// EXPORTAR CONTROLADORES
// ==============================================

module.exports = {
    obtenerEstadisticasCompletas,
    obtenerMetricasRapidas,
    compararPeriodos,
    obtenerEstadisticasProducto,
    obtenerEstadisticasProductosEspeciales
};