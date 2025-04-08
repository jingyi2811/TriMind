import path from 'path';
import { Tool } from 'ai';
import { experimental_createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { createLogger, format, transports } from 'winston';

// Basic logger setup
const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...rest }) => {
      return `${timestamp} ${level}: ${message} ${Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''}`;
    })
  ),
  transports: [new transports.Console()],
});

// Path to the Python script
const GEMINI_SERVER_SCRIPT = path.join(process.cwd(), 'app/api/mcp/gemini_server.py');

// Store a reference to the MCP client using type inference
let mcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>> | null = null;

// Track whether we've registered cleanup handlers
let cleanupHandlersRegistered = false;

/**
 * Initialize the MCP client (only once) for communication with the Python server
 * @returns The MCP client instance
 */
async function initializeMCPClient() {
  if (mcpClient) {
    logger.debug('[MCP-GeminiThinking] MCP client already initialized');
    return mcpClient;
  }

  logger.info('[MCP-GeminiThinking] Initializing MCP client...');
  try {
    // Create transport for the Python script
    const transport = new Experimental_StdioMCPTransport({
      command: 'python',
      args: [GEMINI_SERVER_SCRIPT],
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
          logger.info('[MCP-GeminiThinking] Closing MCP client on process exit');
          // On exit, we can't await promises, so we just call the method directly
          try {
            // Just attempt to close - we can't await in exit handler
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-GeminiThinking] Error closing client on exit', { error: e });
          }
          mcpClient = null;
        }
      });

      // Also handle SIGINT and SIGTERM if running in Node.js
      process.on('SIGINT', () => {
        if (mcpClient) {
          logger.info('[MCP-GeminiThinking] Closing MCP client on SIGINT');
          // On exit, we can't await promises, so we just call the method directly
          try {
            // Just attempt to close - we can't await in exit handler
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-GeminiThinking] Error closing client on SIGINT', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      process.on('SIGTERM', () => {
        if (mcpClient) {
          logger.info('[MCP-GeminiThinking] Closing MCP client on SIGTERM');
          // On exit, we can't await promises, so we just call the method directly
          try {
            // Just attempt to close - we can't await in exit handler
            mcpClient.close();
          } catch (e) {
            logger.error('[MCP-GeminiThinking] Error closing client on SIGTERM', { error: e });
          }
          mcpClient = null;
          process.exit(0);
        }
      });

      cleanupHandlersRegistered = true;
    }

    logger.info('[MCP-GeminiThinking] MCP client initialized successfully');
    return mcpClient;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during MCP client initialization';
    logger.error('[MCP-GeminiThinking] Failed to initialize MCP client', { errorMessage });
    throw new Error(`MCP Client Initialization Failed: ${errorMessage}`);
  }
}

/**
 * Convert tool parameters to the format expected by the server
 * @param params The parameters passed to the tool
 * @returns The converted parameters in server format
 */
function convertToolParams(params: Record<string, any>): Record<string, any> {
  return {
    query: params.query,
    context: params.context || '',
    approach: params.approach || '',
    previous_thoughts: params.previousThoughts || [],
    thought: params.thought || '',
    next_thought_needed: params.nextThoughtNeeded,
    thought_number: params.thoughtNumber,
    total_thoughts: params.totalThoughts,
    is_revision: params.isRevision || false,
    revises_thought: params.revisesThought || null,
    branch_from_thought: params.branchFromThought || null,
    branch_id: params.branchId || '',
    needs_more_thoughts: params.needsMoreThoughts || false,
  };
}

/**
 * Convert MCP response to the expected format
 * @param response The response from the server
 * @returns The converted response in client format
 */
function convertMCPResponse(response: Record<string, any>): Record<string, any> {
  return {
    thought: response.thought,
    thoughtNumber: response.thought_number,
    totalThoughts: response.total_thoughts,
    nextThoughtNeeded: response.next_thought_needed,
  };
}

