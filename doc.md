# OpenManus TypeScript Agent System

**Technical Architecture & Implementation Plan**

## Table of Contents

1. [System Architecture](#1-system-architecture)
    - [High-Level Overview](#high-level-overview)
    - [Component Breakdown](#component-breakdown)
    - [Data Flow](#data-flow)
    - [Technology Stack](#technology-stack)

2. [User Flow](#2-user-flow)
    - [Interaction Lifecycle](#interaction-lifecycle)
    - [UI Components](#ui-components)
    - [Session Management](#session-management)
    - [Error Handling](#error-handling)

3. [Agent Sequence](#3-agent-sequence)
    - [Initialization Sequence](#initialization-sequence)
    - [Processing Sequence](#processing-sequence)
    - [Streaming Sequence](#streaming-sequence)
    - [Tool Execution Sequence](#tool-execution-sequence)

4. [Implementation Roadmap](#4-implementation-roadmap)
    - [Phase 1: Core Framework](#phase-1-core-framework)
    - [Phase 2: Tool Integration](#phase-2-tool-integration)
    - [Phase 3: Specialized Agents](#phase-3-specialized-agents)
    - [Phase 4: Frontend & API](#phase-4-frontend--api)
    - [Phase 5: Testing & Refinement](#phase-5-testing--refinement)

5. [Technical Specifications](#5-technical-specifications)
    - [Interface Definitions](#interface-definitions)
    - [API Specifications](#api-specifications)
    - [Performance Requirements](#performance-requirements)
    - [Security Considerations](#security-considerations)

## 1. System Architecture

### High-Level Overview

The OpenManus TypeScript Agent System is designed as a modular, extensible framework for building AI agents that can perform complex tasks through reasoning and tool execution. The system leverages Model Context Protocol (MCP) for standardized tool calling and the Vercel AI SDK for frontend integration.

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Browser                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Next.js Frontend                    │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │    │
│  │  │ Chat UI   │  │ Message   │  │ Tool Result   │    │    │
│  │  │ Component │  │ History   │  │ Visualization │    │    │
│  │  └───────────┘  └───────────┘  └───────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Next.js Server                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    API Routes                        │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │    │
│  │  │ /api/chat │  │ /api/tools│  │ /api/sessions │    │    │
│  │  └───────────┘  └───────────┘  └───────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                             │                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Agent System                       │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │    │
│  │  │ BaseAgent │→ │ ReActAgent│→ │ ToolCallAgent │    │    │
│  │  └───────────┘  └───────────┘  └───────────────┘    │    │
│  │        ↓                               ↓            │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │    │
│  │  │ Memory    │  │ EventEmitter│ │ StreamManager │    │    │
│  │  └───────────┘  └───────────┘  └───────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      External Services                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐     │
│  │ LLM API    │  │ MCP Server │  │ Tool-specific APIs │     │
│  │ (OpenAI)   │  │ (Tool Host)│  │ (Browser, DB, etc) │     │
│  └────────────┘  └────────────┘  └────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

1. **Frontend Layer**
    - **Chat UI Component**: Handles user input and message display
    - **Message History**: Manages conversation state
    - **Tool Result Visualization**: Renders tool outputs (images, formatted data)
    - **Stream Processing**: Processes streamed chunks from backend

2. **API Routes Layer**
    - **/api/chat**: Primary endpoint for chat interactions
    - **/api/tools**: Direct access to individual tools
    - **/api/sessions**: Session management endpoints

3. **Agent System Layer**
    - **BaseAgent**: Core agent capabilities and state management
    - **ReActAgent**: Reasoning and acting cycle implementation
    - **ToolCallAgent**: Tool orchestration with MCP
    - **Specialized Agents**:
        - **BrowserAgent**: Web browsing capabilities
        - **PlanningAgent**: Task planning and execution
        - **ManusAgent**: Top-level orchestration

4. **Support Systems**
    - **Memory**: Agent memory and conversation history
    - **EventEmitter**: Event-based communication
    - **StreamManager**: Streaming response handling

5. **External Services**
    - **LLM API**: Language model provider (OpenAI, etc.)
    - **MCP Server**: Model Context Protocol implementation
    - **Tool-specific APIs**: External services for tool execution

### Data Flow

1. **Request Flow**
    - User input → Frontend → API Routes → Agent System → External Services
    - Agent thinking → Tool selection → Tool execution → Result processing

2. **Response Flow**
    - External Services → Agent System → StreamManager → API Routes → Frontend
    - Each step generates streaming updates to the UI

3. **State Management**
    - Session state maintained via cookies or JWT
    - Agent memory persisted across requests
    - User preferences stored in session

### Technology Stack

1. **Frontend**
    - Next.js 14+
    - Vercel AI SDK
    - React 18+
    - TailwindCSS
    - TypeScript 5+

2. **Backend**
    - Node.js 18+
    - TypeScript 5+
    - Next.js API Routes
    - Web Streams API

3. **External Services**
    - OpenAI API (or alternative LLM)
    - Model Context Protocol implementation
    - MongoDB/PostgreSQL for persistence
    - Redis for caching (optional)

4. **Deployment**
    - Vercel for Next.js
    - Docker for MCP server
    - AWS/GCP/Azure for additional services

## 2. User Flow

### Interaction Lifecycle

The typical user interaction follows this lifecycle:

```
1. User submits query or request via chat interface
2. System acknowledges and begins processing
3. Agent analyzes request and determines approach
4. Agent starts thinking process (streamed to user)
5. Tool selection and execution occurs (streamed)
6. Results are processed and analyzed (streamed)
7. Final response is presented (streamed)
8. System awaits next user input
```

Specific user flows include:

#### Information Request Flow
```
User: "What is the capital of France?"
1. ManusAgent analyzes query as information request
2. Direct response without tool use: "The capital of France is Paris."
```

#### Web Information Flow
```
User: "Find recent news about SpaceX"
1. ManusAgent detects web search need
2. BrowserAgent activated
3. Search tool executed (streamed)
4. Results analyzed (streamed)
5. Summary presented with sources (streamed)
```

#### Complex Task Flow
```
User: "Help me plan my vacation to Japan"
1. ManusAgent detects complex planning task
2. PlanningAgent activated
3. Task broken into subtasks (streamed)
4. Each subtask executed with appropriate tools (streamed)
5. Comprehensive plan presented (streamed)
```

### UI Components

1. **Chat Interface**
    - Message input field
    - Send button
    - Message history display
    - Typing indicators
    - Tool execution visualization

2. **Message Types**
    - User messages (right-aligned)
    - Agent messages (left-aligned)
    - System messages (centered)
    - Tool execution messages (special formatting)
    - Error messages (special formatting)

3. **Tool Result Visualization**
    - Images (screenshots, diagrams)
    - Formatted data (tables, JSON)
    - Code blocks (syntax highlighting)
    - Links (clickable)

4. **Status Indicators**
    - Thinking indicator
    - Tool execution indicator
    - Error indicator
    - Completion indicator

### Session Management

1. **Session Initialization**
    - New user receives unique session ID
    - Session stored in cookie or local storage
    - Initial system message displayed

2. **Session Persistence**
    - Conversation history saved with session
    - Agent memory maintained between requests
    - User preferences stored in session

3. **Session Recovery**
    - Automatic session restoration on page reload
    - Option to start new conversation
    - Access to past conversations (premium feature)

### Error Handling

1. **User-Facing Errors**
    - Input validation errors
    - Connection errors
    - Tool execution errors

2. **Recovery Mechanisms**
    - Automatic retry for transient errors
    - Graceful degradation for unavailable tools
    - Clear error messages with next steps

3. **Feedback Loop**
    - Error reporting option for users
    - Automatic error logging for analysis
    - Continuous improvement based on error patterns

## 3. Agent Sequence

### Initialization Sequence

```
┌───────────┐      ┌──────────────┐      ┌────────────┐
│  Frontend │      │  API Routes  │      │   Agent    │
└─────┬─────┘      └──────┬───────┘      └──────┬─────┘
      │                   │                     │
      │ User Input        │                     │
      │ ──────────►       │                     │
      │                   │ Process Request     │
      │                   │ ──────────►         │
      │                   │                     │
      │                   │                     │ 1. Check session
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │                     │ 2. Load memory
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │                     │ 3. Add user message
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │                     │ 4. Initialize stream
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │ Return stream       │
      │                   │ ◄──────────         │
      │                   │                     │
      │ Begin streaming   │                     │
      │ ◄──────────       │                     │
```

### Processing Sequence

```
┌───────────┐      ┌──────────────┐      ┌────────────┐      ┌────────────┐      ┌────────┐
│  Frontend │      │  API Routes  │      │   Agent    │      │    MCP     │      │  LLM   │
└─────┬─────┘      └──────┬───────┘      └──────┬─────┘      └──────┬─────┘      └────┬───┘
      │                   │                     │                   │                  │
      │                   │                     │ 1. Task analysis  │                  │
      │                   │                     │ ──────────────►   │                  │
      │                   │                     │                   │                  │
      │                   │                     │                   │ Call LLM         │
      │                   │                     │                   │ ──────────────► │
      │                   │                     │                   │                  │
      │                   │                     │                   │ ◄─────────────  │
      │                   │                     │                   │                  │
      │                   │                     │ ◄──────────────   │                  │
      │                   │                     │                   │                  │
      │ Stream: "Analyzing your request..."     │                   │                  │
      │ ◄───────────────────────────────────────┤                   │                  │
      │                   │                     │                   │                  │
      │                   │                     │ 2. Agent selection│                  │
      │                   │                     │ ──────────┐       │                  │
      │                   │                     │           │       │                  │
      │                   │                     │ ◄─────────┘       │                  │
      │                   │                     │                   │                  │
      │ Stream: "Selected approach: [approach]" │                   │                  │
      │ ◄───────────────────────────────────────┤                   │                  │
      │                   │                     │                   │                  │
      │                   │                     │ 3. Think phase    │                  │
      │                   │                     │ ──────────────►   │                  │
      │                   │                     │                   │                  │
      │                   │                     │                   │ Call LLM         │
      │                   │                     │                   │ ──────────────► │
      │                   │                     │                   │                  │
      │                   │                     │                   │ ◄─────────────  │
      │                   │                     │                   │                  │
      │                   │                     │ ◄──────────────   │                  │
      │                   │                     │                   │                  │
      │ Stream: "Thinking: [reasoning]"         │                   │                  │
      │ ◄───────────────────────────────────────┤                   │                  │
```

### Streaming Sequence

```
┌───────────┐      ┌──────────────┐      ┌────────────┐
│  Frontend │      │  API Routes  │      │   Agent    │
└─────┬─────┘      └──────┬───────┘      └──────┬─────┘
      │                   │                     │
      │                   │                     │ 1. Emit progress event
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │ 2. Format chunk     │
      │                   │ ◄─────────────────  │
      │                   │                     │
      │                   │ 3. Push to stream   │
      │                   │ ──────────┐         │
      │                   │           │         │
      │                   │ ◄─────────┘         │
      │                   │                     │
      │ 4. Receive chunk  │                     │
      │ ◄──────────       │                     │
      │                   │                     │
      │ 5. Update UI      │                     │
      │ ──────────┐       │                     │
      │           │       │                     │
      │ ◄─────────┘       │                     │
      │                   │                     │
      │                   │                     │ 6. Continue processing
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │                     │ 7. Emit next event
      │                   │                     │ ──────────┐
      │                   │                     │           │
      │                   │                     │ ◄─────────┘
      │                   │                     │
      │                   │ 8. Format chunk     │
      │                   │ ◄─────────────────  │
      │                   │                     │
      │                   │ 9. Push to stream   │
      │                   │ ──────────┐         │
      │                   │           │         │
      │                   │ ◄─────────┘         │
      │                   │                     │
      │ 10. Receive chunk │                     │
      │ ◄──────────       │                     │
      │                   │                     │
      │ 11. Update UI     │                     │
      │ ──────────┐       │                     │
      │           │       │                     │
      │ ◄─────────┘       │                     │
```

### Tool Execution Sequence

```
┌───────────┐    ┌──────────────┐    ┌────────────┐    ┌────────────┐    ┌───────────┐
│  Frontend │    │  API Routes  │    │   Agent    │    │    MCP     │    │   Tool    │
└─────┬─────┘    └──────┬───────┘    └──────┬─────┘    └──────┬─────┘    └─────┬─────┘
      │                 │                   │                 │                 │
      │                 │                   │ 1. Tool selection                 │
      │                 │                   │ ──────────┐     │                 │
      │                 │                   │           │     │                 │
      │                 │                   │ ◄─────────┘     │                 │
      │                 │                   │                 │                 │
      │ Stream: "Using tool: [tool]"        │                 │                 │
      │ ◄─────────────────────────────────────────────────────┤                 │
      │                 │                   │                 │                 │
      │                 │                   │ 2. Prepare args │                 │
      │                 │                   │ ──────────┐     │                 │
      │                 │                   │           │     │                 │
      │                 │                   │ ◄─────────┘     │                 │
      │                 │                   │                 │                 │
      │ Stream: "With parameters: [params]" │                 │                 │
      │ ◄─────────────────────────────────────────────────────┤                 │
      │                 │                   │                 │                 │
      │                 │                   │ 3. Execute tool │                 │
      │                 │                   │ ────────────────────────────────► │
      │                 │                   │                 │                 │
      │ Stream: "Tool processing..."        │                 │                 │
      │ ◄─────────────────────────────────────────────────────┤                 │
      │                 │                   │                 │                 │
      │                 │                   │                 │ Call Tool        │
      │                 │                   │                 │ ──────────────► │
      │                 │                   │                 │                 │
      │                 │                   │                 │ ◄─────────────  │
      │                 │                   │                 │                 │
      │                 │                   │ ◄───────────────┤                 │
      │                 │                   │                 │                 │
      │ Stream: "Tool result: [result]"     │                 │                 │
      │ ◄─────────────────────────────────────────────────────┤                 │
      │                 │                   │                 │                 │
      │                 │                   │ 4. Process result                 │
      │                 │                   │ ──────────┐     │                 │
      │                 │                   │           │     │                 │
      │                 │                   │ ◄─────────┘     │                 │
      │                 │                   │                 │                 │
      │ Stream: "Based on the results..."   │                 │                 │
      │ ◄─────────────────────────────────────────────────────┤                 │
```

## 4. Implementation Roadmap

### Phase 1: Core Framework (Weeks 1-2)

**Week 1: Core Infrastructure**

1. **Setup Project Structure**
    - Initialize monorepo with pnpm workspaces
    - Configure TypeScript, ESLint, Prettier
    - Set up CI/CD pipeline

2. **Define Core Interfaces**
    - Agent interfaces
    - Memory interfaces
    - Message structures
    - Event system interfaces

3. **Implement Base Classes**
    - BaseAgent
    - Memory implementation
    - EventEmitter integration
    - Stream utilities

**Week 2: Basic Agent Implementation**

1. **Implement ReActAgent**
    - Think/Act cycle
    - State management
    - Error handling

2. **LLM Integration**
    - Provider abstraction layer
    - Request/response formats
    - Streaming support

3. **Testing Infrastructure**
    - Unit tests for core components
    - Mock implementations for testing
    - Integration test framework

### Phase 2: Tool Integration (Weeks 3-4)

**Week 3: MCP Integration**

1. **MCP Client Implementation**
    - Protocol client
    - Tool registration
    - Tool execution

2. **ToolCallAgent Implementation**
    - Tool selection logic
    - Tool result processing
    - Tool error handling

3. **Basic Tool Set**
    - Simple utility tools
    - Web search tool
    - Calculator tool

**Week 4: Advanced Tools**

1. **Browser Automation Tools**
    - Page navigation
    - Element interaction
    - Content extraction

2. **File Operation Tools**
    - Read/write operations
    - Directory management
    - File parsing

3. **External API Tools**
    - Weather API
    - Mapping services
    - Data analysis

### Phase 3: Specialized Agents (Weeks 5-6)

**Week 5: Agent Extensions**

1. **BrowserAgent Implementation**
    - Browser state management
    - Navigation workflows
    - Screenshot handling

2. **PlanningAgent Implementation**
    - Planning strategies
    - Step management
    - Progress tracking

3. **Testing & Validation**
    - End-to-end agent tests
    - Performance benchmarks
    - Error recovery testing

**Week 6: Manus Agent**

1. **ManusAgent Implementation**
    - Agent orchestration
    - Task classification
    - Context management

2. **Agent Selection Logic**
    - Task analysis
    - Agent routing
    - Fallback mechanisms

3. **Advanced Features**
    - Multi-agent collaboration
    - Long-running task support
    - Continuations

### Phase 4: Frontend & API (Weeks 7-8)

**Week 7: Next.js Integration**

1. **Next.js Project Setup**
    - Project configuration
    - Vercel AI SDK integration
    - TailwindCSS setup

2. **API Routes Implementation**
    - /api/chat route
    - /api/tools routes
    - /api/sessions routes

3. **Session Management**
    - Cookie-based sessions
    - Memory persistence
    - User preferences

**Week 8: UI Components**

1. **Chat Interface**
    - Message display
    - Input handling
    - Loading states

2. **Real-time Streaming**
    - Chunk processing
    - UI updates
    - Error handling

3. **Tool Visualization**
    - Image display
    - Data formatting
    - Code highlighting

### Phase 5: Testing & Refinement (Weeks 9-10)

**Week 9: System Testing**

1. **End-to-End Testing**
    - Complete user flows
    - Edge cases
    - Performance testing

2. **Stress Testing**
    - Concurrent users
    - Long conversations
    - Large data handling

3. **Security Audit**
    - Input validation
    - Authentication
    - Authorization

**Week 10: Optimization & Documentation**

1. **Performance Optimization**
    - Response time improvements
    - Memory usage optimization
    - Caching strategies

2. **Documentation**
    - API documentation
    - Architecture documentation
    - Developer guides

3. **Deployment Preparation**
    - Deployment scripts
    - Environment configurations
    - Monitoring setup

## 5. Technical Specifications

### Interface Definitions

#### Agent Interfaces

```typescript
interface Agent {
  name: string;
  description?: string;
  state: AgentState;
  memory: Memory;
  
  process(input: string): Promise<AsyncIterable<string>>;
  run(input: string): Promise<string>;
  importMessages(messages: Message[]): void;
}

interface ReActAgent extends Agent {
  think(): Promise<boolean>;
  act(): Promise<string>;
}

interface ToolCallAgent extends ReActAgent {
  tools: Map<string, Tool>;
  executeToolCall(toolCall: ToolCall): Promise<string>;
}
```

#### Memory Interface

```typescript
interface Memory {
  messages: Message[];
  addMessage(message: Message): void;
  addUserMessage(content: string, base64Image?: string): void;
  addAssistantMessage(content: string): void;
  addSystemMessage(content: string): void;
  addToolMessage(params: ToolMessageParams): void;
  getMessages(): Message[];
  getLastMessage(): Message | undefined;
  clear(): void;
}
```

#### Tool Interfaces

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  supportsStreaming?: boolean;
  
  execute(args: any, progressCallback?: (progress: string) => void): Promise<any>;
  cleanup?(): Promise<void>;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

interface ToolResult {
  output: string;
  error?: string;
  base64Image?: string;
  metadata?: any;
}
```

### API Specifications

#### Chat API

```
POST /api/chat
Request:
{
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "What's the weather?"}
  ],
  "sessionId": "optional-session-id"
}

Response:
Streaming text/event-stream with chunks of the agent's response
```

#### Tools API

```
POST /api/tools/:toolName
Request:
{
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  },
  "sessionId": "optional-session-id"
}

Response:
{
  "result": "Tool execution result",
  "metadata": {
    "additionalInfo": "..."
  }
}
```

#### Sessions API

```
GET /api/sessions/:sessionId
Response:
{
  "sessionId": "abc123",
  "createdAt": "2025-03-19T11:34:56Z",
  "lastActive": "2025-03-19T11:45:12Z",
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"}
  ]
}

POST /api/sessions/new
Response:
{
  "sessionId": "new-session-id",
  "createdAt": "2025-03-19T12:00:00Z"
}

DELETE /api/sessions/:sessionId
Response:
{
  "success": true
}
```

### Performance Requirements

1. **Response Time**
    - Initial response within 300ms of user input
    - First streaming chunk within 500ms
    - Tool execution acknowledgment within 200ms

2. **Throughput**
    - Support 100 concurrent users per instance
    - Handle 50 requests per second
    - Process 1000 messages per minute

3. **Resource Utilization**
    - Memory usage below 512MB per instance
    - CPU usage below 80% under load
    - Network bandwidth below 5MB/s per instance

4. **Reliability**
    - 99.9% uptime
    - Automatic recovery from failures
    - Graceful degradation under load

### Security Considerations

1. **User Data Protection**
    - All sensitive data encrypted in transit and at rest
    - No persistent storage of conversation content without explicit consent
    - Regular data purging for inactive sessions

2. **Authentication & Authorization**
    - Secure session management
    - Rate limiting to prevent abuse
    - API key authentication for external services

3. **Input Validation**
    - Sanitization of all user inputs
    - Validation of tool arguments
    - Prevention of injection attacks

4. **External Service Security**
    - Secure API key management
    - Limited permissions for service accounts
    - Regular security audits of dependencies