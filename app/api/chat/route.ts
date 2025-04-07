import { NextRequest } from 'next/server';
import { Tool } from 'ai';
import { getMCPClient } from '../mcp/server';

// Make sure ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, and QWEN_API_KEY are in your .env.local file
export async function POST(req: NextRequest) {
    try {
        const { messages, model = 'claude' } = await req.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: 'Invalid messages format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Route to appropriate handler based on model selection
        switch (model.toLowerCase()) {
            case 'deepseek':
                return await handleDeepSeekRequest(messages);
            case 'qwen':
                return await handleQwenRequest(messages);
            case 'qwen_direct':
                return await handleQwenDirectRequest(messages);
            case 'claude':
            default:
                return await handleClaudeDirectRequest(messages);
        }

    } catch (error) {
        console.error('Error in chat route:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

/**
 * Direct API call to Qwen using OpenAI-compatible endpoint
 * Based on documentation: https://www.alibabacloud.com/help/en/model-studio/developer-reference/compatibility-of-openai-with-dashscope
 */

async function handleQwenDirectRequest(messages: Array<{text: string; sender: string}>) {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({
            reply: "API key not configured. Please set QWEN_API_KEY environment variable."
        }), { status: 500 });
    }

    try {
        // Input validation
        if (!messages?.length) {
            return new Response(JSON.stringify({ reply: "No messages provided" }), { status: 400 });
        }

        // Basic validation function without external dependencies
        const containsInappropriateLanguage = (text: string): boolean => {
            const basicProfanityList = ['badword1', 'badword2']; // Replace with actual terms if needed
            return basicProfanityList.some(word => 
                text.toLowerCase().includes(word.toLowerCase())
            );
        };
        
        const sanitizedMessages = messages.map((message: {text: string; sender: string}) => {
            // Validate message structure
            if (typeof message.text !== 'string' || !message.text.trim()) {
                throw new Error('Invalid message format: text must be a non-empty string');
            }

            // Check for sensitive information patterns
            const sensitivePatterns = [
                /\b\d{16}\b/, // Credit card numbers
                /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone numbers
                /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ // Email addresses
            ];

            sensitivePatterns.forEach(pattern => {
                if (pattern.test(message.text)) {
                    throw new Error('Input contains potential sensitive information');
                }
            });

            // Simple check for inappropriate language
            if (containsInappropriateLanguage(message.text)) {
                throw new Error('Input contains inappropriate language');
            }

            return {
                role: message.sender === 'user' ? 'user' : 'assistant',
                content: message.text
            };
        });
        
        // Add a system message to improve response quality
        const messagesWithSystem = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            ...sanitizedMessages
        ];

        // Precise timing for API call and response
        console.log('⏱️ [QWEN-DIRECT] API call starting');
        const apiCallStartTime = performance.now();
        
        // Use OpenAI-compatible endpoint as documented in Alibaba Cloud docs
        const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                // Available models: qwen-plus, qwen-max, qwen-turbo, qwen2.5-7b-instruct, etc.
                model: process.env.QWEN_MODEL || 'qwen-max',
                messages: messagesWithSystem,
                max_tokens: 4000,
                temperature: 0.7
            })
        });

        const data = await response.json();
        const apiCallEndTime = performance.now();
        const apiCallDuration = apiCallEndTime - apiCallStartTime;
        console.log(`⏱️ [QWEN-DIRECT] API call completed in ${apiCallDuration.toFixed(2)}ms`);

        if (!response.ok) {
            console.error('Qwen API Error:', data);
            const errorMessage = data?.error?.message || data?.message || 'Unknown error';
            return new Response(JSON.stringify({
                reply: `Qwen API error: ${errorMessage}. Please check your API key and configuration.`
            }), { status: response.status });
        }

        if (!data?.choices?.[0]?.message?.content) {
            console.error('Invalid Qwen API response format:', data);
            throw new Error('Invalid API response format from Qwen');
        }

        // Extract response content from the OpenAI-compatible format
        return new Response(JSON.stringify({ reply: data.choices[0].message.content }));

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Qwen Direct API Error:', errorMessage);
        return new Response(JSON.stringify({
            reply: `Error with Qwen Direct API: ${errorMessage}`
        }), { status: 500 });
    }
}

