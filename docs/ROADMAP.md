# Known limitations and roadmap

## Known limitations

These are the honest edges of the current release. Each is also labelled in the in-app Marketplace.

| Area | Limitation |
| --- | --- |
| Reminders and automation | Run only while LIFEOS is open on at least one device. Missed schedules run once when the app is next opened. There are no push notifications while the app is closed. |
| Attachments | Files attached to records stay in the browser where they were added. They are not uploaded, synced or included in JSON backups. |
| Calendar | No two-way sync with Google or Outlook. `.ics` import and export work. Recurring events support daily / weekly (by weekday) / monthly / yearly rules; exceptions to a series and "nth weekday of the month" are not supported. |
| Currencies | Exchange rates are reference values the user maintains, not a live feed. |
| Vision board | Cards use text, emoji and colour; no photos. |
| Journal privacy | Private entries are hidden in the interface but not separately encrypted. |
| Encryption | Data is encrypted in transit (HTTPS) and at rest by the database host, not end-to-end. The server operator can read synced data. |
| Sync | Conflicts on the same field are resolved by device time (the losing value is always kept and restorable). Sync is polling (about 30 s, plus on focus, reconnect and after edits), not real-time push. |
| Collaboration | Single-user. There is no sharing between accounts. |
| Password reset by e-mail | Requires a Resend API key on the deployment; otherwise the recovery code is the only reset path. |
| Search | Substring matching across all text; no typo tolerance or ranking by meaning. |
| Recommendations | Entertainment suggestions come from the user's own library only. |
| Browsers | Tested in Chromium. Firefox and Safari are expected to work (standard APIs only) but were not tested. |
| Hosting | The current deployment uses free tiers: the service sleeps when idle and the free database expires after 30 days unless upgraded. |
| AI | There are no AI features. Nothing in the product depends on a paid API. |

One housekeeping note: an empty file `scripts/gen-schema.py` was left in the working directory during the build (it is
excluded from git and not part of the repository).

## Roadmap

The registry is designed for 500+ capabilities; these are the next steps in rough priority order.

**Next**
1. **Web Push and a server-side job runner** — reminders and scheduled automations while the app is closed (VAPID keys,
   a cron-triggered endpoint, per-device subscriptions).
2. **Object storage for attachments** — upload endpoint with size/type checks, signed URLs, attachments in notes.
3. **End-to-end encryption option** — a user-held key encrypting record payloads before sync.
4. **External calendar sync** — Google and Microsoft OAuth with incremental sync; until then CalDAV subscription links.
5. **Hybrid logical clocks** for conflict ordering independent of device clocks.

**Then**
- Recurrence exceptions and "nth weekday" rules; drag-to-reschedule in week view.
- Real-time sync channel (server-sent events) on top of the existing cursor protocol.
- Full-text index in a web worker; saved searches and filters.
- Photo cards for the vision board; image attachments for notes and inventory.
- Shared workspaces (household budgets, shopping lists, trips) with per-record permissions.
- Import adapters: Todoist, Notion, Google Keep, bank statement formats (OFX/QIF).
- Optional AI assistance with a user-provided key: summarise a week, draft a plan, natural-language capture.
- Native wrappers (Capacitor) for widgets, share-sheet capture and background sync.
- Automated accessibility audits (axe) and visual regression tests in CI; Firefox and WebKit test projects.
- Authorised webhooks through a server-side, allow-listed relay.

**Module ideas that fit the registry without architectural change**
Recipes and meal planning · medication and symptom log · pet care · plant care · vehicle log · reading highlights ·
people CRM with last-contact reminders · gift planner · chores rota · home energy log · career log and CV builder ·
investment tracker · tax document checklist · language-learning vocabulary · music practice log · packing templates.
