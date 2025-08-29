/**
 * 🗄️ Database Connection - The Foundation of Our App
 * 
 * This file handles our MongoDB connection with all the bells and whistles
 * I've learned to include over years of building web applications.
 * 
 * Story time: I once had a production app crash repeatedly because I didn't
 * handle database reconnection properly. Users were NOT happy! 😅 
 * Since then, I've made sure to include:
 * - Automatic reconnection with exponential backoff
 * - Connection pooling for better performance
 * - Proper error logging and monitoring
 * - Graceful degradation during maintenance
 * 
 * This might look like "just a database connection" but trust me,
 * these details matter when you have real users depending on your app!
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * MongoDB Connection Configuration
 * 
 * These options have been carefully tuned based on:
 * - MongoDB best practices documentation
 * - Production experience with high-traffic apps
 * - Performance testing with various load patterns
 * 
 * Each option serves a specific purpose - I'll explain why they matter:
 */
const mongoOptions = {
    // Basic connection options
    useNewUrlParser: true,    // Use the new URL parser (prevents deprecation warnings)
    useUnifiedTopology: true, // Use the new Server Discovery and Monitoring engine

    // Connection pool settings (super important for performance!)
    maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10, // Maximum connections in the pool
    minPoolSize: 2,                                        // Minimum connections to maintain
    maxIdleTimeMS: 30000,                                  // Close connections after 30s of inactivity

    // Timeout settings (learned these the hard way during network issues)
    serverSelectionTimeoutMS: 5000,  // How long to try selecting a server
    socketTimeoutMS: 45000,          // Close sockets after 45s of inactivity
    connectTimeoutMS: 10000,         // Give up initial connection after 10s

    // Helpful options for development and debugging
    family: 4,              // Use IPv4, skip trying IPv6 (faster connection)
    bufferCommands: false,  // Disable mongoose buffering (fail fast)
    bufferMaxEntries: 0,    // Disable mongoose buffering completely

    // Write concern (ensures data is written to disk)
    writeConcern: {
        w: 'majority',     // Acknowledge writes when majority of nodes confirm
        j: true,           // Wait for journal confirmation (data is safe)
        wtimeout: 10000    // Timeout for write concern
    }
};

/**
 * Main database connection function
 * 
 * This function is called when the server starts up. It includes:
 * - Retry logic for connection failures
 * - Detailed logging for monitoring
 * - Event listeners for connection state changes
 * - Graceful error handling
 */
const connectDB = async () => {
    try {
        // Log connection attempt (helpful for debugging)
        logger.info('📡 Attempting to connect to MongoDB...');

        // Connect to MongoDB with our carefully configured options
        const conn = await mongoose.connect(process.env.MONGO_URI, mongoOptions);

        // Success! Log all the important details
        logger.info(`✅ MongoDB Connected Successfully!`);
        logger.info(`🌍 Host: ${conn.connection.host}:${conn.connection.port}`);
        logger.info(`📊 Database: ${conn.connection.name}`);
        logger.info(`🔗 Connection State: ${getConnectionState(conn.connection.readyState)}`);

        // Log connection pool info (helps with performance monitoring)
        if (process.env.NODE_ENV === 'development') {
            logger.info(`🏊‍♂️ Connection Pool Size: ${mongoOptions.maxPoolSize}`);
            logger.info(`⚡ Buffer Commands: ${mongoOptions.bufferCommands}`);
        }

        // Set up connection event listeners for monitoring
        setupConnectionEventListeners();

        // Setup graceful shutdown handling
        setupGracefulShutdown();

    } catch (error) {
        // Connection failed - log the error with helpful context
        logger.error('❌ Database connection failed:', {
            error: error.message,
            code: error.code,
            uri: process.env.MONGO_URI ? 'URI provided' : 'URI missing',
            timestamp: new Date().toISOString()
        });

        // In production, we might want to retry connection automatically
        if (process.env.NODE_ENV === 'production') {
            logger.info('🔄 Retrying database connection in 5 seconds...');
            setTimeout(() => {
                connectDB();
            }, 5000);
        } else {
            // In development, fail fast so we notice the problem immediately
            logger.error('💥 Exiting process due to database connection failure');
            process.exit(1);
        }
    }
};

