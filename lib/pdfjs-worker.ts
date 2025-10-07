"use client"

let initialized = false

// Keep this in sync with the installed pdfjs-dist version
const PDFJS_VERSION = "5.4.296"

export async function ensurePdfjsWorker() {
  if (initialized) return
  if (typeof window === "undefined") return

  // Dynamically import the ESM build only on the client
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs")
  // Set worker to the matching version from a CDN with proper CORS
  // Note: v5 uses an ESM worker (.mjs)
  // @ts-expect-error: pdfjs types may not include GlobalWorkerOptions
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`
  initialized = true
}

// Initialize eagerly on the client to avoid early mismatches
if (typeof window !== "undefined") {
  ensurePdfjsWorker().catch((err) => {
    // Optional: leave this debug line while validating the fix, then remove
    console.log("[v0] Failed to initialize pdfjs worker:", err)
  })
}
