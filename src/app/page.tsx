export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-12 sm:px-10">
      <section aria-labelledby="page-title" className="w-full rounded-2xl border border-border bg-surface p-6 sm:p-10">
        <p className="text-sm font-semibold tracking-wide text-primary">Make My Marriage</p>
        <h1 id="page-title" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          A shared space for your wedding.
        </h1>
        <p className="mt-5 max-w-prose leading-7 text-muted">
          The application is being prepared. Planning tools and account access will
          become available in a future release.
        </p>
      </section>
    </main>
  );
}
