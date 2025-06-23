import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class ChatGateway {
  @WebSocketServer() server: Server;

  private activeThreads = new Set<string>();

  @SubscribeMessage('chat-join')
  handleJoin(
    @MessageBody() threadId: string,
    @ConnectedSocket() socket: Socket,
  ) {
    void socket.join(threadId);
    // only send once, not continuously
    if (!this.activeThreads.has(threadId)) {
      this.activeThreads.add(threadId);
    }
  }

  sendSystemMessageToUser(threadId: string, message: string) {
    this.server.to(threadId).emit('chat-message', { message });
  }
}
