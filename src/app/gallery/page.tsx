import { Brand } from "@/components/brand";
import { ExchangeInvitation } from "@/components/invitation/exchange-invitation";
export const metadata = { title: "Open wedding gallery | Make My Marriage", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() { return <div className="guest-invitation"><header className="invitation-header"><Brand/></header><main className="invitation-main"><ExchangeInvitation kind="gallery"/></main></div>; }
