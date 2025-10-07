"use client"

import type React from "react"
import marked from "marked"
import { ensurePdfjsWorker } from "@/lib/pdfjs-worker"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string // Markdown content
}

async function getArrayBuffer(file: File): Promise<ArrayBuffer> {
  // Use modern API when available
  if ("arrayBuffer" in file && typeof (file as any).arrayBuffer === "function") {
    return await (file as any).arrayBuffer()
  }
  // Fallback to FileReader for legacy environments
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as ArrayBuffer)
    fr.onerror = (err) => reject(err)
    fr.readAsArrayBuffer(file)
  })
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase()
  const type = file.type || ""

  const isPDF = type === "application/pdf" || name.endsWith(".pdf")
  const isDOCX =
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")
  const isTXT = type === "text/plain" || name.endsWith(".txt")

  try {
    if (isPDF) {
      const buffer = await getArrayBuffer(file)
      const data = new Uint8Array(buffer)

      // Use ESM build to match the ESM worker we configure
      const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs")

      // Attempt with worker (preferred)
      let pdf
      try {
        pdf = await pdfjsLib.getDocument({ data }).promise
      } catch (err: any) {
        const msg = String(err?.message || err || "")
        // Fallback if the environment still reports a worker mismatch
        if (msg.includes("does not match the Worker version")) {
          pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise
        } else {
          throw err
        }
      }

      let text = ""
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += (content.items as any[]).map((item) => item.str).join(" ")
        text += "\n"
      }
      return text.trim()
    }

    if (isDOCX) {
      const buffer = await getArrayBuffer(file)
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ arrayBuffer: buffer })
      return result.value || ""
    }

    if (isTXT) {
      // Prefer the modern API to avoid encoding issues
      try {
        return await file.text()
      } catch {
        const buffer = await getArrayBuffer(file)
        return new TextDecoder("utf-8", { fatal: false }).decode(buffer)
      }
    }

    // Unknown file type: attempt a sane text fallback
    try {
      return await file.text()
    } catch {
      const buffer = await getArrayBuffer(file)
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer)
    }
  } catch (e) {
    console.error("[v0] extractTextFromFile error:", e)
    throw e
  }
}

export default function DocChat() {
  useEffect(() => {
    ensurePdfjsWorker().catch((e) => {
      console.log("[v0] Failed to init pdfjs worker:", e)
    })
  }, [])

  const [files, setFiles] = useState<File[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<string>("")
  const [isReady, setIsReady] = useState<boolean>(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState<string>("")
  const [isSending, setIsSending] = useState<boolean>(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const hasFiles = files.length > 0

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isSending])

  const fileNames = useMemo(() => files.map((f) => f.name).join(", "), [files])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list) return
    setFiles(Array.from(list))
    e.target.value = ""
  }

  async function handleProcessDocuments() {
    if (!hasFiles) return
    setIsSending(true)
    try {
      const texts = await Promise.all(files.map(extractTextFromFile))
      const kb = texts.join("\n\n---\n\n")
      setKnowledgeBase(kb)
      setIsReady(true)
      // seed a friendly intro from assistant
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Hi! Your documents are processed. Ask a question and I will answer based on them.",
        },
      ])
    } catch (err) {
      console.error("[v0] Error processing files:", err)
      alert("Error processing files. Check the console for details.")
    } finally {
      setIsSending(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isSending || !isReady) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }
    setMessages((m) => [...m, userMsg])
    setInput("")
    setIsSending(true)

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeBase,
          messages: messages.concat(userMsg).map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      })

      if (!res.ok) {
        const t = await res.text()
        throw new Error(`API error (${res.status}): ${t}`)
      }

      const data = (await res.json()) as { reply: string }
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
      }
      setMessages((m) => [...m, aiMsg])
    } catch (err: any) {
      console.error("[v0] Chat error:", err?.message || err)
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong reaching Gemini. Please try again.",
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className="w-full">
      {!isReady ? (
        <div className="rounded-lg border p-4 bg-card" aria-labelledby="upload-title">
          <h2 id="upload-title" className="text-lg font-medium mb-3">
            Upload your documents
          </h2>

          <label className="block mb-2 text-sm opacity-80" htmlFor="file-upload">
            Choose PDF, DOCX, or TXT files
          </label>
          <Input
            id="file-upload"
            type="file"
            accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
            multiple
            onChange={handleFileChange}
            aria-describedby="upload-help"
          />
          <p id="upload-help" className="text-xs opacity-70 mt-2">
            Selected: {hasFiles ? fileNames : "None"}
          </p>

          <div className="mt-4">
            <Button type="button" onClick={handleProcessDocuments} disabled={!hasFiles || isSending}>
              {isSending ? "Processing..." : "Process Documents"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="h-[50svh] overflow-y-auto p-4" role="log" aria-live="polite">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {isSending ? (
              <div className="mt-2 text-sm opacity-70" aria-label="AI is thinking">
                {"●●●"}
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSend} className="border-t p-3 flex gap-2">
            <Input
              aria-label="Type your message"
              placeholder="Ask about your documents..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSending}
            />
            <Button type="submit" disabled={!input.trim() || isSending}>
              Send
            </Button>
          </form>
        </div>
      )}
    </section>
  )
}

function MessageBubble(props: { role: "user" | "assistant"; content: string }) {
  const isUser = props.role === "user"
  const html = useMemo(() => {
    // marked can return string or Promise<string>; normalize to string
    const out = marked.parse(props.content)
    if (out && typeof out.then === "function") {
      // If it is async, we won't await here; as a fallback show raw text.
      return undefined as unknown as string
    }
    return out as string
  }, [props.content])

  return (
    <div className={cn("my-2 flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-md px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {html ? (
          <div
            // Note: marked output is not sanitized; for untrusted input, add a sanitizer.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="whitespace-pre-wrap">{props.content}</div>
        )}
      </div>
    </div>
  )
}
