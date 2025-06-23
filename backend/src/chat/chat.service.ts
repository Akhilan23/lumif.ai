import { Injectable } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import Redis from 'ioredis';
import { OpenaiService } from 'src/openai/openai.service';
import { ChatCompletionMessageParam } from 'openai/resources/index';

@Injectable()
export class ChatService {
  constructor(
    private readonly redis: Redis,
    private readonly gateway: ChatGateway,
    private readonly openaiService: OpenaiService,
  ) {}

  async getChat(threadId: string) {
    return await this.getMessages(threadId);
  }

  async answerQuery(threadId: string, message: string) {
    const messages = await this.getMessages(threadId);
    const response = await this.openaiService.runQuery(
      threadId,
      message,
      messages,
    );

    // Add user message
    messages.push(
      {
        role: 'user',
        content: message,
      },
      response,
    );
    await this.saveMessages(threadId, messages);
    console.log('🚀 ~ ChatService ~ answerQuery ~ response:', response);
    return response;
  }

  async getMessages(threadId: string) {
    const redisKey = `thread:${threadId}:messages`;
    const existing = await this.redis.get(redisKey);
    let messages: ChatCompletionMessageParam[] = [];
    if (existing) {
      messages = JSON.parse(existing) as ChatCompletionMessageParam[];
    }
    console.log('🚀 ~ ChatService ~ answerQuery ~ messages:', messages.length);
    return messages;
  }

  async saveMessages(threadId: string, messages: ChatCompletionMessageParam[]) {
    const redisKey = `thread:${threadId}:messages`;
    const indexedMessages = messages.map((msg, idx) => ({
      index: idx,
      ...msg,
    }));
    await this.redis.set(redisKey, JSON.stringify(indexedMessages));
  }

  async deploy(url: string) {
    return await this.openaiService.deployMCPServer({ repoUrl: url });
  }
}
