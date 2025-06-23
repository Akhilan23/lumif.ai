import { Module } from '@nestjs/common';
import { RedisModule as BaseRedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    BaseRedisModule.forRoot({
      type: 'single',
      options: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
  exports: [BaseRedisModule],
})
export class RedisModule {}
