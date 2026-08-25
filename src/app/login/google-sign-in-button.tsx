"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="w-full rounded-xs border border-line px-4 py-3 text-subhead transition-colors hover:bg-fg hover:text-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "이동 중" : "Google 계정으로 계속"}
      </button>
      {failed ? (
        <p className="mt-3 text-small text-muted">
          로그인을 시작하지 못했다. 잠시 후 다시 시도할 것.
        </p>
      ) : null}
    </div>
  );
}
