import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('/messages/:threadId')
  async getChat(@Param('threadId') threadId: string) {
    return this.chatService.getChat(threadId);
  }

  @Post()
  async chat(@Body() body: { threadId: string; message: string }) {
    console.log('🚀 ~ chat ~ body:', body, JSON.stringify(body));
    const response = await this.chatService.answerQuery(
      body.threadId,
      body.message,
    );
    return { response };
  }

  @Get('/deploy')
  async deploy() {
    await this.chatService.deploy(
      // 'https://github.com/wongjingping/postgres-mcp',
      // 'https://github.com/crystaldba/postgres-mcp',
      'https://github.com/asadudin/mcp-server-postgres',
    );
  }
}
