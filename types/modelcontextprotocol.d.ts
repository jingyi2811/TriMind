// Declaration file for @modelcontextprotocol/sdk
declare module '@modelcontextprotocol/sdk' {
  export interface Tool {
    description: string;
    parameters: any;
    execute: (params: any) => Promise<any>;
  }

  export interface MCPClient {
    tools: () => Promise<Record<string, Tool>>;
    close: () => Promise<void>;
    // Add other properties as needed
  }

  export interface GenesysHTTPClient {
    // Define the interface as needed
  }

  export interface Session {
    // Define the interface as needed
  }

  export function createClient(options: any): any;
}