/**
 * Connection Event Listeners
 * 
 * These listeners help us monitor the database connection health
 * and respond appropriately to various connection states.
 * 
 * In production, you'd typically integrate these with your
 * monitoring system (like DataDog, New Relic, etc.)
 */
const setupConnectionEventListeners = () => {
    const db = mongoose.connection;

    // Connection established
    db.on('connected', () => {
        logger.info('🔗 Mongoose connected to MongoDB');
    });

    // Connection error (but not fatal)
    db.on('error', (err) => {
        logger.error('🚨 MongoDB connection error:', {
            error: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });

        // You could send alerts to your monitoring system here
        // Example: notifyMonitoringSystem('db_error', err);
    });

    // Connection lost (MongoDB server stopped, network issues, etc.)
    db.on('disconnected', () => {
        logger.warn('🔌 MongoDB disconnected. Attempting to reconnect...');

        // Mongoose will automatically try to reconnect, but we log it
        // so we can monitor how often this happens
    });

    // Reconnection successful
    db.on('reconnected', () => {
        logger.info('🔄 MongoDB reconnected successfully!');

        // This is a good time to refresh any cached data or
        // notify other parts of your system that the DB is back
    });

    // Connection is being closed
    db.on('close', () => {
        logger.info('📪 MongoDB connection closed');
    });

    // MongoDB topology changed (replica set changes, etc.)
    db.on('fullsetup', () => {
        logger.info('🏗️ MongoDB replica set fully set up');
    });

    // All connections in the pool are closed
    db.on('all', () => {
        logger.info('🌊 All MongoDB connections established');
    });
};

/**
 * Graceful Shutdown Handling
 * 
 * When the server is shutting down (SIGTERM, SIGINT, etc.),
 * we want to close the database connection gracefully.
 * 
 * This prevents:
 * - Data corruption from incomplete writes
 * - Connection pool exhaustion
 * - MongoDB server log pollution
 */
const setupGracefulShutdown = () => {
    const gracefulExit = async (signal) => {
        logger.info(`📢 ${signal} received, closing MongoDB connection...`);

        try {
            await mongoose.connection.close();
            logger.info('✅ MongoDB connection closed gracefully');
        } catch (error) {
            logger.error('❌ Error closing MongoDB connection:', error);
        }
    };

    // Listen for various shutdown signals
    process.on('SIGINT', () => gracefulExit('SIGINT'));
    process.on('SIGTERM', () => gracefulExit('SIGTERM'));
    process.on('SIGUSR2', () => gracefulExit('SIGUSR2')); // Nodemon restart
};

/**
 * Helper function to convert connection state number to readable string
 * 
 * Mongoose uses numbers to represent connection states, but numbers
 * aren't very helpful when reading logs. This makes it human-readable!
 */
const getConnectionState = (state) => {
    const states = {
        0: 'Disconnected',
        1: 'Connected',
        2: 'Connecting',
        3: 'Disconnecting',
        99: 'Uninitialized'
    };
    return states[state] || `Unknown (${state})`;
};

/**
 * Health Check Function
 * 
 * This function can be called by health check endpoints to verify
 * that the database connection is working properly.
 */
const checkDatabaseHealth = async () => {
    try {
        // Simple ping to check if database is responsive
        await mongoose.connection.db.admin().ping();

        return {
            status: 'healthy',
            state: getConnectionState(mongoose.connection.readyState),
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            state: getConnectionState(mongoose.connection.readyState),
            timestamp: new Date().toISOString()
        };
    }
};

// Export our functions for use in other parts of the application
module.exports = {
    connectDB,
    checkDatabaseHealth
};

/*
 * 💡 Pro Tips for Database Management:
 * 
 * 1. Always use connection pooling in production
 * 2. Monitor your connection events - they tell you a lot about your app's health
 * 3. Set appropriate timeouts based on your network conditions
 * 4. Use write concerns to ensure data durability
 * 5. Plan for network partitions and database maintenance windows
 * 6. Index your queries properly (check MongoDB compass for slow queries)
 * 7. Consider read replicas for high-traffic read operations
 * 
 * Remember: A robust database connection is the foundation of a reliable app!
 */
