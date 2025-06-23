import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { RedisModule } from 'src/redis/redis.module';
import Redis from 'ioredis';
import { OpenaiModule } from 'src/openai/openai.module';
import { OpenaiService } from 'src/openai/openai.service';

@Module({
  imports: [OpenaiModule, RedisModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, Redis, OpenaiService],
})
export class ChatModule {}
