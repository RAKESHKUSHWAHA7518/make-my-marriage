export type InvitationEmailSnapshot = {
  household: string;
  recipient: string;
  address: string;
  couple: string;
  subject: string;
  greeting: string;
  body: string;
  events: { name: string; time: string; venue: string }[];
  card: { name: string; revision: number } | null;
};

export const invitationBody = "We would love for you to celebrate with us. Please open your private invitation to see the details and respond for your household.";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function invitationMessage(snapshot: InvitationEmailSnapshot, link: string, from: string) {
  const e = escapeHtml;
  const events = snapshot.events.map(event => [event.name, event.time, event.venue].join(" · "));
  return {
    from,
    to: [snapshot.address],
    subject: snapshot.subject,
    text: ["Make My Marriage", snapshot.couple, snapshot.greeting, snapshot.body, ...events, "View your invitation", link, "One response applies to your household."].join("\n\n"),
    html: `<div style="background:#fffdf9;padding:24px;color:#35262b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto"><p style="color:#802b3a">Make My Marriage</p><h1 style="color:#802b3a;font-family:Georgia,serif">${e(snapshot.couple)}</h1><p>${e(snapshot.greeting)}</p><p>${e(snapshot.body)}</p><ul>${events.map(event => `<li>${e(event)}</li>`).join("")}</ul><p><a style="display:inline-block;background:#802b3a;color:white;padding:14px 20px;border-radius:6px" href="${e(link)}">View your invitation</a></p><p>One response applies to your household.</p><p style="overflow-wrap:anywhere">${e(link)}</p></div></div>`,
  };
}
