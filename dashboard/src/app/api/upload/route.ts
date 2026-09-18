import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Uploads are proxied through the server rather than posted to n8n from the
// browser: it keeps the n8n URL off the client, avoids CORS entirely, and lets
// the session be checked before anything reaches the pipeline. The file is
// handed to the *same* webhook the curl path uses, so there is exactly one
// ingestion implementation (OCR -> Storage -> insert) regardless of entry point.
const N8N_INGEST_URL =
  process.env.N8N_INGEST_URL ?? "http://localhost:5678/webhook/ingest";

// OCR.space's free tier rejects files above ~1 MB. Catching it here turns a
// confusing downstream OCR failure into a clear message at the point of upload.
const MAX_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Read-only: this route never needs to refresh the session cookie.
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file selected." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `File is ${mb} MB — OCR.space's free tier caps at 1 MB.` },
      { status: 413 }
    );
  }

  // Field name must be "data": the workflow's Extract File node reads
  // binary.data for the webhook entry point.
  const upstream = new FormData();
  upstream.append("data", file, file.name);

  try {
    const res = await fetch(N8N_INGEST_URL, { method: "POST", body: upstream });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Ingestion webhook returned ${res.status}. Is the "Invoice Ingestion" workflow active?`,
        },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach the ingestion workflow. Is n8n running?" },
      { status: 502 }
    );
  }

  // The webhook responds on receipt, so success here means "accepted", not
  // "processed" — OCR, Storage upload and the row insert happen after.
  return NextResponse.json({ ok: true, filename: file.name });
}
