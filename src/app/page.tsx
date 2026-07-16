import { redirect } from "next/navigation";
import QuoteWorkspace from "@/components/quote-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/auth/anonymous");

  await supabase.from("contractor_profiles").upsert({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  }, { onConflict: "id", ignoreDuplicates: true });

  return <QuoteWorkspace userEmail={typeof claims.email === "string" ? claims.email : "This device"} />;
}
