"use client";
import Link from "next/link";
export default function DesignError({retry}:{retry:()=>void}){return <main className="workspace-main designs-page"><section className="workspace-panel workspace-empty"><h1>Unable to load invitation drafts</h1><p>Your saved drafts have not been changed.</p><div className="design-actions"><button className="button button-primary" onClick={retry}>Retry</button><Link className="button button-secondary" href="/wedding">Back to workspace</Link></div></section></main>;}
