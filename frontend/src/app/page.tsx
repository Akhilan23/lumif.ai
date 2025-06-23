"use client";

import {
  ChatCanvas,
  ChatInput,
  ChatMessage,
  ChatMessages,
  ChatSection,
  useChatUI,
} from "@llamaindex/chat-ui";
import { useChat, Message } from "@ai-sdk/react";
import { useEffect, useState } from "react";

export default function SimpleChatWrapper() {
  const [messagesFetched, setMessagesFetched] = useState<Message[]>([
    {
      id: "1",
      content: "Hello! How can I help you today?",
      role: "assistant",
    },
  ]);
  const [threadId] = useState("1f94b6c7-46b3-485a-a155-3a4248333ba3");

  useEffect(() => {
    console.log("🔁 useEffect triggered with threadId:", threadId);
    const fetchMessages = async () => {
      try {
        const res = await fetch(
          `http://localhost:3001/api/chat/messages/${threadId}`
        );
        const data = await res.json();
        console.log("🚀 ~ fetchMessages ~ data:", data);
        setMessagesFetched(data || []);
      } catch (err) {
        console.error("Failed to fetch messages", err);
        setMessagesFetched([]);
      }
    };
    fetchMessages();
  }, [threadId]);

  if (messagesFetched === null)
    return <div className="p-4">Loading chat...</div>;

  return <SimpleChat threadId={threadId} initialMessages={messagesFetched} />;
}

function SimpleChat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: Message[];
}) {
  const handler = useChat({
    api: "/api/chat",
    body: { threadId },
    initialMessages,
  });

  return (
    <div className="flex h-screen flex-col">
      <div className="min-h-0 flex-1">
        <ChatSection
          handler={handler}
          className="block h-full flex-row gap-4 p-0 md:flex md:p-5"
        >
          <div className="md:max-w-1/2 mx-auto flex h-full min-w-0 max-w-full flex-1 flex-col gap-4">
            <ChatMessages className="overflow-scroll">
              <ChatMessages.List className="space-y-6 p-6">
                <CustomChatMessages />
              </ChatMessages.List>
            </ChatMessages>
            <div className="border-t p-4">
              <ChatInput>
                <ChatInput.Form>
                  <ChatInput.Field
                    className="flex-1 border-1 bg-gray-50 rounded-lg px-4 py-2"
                    placeholder="Type your message..."
                  />
                  <ChatInput.Submit className="ml-2" />
                </ChatInput.Form>
              </ChatInput>
            </div>
          </div>
          <ChatCanvas className="w-full md:w-2/3" />
        </ChatSection>
      </div>
    </div>
  );
}

function CustomChatMessages() {
  const { messages, isLoading, append } = useChatUI();

  return (
    <>
      {messages.map((message, index) => (
        <ChatMessage
          key={index}
          message={message}
          isLast={index === messages.length - 1}
          className="mb-4"
        >
          <ChatMessage.Avatar>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
              {message.role === "assistant" ? "AI" : "U"}
            </div>
          </ChatMessage.Avatar>
          <ChatMessage.Content isLoading={isLoading} append={append}>
            <ChatMessage.Content.Markdown />
            <ChatMessage.Content.Source />
          </ChatMessage.Content>
          <ChatMessage.Actions />
        </ChatMessage>
      ))}
    </>
  );
}
