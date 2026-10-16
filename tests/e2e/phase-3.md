# Phase 3 manual checklist — briefings in the owner's voice

Prereqs: phase 2 runner online for the owner, a style guide filled in under Settings.

- [ ] Devs see the Briefings tab but only an "Owner only" notice.
- [ ] Briefings → New briefing → Status update, no task, optional instructions. The briefing page shows "Waiting for your runner…" then "Claude is drafting…", and the draft appears without reloading.
- [ ] The drafting session (link in the header) shows `auth none`/`oauth`, no Bash/Read/Write tools, one `submit_briefing` call, then Completed.
- [ ] The draft reads as you: first person, your style guide applied, no task numbers unless the client uses them, a clear "what we need from you" when something is blocked.
- [ ] Edit the text, Preview renders markdown, "Save edits" persists after reload.
- [ ] "Regenerate with feedback" queues a new drafting session; the new draft reflects the feedback.
- [ ] "I sent this" (with "email" in Sent via) marks it Sent, records the draft → final pair, and adds a system comment on the task when one is bound. The original draft is viewable on the sent briefing.
- [ ] Create a second status update: the drafting session's system prompt contains "How <you> edit drafts" with the previous pair, and the previously sent update under "Previously sent".
- [ ] Pre-task questions and Blocker require a task; the task's description, comments, subtasks and PRs are in the first message.
- [ ] Release notes list merged PRs from the last two weeks without PR numbers or file names.
- [ ] Inbox (owner) shows "Briefing drafts to review" while a draft is pending; it disappears once sent or discarded.
- [ ] Discard a queued briefing: its session ends; the briefing is listed under Sent & discarded.
- [ ] Nothing is ever sent automatically; there is no email/Slack integration.
- [ ] The hidden anchor task (T-0 "Client communication") never appears on the board, inbox, overview or proposal selects.
