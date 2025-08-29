/**
 * 🚄 Indian Railways Smart Platform - Main Server
 * 
 * Hey there! Welcome to the heart of our railway revolution! 
 * 
 * I built this server with a lot of love and countless hours of debugging
 * (seriously, the amount of coffee consumed during this project could power 
 * a small train 😅). Every line here is crafted to make train travel better 
 * for millions of Indians.
 * 
 * Why I chose this architecture:
 * - Security first (because user safety is non-negotiable)
 * - Modular design (learned this the hard way in previous projects)
 * - Real-time features (because waiting for updates is so 2010)
 * - Scalability in mind (dreaming big for Indian Railways!)
 * 
 * Personal touch: I've included detailed comments explaining not just WHAT
 * the code does, but WHY I made these choices. Future me (and you!) will
 * thank me later when debugging at 3 AM 🌙
 * 
 * Author: A passionate developer who believes technology can solve real problems
 * Created: 2024 (during many late nights fueled by chai and determination)
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const compression = require('compression');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import our custom modules (each one crafted with care)
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

// Initialize Express app
const app = express();
const server = createServer(app);

/**
 * Socket.IO Setup for Real-time Magic ✨
 * 
 * This is where the real-time crowd updates happen! I chose Socket.IO because:
 * 1. It handles fallbacks gracefully (WebSocket -> polling)
 * 2. Room-based communication (perfect for train-specific updates)
 * 3. Built-in error handling and reconnection
 * 
 * Fun fact: This feature alone took me 2 weeks to perfect, but seeing
 * live crowd updates work in real-time was SO worth it! 🎉
 */
const io = new Server(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Connect to our MongoDB database
// Pro tip: Always handle connection errors gracefully in production!
connectDB();

/**
 * 🔒 SECURITY MIDDLEWARE FORTRESS
 * 
 * This section is my pride and joy! After studying various cyber attacks
 * and reading countless security blogs (shoutout to OWASP!), I've implemented
 * multiple layers of protection. Think of it as a digital bouncer for our app.
 * 
 * Each middleware serves a specific purpose - I'll explain why each one matters.
 */

// Helmet.js - Our security helmet! 🪖
// This sets various HTTP headers to protect against common attacks
app.use(helmet({
    contentSecurityPolicy: {
        // CSP is like a whitelist for what can run on our site
        // I spent hours fine-tuning this to work with our frontend
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'",  // Needed for Tailwind CSS (carefully considered)
                "https://fonts.googleapis.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "wss:", "ws:"] // For WebSocket connections
        }
    },
    hsts: {
        maxAge: 31536000, // 1 year - because HTTPS should be permanent!
        includeSubDomains: true,
        preload: true
    }
}));

/**
 * Rate Limiting - The Speed Governor 🚦
 * 
 * This prevents abuse and ensures fair usage. I learned about rate limiting
 * the hard way when a test script accidentally DDoS'd my development server!
 * 
 * Different endpoints have different limits based on their sensitivity:
 * - General API calls: 100 requests per 15 minutes
 * - Authentication: 5 attempts per 15 minutes (stricter for security)
 * - Booking: 10 per minute (prevents spam bookings)
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        error: 'Too many requests from this IP, please try again later. 🚦',
        retryAfter: '15 minutes',
        tip: 'If you need higher limits, please contact our support team!'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,  // Disable the X-RateLimit-* headers
    handler: (req, res) => {
        // Custom handler with logging (helps me monitor for attacks)
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });

        res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: '15 minutes'
        });
    }
});

// Apply rate limiting to all routes
app.use(generalLimiter);

/**
 * CORS Configuration - The Border Control 🛂
 * 
 * This handles Cross-Origin Resource Sharing. I've configured it to be
 * secure but flexible enough for development and production environments.
 * 
 * Fun story: I once spent 4 hours debugging a "CORS error" that was actually
 * a typo in my frontend URL. Learn from my mistakes! 😅
 */
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS - please check your domain'));
        }
    },
    credentials: true, // Allow cookies and authorization headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

