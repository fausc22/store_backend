-- =============================================================================
-- FASE 6: Tabla de idempotencia para pedidos (evitar duplicados por doble clic/reintentos)
-- =============================================================================
-- Ejecutar después de migrate_fase2_pedidos_cupones.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS pedidos_idempotency (
  id INT NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(64) NOT NULL COMMENT 'UUID enviado por el cliente',
  pedido_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pedidos_idempotency_key (idempotency_key),
  KEY idx_pedidos_idempotency_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
