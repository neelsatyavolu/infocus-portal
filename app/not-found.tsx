import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold text-foreground">Not found</h1>
        <p className="text-sm text-muted-foreground">The resource could not be located or you may not have access.</p>
        <Link href="/dashboard" className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
