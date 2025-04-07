import { createLogger, format, transports } from 'winston';
import crypto from 'crypto';
import { GoogleGenerativeAI } from "@google/generative-ai"; // Import the SDK

// Basic logger (reuse or enhance your existing logger setup)
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [new transports.Console()],
});

interface GeminiThinkingParams {
    query: string;
    context?: string;
    approach?: string;
    previousThoughts?: string[];
    thought?: string; // User provided thought - we won't generate if this exists
    nextThoughtNeeded: boolean;
    thoughtNumber: number;
    totalThoughts: number;
    isRevision?: boolean;
    revisesThought?: number;
    branchFromThought?: number;
    branchId?: string;
    needsMoreThoughts?: boolean;
    // Session parameters are handled by the caller in this integrated version
}

interface GeminiThinkingResult {
    thought: string;
    thoughtNumber: number;
    totalThoughts: number;
    nextThoughtNeeded: boolean;
    // Add other result fields if necessary
}

// Get the Google API Key
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Initialize the SDK client outside the execute function for potential reuse
// Check if the API key exists
if (!GOOGLE_API_KEY) {
    logger.error('[MCP-GeminiThinkingTool] FATAL: Google API key not found. Set GOOGLE_API_KEY environment variable.');
    // Depending on the application structure, you might want to throw an error here
    // or handle it in a way that prevents the tool from being executed without a key.
}

// We initialize the client inside execute for now, as API key check is crucial
// If this becomes a performance bottleneck, consider initializing once outside.

export const geminiThinkingTool: any = {
    name: "gemini_thinking", // Consistent naming convention
    description: `A detailed tool for dynamic and reflective problem-solving through Gemini AI. Uses the @google/generative-ai SDK.`, // Updated description
    // Use the schema defined in new-mcp/index.ts, omitting session commands
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The question or problem to analyze" },
        context: { type: "string", description: "Additional context information" },
        approach: { type: "string", description: "Suggested approach to the problem" },
        previousThoughts: { type: "array", items: { type: "string" }, description: "Array of previous thoughts for context" },
        thought: { type: "string", description: "User's current thinking step (if provided, Gemini won't generate)" },
        nextThoughtNeeded: { type: "boolean", description: "Whether another thought step is needed" },
        thoughtNumber: { type: "integer", description: "Current thought number", minimum: 1 },
        totalThoughts: { type: "integer", description: "Estimated total thoughts needed", minimum: 1 },
        isRevision: { type: "boolean", description: "Whether this revises previous thinking" },
        revisesThought: { type: "integer", description: "Which thought is being reconsidered", minimum: 1 },
        branchFromThought: { type: "integer", description: "Branching point thought number", minimum: 1 },
        branchId: { type: "string", description: "Branch identifier" },
        needsMoreThoughts: { type: "boolean", description: "If more thoughts are needed" }
        // Removed session properties
      },
      required: ["query", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
    },
    execute: async (params: GeminiThinkingParams): Promise<GeminiThinkingResult> => {
        logger.info('[MCP-GeminiThinkingTool] Executing tool with params:', params);

        if (!GOOGLE_API_KEY) {
            logger.error('[MCP-GeminiThinkingTool] Cannot execute: GOOGLE_API_KEY is not set.');
            throw new Error('Google API Key is missing in the environment.');
        }

        // If the user provided a thought, just return it (or process/store it as needed)
        // For now, we assume if `thought` is present, Gemini generation is skipped.
        if (params.thought && params.thought.trim() !== "") {
            logger.info('[MCP-GeminiThinkingTool] User provided thought, skipping Gemini generation.');
            // Return the provided thought structure, potentially adding other necessary fields
            return {
                 thought: params.thought,
                 thoughtNumber: params.thoughtNumber,
                 totalThoughts: params.totalThoughts,
                 nextThoughtNeeded: params.nextThoughtNeeded,
                 // Include other params if the calling function expects them
            };
        }

        // Initialize Gemini Client and Model
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        const modelName = "gemini-1.5-flash-latest"; // Or use "gemini-2.0-flash-thinking-exp-01-21" if preferred
        const model = genAI.getGenerativeModel({ model: modelName });
        logger.info(`[MCP-GeminiThinkingTool] Using Gemini model: ${modelName}`);

        // Construct the prompt for Gemini based on input parameters
        let prompt = `Query: ${params.query}\n`;
        if (params.context) prompt += `Context: ${params.context}\n`;
        if (params.approach) prompt += `Approach: ${params.approach}\n`;
        if (params.previousThoughts && params.previousThoughts.length > 0) {
            prompt += `Previous thoughts:\n${params.previousThoughts.join('\n')}\n`;
        }
        prompt += `\nGenerate thought #${params.thoughtNumber} of ${params.totalThoughts}`;
        if (params.isRevision) prompt += ` (revising thought #${params.revisesThought})`;
        if (params.branchFromThought) prompt += ` (branching from thought #${params.branchFromThought})`;
        prompt += `\nRemember: Provide only analytical thinking.`; // Simplified instruction

        logger.debug(`[MCP-GeminiThinkingTool] Constructed Prompt:\n${prompt}`);

        // Configure generation parameters (optional, use defaults or customize)
        const generationConfig = {
            temperature: 0.7,
            maxOutputTokens: 1024,
            // topP: 0.8, // Example additional params
            // topK: 40,  // Example additional params
        };

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig,
            });

            const response = result.response;
            const generatedText = response.text();

            logger.info('[MCP-GeminiThinkingTool] Successfully received response from Gemini SDK.');
            logger.debug(`[MCP-GeminiThinkingTool] Gemini Raw Response Text: ${generatedText}`);

            // Simple return structure, adjust as needed based on how the caller uses the result
            return {
                thought: generatedText.trim(),
                thoughtNumber: params.thoughtNumber,
                totalThoughts: params.totalThoughts,
                nextThoughtNeeded: params.nextThoughtNeeded, // Pass this through
                 // Add meta-parsing here if needed, similar to new-mcp/index.ts
                 // e.g., metaComments, confidenceLevel, alternativePaths
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown Gemini SDK error';
            logger.error('[MCP-GeminiThinkingTool] Error calling Gemini SDK:', { error: errorMessage, originalError: error });
            // Rethrow a structured error
            throw new Error(`Gemini SDK Error: ${errorMessage}`);
        }
    },
};
