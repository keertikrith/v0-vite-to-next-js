"use client"

import dynamic from "next/dynamic"

const DocChat = dynamic(() => import("@/components/doc-chat"), { ssr: false })

export default function DocChatClient() {
  return <DocChat />
}