/**
 * Execute the tool with MCP client
 * @param toolName The name of the tool to execute
 * @param params The parameters to pass to the tool
 * @returns The response from the tool
 */
async function executeThroughMCP(toolName: string, params: Record<string, any>): Promise<Record<string, any>> {
  try {
    const client = await initializeMCPClient();
    const tools = await client.tools();
    
    logger.debug('[MCP-GeminiThinking] Available tools:', Object.keys(tools));
    
    // Check if the requested tool exists
    if (!tools[toolName]) {
      logger.error(`[MCP-GeminiThinking] Tool '${toolName}' not found in available tools`, { availableTools: Object.keys(tools) });
      throw new Error(`Tool '${toolName}' not found. Available tools: ${Object.keys(tools).join(', ')}`);
    }
    
    logger.debug(`[MCP-GeminiThinking] Calling tool '${toolName}' with params:`, params);
    
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
    
    logger.debug(`[MCP-GeminiThinking] Received response from tool '${toolName}'`, { response });
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[MCP-GeminiThinking] Error executing tool '${toolName}'`, { errorMessage });
    throw new Error(`Failed to execute '${toolName}': ${errorMessage}`);
  }
}

/**
 * Export the Gemini Thinking tool
 */
export const geminiThinkingTool: Tool = {
  description: 'Generate or process a thinking step using Gemini for complex reasoning tasks',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question or problem to analyze' },
      context: { type: 'string', description: 'Additional context information' },
      approach: { type: 'string', description: 'Suggested approach to the problem' },
      previousThoughts: { type: 'array', items: { type: 'string' }, description: 'Array of previous thoughts for context' },
      thought: { type: 'string', description: 'User\'s current thinking step (if provided, Gemini won\'t generate)' },
      nextThoughtNeeded: { type: 'boolean', description: 'Whether another thought step is needed' },
      thoughtNumber: { type: 'integer', description: 'Current thought number', minimum: 1 },
      totalThoughts: { type: 'integer', description: 'Estimated total thoughts needed', minimum: 1 },
      isRevision: { type: 'boolean', description: 'Whether this revises previous thinking' },
      revisesThought: { type: 'integer', description: 'Which thought is being reconsidered', minimum: 1 },
      branchFromThought: { type: 'integer', description: 'Branching point thought number', minimum: 1 },
      branchId: { type: 'string', description: 'Branch identifier' },
      needsMoreThoughts: { type: 'boolean', description: 'If more thoughts are needed' },
    },
    required: ['query', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts'],
  },
  execute: async (params: Record<string, any>): Promise<Record<string, any>> => {
    logger.info('[MCP-GeminiThinkingTool] Executing tool with params:', params);

    // If the user provided a thought, just return it
    if (params.thought && params.thought.trim()) {
      logger.info('[MCP-GeminiThinkingTool] Using provided thought, skipping generation');
      return {
        thought: params.thought,
        thoughtNumber: params.thoughtNumber,
        totalThoughts: params.totalThoughts,
        nextThoughtNeeded: params.nextThoughtNeeded,
      };
    }

    try {
      // Convert params before sending to MCP
      const convertedParams = convertToolParams(params);
      logger.debug('[MCP-GeminiThinkingTool] Converted params:', convertedParams);
      
      // Call the gemini_thinking tool
      const response = await executeThroughMCP('gemini_thinking', convertedParams);
      
      // Convert the response back to our expected format
      const result = convertMCPResponse(response);
      logger.info('[MCP-GeminiThinkingTool] Successfully generated thought');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Gemini server error';
      logger.error('[MCP-GeminiThinkingTool] Error communicating with Gemini server:', { errorMessage });
      
      // Create a new error with a specific prefix to distinguish it
      if (errorMessage.includes('Tool "gemini_thinking" not found')) {
        throw new Error(`MCP Tool Missing: ${errorMessage}`);
      } else {
        throw new Error(`Gemini Server Error: ${errorMessage}`);
      }
    }
  },
};


