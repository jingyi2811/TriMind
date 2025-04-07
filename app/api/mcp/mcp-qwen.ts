import { Tool } from 'ai';
import { z } from 'zod';
import axios from 'axios';
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

// Custom error class for Qwen API errors
export class QwenAPIError extends Error {
  statusCode?: number;
  response?: any;

  constructor(message: string, statusCode?: number, response?: any) {
    super(message);
    this.name = 'QwenAPIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

// Qwen MCP client type
export interface QwenMCPClient {
  apiKey: string;
  baseUrl: string;
  models: string[];
}

/**
 * Initialize the Qwen MCP client
 * @param apiKey Dashscope API key
 * @returns QwenMCPClient instance or null if initialization fails
 */
export async function initializeQwenMCP(apiKey?: string): Promise<QwenMCPClient | null> {
  logger.info('Initializing Qwen MCP client...');

  if (!apiKey) {
    // Try both environment variables for backward compatibility
    apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
    if (!apiKey) {
      logger.error('Dashscope API key not provided');
      return null;
    }
  }

  try {
    // Create the client
    const client: QwenMCPClient = {
      apiKey,
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen'] // Available models
    };

    // Test the connection
    await testConnection(client);
    logger.info('Qwen MCP client initialized successfully');

    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize Qwen MCP client', { error: errorMessage });
    return null;
  }
}

/**
 * Test connection to Qwen API
 * @param client Qwen MCP client
 */
async function testConnection(client: QwenMCPClient): Promise<void> {
  logger.info('Testing connection to Qwen API...');

  try {
    // Simple test request with minimal tokens
    const response = await axios.post(
      `${client.baseUrl}/chat/completions`,
      {
        model: 'qwen-plus',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${client.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200) {
      logger.info('Connection to Qwen API successful');
    } else {
      throw new QwenAPIError(
        `Unexpected status: ${response.status}`,
        response.status,
        response.data
      );
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new QwenAPIError(
        `API connection test failed: ${error.message}`,
        error.response.status,
        error.response.data
      );
    } else {
      throw new QwenAPIError(
        `API connection test failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
          throw new QwenAPIError(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        const requestBody: any = {
          model: model,
          messages: params.messages,
          max_tokens: params.max_tokens || 1000,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 0.9,
          n: params.n || 1,
          stream: params.stream || false
        };

        const response = await axios.post(
          `${client.baseUrl}/chat/completions`,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${client.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        logger.info('Qwen chat API request successful');
        
        // Extract and return the text response
        if (response.data.choices && response.data.choices.length > 0) {
          return response.data.choices[0].message.content;
        } else {
          throw new QwenAPIError('No choices returned from Qwen API');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const errorMessage = `Qwen API Error: ${error.message}`;
          logger.error(errorMessage, {
            status: error.response.status,
            data: error.response.data
          });
          throw new QwenAPIError(
            errorMessage,
            error.response.status,
            error.response.data
          );
        } else {
          const errorMessage = `Qwen API Error: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          throw new QwenAPIError(errorMessage);
        }
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
          throw new QwenAPIError(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        const requestBody: any = {
          model: model,
          prompt: params.prompt,
          max_tokens: params.max_tokens || 1000,
          temperature: params.temperature || 0.8,
          top_p: params.top_p || 0.95,
          n: params.n || 1,
          stream: params.stream || false
        };

        const response = await axios.post(
          `${client.baseUrl}/completions`,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${client.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        logger.info('Qwen completion API request successful');
        
        // Extract and return the text response
        if (response.data.choices && response.data.choices.length > 0) {
          return response.data.choices[0].text;
        } else {
          throw new QwenAPIError('No choices returned from Qwen API');
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const errorMessage = `Qwen API Error: ${error.message}`;
          logger.error(errorMessage, {
            status: error.response.status,
            data: error.response.data
          });
          throw new QwenAPIError(
            errorMessage,
            error.response.status,
            error.response.data
          );
        } else {
          const errorMessage = `Qwen API Error: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(errorMessage);
          throw new QwenAPIError(errorMessage);
        }
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
 * @param client Qwen MCP client
 */
export async function closeQwenClient(client: QwenMCPClient | null): Promise<void> {
  if (!client) {
    logger.warn('Qwen client not initialized, nothing to close');
    return;
  }

  logger.info('Closing Qwen MCP client...');
  // Since there's no active connection to close, just log completion
  logger.info('Qwen MCP client closed');
}
