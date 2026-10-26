"use client";
export default function GuestError({retry}:{retry:()=>void}){return <section className="invitation-panel invitation-empty"><h1>Invitation temporarily unavailable</h1><p>We couldn’t load your invitation. Please retry.</p><button type="button" className="button button-primary" onClick={retry}>Retry</button></section>;}
