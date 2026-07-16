import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: existing } = await supabase.auth.getClaims();

  if (!existing?.claims?.sub) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      return new NextResponse("Unable to open your workspace. Please refresh and try again.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
