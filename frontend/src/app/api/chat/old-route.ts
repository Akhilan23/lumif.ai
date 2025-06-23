import { NextResponse, type NextRequest } from "next/server";

const TOKEN_DELAY = 30; // optional delay
const TEXT_PREFIX = "0:"; // vercel ai text prefix

export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json();
    console.log("🚀 ~ POST ~ requestData:", requestData);
    const { messages, threadId } = requestData;
    const lastMessage = messages[messages.length - 1];
    // console.log("🚀 ~ POST ~ messages, threadId:", messages, threadId);

    // Call your NestJS backend
    const backendRes = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        message: lastMessage.content,
      }),
    });

    const data = await backendRes.json();
    console.log("🚀 ~ POST ~ data:", data);
    return new Response();
    // console.log("🚀 ~ POST ~ data:", data);
    // const stream = streamAgentReply(data.response); // stream token by token
    // console.log("🚀 ~ POST ~ stream:", stream);

    // return new Response(stream, {
    //   headers: {
    //     "Content-Type": "text/plain; charset=utf-8",
    //     "X-Vercel-AI-Data-Stream": "v1",
    //     Connection: "keep-alive",
    //   },
    // });
  } catch (error) {
    const detail = (error as Error).message;
    return NextResponse.json({ detail }, { status: 500 });
  }
}

// Streams plain text using the Vercel AI stream format
function streamAgentReply(fullText: string): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const tokens = fullText.split(/(\s+)/); // split by words and spaces

      for (const token of tokens) {
        await new Promise((res) => setTimeout(res, TOKEN_DELAY));
        controller.enqueue(
          encoder.encode(`${TEXT_PREFIX}${JSON.stringify(token)}\n`)
        );
      }

      controller.close();
    },
  });
}
