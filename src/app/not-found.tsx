import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-12">
      <section aria-labelledby="page-title">
        <p className="font-semibold text-primary">Make My Marriage</p>
        <h1 id="page-title" className="mt-4 text-3xl font-semibold">Page unavailable</h1>
        <p className="mt-4 leading-7 text-muted">This page could not be found.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          Go to homepage
        </Link>
      </section>
    </main>
  );
}
