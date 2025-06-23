/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { EventSource } from 'eventsource';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { URL } from 'url';
import { Redis } from 'ioredis';

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getMCPServerList',
      description: 'Search for MCP servers matching a user query',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The user query used for searching MCP servers',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deployMCPServer',
      description: 'Deploys a selected MCP server to an EC2 instance',
      parameters: {
        type: 'object',
        properties: {
          serverId: {
            type: 'string',
            description: 'The unique ID of the selected MCP server',
          },
          repoUrl: {
            type: 'string',
            description: 'The Git repository URL to be deployed',
          },
          environmentVariables: {
            type: 'object',
            description:
              'A map/dictionary of key-value pair required for the selected server',
            additionalProperties: { type: 'string' }, // 👈 indicates string values
          },
        },
        required: ['serverId', 'repoUrl', 'environmentVariables'],
      },
    },
  },
];

@Injectable()
export class OpenaiService {
  private readonly openai: OpenAI;
  private redis: Redis;
  private readonly mcpClients = new Map<string, MCPClient>();
  private readonly mcpServers = new Map<string, string>();

  async onModuleInit() {
    const Redis = (await import('ioredis')).default;
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  async runQuery(
    threadId: string,
    userMessage: string,
    previousMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
    const deployedServerUrl = await this.redis.get(`mcp:server:${threadId}`);
    // console.log('🚀 ~ OpenaiService ~ deployedServerUrl:', deployedServerUrl);
    let dynamicTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

    if (deployedServerUrl) {
      const mcpClient = new MCPClient({
        name: 'ai-assistant',
        version: '1.0.0',
      });
      const transport = new SSEClientTransport(
        new URL(`${deployedServerUrl}/sse`),
      );
      await mcpClient.connect(transport);
      await this.redis.set(
        `mcp:client:${threadId}`,
        JSON.stringify({ url: deployedServerUrl }),
      );

      this.mcpClients.set(threadId, mcpClient);

      const { tools: mcpTools } = await mcpClient.listTools();
      dynamicTools = mcpTools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `
          You are an AI system that is specialized in finding open-source MCP servers based on the requirements of the user. There multiple steps involved in this conversation. 
          `,
      },
      {
        role: 'assistant',
        content: `You are an AI assistant desgined to infer from conversation history, indetify the current step and handle all these taks needed to be performed for that step.
          1. User asks for suggestion of MCP server that caters to their requirements. You are already provided with a function/tool that performs an API call and fetches a list of servers and their details. Try to filter only those which are remotely capable or have docker capabilities. Return the name, description, glama.ai link and github link. 
            Save the response of the api and other details in your context. It is required in later part of the conversation. Dont make redundant calls for same search query. Dont repeat the results as well. Try to respond with new set of results;
          2. Once an user chooses a server, now make sure to get all the values of the required environment variables. This is a hard blocker before you can move to further steps because we are using this server to access the user's resources. So without all the required values, we wont be able to create a server. 
            Dont change the format and casing of the environment variables at any point. We need it as it is. Try to maintain it like a string. For example, "HOST=0.0.0.0 PORT=1234 USERNAME=abc".
          3. Once the user provides all the required values, use our EC2 to host this server. Clone the repo in a proper location in our server, identify what language/framework  it is based (mostly js/python) and install the dependencies and start the server.
          $. From then on, for any query that is particular to this server, take help of it in querying and respond back. Dont ever respond back saying to try it themselves.

          You have tools and functions to getMCPServerList and deployMCPServer and some dynamic tools and functions added too. Make the best use of them.
        `,
      },
      ...previousMessages,
      { role: 'user', content: userMessage },
    ];

    const response = await this.openai.chat.completions.create(
      {
        model: 'gpt-4o',
        messages,
        tools: [...tools, ...dynamicTools],
        tool_choice: 'auto',
        store: true,
      },
      {
        timeout: 60 * 1000,
      },
    );

    const choice = response.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const result = await this.handleToolCall(
            threadId,
            functionName,
            functionArgs,
          );

          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
        }),
      );
      const assistantResponse = await this.openai.chat.completions.create(
        {
          model: 'gpt-4o',
          messages: [
            ...messages,
            {
              role: 'assistant',
              tool_calls: message.tool_calls,
            },
            ...toolResults,
          ],
          store: true,
        },
        {
          timeout: 60 * 1000,
        },
      );
      // console.log(
      //   '🚀 ~ OpenaiService ~ assistantResponse:',
      //   assistantResponse,
      //   assistantResponse.choices[0].message,
      // );
      return assistantResponse.choices[0].message || null;
    }
    return message || null;
  }

  async handleToolCall(
    threadId: string,
    name: string,
    args: any,
  ): Promise<string> {
    // console.log('🚀 ~ OpenaiService ~ handleToolCall ~ args:', args);
    if (name === 'getMCPServerList') {
      const servers = await this.getMCPServerList(args.message);
      return JSON.stringify(servers);
    }
    if (name === 'deployMCPServer') {
      const url = await this.deployMCPServer({
        repoUrl: args.repoUrl,
        environmentVariables: args.environmentVariables,
      });
      await this.redis.set(`mcp:server:${threadId}`, url);
      return `MCP server deployed at ${url}`;
    }

    const mcpUrl = await this.redis.get(`mcp:server:${threadId}`);
    if (mcpUrl) {
      return await this.callMCPTool(threadId, mcpUrl, name, args);
    }
    return 'Unknown tool';
  }

  async getMCPServerList(message: string) {
    const keywords = await this.extractKeywordsForSearch(message);
    const searchQuery = encodeURIComponent(keywords.join(' '));
    // console.log('🚀 ~ getMCPServerList ~ keywords:', keywords, searchQuery);

    const endpoint = `https://glama.ai/api/mcp/v1/servers?first=60&query=${searchQuery}&attributes=hosting%3Aremote-capable`;
    const apikey =
      'glama_eyJhcGlLZXkiOiIzMmFlMzAxNi00MWE4LTQ2ZGYtOGQ0My04ZDRkMDYwYTk0MmQifQ';

    try {
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Bearer ${apikey}`,
        },
      });
      const data: any = response.data;
      // console.log(
      //   '🚀 ~ OpenaiService ~ getMCPServerList ~ data:',
      //   data?.servers.length,
      // );
      const servers = data?.servers || [];
      return servers.map((server) => ({
        id: server.id,
        name: server.name,
        description: server.description,
        slug: server.slug,
        namespace: server.namespace,
        url: server.url,
        repoUrl: server.repository?.url,
        license: server.spdxLicense?.name,
        attributes: server.attributes,
        tools: server.tools?.map((t) => t.name).filter(Boolean),
        requiredEnvVars: Object.keys(
          server.environmentVariablesJsonSchema?.properties || {},
        ),
      }));
    } catch (err) {
      console.error('❌ Error fetching MCP servers:', err.message);
      return [];
    }
  }

  async deployMCPServer({
    repoUrl,
    environmentVariables,
  }: {
    repoUrl: string;
    environmentVariables?: any;
  }) {
    // console.log(
    //   '🚀 ~ deployMCPServer ~ repoUrl, environmentVariables:',
    //   repoUrl,
    //   environmentVariables,
    // );
    const conn = new Client();

    const ec2Host = process.env.EC2_HOST!;
    const ec2Ip = process.env.EC2_PUBLIC_IP!;
    const ec2User = process.env.EC2_USER || 'ubuntu';
    const privateKey = readFileSync(process.env.EC2_PRIVATE_KEY_PATH!, 'utf8');
    const envs = {
      DATABASE_URI:
        'postgresql://neondb_read_only:npg_Bq6Ncz2UPWXL@ep-black-fog-a5nhv8so.us-east-2.aws.neon.tech/neondb?sslmode=require',
      PG_HOST: 'ep-black-fog-a5nhv8so.us-east-2.aws.neon.tech',
      PG_PORT: 5432,
      PG_USER: 'neondb_read_only',
      PG_PASSWORD: 'npg_Bq6Ncz2UPWXL',
      PG_DATABASE: 'neondb',
      HOST: '0.0.0.0.',
      PORT: 8000,
    };
    const envFlags = Object.entries(envs)
      .map(([key, val]) => `-e ${key}=${val}`)
      .join(' ');

    const repoName =
      repoUrl.split('/').pop()?.replace('.git', '') || `repo-${Date.now()}`;
    // console.log('🚀 ~ OpenaiService ~ repoName:', repoName);
    const targetPath = `/home/${ec2User}/mcp-repos/${repoName}`;

    // console.log('🚀 ~ OpenaiService ~ targetPath:', targetPath);
    const dockerContainer = `mcp-${repoName}-container`;
    const dockerImage = `mcp-${repoName}`;
    // Stop and remove any container currently using port 8000
    const preKillCmd = `sudo docker ps --format '{{.ID}} {{.Ports}}' | grep '0.0.0.0:8000' | awk '{print $1}' | xargs -r sudo docker rm -f`;
    const commands = [
      `mkdir -p /home/${ec2User}/mcp-repos`,
      `git clone ${repoUrl} ${targetPath}`,
      `cd ${targetPath}`,
      preKillCmd,
      `sudo docker rm -f ${dockerContainer} || true`,
      `sudo docker build -t ${dockerImage} .`,
      `sudo docker run -d -p 8000:8000 --name ${dockerContainer} ${envFlags} ${dockerImage}`,
    ];

    const cloneCommand = commands.join(' && ');

    const envFile = Object.entries(envs || {})
      .map(([key, val]) => `${key}=${val}`)
      .join('\n');

    const cloneCommandV2 = `
      echo "${envFile}" > .env
      set -e;
      echo "${envFile}" > .env
      mkdir -p ${targetPath};
      git clone ${repoUrl} ${targetPath};
      cd ${targetPath};
      if [ -f docker-compose.yml ]; then
        sudo docker compose down || true;
        sudo docker compose up -d;
      elif [ -f Dockerfile ]; then
        sudo docker rm -f ${dockerContainer} || true;
        sudo docker build -t ${dockerImage} .;
        sudo docker run -d --network host -p 8000:8000 --name ${dockerContainer} ${envFlags} ${dockerImage};
      else
        echo "No Dockerfile or docker-compose.yml found" && exit 1;
      fi
    `;

    await new Promise<void>((resolve, reject) => {
      conn
        .on('ready', async () => {
          try {
            await this.runSSHCommand(conn, cloneCommandV2);
            resolve();
          } catch (err) {
            reject(err);
          }
        })
        .on('error', (err) => {
          reject(err);
        })
        .connect({
          host: ec2Host,
          port: 22,
          username: ec2User,
          privateKey,
        });
    });

    await this.waitForContainerToStart(dockerContainer);
    return `http://${ec2Ip}:${envs.PORT}`;
  }

  async runSSHCommand(conn: Client, cloneCommand: string): Promise<string> {
    return new Promise((resolve, reject) => {
      conn.exec(cloneCommand, (err, stream) => {
        if (err) return reject(err);

        let errorOutput = '';
        stream
          .on('close', (code: number, signal: string) => {
            console.log(
              '🚀 ~ stream closed with code:',
              code,
              'signal:',
              signal,
            );
            conn.end();
            if (code === 0) {
              resolve('success');
            } else {
              reject(
                new Error(`Command failed with code ${code}: ${errorOutput}`),
              );
            }
          })
          .on('data', (data: Buffer) => {
            console.log('stdout:', data.toString());
          })
          .stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
            console.error('stderr:', data.toString());
          });
      });
    });
  }

  async waitForContainerToStart(dockerContainer: string): Promise<void> {
    const conn = new Client();
    const ec2Host = process.env.EC2_HOST!;
    const ec2User = process.env.EC2_USER || 'ubuntu';
    const privateKey = readFileSync(process.env.EC2_PRIVATE_KEY_PATH!, 'utf8');

    const command = `sudo docker ps --filter "name=${dockerContainer}" --format '{{.Names}}'`;

    return new Promise((resolve, reject) => {
      conn
        .on('ready', async () => {
          console.log('🔌 SSH ready for container status check');
          const checkInterval = 5000;

          const checkLoop = async () => {
            while (true) {
              await new Promise<void>((innerResolve) => {
                conn.exec(command, (err, stream) => {
                  if (err) {
                    console.error('❌ Docker check error:', err);
                    return innerResolve(); // retry
                  }

                  let output = '';
                  stream
                    .on('data', (data) => {
                      output += data.toString();
                    })
                    .on('close', () => {
                      const isRunning = output.trim() === dockerContainer;
                      console.log(`🧐 Is container running? ${isRunning}`);
                      if (isRunning) {
                        conn.end();
                        return resolve(); // success
                      }
                      setTimeout(innerResolve, checkInterval);
                    });
                });
              });
            }
          };

          await checkLoop();
        })
        .on('error', (err) => {
          console.error('❌ SSH error:', err);
          reject(err);
        })
        .connect({
          host: ec2Host,
          port: 22,
          username: ec2User,
          privateKey,
        });
    });
  }

  async getTools(url: string) {
    const client = new MCPClient({
      name: 'mcp-client',
      version: '1.0.0',
    });
    const transport = new SSEClientTransport(new URL(`${url}/sse`), {});
    await client.connect(transport);
    const toolsResult = await client.listTools();
    toolsResult.tools.forEach((tool) => {
      console.log('tool: ', tool);
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      };
    });
  }

  private async callMCPTool(
    threadId: string,
    url: string,
    toolName: string,
    args: any,
  ): Promise<string> {
    try {
      // console.log(
      //   '🚀 ~ OpenaiService ~ url, toolName, args:',
      //   url,
      //   toolName,
      //   args,
      // );
      let client = this.mcpClients.get(threadId);
      if (!client) {
        client = new MCPClient({ name: 'ai-assistant', version: '1.0.0' });
        const transport = new SSEClientTransport(new URL(`${url}/sse`));
        await client.connect(transport);
        this.mcpClients.set(threadId, client);
      }
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });
      // console.log('🚀 ~ OpenaiService ~ result:', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('callMCPTool error: ', error);
      return 'something went wrong. can you please try again later';
    }
  }

  async extractKeywordsForSearch(message: string) {
    const prompt =
      `Extracting technology, framework terms from a given search message. So extract, identify which of them are very strongly related to the query, directly or indirectly and return only 2 to 3 words.
        For example, if search is "get me list of mcp servers for querying postgres tables", meaning return "postgres". but if search is for "google toolbox", seacr for google products like drive, calendar, etc.
        Ignore words of actions, verbs and stuf like querying or tables or niche words for that instance.
        Message: "${message}"    
        Return format: ["keyword1", "keyword2", "keyword3"]
      `.trim();

    const res = await this.openai.chat.completions.create(
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      },
      {
        timeout: 60 * 1000,
      },
    );

    const text = res.choices[0].message.content?.trim() ?? '[]';
    try {
      const json = JSON.parse(text) as [];
      if (Array.isArray(json)) {
        return json.map((k) => (k as string).toLowerCase());
      }
    } catch (err) {
      console.warn('Failed to parse keywords:', text);
    }
    return [];
  }
}
