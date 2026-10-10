# Existing backend connection

The published planner currently stores data on the device. The user chose an existing backend; its provider/repository, API URL, and sign-in method are still needed. No new service has been provisioned and no live cloud connection is claimed.

## Planner sync contract

Implement `PlannerSyncTransport` from `src/lib/sync-core.ts` using the existing authenticated API:

```ts
read(): Promise<{ revision: string | null; state: PlannerState | null }>;
compareAndSwap(expectedRevision: string | null, state: PlannerState): Promise<
  | { status: "saved"; snapshot: SyncSnapshot }
  | { status: "conflict"; snapshot: SyncSnapshot }
>;
```

A missing plan returns both fields as `null`. Each accepted write changes the opaque revision and returns the exact saved state. Comparing the expected revision and writing must be atomic on the server. The server derives ownership from the authenticated user; a request body must not grant access to another user's plan. Validate the full versioned planner payload and enforce the same 10 MB limit before accepting a write.

The tested client core merges independent record and field edits against a confirmed shared version. Divergent edits, deletion-versus-edit conflicts, and combined changes that break references stop synchronization. A competing server write returns a retry result instead of overwriting the new revision. The eventual UI must retain the local plan and its recovery copy until a successful server confirmation, show pending/offline changes, and ask the user to resolve actual conflicts before replacing data.

## Team tasker contract

Implement `DelegationTransport` from `src/lib/delegation.ts`:

```ts
publishOffer(offer: TaskerOffer): Promise<{ remoteId: string }>;
submitUpdate(remoteId: string, update: TaskerUpdate): Promise<void>;
readUpdates(remoteId: string): Promise<TaskerUpdate[]>;
```

The API must identify the authenticated supervisor and recipient, enforce access to each offer, retain ordered updates, and prevent recipient submissions from marking a supervisor's source tasker complete. Completion remains a separate supervisor review action with prerequisite checks. Names/emails in the portable packets are descriptive and are not proof of identity. Live invitations can be generated only after there is an actual endpoint and access control for the recipient.

## Configuration needed

- Backend service or source repository, API base URL, and development/test environment.
- Existing sign-in flow and how browser requests obtain a user session.
- Existing planner/team endpoints or permission to add them to that backend.
- Allowed origin `https://daftccc.github.io` and appropriate session/CORS behavior for the Pages deployment.

Public configuration may be supplied in deployment variables. Private server credentials and administrative keys belong on the server, never in the web bundle. OAuth calendar connections and closed-app notification delivery need the backend's supported OAuth/push facilities and can be implemented after its capabilities are known. Current `.ics` exports, foreground reminders, and portable offer/update files work independently.
