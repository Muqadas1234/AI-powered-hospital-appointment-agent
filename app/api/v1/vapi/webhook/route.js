import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    // We just return success so VAPI doesn't crash on webhook events.
    // In future, you can log the events or store transcripts here.
    return NextResponse.json({ ok: true, message: "Webhook received" });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Vapi webhook endpoint is active" });
}
