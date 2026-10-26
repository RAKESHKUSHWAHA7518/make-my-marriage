import { Brand } from "@/components/brand";
import { ExchangeInvitation } from "@/components/invitation/exchange-invitation";
export const metadata={title:"Open your invitation | Make My Marriage",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function InvitePage(){return <div className="guest-invitation"><header className="invitation-header"><Brand/></header><main className="invitation-main"><ExchangeInvitation/></main></div>;}
