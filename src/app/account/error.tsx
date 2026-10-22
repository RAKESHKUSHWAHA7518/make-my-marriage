"use client";
export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <main className="shell section">
      <h1>Your account is temporarily unavailable</h1>
      <p>Please try again in a moment.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
