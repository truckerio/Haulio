import { NextRequest, NextResponse } from "next/server";
import { buildForwardHeaders, getFastApiUrl, resolveActorContext } from "../_proxy";

export async function POST(request: NextRequest) {
  const actor = await resolveActorContext(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!actor.chatbotEnabled) {
    return NextResponse.json({ error: "Chatbot module is not enabled for this organization." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const response = await fetch(getFastApiUrl("/v1/chat/assist"), {
      method: "POST",
      headers: buildForwardHeaders(request, actor, true),
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Chat assist unavailable" }, { status: 502 });
  }
}
