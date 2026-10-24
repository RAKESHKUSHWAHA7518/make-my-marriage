import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { weddingUser } from "@/modules/weddings/page-session";
import { membershipFor, weddingFor } from "@/modules/weddings/service";
import { listWeddingAccess } from "@/modules/weddings/access";
import { MemberAccessControls } from "@/components/weddings/member-access-controls";
import {
  InviteFamilyForm,
  RevokeInvitationButton,
} from "@/components/weddings/family-invitations";
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
    <WorkspaceShell
      name={user.displayName}
      role={wedding.role}
      weddingTitle={wedding.title}
      activePage="family"
    >
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
          {wedding.role === "ADMIN" &&
            wedding.state === "active" &&
            (user.emailVerifiedAt ? (
              <InviteFamilyForm weddingId={wedding.id} />
            ) : (
              <p className="wedding-notice">
                Verify your email before sending invitations.{" "}
                <Link href="/verify-email">Verify email</Link>
              </p>
            ))}
        </div>
        <aside className="wedding-notice family-privacy-note">
          <strong>Planning together starts with an invitation.</strong>
          <span>
            Partner names in wedding details do not grant access. Each person
            must be invited and accept.
          </span>
        </aside>
        {wedding.state === "archived" && (
          <p className="wedding-notice">
            This wedding is archived. New invitations are disabled;
            administrators can revoke pending invitations and remove access.
          </p>
        )}
        <div className="family-role-grid">
          <section className="wedding-card">
            <h2>ADMIN</h2>
            <p>Can plan the wedding and manage family access.</p>
          </section>
          <section className="wedding-card">
            <h2>MANAGER</h2>
            <p>Can help plan the wedding and view wedding details. Cannot edit wedding details or manage family access.</p>
          </section>
        </div>
        <section
          className="wedding-card family-list"
          aria-labelledby="family-members-heading"
        >
          <h2 id="family-members-heading">Members</h2>
          <div className="family-list-column-labels" aria-hidden="true">
            <span>Member &amp; identity</span>
            <span>Role &amp; access</span>
            <span>Actions</span>
          </div>
          <ul>
            {members.data.map(
              (member) =>
                "userId" in member && (
                  <li key={member.id} className="family-member-row">
                    <div className="family-member-identity">
                      <span className="family-member-avatar" aria-hidden="true">
                        {(member.displayName ?? "Member")
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>
                          {member.displayName ?? "Member unavailable"}
                          {member.userId === user._id.toString() ? " (You)" : ""}
                        </strong>
                        <p>{member.email ?? "Account details unavailable"}</p>
                      </div>
                    </div>
                    <div>
                      <span className="wedding-role">{member.role}</span>
                      <p>
                        {member.status === "removed"
                          ? "Access removed"
                          : "Active member"}
                      </p>
                    </div>
                    <div>
                      {wedding.role === "ADMIN" &&
                        member.status === "active" && (
                          <MemberAccessControls
                            key={`${member.id}-${member.version}`}
                            weddingId={wedding.id}
                            memberId={member.id}
                            name={
                              member.displayName ??
                              member.email ??
                              "this member"
                            }
                            role={member.role}
                            version={member.version}
                            archived={wedding.state === "archived"}
                            lastAdmin={
                              member.role === "ADMIN" &&
                              members.activeAdminCount === 1
                            }
                            self={member.userId === user._id.toString()}
                          />
                        )}
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
                          <p>Email: {invite.emailSubmission}</p>
                          <p>
                            Expires{" "}
                            {new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeZone: wedding.timezone,
                            }).format(new Date(invite.expiresAt!))}
                          </p>
                          {invite.state === "pending" && (
                            <RevokeInvitationButton
                              weddingId={wedding.id}
                              inviteId={invite.id}
                              version={invite.version}
                            />
                          )}
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
          Partner names alone do not grant access. Invited people must verify
          the matching email and accept. Removing wedding access preserves the
          person’s account and previous contributions.
        </p>
      </main>
    </WorkspaceShell>
  );
}
