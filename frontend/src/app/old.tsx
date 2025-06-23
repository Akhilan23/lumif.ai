// "use client";

// import {
//   ChatCanvas,
//   ChatInput,
//   ChatMessage,
//   ChatMessages,
//   ChatSection,
//   useChatUI,
// } from "@llamaindex/chat-ui";
// import { useChat, Message } from "@ai-sdk/react";
// import { JSX, useEffect, useRef, useState } from "react";
// import { io, Socket } from "socket.io-client";
// import { v4 as uuid } from "uuid";

// const initialMessages: Message[] = [
//   {
//     id: "1",
//     content: "Hello! How can I help you today?",
//     role: "assistant",
//   },
// ];

// export default function Page(): JSX.Element {
//   const [threadId, setThreadId] = useState(uuid());
//   console.log("🚀 ~ Page ~ threadId:", threadId);
//   return (
//     <div className="flex h-screen flex-col">
//       <div className="min-h-0 flex-1">
//         <ChatExample threadId={threadId} />
//       </div>
//     </div>
//   );
// }

// function ChatExample(props: { threadId: string }) {
//   const handler = useChat({
//     api: "/api/chat",
//     body: { threadId: props.threadId },
//     initialMessages,
//     onResponse: (response) => {
//       console.log("onResponse: ", response.json(), response);
//     },
//     onFinish: (message, { messages }) => {
//       // Called only when user types something
//       console.log("User query finished:", message);
//     },
//   });

//   return (
//     <ChatSection
//       handler={handler}
//       className="block h-full flex-row gap-4 p-0 md:flex md:p-5"
//     >
//       <div className="md:max-w-1/2 mx-auto flex h-full min-w-0 max-w-full flex-1 flex-col gap-4">
//         <ChatMessages className="overflow-scroll">
//           <ChatMessages.List className="px-4 py-6">
//             <CustomChatMessages threadId={props.threadId} />
//           </ChatMessages.List>
//         </ChatMessages>
//         <div className="border-t p-4">
//           <ChatInput>
//             <ChatInput.Form>
//               <ChatInput.Field
//                 className="flex-1 border-1 bg-gray-50 rounded-lg px-4 py-2"
//                 placeholder="Type your message..."
//               />
//               <ChatInput.Submit className="ml-2" />
//             </ChatInput.Form>
//           </ChatInput>
//         </div>
//       </div>
//       <ChatCanvas className="w-full md:w-2/3" />
//     </ChatSection>
//   );
// }

// function CustomChatMessages(props: { threadId: string }) {
//   const { messages, isLoading, append } = useChatUI();
//   const socketRef = useRef<Socket | null>(null);

//   useEffect(() => {
//     const socket = io("http://localhost:3001", {
//       reconnection: true,
//       reconnectionAttempts: 5,
//       reconnectionDelay: 1000,
//     });

//     socketRef.current = socket;

//     socket.once("connect", () => {
//       console.log("✅ Socket connected:", socket.id);
//       socket.emit("chat-join", props.threadId);
//     });

//     socket.on("disconnect", (reason) => {
//       console.log("❌ Socket disconnected:", reason);
//     });

//     socket.on("chat-message", (data: any) => {
//       console.log("📩 Incoming message:", data);
//       if (!data?.message) return;
//       append({
//         id: uuid(),
//         role: "assistant",
//         content: data.message,
//       });
//     });

//     return () => {
//       socket.disconnect();
//       socketRef.current = null;
//       console.log("🔌 Socket manually disconnected");
//     };
//   }, [append, props.threadId]);

//   return (
//     <>
//       {messages.map((message, index) => (
//         <ChatMessage
//           key={index}
//           message={message}
//           isLast={index === messages.length - 1}
//           className="mb-4"
//         >
//           <ChatMessage.Avatar>
//             <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
//               {message.role === "assistant" ? "AI" : "U"}
//             </div>
//           </ChatMessage.Avatar>
//           <ChatMessage.Content isLoading={isLoading} append={append}>
//             <ChatMessage.Content.Markdown />
//             <ChatMessage.Content.Source />
//           </ChatMessage.Content>
//           <ChatMessage.Actions />
//         </ChatMessage>
//       ))}
//     </>
//   );
// }
