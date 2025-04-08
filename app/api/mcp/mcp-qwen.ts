import path from 'path';
import { Tool } from 'ai';

/**
 * Custom error class for Qwen API errors
 */
export class QwenAPIError extends Error {
  constructor(message: string, public readonly code?: string, public readonly details?: any) {
    super(message);
    this.name = 'QwenAPIError';
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, QwenAPIError.prototype);
  }
}
import { experimental_createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { createLogger, format, transports } from 'winston';

// Create a logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'qwen-mcp.log' })
  ]
});

// Path to the Python script
const QWEN_SERVER_SCRIPT = path.join(process.cwd(), 'app/api/mcp/qwen_server.py');

// Store a reference to the MCP client using type inference
let mcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>> | null = null;

// Track whether we've registered cleanup handlers
let cleanupHandlersRegistered = false;

// Simple interface to store available models
export interface QwenMCPClient {
  models: string[];
}

/**
 * Initialize the MCP client for communication with the Python server
 * @returns The MCP client instance
 */
async function initializeMCPClient() {
  if (mcpClient) {
    logger.debug('[MCP-Qwen] MCP client already initialized');
    return mcpClient;
  }

  logger.info('[MCP-Qwen] Initializing MCP client...');
  try {
    // Create transport for the Python script
    const transport = new Experimental_StdioMCPTransport({
      command: 'python',
      args: [QWEN_SERVER_SCRIPT],
      env: process.env as Record<string, string>,
    });

    // Create MCP client
    mcpClient = await experimental_createMCPClient({
      transport,
      // Additional options if needed
    });

    if (!cleanupHandlersRegistered) {
      // Register cleanup handlers for process exit
      process.on('beforeExit', () => {
        if (mcpClient) {
          logger.info('[MCP-Qwen] Closing MCP client on process exit');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-Qwen] Error closing client on exit', { error: e });
          }
          mcpClient = null;
        }
      });

      // Also handle SIGINT and SIGTERM if running in Node.js
      process.on('SIGINT', () => {
        if (mcpClient) {
          logger.info('[MCP-Qwen] Closing MCP client on SIGINT');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-Qwen] Error closing client on SIGINT', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      process.on('SIGTERM', () => {
        if (mcpClient) {
          logger.info('[MCP-Qwen] Closing MCP client on SIGTERM');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-Qwen] Error closing client on SIGTERM', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      cleanupHandlersRegistered = true;
    }

    logger.info('[MCP-Qwen] MCP client initialized successfully');
    return mcpClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during MCP client initialization';
    logger.error('[MCP-Qwen] Failed to initialize MCP client', { errorMessage });
    throw new Error(`MCP Client Initialization Failed: ${errorMessage}`);
  }
}

/**
 * Initialize the Qwen MCP client
 * @returns QwenMCPClient instance or null if initialization fails
 */
export async function initializeQwenMCP(): Promise<QwenMCPClient | null> {
  logger.info('[MCP-Qwen] Initializing Qwen MCP client...');

  try {
    // Create the client with available models
    const client: QwenMCPClient = {
      models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen'] // Available models
    };

    // Initialize MCP client for stdio communication
    await initializeMCPClient();
    logger.info('[MCP-Qwen] Qwen MCP client initialized successfully');

    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MCP-Qwen] Failed to initialize Qwen MCP client', { error: errorMessage });
    return null;
  }
}

/**
 * Execute a tool through the MCP client
 * @param toolName Name of the tool to execute
 * @param params Parameters to pass to the tool
 * @returns Result from the tool
 */
