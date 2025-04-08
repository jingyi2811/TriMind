import path from 'path';
import { Tool } from 'ai';

/**
 * Custom error class for DeepSeek API errors
 */
export class DeepSeekAPIError extends Error {
  constructor(message: string, public readonly code?: string, public readonly details?: any) {
    super(message);
    this.name = 'DeepSeekAPIError';
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, DeepSeekAPIError.prototype);
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
    new transports.File({ filename: 'deepseek-mcp.log' })
  ]
});

// Path to the Python script
const DEEPSEEK_SERVER_SCRIPT = path.join(process.cwd(), 'app/api/mcp/deepseek_server.py');

// Store a reference to the MCP client using type inference
let mcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>> | null = null;

// Track whether we've registered cleanup handlers
let cleanupHandlersRegistered = false;

// DeepSeek MCP client type
export interface DeepSeekMCPClient {
  models: string[];
}

/**
 * Initialize the MCP client for communication with the Python server
 * @returns The MCP client instance
 */
async function initializeMCPClient() {
  if (mcpClient) {
    logger.debug('[MCP-DeepSeek] MCP client already initialized');
    return mcpClient;
  }

  logger.info('[MCP-DeepSeek] Initializing MCP client...');
  try {
    // Create transport for the Python script
    const transport = new Experimental_StdioMCPTransport({
      command: 'python',
      args: [DEEPSEEK_SERVER_SCRIPT],
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
          logger.info('[MCP-DeepSeek] Closing MCP client on process exit');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-DeepSeek] Error closing client on exit', { error: e });
          }
          mcpClient = null;
        }
      });

      // Also handle SIGINT and SIGTERM if running in Node.js
      process.on('SIGINT', () => {
        if (mcpClient) {
          logger.info('[MCP-DeepSeek] Closing MCP client on SIGINT');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-DeepSeek] Error closing client on SIGINT', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      process.on('SIGTERM', () => {
        if (mcpClient) {
          logger.info('[MCP-DeepSeek] Closing MCP client on SIGTERM');
          try {
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-DeepSeek] Error closing client on SIGTERM', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      cleanupHandlersRegistered = true;
    }

    logger.info('[MCP-DeepSeek] MCP client initialized successfully');
    return mcpClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during MCP client initialization';
    logger.error('[MCP-DeepSeek] Failed to initialize MCP client', { errorMessage });
    throw new Error(`MCP Client Initialization Failed: ${errorMessage}`);
  }
}

/**
 * Initialize the DeepSeek MCP client
 * @returns DeepSeekMCPClient instance or null if initialization fails
 */
