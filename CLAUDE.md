# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js e-commerce backend for "PuntoSur" store built with Express.js and MySQL. The application serves as a REST API backend for an online store with comprehensive logging, connection pooling, rate limiting, and error handling.

## Core Architecture

- **Entry Point**: `index.js` - Main server file with comprehensive logging, security middleware, and server configuration
- **Database Layer**: `controllers/dbPS.js` - MySQL connection pool management with monitoring and graceful shutdown
- **Route Structure**: 
  - `routes/storeRoutes.js` - Public store endpoints (products, cart, orders)
  - `routes/adminRoutes.js` - Admin management endpoints
  - `routes/estadisticasRoutes.js` - Statistics and analytics endpoints
- **Controllers**: Business logic separated by domain (store, admin, images, statistics)
- **Static Assets**: Multiple static routes for product images and showcase content

## Development Commands

```bash
# Development with auto-reload
npm run dev

# Production start
npm start

# PM2 process management (production)
npm run start:pm2    # Start with PM2
npm run stop:pm2     # Stop PM2 process
npm run restart:pm2  # Restart PM2 process
npm run logs:pm2     # View PM2 logs
npm run monitor:pm2  # PM2 monitoring dashboard
```

## Database Configuration

The application uses MySQL with connection pooling:
- Primary DB config from environment variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT)
- Connection pool with 20 max connections, automatic reconnection
- Database operations should use the `executeQuery` helper from `controllers/dbPS.js` for consistent logging
- All database errors are logged with detailed information

## Environment Configuration

Critical environment variables (from `.env`):
- `STORE_*`: Store information (name, address, delivery costs, etc.)
- `DB_*`: Database connection parameters
- `SESSION_SECRET`: Session encryption key
- `MERCADOPAGO_ACCESS_TOKEN`: Payment gateway token
- `EMAIL_USER/EMAIL_PASS`: Email service credentials
- `NODE_ENV`: Environment mode (development/production)
- `PORT`: Server port (default: 3002)

## Rate Limiting & Security

The application implements tiered rate limiting:
- **General endpoints** (products, categories): 5000 requests/15min
- **Images**: 3000 requests/15min
- **Cart/checkout**: 1000 requests/15min
- **Sensitive operations** (orders, payments): 200 requests/15min

Security headers and CORS are properly configured with specific allowed origins.

## Logging System

Comprehensive logging system with color-coded output:
- All database operations are logged with execution time
- HTTP requests logged with response times (color-coded by performance)
- Rate limiting violations tracked and logged
- Server statistics logged every 30 minutes
- Critical errors logged with unique error IDs

## API Structure

- `/health` - Health check endpoint with system statistics
- `/store/*` - Public store API endpoints
- `/admin/*` - Administrative endpoints
- `/estadisticas/*` - Analytics and statistics endpoints
- Static content served from `/showcase`, `/images/products`, `/images`

## Error Handling

Global error handling with:
- Unique error IDs for tracking
- Stack traces in development mode only
- Structured JSON error responses
- Graceful shutdown handling for SIGINT/SIGTERM

## Key Development Notes

- The application runs on port 3002 by default
- Uses MySQL2 with promise-based connections
- Implements comprehensive request/response logging
- Has built-in rate limiting for different endpoint types
- Includes health monitoring and periodic statistics logging
- PM2 ecosystem configuration available for production deployment
- Static file serving optimized with caching headers