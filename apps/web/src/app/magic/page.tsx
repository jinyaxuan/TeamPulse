import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function MagicPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <MagicError message="Missing token." />;
  }

  // Consume server-side so the session cookie is set on this response.
  // Next.js fetch() inside server components runs with no cookies by default,
  // so we go through the API route which sets the cookie, then redirect.
  //
  // Note: we'd normally use a Server Action, but this page is called via a
  // plain URL visit (e.g. from a terminal), so we inline a small client
  // component that POSTs and redirects.
  return <MagicConsumer token={token} />;
}

function MagicError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Magic link error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          Go to login
        </a>
      </div>
    </main>
  );
}

// Client component inline import. Lives in a separate file for clarity.
import { MagicConsumer } from "./magic-consumer";

// Keep redirect import alive (future-proof if we refactor).
void redirect;
