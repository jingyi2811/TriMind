import { Tool } from 'ai';
import axios from 'axios';
import winston from 'winston';
import { z } from 'zod';

// Create a logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
    ],
});

export interface ClaudeMCPClient {
    apiKey: string;
    baseUrl: string;
    models: string[];
}

/**
 * Initialize the Claude MCP client
 */
export async function initializeClaudeMCP(apiKey: string | undefined): Promise<ClaudeMCPClient | null> {
    if (!apiKey) {
        logger.error('No API key provided for Claude');
        return null;
    }

    logger.info('Initializing Claude MCP client');
    
    try {
        // Test connection to Claude API
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: 'claude-3-sonnet-20240229',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Test connection' }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            }
        );

        if (response.status !== 200) {
            logger.error('Failed to connect to Claude API', { status: response.status });
            return null;
        }

        logger.info('Claude MCP client initialized successfully');
        
        // Return the client with API key and available models
        const client: ClaudeMCPClient = {
            apiKey,
            baseUrl: 'https://api.anthropic.com/v1',
            models: ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-opus-20240229']
        };
        
        return client;
    } catch (error) {
        logger.error('Error initializing Claude MCP client', { error });
        return null;
    }
}

/**
 * Get Claude MCP tools
 */
export function getClaudeTools(client: ClaudeMCPClient | null): Record<string, Tool> {
    if (!client) {
        return {}; // Return empty object if client is null
    }
    
    // Chat completion tool for Claude
    const chatCompletionTool: Tool = {
        description: 'Generate responses using Claude chat models',
        parameters: {
            type: 'object',
            properties: {
                model: {
                    type: 'string',
                    description: 'Claude model to use',
                    default: 'claude-3-sonnet-20240229'
                },
                messages: {
                    type: 'array',
                    description: 'Array of messages in the conversation',
                    items: {
                        type: 'object',
                        properties: {
                            role: {
                                type: 'string',
                                enum: ['user', 'assistant', 'system']
                            },
                            content: {
                                type: 'string'
                            }
                        },
                        required: ['role', 'content']
                    }
                },
                max_tokens: {
                    type: 'number',
                    description: 'Maximum number of tokens to generate',
                    default: 4000
                },
                temperature: {
                    type: 'number',
                    description: 'Sampling temperature',
                    default: 0.7
                }
            },
            required: ['messages']
        },
        execute: async (params: {
            model?: string;
            messages: Array<{ role: string; content: string }>;
            max_tokens?: number;
            temperature?: number;
            tools?: Array<any>;
            tool_choice?: string;
        }) => {
            try {
                // Use a default model if not specified
                const model = params.model || 'claude-3-sonnet-20240229';
                
                logger.info('Executing Claude chat completion', { model });

                const response = await axios.post(
                    `${client.baseUrl}/messages`,
                    {
                        model,
                        messages: params.messages,
                        max_tokens: params.max_tokens || 4000,
                        temperature: params.temperature || 0.7,
                        tools: params.tools || [],
                        tool_choice: params.tool_choice || 'auto'
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': client.apiKey,
                            'anthropic-version': '2023-06-01'
                        }
                    }
                );

                // Return the text content from the Claude API response
                return response.data.content[0].text;
            } catch (error) {
                logger.error('Error executing Claude chat completion', { error });
                throw error;
            }
        }
    };

    // Return all available tools
    return {
        'claude_chat_completion': chatCompletionTool
    };
}
