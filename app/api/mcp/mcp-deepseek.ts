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
    new transports.File({ filename: 'deepseek-mcp.log' })
  ]
});

// Custom error class for DeepSeek API errors
export class DeepSeekAPIError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'DeepSeekAPIError';
    this.statusCode = statusCode;
  }
}

// DeepSeek MCP client type
export interface DeepSeekMCPClient {
  apiKey: string;
  baseUrl: string;
  models: string[];
}

/**
 * Initialize the DeepSeek MCP client
 * @param apiKey DeepSeek API key
 * @returns DeepSeekMCPClient instance or null if initialization fails
 */
export async function initializeDeepSeekMCP(apiKey?: string): Promise<DeepSeekMCPClient | null> {
  // Check if API key is provided
  if (!apiKey) {
    logger.error('DeepSeek API key not provided');
    return null;
  }

  try {
    // Initialize client
    const client: DeepSeekMCPClient = {
      apiKey,
      baseUrl: 'https://api.deepseek.com/v1',
      models: [
        'deepseek-chat',
        'deepseek-reasoner'
      ]
    };

    // Test connection by making a simple request
    await testConnection(client);
    logger.info('DeepSeek MCP client initialized successfully');
    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to initialize DeepSeek MCP client', { error: errorMessage });
    return null;
  }
}

/**
 * Test connection to DeepSeek API
 * @param client DeepSeek MCP client
 */
async function testConnection(client: DeepSeekMCPClient): Promise<void> {
  try {
    const response = await axios.get(`${client.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${client.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Update model list with available models from API
    if (response.data && response.data.data) {
      client.models = response.data.data.map((model: any) => model.id);
    }
    
    logger.info('Connection to DeepSeek API established', { models: client.models });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new DeepSeekAPIError(
        `DeepSeek API error: ${error.response.data.error || error.message}`,
        error.response.status
      );
    }
    throw new DeepSeekAPIError(`Failed to connect to DeepSeek API: ${error instanceof Error ? error.message : String(error)}`);
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
          throw new DeepSeekAPIError(`Invalid model: ${model}. Available models: ${client.models.join(', ')}`);
        }

        const requestBody: any = {
          model: model,
          messages: params.messages,
          max_tokens: params.max_tokens || 4096,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 1,
          frequency_penalty: params.frequency_penalty || 0,
          presence_penalty: params.presence_penalty || 0
        };

        // Add response_format if JSON is requested
        if (params.json_response) {
          requestBody.response_format = { type: 'json_object' };
        }

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

        return response.data.choices[0].message.content;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          throw new DeepSeekAPIError(
            `DeepSeek API error: ${error.response.data.error || error.message}`,
            error.response.status
          );
        }
        throw new DeepSeekAPIError(`Failed to generate chat completion: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };

  // Tool for FIM (Fill-In-the-Middle) Completion
  const fimCompletionTool: Tool = {
    description: 'Generate text using DeepSeek FIM completion API',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'DeepSeek model to use (must be deepseek-chat)',
          enum: ['deepseek-chat'],
          default: 'deepseek-chat'
        },
        prompt: {
          type: 'string',
          description: 'The prompt to generate completions from'
        },
        suffix: {
          type: 'string',
          description: 'The suffix that comes after the completion of inserted text'
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
          description: 'Top-p sampling parameter (0-1)',
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
        stop: {
          type: 'array',
          description: 'Up to 16 sequences where the API will stop generating',
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
      suffix?: string;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      stop?: string[];
    }) => {
      logger.info('Executing deepseek_fim_completion tool');
      
      try {
        const requestBody: any = {
          model: 'deepseek-chat', // FIM completion only supports deepseek-chat
          prompt: params.prompt,
          max_tokens: params.max_tokens || 1000,
          temperature: params.temperature || 0.7,
          top_p: params.top_p || 1,
          frequency_penalty: params.frequency_penalty || 0,
          presence_penalty: params.presence_penalty || 0
        };

        // Add optional parameters
        if (params.suffix) requestBody.suffix = params.suffix;
        if (params.stop) requestBody.stop = params.stop;

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

        return response.data.choices[0].text;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          throw new DeepSeekAPIError(
            `DeepSeek API error: ${error.response.data.error || error.message}`,
            error.response.status
          );
        }
        throw new DeepSeekAPIError(`Failed to generate FIM completion: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };

  // Tool for model information
  const modelsInfoTool: Tool = {
    description: 'Get information about available DeepSeek models',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    execute: async () => {
      logger.info('Executing deepseek_models_info tool');
      
      try {
        const response = await axios.get(
          `${client.baseUrl}/models`,
          {
            headers: {
              'Authorization': `Bearer ${client.apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          throw new DeepSeekAPIError(
            `DeepSeek API error: ${error.response.data.error || error.message}`,
            error.response.status
          );
        }
        throw new DeepSeekAPIError(`Failed to get models info: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };

  return {
    'deepseek_chat_completion': chatCompletionTool,
    'deepseek_fim_completion': fimCompletionTool,
    'deepseek_models_info': modelsInfoTool
  };
}

/**
 * Close DeepSeek MCP client
 * @param client DeepSeek MCP client
 */
export async function closeDeepSeekClient(client: DeepSeekMCPClient | null): Promise<void> {
  // No active connections to close, but we log for consistency
  if (client) {
    logger.info('DeepSeek MCP client closed');
  }
}
