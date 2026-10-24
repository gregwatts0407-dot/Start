export function SetupNotice() {
  return (
    <div className="space-y-2 rounded-3xl border border-gold/40 bg-gold/10 p-5 text-sm" role="status">
      <p className="font-medium">Supabase isn’t connected yet</p>
      <p className="text-muted-foreground">
        Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code>, add your
        project URL and anon key, then restart the dev server. The README walks through it.
      </p>
    </div>
  );
}
