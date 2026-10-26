import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
export const metadata={title:"Private invitation | Make My Marriage",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function GuestLayout({children}:{children:ReactNode}){return <div className="guest-invitation"><header className="invitation-header"><Brand/><nav aria-label="Your invitation"><Link href="/guest">Invitation</Link><Link href="/guest/response">Your response</Link></nav></header><main className="invitation-main">{children}</main><footer className="invitation-footer">Make My Marriage · Private household invitation</footer></div>;}