export async function initializeDeepSeekMCP(): Promise<DeepSeekMCPClient | null> {
  logger.info('[MCP-DeepSeek] Initializing DeepSeek MCP client...');

  try {
    // Create the client with available models
    const client: DeepSeekMCPClient = {
      models: [
        'deepseek-chat',
        'deepseek-reasoner'
      ]
    };

    // Initialize MCP client for stdio communication
    await initializeMCPClient();
    logger.info('[MCP-DeepSeek] DeepSeek MCP client initialized successfully');

    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MCP-DeepSeek] Failed to initialize DeepSeek MCP client', { error: errorMessage });
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
    
    logger.debug('[MCP-DeepSeek] Available tools:', Object.keys(tools));
    
    // Check if the requested tool exists
    if (!tools[toolName]) {
      logger.error(`[MCP-DeepSeek] Tool '${toolName}' not found in available tools`, { availableTools: Object.keys(tools) });
      throw new Error(`Tool '${toolName}' not found. Available tools: ${Object.keys(tools).join(', ')}`);
    }
    
    logger.debug(`[MCP-DeepSeek] Calling tool '${toolName}' with params:`, params);
    
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
    
    logger.debug(`[MCP-DeepSeek] Received response from tool '${toolName}'`, { response });
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[MCP-DeepSeek] Error executing tool '${toolName}'`, { errorMessage });
    throw new Error(`Failed to execute '${toolName}': ${errorMessage}`);
  }
}

/**
 * Get DeepSeek tools for MCP
 * @param client DeepSeek MCP client
 * @returns Record of DeepSeek tools
 */
export async function getDeepSeekTools(client: DeepSeekMCPClient | null): Promise<Record<string, Tool>> {
  if (!client) {
    logger.warn('DeepSeek client not initialized, returning empty tool set');
    return {};
  }

  // Tool for chat completion using DeepSeek models
  const chatCompletionTool: Tool = {
    description: 'Generate responses using DeepSeek chat models',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'DeepSeek model to use (e.g., deepseek-chat, deepseek-reasoner)',
          enum: client.models,
          default: 'deepseek-chat'
        },
        messages: {
          type: 'array',
          description: 'Array of messages in the conversation',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                description: 'Role of the message author (system, user, assistant, or tool)',
                enum: ['system', 'user', 'assistant', 'tool']
              },
              content: {
                type: 'string',
                description: 'Content of the message'
              },
              name: {
                type: 'string',
                description: 'Optional name for the participant'
              }
            },
            required: ['role', 'content']
          }
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum number of tokens to generate (1-8192)',
          default: 4096
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-2)',
          default: 0.7
        },
        top_p: {
          type: 'number',
          description: 'Top-p sampling parameter',
          default: 1
        },
        frequency_penalty: {
          type: 'number',
          description: 'Frequency penalty (-2 to 2)',
          default: 0
        },
        presence_penalty: {
          type: 'number',
          description: 'Presence penalty (-2 to 2)',
          default: 0
        },
        json_response: {
          type: 'boolean',
          description: 'Whether to return response in JSON format',
          default: false
        }
      },
      required: ['messages']
    },
    execute: async (params: {
      model?: string;
      messages: Array<{role: string; content: string; name?: string}>;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      json_response?: boolean;
    }) => {
      logger.info('Executing deepseek_chat_completion tool', { model: params.model || 'deepseek-chat' });
      
      try {
        const model = params.model || 'deepseek-chat';
        if (!client.models.includes(model)) {
          throw new Error(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        // Make the request through MCP
        logger.info('[MCP-DeepSeek] Making chat completion request via MCP');
        
        // Define the type with all possible properties including response_format
        type DeepSeekRequestParams = {
          model: string;
          messages: Array<{role: string; content: string; name?: string}>;
          max_tokens: number;
          temperature: number;
          top_p: number;
          frequency_penalty: number;
          presence_penalty: number;
          response_format?: { type: string };
        };
        
        const requestParams: DeepSeekRequestParams = {
          model: model,
          messages: params.messages,
          max_tokens: params.max_tokens || 4096,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 1,
          frequency_penalty: params.frequency_penalty || 0,
          presence_penalty: params.presence_penalty || 0
        };

        if (params.json_response) {
          requestParams.response_format = { type: 'json_object' };
        }

        const response = await executeThroughMCP('deepseek_chat', requestParams);

        // Process the response (already in the expected format from MCP)
        logger.info('[MCP-DeepSeek] Successfully received response from DeepSeek via MCP');
        return response;
      } catch (error) {
        logger.error('[MCP-DeepSeek] Error in chat completion', { error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Chat completion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  // Tool for text completion using DeepSeek models
  const textCompletionTool: Tool = {
    description: 'Generate text completions using DeepSeek models',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'DeepSeek model to use (e.g., deepseek-coder)',
          enum: client.models,
          default: 'deepseek-coder'
        },
        prompt: {
          type: 'string',
          description: 'The prompt to generate completions for'
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum number of tokens to generate',
          default: 2048
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0-2)',
          default: 0.8
        },
        top_p: {
          type: 'number',
          description: 'Top-p sampling parameter',
          default: 1
        },
        stop: {
          type: 'array',
          description: 'Sequences where the API will stop generating further tokens',
          items: {
            type: 'string'
          }
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
      stop?: string[];
    }) => {
      logger.info('Executing deepseek_text_completion tool', { model: params.model || 'deepseek-coder' });
      
      try {
        const model = params.model || 'deepseek-coder';
        if (!client.models.includes(model)) {
          throw new Error(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        // Make the request through MCP
        logger.info('[MCP-DeepSeek] Making text completion request via MCP');
        
        const response = await executeThroughMCP('deepseek_text', {
          model: params.model || 'deepseek-coder',
          prompt: params.prompt,
          max_tokens: params.max_tokens || 2048,
          temperature: params.temperature || 0.8,
          top_p: params.top_p || 1,
          stop: params.stop || null
        });

        // Process the response (already in the expected format from MCP)
        logger.info('[MCP-DeepSeek] Successfully received response from DeepSeek via MCP');
        return response;
      } catch (error) {
        logger.error('[MCP-DeepSeek] Error in text completion', { error: error instanceof Error ? error.message : String(error) });
        throw new Error(`Text completion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  return {
    deepseek_chat_completion: chatCompletionTool,
    deepseek_text_completion: textCompletionTool,
  };
}

/**
 * Close DeepSeek MCP client
 */
export async function closeDeepSeekClient(client?: DeepSeekMCPClient): Promise<void> {
  if (!mcpClient) {
    logger.debug('[MCP-DeepSeek] No MCP client to close');
    return;
  }
  
  logger.info('[MCP-DeepSeek] Closing DeepSeek MCP client');
  try {
    await mcpClient.close();
    mcpClient = null;
    logger.info('[MCP-DeepSeek] MCP client closed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[MCP-DeepSeek] Error closing MCP client', { errorMessage });
  }
}
