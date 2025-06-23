import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule],
  providers: [OpenaiService],
})
export class OpenaiModule {}
