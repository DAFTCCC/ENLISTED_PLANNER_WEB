import { useState, type FormEvent } from "react";
import { Download, FileInput, Handshake, Plus, Send } from "lucide-react";
import { usePlanner } from "../lib/planner";
import { formatDate, localDate } from "../lib/dates";
import {
  applyReviewedUpdate,
  buildTaskerOffer,
  buildTaskerUpdate,
  closeDelegation,
  closeDelegationError,
  parseTaskerOffer,
  parseTaskerUpdate,
  RECIPIENT_STATUSES,
  updateReviewError,
  type RecipientStatus,
  type TaskerOffer,
  type TaskerUpdate,
} from "../lib/delegation";
import type { Delegation, Page } from "../lib/types";
import ProfessionalDialog from "./ProfessionalDialog";
import "./professional.css";
import "./team-intake.css";

function downloadPacket(packet: TaskerOffer | TaskerUpdate) {
  const blob = new Blob([JSON.stringify(packet, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${packet.kind === "enlisted-planner-tasker-offer" ? "tasker-offer" : "tasker-update"}-${packet.kind === "enlisted-planner-tasker-offer" ? packet.delegation.id : packet.delegationId}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Review the packet and try again.";
const dateLabel = (value: string) =>
  value ? formatDate(value) : "No suspense date";

export default function TeamTaskers({
  onNavigate,
}: {
  onNavigate?: (page: Page) => void;
  onOpenDay?: (date: string, taskId?: string) => void;
}) {
  const { state, mutate } = usePlanner();
  const [tab, setTab] = useState<"owner" | "recipient">("owner");
  const [notice, setNotice] = useState("");
  const [offerDialog, setOfferDialog] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [assignOwner, setAssignOwner] = useState(true);
  const [packet, setPacket] = useState<TaskerOffer | TaskerUpdate | null>(null);
  const [updateText, setUpdateText] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<TaskerUpdate | null>(null);
  const [closeId, setCloseId] = useState("");
  const [offerText, setOfferText] = useState("");
  const [receivedOffer, setReceivedOffer] = useState<TaskerOffer | null>(null);
  const [recipientStatus, setRecipientStatus] =
    useState<RecipientStatus>("Accepted");
  const [progress, setProgress] = useState("0");
  const [blocker, setBlocker] = useState("");
  const [notes, setNotes] = useState("");

  function chooseMember(id: string) {
    setMemberId(id);
    const member = state.members.find((value) => value.id === id);
    setRecipientName(member?.name ?? "");
    setRecipientEmail(
      state.contacts.find((contact) => contact.id === member?.contactId)
        ?.email ?? "",
    );
  }
  function beginOffer() {
    const task = state.tasks.find(
      (value) =>
        !value.completed &&
        !state.delegations.some(
          (delegation) =>
            delegation.taskId === value.id &&
            !["Closed", "Declined"].includes(delegation.status),
        ),
    );
    setTaskId(task?.id ?? "");
    chooseMember(task?.assigneeId ?? "");
    setAssignOwner(true);
    setNotice("");
    setOfferDialog(true);
  }
  function saveOffer(event: FormEvent) {
    event.preventDefault();
    const task = state.tasks.find((value) => value.id === taskId);
    if (!task || task.completed) {
      setNotice("Choose an open tasker before preparing an offer.");
      return;
    }
    if (
      state.delegations.some(
        (delegation) =>
          delegation.taskId === taskId &&
          !["Closed", "Declined"].includes(delegation.status),
      )
    ) {
      setNotice(
        "This tasker already has an active offer. Review that offer first.",
      );
      return;
    }
    if (!recipientName.trim()) {
      setNotice("Add the recipient's name.");
      return;
    }
    if (memberId && !state.members.some((member) => member.id === memberId)) {
      setNotice(
        "The selected teammate no longer exists. Select the recipient again.",
      );
      return;
    }
    const date = localDate();
    const delegation: Delegation = {
      id: crypto.randomUUID(),
      taskId,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      status: "Offered",
      sentOn: date,
      updatedOn: date,
      progress: 0,
      blocker: "",
      notes: "",
    };
    try {
      const prepared = buildTaskerOffer(state, delegation);
      const saved = mutate((draft) => {
        draft.delegations.push(delegation);
        if (memberId && assignOwner)
          draft.tasks.find((value) => value.id === taskId)!.assigneeId =
            memberId;
      });
      if (!saved) {
        setNotice(
          "The offer could not be saved. Check the planner's storage message and try again.",
        );
        return;
      }
      setOfferDialog(false);
      setPacket(prepared);
      setNotice(
        "Offer prepared. Share the downloaded packet with the recipient using your usual approved channel.",
      );
    } catch (error) {
      setNotice(message(error));
    }
  }
  function reviewUpdate() {
    try {
      const update = parseTaskerUpdate(updateText);
      const error = updateReviewError(update, state);
      if (error) throw new Error(error);
      setPendingUpdate(update);
      setNotice("");
    } catch (error) {
      setNotice(message(error));
    }
  }
  function applyUpdate() {
    if (!pendingUpdate) return;
    const error = updateReviewError(pendingUpdate, state);
    if (error) {
      setNotice(error);
      setPendingUpdate(null);
      return;
    }
    if (!mutate((draft) => applyReviewedUpdate(draft, pendingUpdate))) {
      setNotice(
        "The update could not be saved. Check the planner's storage message and try again.",
      );
      return;
    }
    setPendingUpdate(null);
    setUpdateText("");
    setNotice(
      pendingUpdate.status === "Submitted"
        ? "Submission recorded. Review the work, then confirm completion to close the tasker."
        : "Reviewed recipient update recorded.",
    );
  }
  function openReceivedOffer() {
    try {
      const offered = parseTaskerOffer(offerText);
      setReceivedOffer(offered);
      setRecipientStatus("Accepted");
      setProgress("0");
      setBlocker("");
      setNotes("");
      setNotice("");
    } catch (error) {
      setNotice(message(error));
    }
  }
  function prepareUpdate(event: FormEvent) {
    event.preventDefault();
    if (!receivedOffer) return;
    try {
      setPacket(
        buildTaskerUpdate(receivedOffer, {
          status: recipientStatus,
          progress: Number(progress),
          blocker: blocker.trim(),
          notes: notes.trim(),
        }),
      );
      setNotice(
        "Update prepared. Return this packet to the supervisor for review; your changes have not been sent automatically.",
      );
    } catch (error) {
      setNotice(message(error));
    }
  }
  async function readFile(
    file: File | undefined,
    setter: (value: string) => void,
  ) {
    if (!file) return;
    if (file.size > 100_000) {
      setNotice("Tasker packets must be under 100 KB.");
      return;
    }
    try {
      setter(await file.text());
      setNotice("");
    } catch {
      setNotice("This file could not be read. Paste its JSON text instead.");
    }
  }

  const active = state.delegations.filter(
    (delegation) => !["Closed", "Declined"].includes(delegation.status),
  );
  const pendingTask = state.tasks.find(
    (task) => task.id === pendingUpdate?.taskId,
  );
  const closing = state.delegations.find(
    (delegation) => delegation.id === closeId,
  );
  return (
    <div className="team-intake-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">OWNERSHIP & FOLLOW-THROUGH</span>
          <h1>Team taskers</h1>
          <p>
            Offer clear work, review progress, and confirm the result together.
          </p>
        </div>
        <button className="button primary" onClick={beginOffer}>
          <Plus size={17} />
          Prepare offer
        </button>
      </div>
      {notice && (
        <p className="team-notice" role="status">
          {notice}
        </p>
      )}
      <div
        className="professional-tabs"
        role="tablist"
        aria-label="Tasker exchange"
      >
        <button
          role="tab"
          aria-selected={tab === "owner"}
          onClick={() => setTab("owner")}
        >
          My offers
        </button>
        <button
          role="tab"
          aria-selected={tab === "recipient"}
          onClick={() => setTab("recipient")}
        >
          Recipient workspace
        </button>
      </div>
      <div className="panel team-exchange-note">
        <Handshake size={23} />
        <div>
          <h2>Portable tasker exchange</h2>
          <p>
            Download an offer, share it with your teammate, and review the
            update they return. Packets contain the tasker details you choose to
            share. They carry recipient names, but do not authenticate identity;
            confirm who sent an update before approving it.
          </p>
          <p>
            Live sign-in and shared updates will use your existing backend once
            its connection is configured.
          </p>
        </div>
      </div>
      {tab === "owner" ? (
        <>
          <div className="team-stats">
            <div>
              <strong>{active.length}</strong>
              <span>Active offers</span>
            </div>
            <div>
              <strong>
                {active.filter((value) => value.status === "Blocked").length}
              </strong>
              <span>Need help</span>
            </div>
            <div>
              <strong>
                {active.filter((value) => value.status === "Submitted").length}
              </strong>
              <span>Awaiting review</span>
            </div>
          </div>
          <section className="panel team-import">
            <h2>
              <FileInput size={19} />
              Review a recipient update
            </h2>
            <p>
              Load or paste a returned update. Nothing changes until you approve
              the review.
            </p>
            <label className="field">
              Update JSON
              <textarea
                value={updateText}
                onChange={(event) => setUpdateText(event.target.value)}
                rows={4}
                placeholder="Paste the tasker update packet here"
              />
            </label>
            <div className="team-actions">
              <label className="button secondary team-file">
                Load update file
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    void readFile(event.target.files?.[0], setUpdateText);
                    event.target.value = "";
                  }}
                />
              </label>
              <button
                className="button primary"
                disabled={!updateText.trim()}
                onClick={reviewUpdate}
              >
                Review update
              </button>
            </div>
          </section>
          <section
            className="team-offer-list"
            aria-label="Prepared tasker offers"
          >
            {state.delegations.length ? (
              [...state.delegations].reverse().map((delegation) => {
                const task = state.tasks.find(
                  (value) => value.id === delegation.taskId,
                );
                const closeError = closeDelegationError(state, delegation);
                return (
                  <article
                    className="panel team-offer-card"
                    key={delegation.id}
                  >
                    <div className="team-card-heading">
                      <div>
                        <span className="eyebrow">
                          {delegation.recipientName}
                        </span>
                        <h2>{task?.title ?? "Tasker no longer available"}</h2>
                      </div>
                      <span
                        className={`team-status team-status-${delegation.status.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {delegation.status === "Offered"
                          ? "Offer prepared"
                          : delegation.status}
                      </span>
                    </div>
                    <p className="team-meta">
                      {dateLabel(task?.date ?? "")}
                      {task?.suspenseTime ? ` at ${task.suspenseTime}` : ""} ·
                      Prepared {formatDate(delegation.sentOn)} · Updated{" "}
                      {formatDate(delegation.updatedOn)}
                    </p>
                    <div className="team-progress">
                      <progress
                        value={delegation.progress}
                        max={100}
                        aria-label={`${task?.title ?? "Tasker"} recipient progress`}
                      />
                      <span>{delegation.progress}% reported</span>
                    </div>
                    {delegation.blocker && (
                      <p className="team-blocker">
                        <strong>Needs help:</strong> {delegation.blocker}
                      </p>
                    )}
                    {delegation.notes && (
                      <p className="team-notes">{delegation.notes}</p>
                    )}
                    {delegation.status === "Submitted" && (
                      <p>
                        Recipient reports the work is ready. Confirm the result
                        before completing the tasker.
                      </p>
                    )}
                    {delegation.status === "Submitted" && closeError && (
                      <p className="team-blocker">{closeError}</p>
                    )}
                    {task?.completed && delegation.status !== "Closed" && (
                      <p className="team-meta">
                        The tasker is complete in your plan; this exchange still
                        needs its own review.
                      </p>
                    )}
                    <div className="team-actions">
                      <button
                        className="button secondary"
                        disabled={!task}
                        onClick={() => {
                          try {
                            setPacket(buildTaskerOffer(state, delegation));
                          } catch (error) {
                            setNotice(message(error));
                          }
                        }}
                        aria-label={`Show offer packet: ${task?.title ?? delegation.id}`}
                      >
                        <Download size={16} />
                        Offer packet
                      </button>
                      {delegation.status === "Submitted" && (
                        <button
                          className="button primary"
                          disabled={!!closeError}
                          onClick={() => setCloseId(delegation.id)}
                          aria-label={`Confirm completion: ${task?.title ?? delegation.id}`}
                        >
                          Confirm completion
                        </button>
                      )}
                      {onNavigate && (
                        <button
                          className="button secondary"
                          onClick={() => onNavigate("work")}
                        >
                          Review tasker
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="panel team-empty">
                <Handshake size={32} />
                <h2>Make the next handoff clear</h2>
                <p>
                  Create a tasker in Projects & taskers, then prepare an offer
                  with its deadline, effort, and prerequisites.
                </p>
                {onNavigate && (
                  <button
                    className="button secondary"
                    onClick={() => onNavigate("work")}
                  >
                    Open Projects & taskers
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel team-recipient">
          <h2>Open an offer addressed to you</h2>
          <p>
            Your workspace stays on this page. Preparing an update does not
            change the supervisor's planner; return the packet so they can
            review it.
          </p>
          <label className="field">
            Offer JSON
            <textarea
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
              rows={4}
              placeholder="Paste the tasker offer packet here"
            />
          </label>
          <div className="team-actions">
            <label className="button secondary team-file">
              Load offer file
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  void readFile(event.target.files?.[0], setOfferText);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              className="button primary"
              disabled={!offerText.trim()}
              onClick={openReceivedOffer}
            >
              Open offer
            </button>
          </div>
          {receivedOffer && (
            <div className="team-received">
              <span className="eyebrow">
                FOR {receivedOffer.delegation.recipientName}
              </span>
              <h3>{receivedOffer.task.title}</h3>
              <p>
                {receivedOffer.supervisorName
                  ? `From ${receivedOffer.supervisorName} · `
                  : ""}
                {dateLabel(receivedOffer.task.date)}
                {receivedOffer.task.suspenseTime
                  ? ` at ${receivedOffer.task.suspenseTime}`
                  : ""}
              </p>
              {receivedOffer.task.projectTitle && (
                <p>Project: {receivedOffer.task.projectTitle}</p>
              )}
              {receivedOffer.task.estimatedMinutes !== null && (
                <p>
                  Estimated effort: {receivedOffer.task.estimatedMinutes}{" "}
                  minutes
                </p>
              )}
              {receivedOffer.task.notes && (
                <p className="team-notes">{receivedOffer.task.notes}</p>
              )}
              {receivedOffer.task.prerequisites.length > 0 && (
                <div>
                  <h4>Prerequisites at the time of this offer</h4>
                  <ul>
                    {receivedOffer.task.prerequisites.map((task) => (
                      <li key={task.id}>
                        {task.title} —{" "}
                        {task.completed ? "Complete" : "Still open"}
                      </li>
                    ))}
                  </ul>
                  <p className="team-meta">
                    Ask the supervisor for current status before relying on this
                    snapshot.
                  </p>
                </div>
              )}
              <form onSubmit={prepareUpdate}>
                <div className="form-grid">
                  <label className="field">
                    Your update
                    <select
                      value={recipientStatus}
                      onChange={(event) => {
                        const status = event.target.value as RecipientStatus;
                        setRecipientStatus(status);
                        if (status === "Submitted") setProgress("100");
                      }}
                    >
                      {RECIPIENT_STATUSES.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Reported progress (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={progress}
                      onChange={(event) => setProgress(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className="field">
                  Blocker or help needed
                  <textarea
                    value={blocker}
                    onChange={(event) => setBlocker(event.target.value)}
                    required={recipientStatus === "Blocked"}
                    rows={2}
                  />
                </label>
                <label className="field">
                  Progress notes and result evidence
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                  />
                </label>
                <button className="button primary" type="submit">
                  <Send size={16} />
                  Prepare update packet
                </button>
              </form>
            </div>
          )}
        </section>
      )}
      {offerDialog && (
        <ProfessionalDialog
          title="Prepare a tasker offer"
          onClose={() => setOfferDialog(false)}
        >
          <form onSubmit={saveOffer}>
            {notice && (
              <p className="team-notice" role="alert">
                {notice}
              </p>
            )}
            <label className="field">
              Tasker
              <select
                value={taskId}
                onChange={(event) => {
                  setTaskId(event.target.value);
                  chooseMember(
                    state.tasks.find((task) => task.id === event.target.value)
                      ?.assigneeId ?? "",
                  );
                }}
                required
              >
                <option value="">Choose an open tasker</option>
                {state.tasks
                  .filter((task) => !task.completed)
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Recipient teammate
              <select
                value={memberId}
                onChange={(event) => chooseMember(event.target.value)}
              >
                <option value="">Enter another recipient</option>
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                Recipient name
                <input
                  value={recipientName}
                  onChange={(event) => {
                    setRecipientName(event.target.value);
                    setMemberId("");
                  }}
                  required
                />
              </label>
              <label className="field">
                Recipient email (optional)
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </label>
            </div>
            {memberId && (
              <label className="team-check">
                <input
                  type="checkbox"
                  checked={assignOwner}
                  onChange={(event) => setAssignOwner(event.target.checked)}
                />
                Assign this teammate as the tasker owner
              </label>
            )}
            <p className="team-meta">
              The offer includes this tasker's notes and prerequisite titles.
              Review those details before sharing the downloaded packet.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setOfferDialog(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                Prepare offer packet
              </button>
            </div>
          </form>
        </ProfessionalDialog>
      )}
      {packet && (
        <ProfessionalDialog
          title={
            packet.kind === "enlisted-planner-tasker-offer"
              ? "Tasker offer packet"
              : "Tasker update packet"
          }
          onClose={() => setPacket(null)}
        >
          <p>
            Share this JSON file through your usual approved channel. This
            action does not send an email or update a teammate's account.
          </p>
          <label className="field">
            Packet JSON
            <textarea
              readOnly
              value={JSON.stringify(packet, null, 2)}
              rows={10}
            />
          </label>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPacket(null)}
            >
              Close packet
            </button>
            <button
              className="button primary"
              onClick={() => downloadPacket(packet)}
            >
              <Download size={16} />
              Download packet
            </button>
          </div>
        </ProfessionalDialog>
      )}
      {pendingUpdate && (
        <ProfessionalDialog
          title="Review recipient update"
          onClose={() => setPendingUpdate(null)}
        >
          {notice && (
            <p className="team-notice" role="alert">
              {notice}
            </p>
          )}
          <div className="team-update-review">
            <h3>{pendingTask?.title}</h3>
            <p>
              Recipient: {pendingUpdate.recipientName}
              {pendingUpdate.recipientEmail
                ? ` (${pendingUpdate.recipientEmail})`
                : ""}
            </p>
            <p>
              Reported {formatDate(pendingUpdate.updatedOn)} ·{" "}
              <strong>{pendingUpdate.status}</strong> · {pendingUpdate.progress}
              %
            </p>
            {pendingUpdate.blocker && (
              <p className="team-blocker">Blocker: {pendingUpdate.blocker}</p>
            )}
            {pendingUpdate.notes && (
              <p className="team-notes">{pendingUpdate.notes}</p>
            )}
            <p>
              Confirm that this packet came from the intended recipient and
              review their account of the work. A submission leaves the tasker
              open until you confirm completion.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPendingUpdate(null)}
            >
              Cancel review
            </button>
            <button className="button primary" onClick={applyUpdate}>
              Approve update
            </button>
          </div>
        </ProfessionalDialog>
      )}
      {closing && (
        <ProfessionalDialog
          title="Confirm the completed work"
          onClose={() => setCloseId("")}
        >
          {notice && (
            <p className="team-notice" role="alert">
              {notice}
            </p>
          )}
          <p>
            Have you reviewed the result for “
            {state.tasks.find((task) => task.id === closing.taskId)?.title}”?
            This closes the exchange and marks the linked tasker complete.
          </p>
          {closing.notes && <p className="team-notes">{closing.notes}</p>}
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setCloseId("")}>
              Keep open
            </button>
            <button
              className="button primary"
              onClick={() => {
                const error = closeDelegationError(state, closing);
                if (error) {
                  setNotice(error);
                  setCloseId("");
                  return;
                }
                if (!mutate((draft) => closeDelegation(draft, closeId))) {
                  setNotice(
                    "The tasker could not be closed. Check the planner's storage message and try again.",
                  );
                  return;
                }
                setCloseId("");
                setNotice("Work reviewed and tasker closed.");
              }}
            >
              Close reviewed tasker
            </button>
          </div>
        </ProfessionalDialog>
      )}
    </div>
  );
}
