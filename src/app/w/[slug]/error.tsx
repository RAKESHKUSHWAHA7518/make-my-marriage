"use client";
export default function WebsiteError({ retry }: { retry: () => void }) { return <main className="public-website-state"><h1>Unable to load this website</h1><p>Please try again in a moment.</p><button type="button" className="button button-primary" onClick={retry}>Retry</button></main>; }
