import DocChatClient from "./doc-chat-client"

export default function Page() {
  return (
    <main className="min-h-svh flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold text-pretty">DocuChat</h1>
          <p className="text-sm opacity-80 mt-2">
            Upload PDF, DOCX, or TXT files. I will answer based only on your documents.
          </p>
        </header>
        <DocChatClient />
      </div>
    </main>
  )
}
