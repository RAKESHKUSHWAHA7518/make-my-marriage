import Image from "next/image";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/site-header";

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function Icon({
  name,
}: {
  name: "calendar" | "people" | "check" | "heart" | "receipt" | "lock";
}) {
  const paths = {
    calendar:
      "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm3 11h3m3 0h2m-8 3h3",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    check: "m5 12 4 4L19 6",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6",
    lock: "M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v3",
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

const faqs = [
  [
    "Can both families plan together?",
    "That’s the idea. Each registered user belongs to one wedding. ADMINs will invite family members as ADMINs or MANAGERs so everyone can coordinate in one shared workspace.",
  ],
  [
    "Can households be invited to different events?",
    "Yes. Organizers will select the events for each household. Its private invitation will show only the celebrations it is invited to.",
  ],
  [
    "Do guests need an account to RSVP?",
    "No account or OTP is needed. Guests will use their private invitation link to give one household response and guest count across their invited events, within the organizer’s guest limit.",
  ],
  [
    "Can we create our own wedding events?",
    "Yes. Plan familiar celebrations such as Haldi, Mehendi and Reception, or name your events to suit your own traditions.",
  ],
  [
    "Is the wedding website public?",
    "Only information you explicitly publish will appear on the public wedding website. Private invitations, RSVP responses and gallery access remain separate.",
  ],
  [
    "How does WhatsApp sharing work?",
    "You’ll open a prepared invitation message and link in WhatsApp, then send it yourself. WhatsApp sharing is always manual.",
  ],
  [
    "Who can access the shared photo gallery?",
    "Anyone with the shared gallery link or its QR code can view the gallery when enabled. They can contribute photos only when uploads are enabled. Keep that link within your intended circle.",
  ],
  [
    "What happens after the wedding?",
    "An ADMIN can archive the wedding. It becomes read-only, while narrow privacy controls such as unpublishing information or revoking access remain available.",
  ],
];

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section className="hero section" aria-labelledby="hero-title">
          <div className="shell">
            <div className="hero-copy">
              <p className="pill">
                <Icon name="heart" /> For couples and their families
              </p>
              <h1 id="hero-title">
                Your wedding.
                <br />
                <span>Beautifully organized.</span>
              </h1>
              <p className="intro">
                Bring your family, events, guests, tasks and expenses together
                in one shared space—from Haldi to Reception, and every
                celebration in between.
              </p>
              <div className="button-row">
                <Link href="/register" className="button button-primary">
                  Create your wedding <span aria-hidden="true">↗</span>
                </Link>
                <a className="button button-secondary" href="#how-it-works">
                  See how it works <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className="hero-note">
                A little less coordinating. A little more celebrating.
              </p>
            </div>
            <figure className="workspace-preview">
              <figcaption className="preview-bar">
                <span>
                  <Icon name="lock" /> Your shared family workspace
                </span>
                <span className="sample-label">Illustrative preview</span>
              </figcaption>
              <div className="workspace-body">
                <div className="workspace-title">
                  <div>
                    <p className="eyebrow">Let the celebrations begin</p>
                    <h2>Rakesh &amp; Priya’s wedding</h2>
                    <p>
                      Udaipur, Rajasthan <span aria-hidden="true">·</span>{" "}
                      February 2027
                    </p>
                  </div>
                  <div className="avatars" aria-label="Sample family members">
                    <span>R</span>
                    <span>P</span>
                    <span>N</span>
                    <span>+2</span>
                  </div>
                </div>
                <div className="event-chips">
                  <span>Haldi</span>
                  <span>Mehendi</span>
                  <span>Sangeet</span>
                  <span>Reception</span>
                </div>
                <div className="summary-grid">
                  <div className="summary-card">
                    <p className="card-label">
                      <Icon name="calendar" /> Upcoming celebration
                    </p>
                    <h3>Haldi ceremony</h3>
                    <p>13 February · 10:00 AM</p>
                    <div className="card-foot">
                      Courtyard Lawn <span className="status">Up next</span>
                    </div>
                  </div>
                  <div className="summary-card">
                    <p className="card-label">
                      <Icon name="check" /> On the to-do list
                    </p>
                    <h3>Confirm decoration</h3>
                    <p>Assigned to Neha</p>
                    <div className="card-foot">
                      <span className="avatar">N</span>
                      <span>Due in 2 days</span>
                    </div>
                  </div>
                  <div className="summary-card">
                    <p className="card-label">
                      <Icon name="people" /> Household responses
                    </p>
                    <h3>
                      42 <small>/ 60</small>
                    </h3>
                    <p>households have responded</p>
                    <div
                      className="progress-track"
                      aria-label="70 percent of sample households responded"
                    >
                      <span />
                    </div>
                  </div>
                  <div className="summary-card">
                    <p className="card-label">
                      <Icon name="receipt" /> Expenses recorded
                    </p>
                    <h3>₹2,45,000</h3>
                    <p>14 expense records</p>
                    <div className="card-foot">
                      The details, all in one place
                    </div>
                  </div>
                </div>
              </div>
            </figure>
            <p className="preview-caption">
              A glimpse of what’s coming. All names, figures and screens shown
              are examples.
            </p>
          </div>
        </section>

        <section
          className="section shell split-section"
          aria-labelledby="together-title"
        >
          <div>
            <p className="eyebrow">Better, together</p>
            <h2 id="together-title">
              One wedding.
              <br />
              One shared plan.
            </h2>
            <p className="section-copy">
              Give both sides of the family a clear place to coordinate, share
              updates and see what needs attention. More helping hands. Fewer
              lost messages.
            </p>
            <div className="benefit">
              <Icon name="people" />
              <div>
                <h3>A place for your people</h3>
                <p>
                  Share responsibilities with parents, siblings and the cousins
                  who always come through.
                </p>
              </div>
            </div>
            <div className="benefit">
              <Icon name="check" />
              <div>
                <h3>Everyone on the same page</h3>
                <p>
                  Keep tasks and updates alongside the celebrations they belong
                  to.
                </p>
              </div>
            </div>
          </div>
          <div className="collaboration-preview">
            <p className="sample-label">Example family update</p>
            <div className="task-row">
              <span className="check-circle">
                <Icon name="check" />
              </span>
              <div>
                <strong>Confirm the mehendi artist</strong>
                <p>Neha · Family manager</p>
              </div>
              <span className="avatar">N</span>
            </div>
            <div className="comment">
              <strong>
                Neha <small>Yesterday, 6:40 PM</small>
              </strong>
              <p>
                “Availability confirmed! I’ll coordinate the arrival time and
                make sure the bridal lounge is ready.”
              </p>
            </div>
            <div className="linked-event">
              <Icon name="calendar" />
              <div>
                <strong>Mehendi ceremony</strong>
                <p>12 February · Courtyard Lawn</p>
              </div>
              <span>Linked event</span>
            </div>
          </div>
        </section>

        <section id="features" className="section tinted-section">
          <div className="shell">
            <SectionHeading
              eyebrow="Room for every little detail"
              title="Everything you need to keep the celebrations organized."
            >
              Thoughtfully connected tools for your people, your plans and
              everything in between.
            </SectionHeading>
            <div className="feature-grid">
              <article className="feature-card">
                <span className="icon-tile">
                  <Icon name="calendar" />
                </span>
                <h3>Plan the celebrations</h3>
                <p>
                  Events, schedules and family responsibilities, brought
                  together.
                </p>
                <div className="mini-list">
                  {[
                    ["Haldi", "13 Feb · Morning"],
                    ["Sangeet", "13 Feb · Evening"],
                    ["Reception", "14 Feb · Evening"],
                  ].map(([name, date]) => (
                    <div key={name}>
                      <strong>{name}</strong>
                      <span>{date}</span>
                    </div>
                  ))}
                </div>
                <p className="feature-foot">
                  Your traditions. Your kind of celebration.
                </p>
              </article>
              <article className="feature-card">
                <span className="icon-tile">
                  <Icon name="people" />
                </span>
                <h3>Coordinate your people</h3>
                <p>
                  Households, event invitations and one simple family response.
                </p>
                <div className="household-mini">
                  <strong>Kapoor household</strong>
                  <p>Sangeet &amp; Reception</p>
                  <span className="status">Attending · 4 guests</span>
                </div>
                <div className="household-mini">
                  <strong>Mehta family</strong>
                  <p>Reception</p>
                  <span className="status neutral">Awaiting reply</span>
                </div>
              </article>
              <article className="feature-card">
                <span className="icon-tile">
                  <Icon name="receipt" />
                </span>
                <h3>Keep track of the details</h3>
                <p>
                  Vendor contacts, actual expenses and receipts, easy to find.
                </p>
                <div className="mini-list">
                  {[
                    ["Floral decoration", "₹25,000"],
                    ["Mehendi", "₹5,000"],
                    ["Invitation printing", "₹3,500"],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <p className="feature-foot">
                  Simple records. A clearer picture.
                </p>
              </article>
            </div>
            <p className="preview-caption">
              Feature previews with sample information. Planning tools are
              coming soon.
            </p>
          </div>
        </section>

        <section id="invitations" className="section shell split-section">
          <div>
            <p className="eyebrow">A warm welcome, without the work</p>
            <h2>
              Thoughtful invitations.
              <br />
              Simple responses.
            </h2>
            <p className="section-copy">
              Choose which events each household is invited to. They’ll respond
              through a private link, without creating an account or entering an
              OTP.
            </p>
            <ol className="numbered-list">
              <li>Choose the household</li>
              <li>Select their invited events</li>
              <li>Share their private invitation</li>
            </ol>
            <p className="privacy-note">
              <Icon name="lock" /> One household response and guest count across
              its invited events.
            </p>
          </div>
          <figure className="invitation-preview">
            <figcaption className="sample-label">
              Example invitation · non-interactive
            </figcaption>
            <div className="invitation-inner">
              <span className="monogram">
                R <span>&amp;</span> P
              </span>
              <p className="eyebrow">Together with our families</p>
              <h3>Dear Sharma family,</h3>
              <p>We’d love to celebrate with you.</p>
              <div className="event-chips">
                <span>Haldi</span>
                <span>Wedding</span>
                <span>Reception</span>
              </div>
              <div className="rsvp-example">
                <strong>Your household response</strong>
                <div className="response-choice">
                  <span>
                    <Icon name="check" /> Attending
                  </span>
                  <span>3 guests</span>
                </div>
                <p>Up to 5 guests, including you.</p>
              </div>
            </div>
          </figure>
        </section>

        <section id="websites" className="section tinted-section">
          <div className="shell">
            <SectionHeading
              eyebrow="Your celebration, your story"
              title="A wedding website that feels like you."
            >
              A beautiful place for the details you choose to share. Your
              private planning stays private.
            </SectionHeading>
            <div className="website-grid">
              {[
                {
                  theme: "burgundy",
                  name: "Burgundy & Champagne",
                  note: "Warm ivory. A little golden glow.",
                  intro: "WE INVITE YOU TO CELEBRATE",
                },
                {
                  theme: "midnight",
                  name: "Midnight Velvet",
                  note: "Evening elegance. Timeless romance.",
                  intro: "TOGETHER WITH OUR FAMILIES",
                },
                {
                  theme: "terracotta",
                  name: "Rose Terracotta",
                  note: "Earthy warmth. A softer kind of romance.",
                  intro: "OUR NEXT CHAPTER BEGINS",
                },
              ].map((theme) => (
                <figure
                  className={`website-example ${theme.theme}`}
                  key={theme.theme}
                >
                  <div className="website-art">
                    <span className="tiny-label">DESIGN PREVIEW</span>
                    <span className="website-initials">R&amp;P</span>
                    <p>{theme.intro}</p>
                    <h3>
                      Rakesh <span>&amp;</span> Priya
                    </h3>
                    <div className="ornament" aria-hidden="true">
                      ◇
                    </div>
                    <p>14 FEBRUARY 2027</p>
                    <span>Udaipur, Rajasthan</span>
                  </div>
                  <figcaption>
                    <strong>{theme.name}</strong>
                    <p>{theme.note}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="preview-caption">
              <Icon name="lock" /> Illustrative styles. Only explicitly
              published information will appear on a public wedding page.
            </p>
          </div>
        </section>

        <section className="section shell">
          <SectionHeading
            eyebrow="The practical side, made simpler"
            title="Keep the practical details close."
          >
            Your go-to contacts and everyday expenses, organized for the whole
            family.
          </SectionHeading>
          <div className="practical-grid">
            <article className="practical-card">
              <div className="card-heading">
                <h3>Your wedding vendors</h3>
                <span className="sample-label">Sample contacts</span>
              </div>
              {[
                ["K", "Kavita Mehendi Art", "Mehendi artist"],
                ["S", "Stories by Joseph", "Photography"],
                ["B", "Bloom & Petal", "Decoration"],
              ].map(([initial, name, category]) => (
                <div className="vendor-row" key={name}>
                  <span className="vendor-avatar">{initial}</span>
                  <div>
                    <strong>{name}</strong>
                    <p>{category}</p>
                  </div>
                  <span className="vendor-category">Contact saved</span>
                </div>
              ))}
              <p className="feature-foot">
                Keep your own contacts. Discover more with Google Places.
              </p>
            </article>
            <article className="practical-card">
              <div className="card-heading">
                <h3>Your expense overview</h3>
                <span className="sample-label">Sample records</span>
              </div>
              {[
                ["Mehendi", "₹5,000"],
                ["Decoration", "₹25,000"],
                ["Invitation printing", "₹3,500"],
              ].map(([name, amount]) => (
                <div className="expense-row" key={name}>
                  <Icon name="receipt" />
                  <div>
                    <strong>{name}</strong>
                    <p>Expense recorded</p>
                  </div>
                  <strong>{amount}</strong>
                </div>
              ))}
              <div className="expense-total">
                <span>Total recorded</span>
                <strong>₹33,500</strong>
              </div>
            </article>
          </div>
        </section>

        <section className="section gallery-section">
          <div className="shell split-section">
            <div>
              <p className="eyebrow">The moments you’ll come back to</p>
              <h2>One place for everyone’s favourite moments.</h2>
              <p className="section-copy">
                The happy chaos. The tiny details. The photos only your cousin
                caught. Bring them together in one shared wedding gallery.
              </p>
              <div className="gallery-benefits">
                <p>
                  <Icon name="check" /> Share a gallery link or QR code
                </p>
                <p>
                  <Icon name="check" /> Let guests contribute when uploads are
                  enabled
                </p>
              </div>
              <p className="privacy-note">
                <Icon name="lock" /> Anyone with the shared link can view an
                enabled gallery. Share it thoughtfully.
              </p>
            </div>
            <figure className="gallery-preview">
              <div className="card-heading">
                <div>
                  <h3>Wedding memories</h3>
                  <p>Little moments. A lifetime of stories.</p>
                </div>
                <Icon name="heart" />
              </div>
              <div className="photo-grid">
                <Image
                  src="/images/marigolds.jpg"
                  alt="Marigold arrangements in a sunlit wedding courtyard"
                  width={600}
                  height={800}
                  sizes="(max-width: 700px) 45vw, 240px"
                />
                <Image
                  src="/images/mehendi.jpg"
                  alt="Intricate mehendi on a bride’s hands"
                  width={600}
                  height={400}
                  sizes="(max-width: 700px) 40vw, 220px"
                />
                <Image
                  src="/images/celebration.jpg"
                  alt="Warm lights illuminating an evening wedding celebration"
                  width={600}
                  height={400}
                  sizes="(max-width: 700px) 40vw, 220px"
                />
              </div>
              <figcaption className="preview-caption">
                Illustrative gallery · imagery from the supplied Stitch design
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="how-it-works" className="section shell">
          <SectionHeading
            eyebrow="A simple beginning"
            title="Start with your wedding. Build the plan together."
          >
            Three steps towards a little more calm and a lot more celebration.
          </SectionHeading>
          <div className="steps-grid">
            {[
              [
                "01",
                "Create your wedding",
                "Add your names, your date and the first of many celebrations.",
              ],
              [
                "02",
                "Bring your family in",
                "Invite your people and give everyone a clear way to lend a hand.",
              ],
              [
                "03",
                "Organize and celebrate",
                "Keep plans, invitations, expenses and memories connected.",
              ],
            ].map(([number, title, copy]) => (
              <article key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faqs" className="section faq-section">
          <div className="shell faq-layout">
            <SectionHeading
              eyebrow="A few things you might be wondering"
              title="Frequently asked questions"
            >
              A little clarity before the celebrations begin. These answers
              describe the planned product.
            </SectionHeading>
            <div className="faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question} name="homepage-faq">
                  <summary>
                    {question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className="section shell">
          <div className="closing-cta">
            <Icon name="heart" />
            <p className="eyebrow">Less juggling. More joy.</p>
            <h2>
              Make room for
              <br />
              the celebration.
            </h2>
            <p>
              Give your wedding plans a shared home—and your family a clearer
              way to help.
            </p>
            <Link href="/register" className="button button-primary">
              Create your wedding <span aria-hidden="true">↗</span>
            </Link>
            <span className="availability-note">
              Account access is coming soon.
            </span>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell">
          <div className="footer-main">
            <div>
              <Brand />
              <p>
                For the plans. For your people.
                <br />
                For everything that makes it yours.
              </p>
            </div>
            <nav aria-label="Footer navigation">
              <a href="#features">Features</a>
              <a href="#how-it-works">How it works</a>
              <a href="#websites">Wedding websites</a>
              <a href="#faqs">FAQs</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Make My Marriage</span>
            <span>Made for meaningful celebrations.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
