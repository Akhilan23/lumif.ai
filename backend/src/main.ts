import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('/api');
  app.enableCors({ origin: '*' }); // Ensure CORS is allowed
  // app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
