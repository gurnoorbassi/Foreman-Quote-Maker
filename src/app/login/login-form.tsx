"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
    setLoading(false);
  };

  return <form onSubmit={submit} className="mt-7 rounded-2xl border border-[#dce0dc] bg-white p-5 shadow-[0_10px_35px_rgba(24,30,26,.06)]"><label className="text-xs font-semibold text-[#535c56]">Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="field"/></label><button disabled={loading} className="mt-4 h-11 w-full rounded-xl bg-[#171c19] text-sm font-semibold text-white disabled:opacity-50">{loading ? "Sending link…" : "Email me a sign-in link"}</button>{message && <p className="mt-4 rounded-xl bg-[#f4f5f2] p-3 text-xs leading-5 text-[#5d665f]">{message}</p>}<p className="mt-4 text-center text-[10px] leading-4 text-[#909792]">By continuing, you agree to keep customer information secure and review every quote before sending.</p></form>;
}