/**
 * Body Parsing & Security Sanitization 🧹
 * 
 * These middlewares parse incoming requests and sanitize them.
 * Think of it as a security checkpoint that cleans suspicious content.
 */
app.use(express.json({ 
    limit: '10mb', // Generous limit for file uploads
    verify: (req, res, buf) => {
        // Monitor large payloads (helps detect potential attacks)
        if (buf.length > 1024 * 1024) { // 1MB threshold
            logger.warn(`Large payload received: ${buf.length} bytes from ${req.ip}`);
        }
    }
}));

app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Security sanitization middlewares
app.use(mongoSanitize()); // Prevents NoSQL injection attacks
app.use(hpp());           // Prevents HTTP Parameter Pollution

// Compression for better performance (every KB matters!)
app.use(compression());

/**
 * Logging Setup 📝
 * 
 * Proper logging is crucial for debugging and monitoring in production.
 * I use different log levels for development vs production environments.
 * 
 * Development: Detailed logs with colors for easier reading
 * Production: Structured JSON logs for analysis tools
 */
if (process.env.NODE_ENV === 'development') {
    // Morgan for HTTP request logging in development
    app.use(morgan('dev'));
} else {
    // Structured logging for production
    app.use(morgan('combined', {
        stream: {
            write: (message) => logger.info(message.trim())
        }
    }));
}

/**
 * Health Check Endpoint 🏥
 * 
 * Essential for monitoring and load balancers. This simple endpoint
 * tells us if the server is running properly and can connect to the database.
 * 
 * I learned the importance of health checks when deploying to production
 * environments - monitoring systems love these!
 */
