import { NextRequest, NextResponse } from "next/server";
import { buildForwardHeaders, getFastApiUrl, resolveActorContext } from "../_proxy";

export async function GET(request: NextRequest) {
  const actor = await resolveActorContext(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!actor.chatbotEnabled) {
    return NextResponse.json({ error: "Chatbot module is not enabled for this organization." }, { status: 403 });
  }

  try {
    const response = await fetch(getFastApiUrl("/v1/chat/capabilities"), {
      method: "GET",
      headers: buildForwardHeaders(request, actor),
      cache: "no-store",
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Chat capabilities unavailable" }, { status: 502 });
  }
}
