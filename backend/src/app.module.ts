import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { OpenaiModule } from './openai/openai.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [ChatModule, OpenaiModule, RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
