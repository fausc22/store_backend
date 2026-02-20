-- =============================================================================
-- FASE 2: Migración pedidos a InnoDB + columnas de descuentos/cupones + tablas
-- Reglas de promoción y cupones (promo_rules, coupons, coupon_redemptions).
-- =============================================================================
-- IMPORTANTE: Ejecutar en staging primero. Hacer backup de pedidos y pedidos_contenido
-- antes de correr en producción:
--   mysqldump -u USUARIO -p NOMBRE_BD pedidos pedidos_contenido > backup_pedidos_YYYYMMDD.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cambio de motor a InnoDB (transacciones y consistencia para cupones)
-- -----------------------------------------------------------------------------
ALTER TABLE pedidos ENGINE=InnoDB;
ALTER TABLE pedidos_contenido ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2. Nuevas columnas en pedidos (descuentos, cupón, snapshot de pricing)
-- -----------------------------------------------------------------------------
ALTER TABLE pedidos
  ADD COLUMN subtotal_productos DECIMAL(10,2) DEFAULT 0.00 AFTER costo_envio,
  ADD COLUMN monto_descuento DECIMAL(10,2) DEFAULT 0.00 AFTER subtotal_productos,
  ADD COLUMN cupon_codigo VARCHAR(64) DEFAULT NULL AFTER monto_descuento,
  ADD COLUMN cupon_id INT NULL AFTER cupon_codigo,
  ADD COLUMN regla_aplicada_id INT NULL AFTER cupon_id,
  ADD COLUMN pricing_snapshot JSON NULL AFTER regla_aplicada_id;

-- Si tu MySQL/MariaDB no soporta JSON (ej. MySQL < 5.7), usa en su lugar:
-- ADD COLUMN pricing_snapshot TEXT NULL AFTER regla_aplicada_id;

-- -----------------------------------------------------------------------------
-- 3. Tabla promo_rules (envío gratis por monto, descuento % por monto)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_rules (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  tipo ENUM('envio_gratis_monto', 'descuento_pct_monto') NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0 COMMENT 'Prioridad: menor = mayor prioridad',
  monto_minimo DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Umbral de subtotal para aplicar',
  valor DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Para envío gratis suele ser 0 o NULL',
  porcentaje_descuento DECIMAL(5,2) NULL DEFAULT NULL COMMENT 'Solo para tipo descuento_pct_monto (0-100)',
  fecha_inicio DATETIME NULL DEFAULT NULL,
  fecha_fin DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_promo_rules_activo (activo),
  KEY idx_promo_rules_tipo (tipo),
  KEY idx_promo_rules_vigencia (fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. Tabla coupons (código único, porcentaje o monto fijo, usos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id INT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(64) NOT NULL,
  tipo ENUM('porcentaje', 'monto_fijo') NOT NULL,
  valor DECIMAL(10,2) NOT NULL COMMENT 'Porcentaje (0-100) o monto en pesos',
  monto_minimo DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Subtotal mínimo para aplicar',
  usos_maximos INT NOT NULL DEFAULT 1 COMMENT '1 = un solo uso',
  usos_actuales INT NOT NULL DEFAULT 0,
  fecha_inicio DATETIME NULL DEFAULT NULL,
  fecha_fin DATETIME NULL DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_coupons_codigo (codigo),
  KEY idx_coupons_activo (activo),
  KEY idx_coupons_activo_codigo (activo, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. Tabla coupon_redemptions (trazabilidad de uso de cupones por pedido)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INT NOT NULL AUTO_INCREMENT,
  cupon_id INT NOT NULL,
  id_pedido INT NOT NULL,
  monto_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_coupon_redemptions_cupon_id (cupon_id),
  KEY idx_coupon_redemptions_pedido_id (id_pedido),
  CONSTRAINT fk_coupon_redemptions_cupon FOREIGN KEY (cupon_id) REFERENCES coupons (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_coupon_redemptions_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos (id_pedido) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. FK opcional: pedidos.cupon_id -> coupons.id (aplicar después de crear coupons)
-- -----------------------------------------------------------------------------
ALTER TABLE pedidos
  ADD CONSTRAINT fk_pedidos_cupon FOREIGN KEY (cupon_id) REFERENCES coupons (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Opcional: FK regla_aplicada_id -> promo_rules.id (si quieres integridad referencial)
-- ALTER TABLE pedidos
--   ADD CONSTRAINT fk_pedidos_regla FOREIGN KEY (regla_aplicada_id) REFERENCES promo_rules (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- ROLLBACK (ejecutar solo si necesitas revertir)
-- =============================================================================
-- 6. Quitar FKs y columnas nuevas de pedidos:
--    ALTER TABLE pedidos DROP FOREIGN KEY fk_pedidos_cupon;
--    ALTER TABLE pedidos
--      DROP COLUMN subtotal_productos,
--      DROP COLUMN monto_descuento,
--      DROP COLUMN cupon_codigo,
--      DROP COLUMN cupon_id,
--      DROP COLUMN regla_aplicada_id,
--      DROP COLUMN pricing_snapshot;
-- 5. Eliminar tablas nuevas (en orden por FKs):
--    DROP TABLE IF EXISTS coupon_redemptions;
--    DROP TABLE IF EXISTS coupons;
--    DROP TABLE IF EXISTS promo_rules;
-- 4. Volver a MyISAM (solo si es estrictamente necesario):
--    ALTER TABLE pedidos ENGINE=MyISAM;
--    ALTER TABLE pedidos_contenido ENGINE=MyISAM;
-- Restaurar datos desde backup si hiciste dump:
--    mysql -u USUARIO -p NOMBRE_BD < backup_pedidos_YYYYMMDD.sql
-- =============================================================================