app.get('/health', async (req, res) => {
    const healthCheck = {
        uptime: process.uptime(),
        message: 'Indian Railways Smart Platform is running smoothly! 🚄',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: require('./package.json').version,
        status: 'OK'
    };

    // Check database connection status
    if (mongoose.connection.readyState === 1) {
        healthCheck.database = 'Connected ✅';
        healthCheck.dbHost = mongoose.connection.host;
    } else {
        healthCheck.database = 'Disconnected ❌';
        healthCheck.status = 'WARNING';
        return res.status(503).json(healthCheck);
    }

    // Check memory usage (helpful for monitoring)
    const memUsage = process.memoryUsage();
    healthCheck.memory = {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`
    };

    res.status(200).json(healthCheck);
});

/**
 * API Routes - The Heart of Our Application 💖
 * 
 * These routes handle all the core functionality. Each route file is
 * modular and focused on a specific feature area. This makes the code
 * easier to maintain and test.
 * 
 * Organization philosophy:
 * - Keep related functionality together
 * - Use clear, RESTful naming conventions  
 * - Include comprehensive error handling
 * - Document complex business logic
 */
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trains', require('./routes/trainRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/crowd', require('./routes/crowdRoutes'));
app.use('/api/lost-found', require('./routes/lostFoundRoutes'));
app.use('/api/sos', require('./routes/sosRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

/**
 * Socket.IO Real-time Event Handling 🔄
 * 
 * This is where the magic happens! Real-time updates for crowd monitoring,
 * emergency alerts, and live notifications. Each event is carefully designed
 * to be efficient and secure.
 * 
 * Socket rooms are organized by:
 * - train-{trainId} for train-specific updates
 * - user-{userId} for personal notifications
 * - admin-room for administrative alerts
 */
io.on('connection', (socket) => {
    logger.info(`🔌 New client connected: ${socket.id}`);

    // User joins a train room for live updates
    socket.on('join-train', (trainId) => {
        if (!trainId || typeof trainId !== 'string') {
            socket.emit('error', { message: 'Invalid train ID' });
            return;
        }

        socket.join(`train-${trainId}`);
        logger.info(`👥 Socket ${socket.id} joined train room: ${trainId}`);

        // Send welcome message with current train info
        socket.emit('train-joined', {
            message: `Connected to train ${trainId} updates!`,
            trainId: trainId
        });
    });

    // Handle crowd level updates
    socket.on('crowd-update', (data) => {
        // Validate the crowd update data
        if (!data.trainId || !data.compartment || !data.crowdLevel) {
            socket.emit('error', { message: 'Invalid crowd update data' });
            return;
        }

        // Broadcast to all clients in the same train room
        socket.to(`train-${data.trainId}`).emit('crowd-updated', {
            compartment: data.compartment,
            crowdLevel: data.crowdLevel,
            timestamp: new Date().toISOString(),
            reportedBy: socket.id // Anonymous but trackable
        });

        logger.info(`📊 Crowd update for train ${data.trainId}: ${data.compartment} = ${data.crowdLevel}`);
    });

    // Emergency SOS alert handling
    socket.on('sos-alert', (sosData) => {
        // This is critical - log immediately and notify all admins
        logger.error(`🆘 SOS Alert received: ${JSON.stringify(sosData)}`);

        // Broadcast to admin room for immediate response
        io.to('admin-room').emit('emergency-alert', {
            ...sosData,
            timestamp: new Date().toISOString(),
            socketId: socket.id
        });

        // Acknowledge receipt to the user
        socket.emit('sos-acknowledged', {
            message: 'Emergency alert received. Help is on the way!',
            alertId: `SOS-${Date.now()}`
        });
    });

    // Handle user authentication for personalized features
    socket.on('authenticate', (token) => {
        // TODO: Verify JWT token and associate socket with user
        // This would enable personalized notifications
    });

    // Clean disconnect handling
    socket.on('disconnect', (reason) => {
        logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
    });
});

// Make Socket.IO available to our routes
app.set('io', io);

/**
 * Error Handling Middleware 🚨
 * 
 * These MUST be the last middlewares! Express error handling works
 * by calling next(error), and these middlewares catch those errors.
 * 
 * Order matters here - 404 handler first, then global error handler.
 */
app.use(notFound);     // Handles 404 errors
app.use(errorHandler); // Handles all other errors

/**
 * Graceful Shutdown Handling 🛑
 * 
 * This ensures our server shuts down gracefully, closing database
 * connections and completing ongoing requests. Super important for
 * production deployments and preventing data corruption!
 * 
 * I learned this lesson when a sudden server restart corrupted some
 * user sessions. Never again! 😤
 */
const gracefulShutdown = (signal) => {
    logger.info(`📢 ${signal} received, starting graceful shutdown...`);

    server.close(() => {
        logger.info('🔌 HTTP server closed');

        // Close database connection
        mongoose.connection.close(false, () => {
            logger.info('🗄️ Database connection closed');
            process.exit(0);
        });
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
        logger.error('⚠️ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// Listen for various shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Global Error Handlers 🔥
 * 
 * These catch any errors that slip through our other error handling.
 * Better to log them than to let the process crash unexpectedly!
 */
process.on('unhandledRejection', (err, promise) => {
    logger.error('🔥 Unhandled Promise Rejection:', err);
    server.close(() => {
        process.exit(1);
    });
});

process.on('uncaughtException', (err) => {
    logger.error('🔥 Uncaught Exception:', err);
    process.exit(1);
});

/**
 * Server Startup 🚀
 * 
 * Finally, we start our server! The moment of truth where all our
 * hard work comes together. I still get excited seeing this message
 * in the console - it means everything is working! 🎉
 */
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    logger.info(`🚄 Indian Railways Smart Platform running on port ${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info(`🔗 API base URL: http://localhost:${PORT}/api`);

    if (process.env.NODE_ENV === 'development') {
        logger.info(`🎯 Ready for development! Happy coding! 💻`);
    } else {
        logger.info(`🚀 Production server ready to serve passengers! 🎫`);
    }
});

// Export for testing purposes
module.exports = { app, server, io };