/**
 * Direct API call to Claude (original implementation)
 */
async function handleClaudeDirectRequest(messages: any[]) {
    try {
        console.log('Claude Direct API request started at:', new Date().toISOString());
        const startTime = performance.now();
        
        // First, extract just the content for Claude's API format
        const formattedMessages = messages.map(message => ({
            role: message.sender === 'user' ? 'user' : 'assistant',
            content: message.text
        }));

        // For simplicity, let's not stream but get a complete response
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY || '',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                messages: formattedMessages,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Claude API error:', errorData);
            throw new Error('Failed to get response from Claude');
        }

        const data = await response.json();
        
        const endTime = performance.now();
        console.log('Claude Direct API request completed at:', new Date().toISOString());
        console.log(`Claude Direct API total response time: ${(endTime - startTime).toFixed(2)}ms`);

        return new Response(JSON.stringify({ reply: data.content[0].text }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in Claude Direct API handler:', error);
        throw error;
    }
}

/**
 * MCP implementation with tool support for Claude
 */
async function handleClaudeMCPRequest(messages: any[], mcpClient: any) {
    // Start timing for the MCP request processing
    const mcpStartTime = performance.now();
    console.log('handleClaudeMCPRequest processing started at:', new Date().toISOString());
    
    // Initialize MCP client
    if (!mcpClient || !mcpClient.claude) {
        throw new Error('Claude MCP client not initialized');
    }

    // Format messages for Claude API
    const formattedMessages = messages.map(message => ({
        role: message.sender === 'user' ? 'user' : 'assistant',
        content: message.text
    }));

    // Get all MCP tools
    const allTools = await mcpClient.tools();

    // Get the system message that describes available tools
    const systemMessage = {
        role: 'system',
        content: `You have access to the following tools to help users:
        - read_file: Read content from files in the data directory
        - write_file: Write content to files in the data directory
        - fetch_data: Make HTTP requests to external APIs
        - echo: Simple echo functionality
        
        When a user asks you to access a file or make a web request, USE THESE TOOLS to fulfill their request.
        DO NOT say you can't access files or make web requests.`
    };

    // Add system message to beginning of conversation
    const messagesWithSystem = [systemMessage, ...formattedMessages];

    // Get required tools
    const toolDefinitions = [
        allTools['read_file'],
        allTools['write_file'],
        allTools['fetch_data'],
        allTools['echo']
    ].filter(Boolean); // Filter out any undefined tools

    // Prepare tool parameters for Claude
    const toolNames = ['read_file', 'write_file', 'fetch_data', 'echo'];
    const toolParams = toolDefinitions.map((tool, index) => ({
        name: toolNames[index], // Use predefined names that match the system message
        description: 'description' in tool ? (tool as any).description : '',
        parameters: (tool as any).parameters || {}
    }));

    // Now get the Claude completion tool
    const claudeChatTool = allTools['claude_chat_completion'];

    if (!claudeChatTool) {
        throw new Error('Claude chat completion tool not found');
    }

    // Execute with tool definitions
    console.log('Claude MCP initial execution started at:', new Date().toISOString());
    const executeStartTime = performance.now();
    
    const result = await (claudeChatTool as unknown as {
        execute: (params: any) => Promise<any>;
    }).execute({
        model: 'claude-3-sonnet-20240229',
        messages: messagesWithSystem,
        max_tokens: 4000,
        temperature: 0.7,
        tools: toolParams, // Include tool definitions
        tool_choice: 'auto' // Let the model decide when to use tools
    });
    
    const executeEndTime = performance.now();
    console.log('Claude MCP initial execution completed at:', new Date().toISOString());
    console.log(`Claude MCP initial execution time: ${(executeEndTime - executeStartTime).toFixed(2)}ms`);

    // Handle tool execution if needed
    let finalResponse = result;

    // If the model wants to use a tool
    if (typeof result === 'object' && result.tool_calls && result.tool_calls.length > 0) {
        console.log('Claude MCP tool execution started at:', new Date().toISOString());
        console.log(`Number of tool calls: ${result.tool_calls.length}`);
        const toolStartTime = performance.now();
        
        // Process each tool call
        const toolResults = await Promise.all(result.tool_calls.map(async (toolCall: any) => {
            const toolName = toolCall.name || toolCall.function?.name;
            const toolArgs = toolCall.arguments || toolCall.function?.arguments;

            // Parse arguments if they're in string format
            const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;

            console.log(`Executing tool: ${toolName} with args:`, args);

            try {
                // Find and execute the tool
                const tool = allTools[toolName];
                if (!tool) throw new Error(`Tool ${toolName} not found`);

                const toolResult = await (tool as any).execute(args);
                return { toolName, result: toolResult };
            } catch (toolError: unknown) {
                const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown error';
                console.error(`Error executing tool ${toolName}:`, errorMessage);
                return {
                    toolName,
                    result: `Error executing ${toolName}: ${errorMessage}`
                };
            }
        }));

        const toolEndTime = performance.now();
        console.log('Claude MCP tool execution completed at:', new Date().toISOString());
        console.log(`Claude MCP tool execution time: ${(toolEndTime - toolStartTime).toFixed(2)}ms`);
        
        // Add tool results to messages
        const toolResultMessages = toolResults.map(tr => ({
            role: 'function' as const,
            name: tr.toolName,
            content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
        }));

        // Get a final response from the model with the tool results
        console.log('Claude MCP final execution started at:', new Date().toISOString());
        const finalStartTime = performance.now();
        
        const finalResult = await (claudeChatTool as unknown as {
            execute: (params: any) => Promise<any>;
        }).execute({
            model: 'claude-3-sonnet-20240229',
            messages: [...messagesWithSystem, ...toolResultMessages],
            max_tokens: 4000,
            temperature: 0.7
        });
        
        const finalEndTime = performance.now();
        console.log('Claude MCP final execution completed at:', new Date().toISOString());
        console.log(`Claude MCP final execution time: ${(finalEndTime - finalStartTime).toFixed(2)}ms`);

        finalResponse = finalResult;
    }

    // Get the text content from the result
    const responseText = typeof finalResponse === 'string'
        ? finalResponse
        : (finalResponse.content || JSON.stringify(finalResponse));

    // End timing for MCP request processing
    const mcpEndTime = performance.now();
    console.log('handleClaudeMCPRequest processing completed at:', new Date().toISOString());
    console.log(`handleClaudeMCPRequest processing time: ${(mcpEndTime - mcpStartTime).toFixed(2)}ms`);

    return new Response(JSON.stringify({ reply: responseText }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Handle request using DeepSeek via MCP
 */
async function handleDeepSeekRequest(messages: any[]) {
    try {
        // Initialize MCP client
        const mcpClient = await getMCPClient();

        if (!mcpClient || !mcpClient.deepseek) {
            throw new Error('DeepSeek MCP client not initialized');
        }

        // Format messages for DeepSeek API
        const formattedMessages = messages.map(message => ({
            role: message.sender === 'user' ? 'user' : 'assistant',
            content: message.text
        }));

        // Get all MCP tools
        const allTools = await mcpClient.tools();

        // Get the system message that describes available tools
        const systemMessage = {
            role: 'system',
            content: `You have access to the following tools to help users:
            - read_file: Read content from files in the data directory
            - write_file: Write content to files in the data directory
            - fetch_data: Make HTTP requests to external APIs
            - echo: Simple echo functionality
            
            When a user asks you to access a file or make a web request, USE THESE TOOLS to fulfill their request.
            DO NOT say you can't access files or make web requests.`
        };

        // Add system message to beginning of conversation
        const messagesWithSystem = [systemMessage, ...formattedMessages];

        // Get required tools
        const toolDefinitions = [
            allTools['read_file'],
            allTools['write_file'],
            allTools['fetch_data'],
            allTools['echo']
        ].filter(Boolean); // Filter out any undefined tools

        // Prepare tool parameters for DeepSeek
        const toolParams = toolDefinitions.map(tool => ({
            name: 'name' in tool ? (tool as any).name : 'unknown_tool',
            description: 'description' in tool ? (tool as any).description : '',
            parameters: (tool as any).parameters || {}
        }));

        // Now get the DeepSeek completion tool
        const deepseekChatTool = allTools['deepseek_chat_completion'];

        if (!deepseekChatTool) {
            throw new Error('DeepSeek chat completion tool not found');
        }

        // Execute with tool definitions
        const result = await (deepseekChatTool as unknown as {
            execute: (params: any) => Promise<any>;
        }).execute({
            model: 'deepseek-chat',
            messages: messagesWithSystem,
            max_tokens: 4000,
            temperature: 0.7,
            tools: toolParams, // Include tool definitions
            tool_choice: 'auto' // Let the model decide when to use tools
        });

        // Handle tool execution if needed
        let finalResponse = result;

        // If the model wants to use a tool
        if (typeof result === 'object' && result.tool_calls && result.tool_calls.length > 0) {
            // Process each tool call
            const toolResults = await Promise.all(result.tool_calls.map(async (toolCall: any) => {
                const toolName = toolCall.name || toolCall.function?.name;
                const toolArgs = toolCall.arguments || toolCall.function?.arguments;

                // Parse arguments if they're in string format
                const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;

                console.log(`Executing tool: ${toolName} with args:`, args);

                try {
                    // Find and execute the tool
                    const tool = allTools[toolName];
                    if (!tool) throw new Error(`Tool ${toolName} not found`);

                    const toolResult = await (tool as any).execute(args);
                    return { toolName, result: toolResult };
                } catch (toolError: unknown) {
                    const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown error';
                    console.error(`Error executing tool ${toolName}:`, errorMessage);
                    return {
                        toolName,
                        result: `Error executing ${toolName}: ${errorMessage}`
                    };
                }
            }));

            // Add tool results to messages
            const toolResultMessages = toolResults.map(tr => ({
                role: 'function' as const,
                name: tr.toolName,
                content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
            }));

            // Get a final response from the model with the tool results
            const finalResult = await (deepseekChatTool as unknown as {
                execute: (params: any) => Promise<any>;
            }).execute({
                model: 'deepseek-chat',
                messages: [...messagesWithSystem, ...toolResultMessages],
                max_tokens: 4000,
                temperature: 0.7
            });

            finalResponse = finalResult;
        }

        // Get the text content from the result
        const responseText = typeof finalResponse === 'string'
            ? finalResponse
            : (finalResponse.content || JSON.stringify(finalResponse));

        return new Response(JSON.stringify({ reply: responseText }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('DeepSeek MCP error:', error);
        throw error; // Will be caught by the main try/catch block
    }
}

/**
 * Handle request using Qwen via MCP
 */
async function handleQwenRequest(messages: any[]) {
    try {
        // Initialize MCP client
        const mcpClient = await getMCPClient();

        if (!mcpClient || !mcpClient.qwen) {
            throw new Error('Qwen MCP client not initialized');
        }

        // Format messages for Qwen API
        const formattedMessages = messages.map(message => ({
            role: message.sender === 'user' ? 'user' : 'assistant',
            content: message.text
        }));

        // Get all MCP tools
        const allTools = await mcpClient.tools();

        // Get the system message that describes available tools
        const systemMessage = {
            role: 'system',
            content: `You have access to the following tools to help users:
            - read_file: Read content from files in the data directory
            - write_file: Write content to files in the data directory
            - fetch_data: Make HTTP requests to external APIs
            - echo: Simple echo functionality
            
            When a user asks you to access a file or make a web request, USE THESE TOOLS to fulfill their request.
            DO NOT say you can't access files or make web requests.`
        };

        // Add system message to beginning of conversation
        const messagesWithSystem = [systemMessage, ...formattedMessages];

        // Get required tools
        const toolDefinitions = [
            allTools['read_file'],
            allTools['write_file'],
            allTools['fetch_data'],
            allTools['echo']
        ].filter(Boolean); // Filter out any undefined tools

        // Prepare tool parameters for Qwen
        const toolParams = toolDefinitions.map(tool => ({
            name: 'name' in tool ? (tool as any).name : 'unknown_tool',
            description: 'description' in tool ? (tool as any).description : '',
            parameters: (tool as any).parameters || {}
        }));

        // Now get the Qwen completion tool
        const qwenChatTool = allTools['qwen_chat_completion'];

        if (!qwenChatTool) {
            throw new Error('Qwen chat completion tool not found');
        }

        // Precise timing for API call and response
        console.log('⏱️ [QWEN-MCP] API call starting');
        const apiCallStartTime = performance.now();
        
        // Execute with tool definitions
        const result = await (qwenChatTool as unknown as {
            execute: (params: any) => Promise<any>;
        }).execute({
            model: 'qwen-max',
            messages: messagesWithSystem,
            max_tokens: 4000,
            temperature: 0.7,
            tools: toolParams, // Include tool definitions
            tool_choice: 'auto' // Let the model decide when to use tools
        });
        
        const apiCallEndTime = performance.now();
        const apiCallDuration = apiCallEndTime - apiCallStartTime;
        console.log(`⏱️ [QWEN-MCP] API call completed in ${apiCallDuration.toFixed(2)}ms`);

        // Handle tool execution if needed
        let finalResponse = result;

        // If the model wants to use a tool
        if (typeof result === 'object' && result.tool_calls && result.tool_calls.length > 0) {
            // Process each tool call
            const toolResults = await Promise.all(result.tool_calls.map(async (toolCall: any) => {
                const toolName = toolCall.name || toolCall.function?.name;
                const toolArgs = toolCall.arguments || toolCall.function?.arguments;

                // Parse arguments if they're in string format
                const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;

                console.log(`Executing tool: ${toolName} with args:`, args);

                try {
                    // Find and execute the tool
                    const tool = allTools[toolName];
                    if (!tool) throw new Error(`Tool ${toolName} not found`);

                    const toolResult = await (tool as any).execute(args);
                    return { toolName, result: toolResult };
                } catch (toolError: unknown) {
                    const errorMessage = toolError instanceof Error ? toolError.message : 'Unknown error';
                    console.error(`Error executing tool ${toolName}:`, errorMessage);
                    return {
                        toolName,
                        result: `Error executing ${toolName}: ${errorMessage}`
                    };
                }
            }));

            // Add tool results to messages
            const toolResultMessages = toolResults.map(tr => ({
                role: 'function' as const,
                name: tr.toolName,
                content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
            }));

            // Get a final response from the model with the tool results
            console.log('⏱️ [QWEN-MCP] Second API call starting (after tool use)');
            const secondApiCallStartTime = performance.now();
            
            const finalResult = await (qwenChatTool as unknown as {
                execute: (params: any) => Promise<any>;
            }).execute({
                model: 'qwen-max',
                messages: [...messagesWithSystem, ...toolResultMessages],
                max_tokens: 4000,
                temperature: 0.7
            });
            
            const secondApiCallEndTime = performance.now();
            const secondApiCallDuration = secondApiCallEndTime - secondApiCallStartTime;
            console.log(`⏱️ [QWEN-MCP] Second API call completed in ${secondApiCallDuration.toFixed(2)}ms`);

            finalResponse = finalResult;
        }

        // Get the text content from the result
        const responseText = typeof finalResponse === 'string'
            ? finalResponse
            : (finalResponse.content || JSON.stringify(finalResponse));

        return new Response(JSON.stringify({ reply: responseText }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Qwen MCP error:', error);
        throw error; // Will be caught by the main try/catch block
    }
}