async function executeThroughMCP(toolName: string, params: Record<string, any>): Promise<Record<string, any>> {
  try {
    const client = await initializeMCPClient();
    const tools = await client.tools();
    
    logger.debug('[MCP-Qwen] Available tools:', Object.keys(tools));
    
    // Check if the requested tool exists
    if (!tools[toolName]) {
      logger.error(`[MCP-Qwen] Tool '${toolName}' not found in available tools`, { availableTools: Object.keys(tools) });
      throw new Error(`Tool '${toolName}' not found. Available tools: ${Object.keys(tools).join(', ')}`);
    }
    
    logger.debug(`[MCP-Qwen] Calling tool '${toolName}' with params:`, params);
    
    // Using type assertion to handle different ways to call the tool
    const toolsAny = tools as any;
    let response;
    
    if (typeof toolsAny.call === 'function') {
      // Try using the call method if available
      response = await toolsAny.call(toolName, params);
    } else {
      // Try direct invocation
      const toolFunc = (tools as any)[toolName];
      if (typeof toolFunc === 'function') {
        response = await toolFunc(params);
      } else {
        throw new Error(`Tool '${toolName}' exists but is not callable`);
      }
    }
    
    logger.debug(`[MCP-Qwen] Received response from tool '${toolName}'`, { response });
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[MCP-Qwen] Error executing tool '${toolName}'`, { errorMessage });
    throw new Error(`Failed to execute '${toolName}': ${errorMessage}`);
  }
}

/**
 * Get Qwen tools for MCP
 * @param client Qwen MCP client
 * @returns Record of Qwen tools
 */
export async function getQwenTools(client: QwenMCPClient | null): Promise<Record<string, Tool>> {
  if (!client) {
    logger.warn('Qwen client not initialized, returning empty tool set');
    return {};
  }

  // Tool for chat completion using Qwen models
  const chatCompletionTool: Tool = {
    description: 'Generate responses using Qwen chat models',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Qwen model to use (e.g., qwen-plus, qwen-max, qwen-turbo)',
          enum: client.models,
          default: 'qwen-plus'
        },
        messages: {
          type: 'array',
          description: 'Array of messages in the conversation',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                description: 'Role of the message author (system, user, or assistant)',
                enum: ['system', 'user', 'assistant']
              },
              content: {
                type: 'string',
                description: 'Content of the message'
              }
            },
            required: ['role', 'content']
          }
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum number of tokens to generate',
          default: 1000
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-2)',
          default: 0.7
        },
        top_p: {
          type: 'number',
          description: 'Top-p sampling parameter',
          default: 0.9
        },
        n: {
          type: 'number',
          description: 'Number of completions to generate',
          default: 1
        },
        stream: {
          type: 'boolean',
          description: 'Whether to stream back partial progress',
          default: false
        }
      },
      required: ['messages']
    },
    execute: async (params: {
      model?: string;
      messages: Array<{role: string; content: string}>;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      n?: number;
      stream?: boolean;
    }) => {
      logger.info('Executing qwen_chat_completion tool', { model: params.model || 'qwen-plus' });
      
      try {
        const model = params.model || 'qwen-plus';
        if (!client.models.includes(model)) {
          throw new Error(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        logger.info('[MCP-Qwen] Making chat completion request via MCP');
        
        const response = await executeThroughMCP('qwen_chat', {
          model: params.model || 'qwen-plus',
          messages: params.messages,
          max_tokens: params.max_tokens || 1000,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 0.9,
          n: params.n || 1,
          stream: params.stream || false
        });

        logger.info('Qwen chat API request successful');
        
        // Extract and return the text response
        if (response.choices && response.choices.length > 0) {
          return response.choices[0].message.content;
        } else {
          throw new Error('No choices returned from Qwen API');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
  };

  // Tool for text completion using Qwen models
  const textCompletionTool: Tool = {
    description: 'Generate text completions using Qwen models',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Qwen model to use (e.g., qwen-plus, qwen-max, qwen-turbo)',
          enum: client.models,
          default: 'qwen-plus'
        },
        prompt: {
          type: 'string',
          description: 'The input text for completion'
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum number of tokens to generate',
          default: 1000
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-2)',
          default: 0.8
        },
        top_p: {
          type: 'number',
          description: 'Top-p sampling parameter',
          default: 0.95
        },
        n: {
          type: 'number',
          description: 'Number of completions to generate',
          default: 1
        },
        stream: {
          type: 'boolean',
          description: 'Whether to stream back partial progress',
          default: false
        }
      },
      required: ['prompt']
    },
    execute: async (params: {
      model?: string;
      prompt: string;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      n?: number;
      stream?: boolean;
    }) => {
      logger.info('Executing qwen_text_completion tool', { model: params.model || 'qwen-plus' });
      
      try {
        const model = params.model || 'qwen-plus';
        if (!client.models.includes(model)) {
          throw new Error(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        logger.info('[MCP-Qwen] Making text completion request via MCP');
        
        const response = await executeThroughMCP('qwen_text', {
          model: params.model || 'qwen-plus',
          prompt: params.prompt,
          max_tokens: params.max_tokens || 1000,
          temperature: params.temperature || 0.8,
          top_p: params.top_p || 0.95,
          n: params.n || 1,
          stream: params.stream || false
        });

        logger.info('Qwen completion API request successful');
        
        // Extract and return the text response
        if (response.choices && response.choices.length > 0) {
          return response.choices[0].text;
        } else {
          throw new Error('No choices returned from Qwen API');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
  };

  // Return a record with tools indexed by name
  return {
    qwen_chat_completion: chatCompletionTool,
    qwen_text_completion: textCompletionTool
  };
}

/**
 * Close Qwen MCP client
 */
export async function closeQwenClient(client?: QwenMCPClient): Promise<void> {
  if (!mcpClient) {
    logger.debug('[MCP-Qwen] No MCP client to close');
    return;
  }
  
  logger.info('[MCP-Qwen] Closing Qwen MCP client');
  try {
    await mcpClient.close();
    mcpClient = null;
    logger.info('[MCP-Qwen] MCP client closed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MCP-Qwen] Error closing MCP client', { errorMessage });
  }
}
