import type { NextRequest } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(req: NextRequest) {
  try {
    const { knowledgeBase, messages } = (await req.json()) as {
      knowledgeBase: string
      messages: { role: "user" | "assistant"; content: string }[]
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response("Missing GEMINI_API_KEY", { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)

    // Mirror the original approach: seed a "system" instruction as the first user turn that embeds the docs.
    const systemPrompt = `
You are a friendly and helpful AI assistant.
You must answer only using the provided document text below.
If the answer is not found in the documents,take inferences and try to answer

--- DOCUMENT CONTENT ---
${knowledgeBase}
`.trim()

    // Build chat-like contents for generateContent.
    // We prepend the systemPrompt as a user message, then replay the conversation.
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [
      { role: "user", parts: [{ text: systemPrompt }] },
      ...messages.map((m) =>
        m.role === "user"
          ? { role: "user" as const, parts: [{ text: m.content }] }
          : { role: "model" as const, parts: [{ text: m.content }] },
      ),
    ]

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    const result = await model.generateContent({ contents })
    const text = result.response.text()

    return Response.json({ reply: text })
  } catch (err: any) {
    console.error("[v0] Gemini route error:", err?.message || err)
    return new Response("Failed to generate content", { status: 500 })
  }
}
