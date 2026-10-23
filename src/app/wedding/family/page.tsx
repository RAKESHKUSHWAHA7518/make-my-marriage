import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { listWeddingAccess } from "@/modules/weddings/access";
import {
  WorkspaceShell,
  WeddingGate,
} from "@/components/weddings/workspace-shell";

export const metadata: Metadata = {
  title: "Family & access | Make My Marriage",
};
export const dynamic = "force-dynamic";
export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ membersCursor?: string; invitationsCursor?: string }>;
}) {
  const user = await weddingUser();
  const access = await membershipFor(user);
  if (!access) redirect("/wedding/create");
  if (access.status !== "active")
    return (
      <WorkspaceShell name={user.displayName}>
        <WeddingGate kind="removed" />
      </WorkspaceShell>
    );
  const wedding = await weddingFor(user);
  if (!wedding) redirect("/account");
  const params = await searchParams;
  const members = await listWeddingAccess(user, wedding.id, "members", {
    ...(params.membersCursor ? { cursor: params.membersCursor } : {}),
  });
  const invitations =
    wedding.role === "ADMIN"
      ? await listWeddingAccess(user, wedding.id, "invitations", {
          ...(params.invitationsCursor
            ? { cursor: params.invitationsCursor }
            : {}),
        })
      : null;
  function nextLink(
    key: "membersCursor" | "invitationsCursor",
    cursor: string,
  ) {
    const query = new URLSearchParams();
    if (params.membersCursor) query.set("membersCursor", params.membersCursor);
    if (params.invitationsCursor)
      query.set("invitationsCursor", params.invitationsCursor);
    query.set(key, cursor);
    return `/wedding/family?${query}`;
  }
  return (
    <WorkspaceShell name={user.displayName} role={wedding.role}>
      <main className="wedding-overview wedding-family">
        <Link href="/wedding" className="wedding-back">
          Back to your wedding
        </Link>
        <div className="wedding-overview-intro">
          <div>
            <span className="wedding-kicker">Your wedding workspace</span>
            <h1>Family &amp; access</h1>
            <p>See who can help plan your wedding.</p>
          </div>
        </div>
        {wedding.state === "archived" && (
          <p className="wedding-notice">
            This wedding is archived. Family access is shown read-only here.
          </p>
        )}
        <div className="family-role-grid">
          <section className="wedding-card">
            <h2>ADMIN</h2>
            <p>Can plan the wedding and manage family access.</p>
          </section>
          <section className="wedding-card">
            <h2>MANAGER</h2>
            <p>Can help plan the wedding. Cannot manage family access.</p>
          </section>
        </div>
        <section
          className="wedding-card family-list"
          aria-labelledby="family-members-heading"
        >
          <h2 id="family-members-heading">Members</h2>
          <ul>
            {members.data.map(
              (member) =>
                "userId" in member && (
                  <li key={member.id}>
                    <div>
                      <strong>
                        {member.displayName ?? "Member unavailable"}
                        {member.userId === user._id.toString() ? " (You)" : ""}
                      </strong>
                      <p>{member.email ?? "Account details unavailable"}</p>
                    </div>
                    <div>
                      <span className="wedding-role">{member.role}</span>
                      <p>
                        {member.status === "removed"
                          ? "Access removed"
                          : "Active member"}
                      </p>
                    </div>
                  </li>
                ),
            )}
          </ul>
          {members.pagination.nextCursor && (
            <Link
              href={nextLink("membersCursor", members.pagination.nextCursor)}
            >
              More members
            </Link>
          )}
          {params.membersCursor && (
            <Link href="/wedding/family">Back to first page</Link>
          )}
        </section>
        {invitations ? (
          <section
            className="wedding-card family-list"
            aria-labelledby="family-invitations-heading"
          >
            <h2 id="family-invitations-heading">Invitations</h2>
            {invitations.data.length ? (
              <ul>
                {invitations.data.map(
                  (invite) =>
                    "state" in invite && (
                      <li key={invite.id}>
                        <div>
                          <strong>{invite.email}</strong>
                          <p>{invite.role}</p>
                        </div>
                        <div>
                          <span className="wedding-status">{invite.state}</span>
                          <p>
                            Expires{" "}
                            {new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeZone: wedding.timezone,
                            }).format(new Date(invite.expiresAt!))}
                          </p>
                        </div>
                      </li>
                    ),
                )}
              </ul>
            ) : (
              <p>
                No invitations on this page. Planning together starts with an
                invitation.
              </p>
            )}
            {invitations.pagination.nextCursor && (
              <Link
                href={nextLink(
                  "invitationsCursor",
                  invitations.pagination.nextCursor,
                )}
              >
                More invitations
              </Link>
            )}
            {params.invitationsCursor && (
              <Link href="/wedding/family">Back to first page</Link>
            )}
          </section>
        ) : (
          <p className="wedding-notice">
            An administrator manages family invitations and access.
          </p>
        )}
        <p className="wedding-notice">
          Inviting family and managing access will be available in the next
          increment. Partner names alone do not grant access.
        </p>
      </main>
    </WorkspaceShell>
  );
}
