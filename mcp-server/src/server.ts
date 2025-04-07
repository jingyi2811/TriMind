import express, { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import winston from 'winston';

dotenv.config();

// --- Logger Setup ---
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }), // Log stack traces
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
        // Add file transport if needed
        // new winston.transports.File({ filename: 'mcp-server.log' })
    ],
});

// --- Environment Variables & Constants ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
const ANTHROPIC_API_VERSION = '2023-06-01';
const PORT = process.env.MCP_PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'; // Be more specific in production!

if (!ANTHROPIC_API_KEY) {
    logger.error('FATAL: Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable.');
    process.exit(1);
}

// --- Express App Setup ---
const app = express();

// Middleware
app.use(cors({
    origin: CORS_ORIGIN, // Configure allowed origins
    methods: ['POST', 'GET', 'OPTIONS'], // Allow necessary methods
}));
app.use(express.json()); // Parse JSON request bodies

// --- Health Check Endpoint ---
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Claude MCP Endpoint ---
app.post('/api/mcp/claude/chat', async (req: Request, res: Response) => {
    const { model, messages, max_tokens, temperature, tools, tool_choice } = req.body;

    // Basic validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        logger.warn('Received invalid messages payload', { body: req.body });
        return res.status(400).json({ error: 'Invalid or empty "messages" array in payload' });
    }

    const payload = {
        model: model || 'claude-3-sonnet-20240229', // Default model
        messages,
        max_tokens: max_tokens || 4000,             // Default max tokens
        temperature: temperature === undefined ? 0.7 : temperature, // Default temp, allowing 0
        tools: tools || [],
        tool_choice: tool_choice || 'auto',         // Default tool choice
    };

    logger.info(`Forwarding request to Anthropic API [${payload.model}]`, { traceId: req.headers['x-request-id'] }); // Example: Use request ID if available

    try {
        const startTime = Date.now();
        const response = await axios.post(
            `${ANTHROPIC_BASE_URL}/messages`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY, // Use the secure key from env
                    'anthropic-version': ANTHROPIC_API_VERSION,
                },
                timeout: 60000, // Add a timeout (e.g., 60 seconds)
            }
        );
        const duration = Date.now() - startTime;

        logger.info(`Received successful response from Anthropic API [${payload.model}]`, {
             status: response.status,
             durationMs: duration,
             traceId: req.headers['x-request-id']
            });

        // Forward the entire data part of the response
        res.status(response.status).json(response.data);

    } catch (error) {
        let duration;
        let startTime;
        const axiosError = error as AxiosError;

        if (axiosError.response) {
            duration = Date.now() - (startTime || Date.now()); // Calculate duration even on error
        }

        logger.error('Error calling Anthropic API', {
            message: axiosError.message,
            status: axiosError.response?.status,
            responseData: axiosError.response?.data,
            requestPayload: payload, // Log the payload for debugging (be careful with sensitive data)
            durationMs: duration,
            traceId: req.headers['x-request-id']
        });

        // Forward error details if possible
        if (axiosError.response) {
            res.status(axiosError.response.status).json({
                error: 'Failed to process request with Anthropic API',
                details: axiosError.response.data,
            });
        } else {
            // Handle network errors or other issues without a response
            res.status(500).json({
                error: 'Internal server error communicating with Anthropic API',
                details: axiosError.message,
            });
        }
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    logger.info(`🚀 Custom MCP server running on http://localhost:${PORT}`);
    logger.info(`🔗 Forwarding requests to: ${ANTHROPIC_BASE_URL}`);
    logger.info(`🔑 Using API key: ${ANTHROPIC_API_KEY.substring(0, 3)}...${ANTHROPIC_API_KEY.substring(ANTHROPIC_API_KEY.length - 4)}`); // Log partial key safely
    logger.info(`🌐 CORS Origin allowed: ${CORS_ORIGIN}`);
});

// Graceful shutdown handler (optional but recommended)
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    // Add cleanup logic here if needed
    process.exit(0);
});
process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    // Add cleanup logic here if needed
    process.exit(0);
});
