import { useMemo, useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  HeartHandshake,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { usePlanner } from "../lib/planner";
import { removePlannerRecord } from "../lib/relationships";
import {
  SUPPORT_AGENCIES,
  SUPPORT_NEEDS,
  SUPPORT_SOURCE,
  matchAgencyContacts,
  matchSupportNeed,
} from "../lib/support-resources";
import type { Contact, Member } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import "./professional.css";
import "./support.css";

const emptyContact = (): Omit<Contact, "id"> => ({
  name: "",
  role: "",
  agency: "",
  phone: "",
  email: "",
  location: "",
  notes: "",
});
const roles = [
  "Wingman",
  "Supervisor",
  "Rater",
  "Section Chief",
  "Flight Chief",
  "Flight Commander",
  "First Sergeant",
  "Senior Enlisted Leader",
  "Squadron Commander",
  "Resource agency",
];
function contactGroup(
  contact: Contact,
): "Wingman" | "Chain of command" | "Resources" {
  if (/wingman/i.test(contact.role)) return "Wingman";
  if (
    /supervisor|rater|chief|commander|first sergeant|senior enlisted|\bSEL\b/i.test(
      contact.role,
    )
  )
    return "Chain of command";
  return "Resources";
}
function memberRole(contact: Contact): NonNullable<Member["role"]> {
  const group = contactGroup(contact);
  if (group === "Wingman") return "Wingman";
  if (group === "Chain of command")
    return /commander|senior enlisted|\bSEL\b|first sergeant/i.test(
      contact.role,
    )
      ? "Senior leader"
      : "Supervisor";
  return "Resource";
}
function ContactActions({ contact }: { contact: Contact }) {
  return (
    <div className="support-contact-actions">
      {contact.phone && (
        <a
          className="button secondary"
          href={`tel:${encodeURIComponent(contact.phone.trim())}`}
        >
          <Phone size={14} /> Call
        </a>
      )}
      {contact.email && (
        <a
          className="button secondary"
          href={`mailto:${encodeURIComponent(contact.email.trim())}`}
        >
          <Mail size={14} /> Email
        </a>
      )}
    </div>
  );
}

export default function Support() {
  const { state, mutate } = usePlanner();
  const [needId, setNeedId] = useState(SUPPORT_NEEDS[0].id);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All contacts");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [draft, setDraft] = useState(emptyContact);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedNeed = SUPPORT_NEEDS.find((need) => need.id === needId)!;
  const matches = matchSupportNeed(needId);
  const visibleContacts = useMemo(
    () =>
      [...state.contacts]
        .filter(
          (contact) =>
            (group === "All contacts" || contactGroup(contact) === group) &&
            [
              contact.name,
              contact.role,
              contact.agency,
              contact.phone,
              contact.email,
              contact.location,
              contact.notes,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.contacts, query, group],
  );
  const linkedMembers = state.members.filter(
    (member) =>
      member.contactId &&
      state.contacts.some((contact) => contact.id === member.contactId),
  );
  const coveredNeeds = SUPPORT_NEEDS.filter((need) =>
    matchSupportNeed(need.id).some(
      (match) =>
        matchAgencyContacts(match.agency.id, state.contacts).length > 0,
    ),
  ).length;

  const openContact = (contact: Contact | "new", agency = "") => {
    setError("");
    setDraft(
      contact === "new"
        ? { ...emptyContact(), agency, role: agency }
        : {
            name: contact.name,
            role: contact.role,
            agency: contact.agency,
            phone: contact.phone,
            email: contact.email,
            location: contact.location,
            notes: contact.notes,
          },
    );
    setEditing(contact);
  };
  const saveContact = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Enter a name or local office name.");
      return;
    }
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(draft.email.trim())) {
      setError("Enter a valid email address or leave it blank.");
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()]),
    ) as Omit<Contact, "id">;
    mutate((next) => {
      if (editing === "new")
        next.contacts.push({ ...changes, id: crypto.randomUUID() });
      else if (editing) {
        const contact = next.contacts.find((item) => item.id === editing.id);
        if (contact) Object.assign(contact, changes);
      }
    });
    setNotice(editing === "new" ? "Local contact added." : "Contact updated.");
    setEditing(null);
  };
  const addToTeam = (contact: Contact) => {
    if (state.members.some((member) => member.contactId === contact.id)) return;
    mutate((next) =>
      next.members.push({
        id: crypto.randomUUID(),
        name: contact.name,
        rank: "",
        focus: "",
        nextFeedback: "",
        notes: "",
        contactId: contact.id,
        team: "",
        supervisorId: "",
        role: memberRole(contact),
      }),
    );
    setNotice(`${contact.name} added to Leadership with this contact linked.`);
  };

  return (
    <div className="professional-stack support-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">KNOW WHO TO TURN TO</span>
          <h1>People &amp; support</h1>
          <p>Your wingman, chain of command, and local support resources.</p>
        </div>
        <button className="button primary" onClick={() => openContact("new")}>
          <Plus size={17} /> Add contact
        </button>
      </header>
      <div className="professional-summary">
        <div className="professional-stat">
          <span>LOCAL CONTACTS</span>
          <strong>{state.contacts.length}</strong>
        </div>
        <div className="professional-stat">
          <span>TEAM CONNECTIONS</span>
          <strong>{linkedMembers.length}</strong>
        </div>
        <div className="professional-stat">
          <span>NEEDS WITH A LOCAL CONTACT</span>
          <strong>
            {coveredNeeds}
            <span> / {SUPPORT_NEEDS.length}</span>
          </strong>
        </div>
      </div>
      {notice && (
        <p className="small professional-icon" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <section
        className="panel support-helping"
        aria-labelledby="helping-hands-heading"
      >
        <div className="panel-heading">
          <div>
            <h2 id="helping-hands-heading">
              <HeartHandshake size={20} /> Helping Hands
            </h2>
            <p className="small muted">
              Choose a need to find relevant starting points and your saved
              local contacts.
            </p>
          </div>
          <span className="badge">Need → agency</span>
        </div>
        <label className="field support-need-select">
          What kind of support are you looking for?
          <select
            value={needId}
            onChange={(event) => setNeedId(event.target.value)}
          >
            {(["Family", "Personal", "Finance", "Legal"] as const).map(
              (category) => (
                <optgroup label={category} key={category}>
                  {SUPPORT_NEEDS.filter((need) => need.group === category).map(
                    (need) => (
                      <option value={need.id} key={need.id}>
                        {need.label}
                      </option>
                    ),
                  )}
                </optgroup>
              ),
            )}
          </select>
        </label>
        {selectedNeed.urgent && (
          <div className="support-urgent" role="note">
            <strong>Immediate safety comes first.</strong>
            <p>
              If someone is in immediate danger, contact local emergency
              services. In the U.S., call 911.{" "}
              {needId === "suicide-prevention" ? (
                <>
                  For the Military Crisis Line in the U.S., call{" "}
                  <a href="tel:988">988, then press 1</a>, or text{" "}
                  <a href="sms:838255">838255</a>. See the{" "}
                  <a
                    href="https://www.militaryonesource.mil/health-wellness/mental-health/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    official mental health resource
                  </a>{" "}
                  for current options.
                </>
              ) : (
                <>
                  For abuse or sexual assault, ask a specialist about safety,
                  privacy, and reporting options before sharing details.
                </>
              )}
            </p>
          </div>
        )}
        <div className="support-matches">
          {matches.map(({ agency, reason }) => {
            const local = matchAgencyContacts(agency.id, state.contacts);
            return (
              <article
                className="support-match"
                aria-label={`Support resource ${agency.name}`}
                key={agency.id}
              >
                <div className="professional-heading-row">
                  <h3>{agency.name}</h3>
                  <span className="badge">
                    {local.length
                      ? `${local.length} local ${local.length === 1 ? "contact" : "contacts"}`
                      : "Starting point"}
                  </span>
                </div>
                <p className="support-reason">{reason}</p>
                <details className="support-agency-scope">
                  <summary>What this resource offers</summary>
                  <p className="small muted">{agency.description}</p>
                </details>
                {local.map((contact) => (
                  <div className="support-local-match" key={contact.id}>
                    <strong>{contact.name}</strong>
                    <span className="small muted">
                      {[contact.phone, contact.email, contact.location]
                        .filter(Boolean)
                        .join(" · ") || contact.role}
                    </span>
                    <ContactActions contact={contact} />
                  </div>
                ))}
                <div className="support-match-actions">
                  {agency.url && (
                    <a
                      className="button ghost"
                      href={agency.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={14} />
                      {agency.sourceLabel || "Public resource"}
                    </a>
                  )}
                  <button
                    className="button secondary"
                    onClick={() => openContact("new", agency.name)}
                  >
                    <Plus size={14} /> Add local contact
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <details className="support-matrix">
          <summary>
            <BookOpen size={16} /> View the full Helping Hands matrix{" "}
            <ChevronDown size={15} />
          </summary>
          <div className="support-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Need</th>
                  <th scope="col">Relevant starting points</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT_NEEDS.map((need) => (
                  <tr key={need.id}>
                    <th scope="row">
                      <span className="small muted">{need.group}</span>
                      <br />
                      {need.label}
                    </th>
                    <td>
                      {matchSupportNeed(need.id)
                        .map(({ agency }) => agency.name)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="small muted support-source">
          {SUPPORT_SOURCE.explanation} Public resource links were checked during
          this release. Programs vary by installation; confirm scope and access
          with the agency. Local details below are your own entries.
        </p>
      </section>
      <section
        className="professional-stack"
        aria-labelledby="contact-directory-heading"
        style={{ gap: 18 }}
      >
        <div className="professional-heading-row">
          <div>
            <h2 id="contact-directory-heading" style={{ margin: 0 }}>
              Your contact directory
            </h2>
            <p className="small muted">
              Keep useful contact details close at hand.
            </p>
          </div>
          <a className="button secondary" href="#leadership">
            <Users size={15} /> Open Leadership
          </a>
        </div>
        <div className="professional-filters">
          <label className="field search-field">
            Search contacts
            <div className="professional-search">
              <Search size={17} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, role, agency, or location"
              />
            </div>
          </label>
          <label className="field">
            Contact group
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option>All contacts</option>
              <option>Wingman</option>
              <option>Chain of command</option>
              <option>Resources</option>
            </select>
          </label>
        </div>
        {visibleContacts.length ? (
          <div className="card-grid">
            {visibleContacts.map((contact) => {
              const members = state.members.filter(
                (member) => member.contactId === contact.id,
              );
              return (
                <article
                  className="professional-item support-contact"
                  aria-label={`Contact ${contact.name}`}
                  key={contact.id}
                >
                  <div className="professional-heading-row">
                    <span className="badge">{contactGroup(contact)}</span>
                    <div className="professional-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit contact ${contact.name}`}
                        onClick={() => openContact(contact)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete contact ${contact.name}`}
                        onClick={() => setDeleting(contact)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 style={{ marginTop: 14 }}>{contact.name}</h3>
                  <p className="small muted">
                    {[contact.role, contact.agency]
                      .filter(Boolean)
                      .join(" · ") || "Local contact"}
                  </p>
                  <dl className="support-contact-details">
                    {contact.phone && (
                      <div>
                        <dt>
                          <Phone size={14} />
                          <span>Phone</span>
                        </dt>
                        <dd>{contact.phone}</dd>
                      </div>
                    )}
                    {contact.email && (
                      <div>
                        <dt>
                          <Mail size={14} />
                          <span>Email</span>
                        </dt>
                        <dd>{contact.email}</dd>
                      </div>
                    )}
                    {contact.location && (
                      <div>
                        <dt>
                          <MapPin size={14} />
                          <span>Location</span>
                        </dt>
                        <dd>{contact.location}</dd>
                      </div>
                    )}
                  </dl>
                  {contact.notes && (
                    <p className="support-contact-notes small">
                      {contact.notes}
                    </p>
                  )}
                  <ContactActions contact={contact} />
                  {members.length ? (
                    <p className="small muted support-team-link">
                      <Users size={14} />
                      Linked to{" "}
                      {members.map((member) => member.name).join(", ")}
                    </p>
                  ) : (
                    <button
                      className="button ghost"
                      style={{ marginTop: 12 }}
                      onClick={() => addToTeam(contact)}
                    >
                      <UserPlus size={15} /> Add to Leadership
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel professional-empty">
            <Users size={29} />
            <h3>
              {state.contacts.length
                ? "No contacts match this view"
                : "Build your local support network"}
            </h3>
            <p>
              {state.contacts.length
                ? "Try another search or contact group."
                : "Add a wingman, supervisor, or local resource office. No personal contact details are prefilled."}
            </p>
            {!state.contacts.length && (
              <button
                className="button primary"
                style={{ marginTop: 18 }}
                onClick={() => openContact("new")}
              >
                <Plus size={16} /> Add your first contact
              </button>
            )}
          </div>
        )}
      </section>
      {editing && (
        <ProfessionalDialog
          title={
            editing === "new" ? "Add a local contact" : "Edit local contact"
          }
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveContact}>
            <div className="professional-modal-body">
              <label className="field">
                Name or local office name
                <input
                  autoFocus
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  maxLength={160}
                  placeholder="A person or local resource office"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Role
                  <input
                    list="support-contact-roles"
                    value={draft.role}
                    onChange={(event) =>
                      setDraft({ ...draft, role: event.target.value })
                    }
                    maxLength={160}
                    placeholder="Wingman, supervisor, resource agency…"
                  />
                  <datalist id="support-contact-roles">
                    {roles.map((role) => (
                      <option value={role} key={role} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  Agency
                  <input
                    list="support-agencies"
                    value={draft.agency}
                    onChange={(event) =>
                      setDraft({ ...draft, agency: event.target.value })
                    }
                    maxLength={200}
                    placeholder="Agency or organization"
                  />
                  <datalist id="support-agencies">
                    {SUPPORT_AGENCIES.map((agency) => (
                      <option value={agency.name} key={agency.id} />
                    ))}
                  </datalist>
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  Phone
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft({ ...draft, phone: event.target.value })
                    }
                    maxLength={80}
                  />
                </label>
                <label className="field">
                  Email
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) =>
                      setDraft({ ...draft, email: event.target.value })
                    }
                    maxLength={254}
                  />
                </label>
              </div>
              <label className="field">
                Location
                <input
                  value={draft.location}
                  onChange={(event) =>
                    setDraft({ ...draft, location: event.target.value })
                  }
                  maxLength={300}
                  placeholder="Installation, building, or office"
                />
              </label>
              <label className="field">
                Useful notes
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                  maxLength={3000}
                  placeholder="Hours, preferred contact method, or services to ask about"
                />
              </label>
              <p className="small muted">
                Save only contact information you are authorized to keep. These
                entries stay in your local planner.
              </p>
              {error && (
                <p className="error-text small" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Save contact
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {deleting && (
        <ProfessionalDialog
          title="Remove this contact?"
          onClose={() => setDeleting(null)}
        >
          <p>
            This removes {deleting.name}'s contact details. Linked team members
            stay in Leadership, and their contact link is cleared.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Keep contact
            </button>
            <button
              className="button primary"
              onClick={() => {
                mutate((next) =>
                  removePlannerRecord(next, "contacts", deleting.id),
                );
                setDeleting(null);
                setNotice("Contact removed. Team records preserved.");
              }}
            >
              Remove contact
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
