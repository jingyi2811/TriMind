import { Tool } from 'ai';
import { z } from 'zod';
import { createLogger, format, transports } from 'winston';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// Import DeepSeek MCP module for chat and completion APIs
import {
  initializeDeepSeekMCP,
  getDeepSeekTools,
  closeDeepSeekClient,
  DeepSeekMCPClient,
  DeepSeekAPIError
} from './api/mcp/mcp-deepseek';

// Import Qwen MCP module for chat and completion APIs
import {
  initializeQwenMCP,
  getQwenTools,
  closeQwenClient,
  QwenMCPClient,
  QwenAPIError
} from './api/mcp/mcp-qwen';

// Claude MCP module has been removed

// Import the Gemini Thinking tool using the correct relative path
import { geminiThinkingTool } from './api/mcp/mcp-gemini-thinking';

// Create a logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'mcp-server.log' })
  ]
});

// Re-export error types
export { DeepSeekAPIError, QwenAPIError };
// MCP client type
export interface MCPClient {
  deepseek: DeepSeekMCPClient | null; // DeepSeek client
  qwen: QwenMCPClient | null; // Qwen client
  tools: () => Promise<Record<string, Tool>>;
  close: () => Promise<void>;
}
// Initialize MCP client
export async function initializeMCP(): Promise<MCPClient> {
  logger.info('Initializing MCP clients...');

  // Get environment variables
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  const qwenApiKey = process.env.QWEN_API_KEY;

  // Initialize clients
  const deepseek = await initializeDeepSeekMCP(deepseekApiKey);
  const qwen = await initializeQwenMCP(qwenApiKey);

  // Log initialization status
  logger.info(`DeepSeek client: ${deepseek ? 'initialized' : 'failed'}`);
  logger.info(`Qwen client: ${qwen ? 'initialized' : 'failed'}`);

  // Create MCP client
  // Define the file tools
  const dataDirectory = process.env.DATA_DIRECTORY || path.join(process.cwd(), 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    logger.info(`Created data directory: ${dataDirectory}`);
  }

  // Utility to prevent path traversal attacks
  const isPathSafe = (filePath: string): boolean => {
    const normalizedPath = path.normalize(filePath);
    return normalizedPath.startsWith(dataDirectory);
  };

  // Echo tool - simple text echo
  const echoTool: Tool = {
    description: 'Echo the input text',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to echo back'
        }
      },
      required: ['text']
    },
    execute: async (params: { text: string }) => {
      logger.info('Executing echo tool');
      return params.text;
    }
  };

  // Read file tool - securely read files from data directory
  const readFileTool: Tool = {
    // The name 'read_file' is handled in the route.ts file
    description: 'Read content from a file in the data directory',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to read (relative to data directory)'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf8)',
          enum: ['utf8', 'ascii', 'utf16le', 'ucs2', 'base64', 'latin1', 'binary', 'hex'],
          default: 'utf8'
        }
      },
      required: ['filename']
    },
    execute: async (params: { filename: string; encoding?: BufferEncoding }) => {
      logger.info('Executing read_file tool', { filename: params.filename });
      
      try {
        const filePath = path.join(dataDirectory, params.filename);
        
        // Security check to prevent path traversal
        if (!isPathSafe(filePath)) {
          throw new Error('Path traversal attempt detected');
        }
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${params.filename}`);
        }
        
        // Read file
        const content = fs.readFileSync(filePath, { encoding: params.encoding || 'utf8' });
        logger.info('File read successfully', { filename: params.filename });
        return content;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error reading file', { error: errorMessage, filename: params.filename });
        throw new Error(`Failed to read file: ${errorMessage}`);
      }
    }
  };

  // Write file tool - securely write files to data directory
  const writeFileTool: Tool = {
    // The name 'write_file' is handled in the route.ts file
    description: 'Write content to a file in the data directory',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to write (relative to data directory)'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf8)',
          enum: ['utf8', 'ascii', 'utf16le', 'ucs2', 'base64', 'latin1', 'binary', 'hex'],
          default: 'utf8'
        }
      },
      required: ['filename', 'content']
    },
    execute: async (params: { filename: string; content: string; encoding?: BufferEncoding }) => {
      logger.info('Executing write_file tool', { filename: params.filename });
      
      try {
        const filePath = path.join(dataDirectory, params.filename);
        
        // Security check to prevent path traversal
        if (!isPathSafe(filePath)) {
          throw new Error('Path traversal attempt detected');
        }
        
        // Ensure directory exists
        const dirname = path.dirname(filePath);
        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, { recursive: true });
        }
        
        // Write file
        fs.writeFileSync(filePath, params.content, { encoding: params.encoding || 'utf8' });
        logger.info('File written successfully', { filename: params.filename });
        return `File written successfully: ${params.filename}`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error writing file', { error: errorMessage, filename: params.filename });
        throw new Error(`Failed to write file: ${errorMessage}`);
      }
    }
  };

  // Fetch data tool - make HTTP requests to external APIs
  const fetchDataTool: Tool = {
    // The name 'fetch_data' is handled in the route.ts file
    description: 'Fetch data from an external API',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch data from'
        },
        method: {
          type: 'string',
          description: 'HTTP method to use',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          default: 'GET'
        },
        headers: {
          type: 'object',
          description: 'HTTP headers to include',
          additionalProperties: true
        },
        data: {
          type: 'object',
          description: 'Data to send with the request (for POST/PUT)',
          additionalProperties: true
        }
      },
      required: ['url']
    },
    execute: async (params: { 
      url: string; 
      method?: string; 
      headers?: Record<string, string>; 
      data?: any; 
    }) => {
      logger.info('Executing fetch_data tool', { url: params.url, method: params.method || 'GET' });
      
      try {
        // Make request
        const response = await axios({
          url: params.url,
          method: params.method || 'GET',
          headers: params.headers || {},
          data: params.data
        });
        
        logger.info('API request successful', { url: params.url, status: response.status });
        return JSON.stringify(response.data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error fetching data', { error: errorMessage, url: params.url });
        throw new Error(`Failed to fetch data: ${errorMessage}`);
      }
    }
  };

  const client: MCPClient = {
    deepseek,
    qwen,
    tools: async () => {
      try {
        // Get tools from clients
        const deepseekTools = await getDeepSeekTools(deepseek);
        const qwenTools = await getQwenTools(qwen);
        
        // Add custom tools
        const customTools = {
          echo: echoTool,
          read_file: readFileTool,
          write_file: writeFileTool,
          fetch_data: fetchDataTool,
          [geminiThinkingTool.name]: geminiThinkingTool,
          ...deepseekTools,
          ...qwenTools
        };
        
        // Log the keys of the final tools object before returning
        logger.info(`[MCP-Server(API)] Registering tools: ${Object.keys(customTools).join(', ')}`);

        return customTools;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error getting MCP tools', { error: errorMessage });
        throw new Error(`Failed to get MCP tools: ${errorMessage}`);
      }
    },
    close: async () => {
      try {
        // Close clients
        await Promise.all([
          closeDeepSeekClient(deepseek),
          closeQwenClient(qwen)
          // Claude doesn't need explicit closing as it uses HTTP requests
        ]);
        logger.info('All MCP clients closed');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error closing MCP clients', { error: errorMessage });
      }
    }
  };

  return client;
}
//
// Helper to get MCP tools
export async function getMCPTools(client: MCPClient): Promise<Record<string, Tool>> {
  logger.info('Getting MCP tools...');
  return await client.tools();
}
//
// Helper to close MCP client
export async function closeMCPClient(client: MCPClient): Promise<void> {
  logger.info('Closing MCP clients...');
  try {
    // Close clients with proper error handling
    if (client.deepseek) {
      await closeDeepSeekClient(client.deepseek);
    }
    if (client.qwen) {
      await closeQwenClient(client.qwen);
    }
    // Claude doesn't need explicit closing as it uses HTTP requests
    logger.info('All MCP clients closed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error closing MCP clients:', { error: errorMessage });
  }
}
//
// Server lifecycle management
process.on('SIGINT', async () => await handleShutdown('SIGINT'));
process.on('SIGTERM', async () => await handleShutdown('SIGTERM'));

async function handleShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down MCP server...`);

  try {
    // Initialize MCP to get the client and then close it properly
    const client = await initializeMCP();
    await closeMCPClient(client);
    logger.info('MCP server shut down gracefully');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error during server shutdown', { error: errorMessage });
    process.exit(1);
  }
}
//
// Create standalone server instance for direct imports
let mcpClientInstance: MCPClient | null = null;

// Get the singleton MCP client instance
export async function getMCPClient(): Promise<MCPClient> {
  if (!mcpClientInstance) {
    mcpClientInstance = await initializeMCP();
  }
  return mcpClientInstance;
}
