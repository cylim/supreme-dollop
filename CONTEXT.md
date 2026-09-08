# JRNY Plan

JRNY Plan is how a signed-in group agrees. A host proposes candidate times on a schedule and later chooses a final time. A host can also pose a decision with labeled options to collect opinion.

## Language

### Access

**Host**:
The signed-in user who created a schedule or a decision.
_Avoid_: Owner, organizer

**Participant**:
A signed-in user who currently has a ballot for a schedule or a decision.
_Avoid_: Voter, guest

**Ballot**:
One participant's response to a schedule or a decision. A schedule ballot is availability for every candidate time. A decision ballot names at least one option. Removing the last option retracts the ballot.
_Avoid_: Vote, response

**Invitation**:
The grant that allows a signed-in user with a matching email address to access an invited schedule or an invited decision.
_Avoid_: Invite

**Public schedule**:
A schedule accessible to any signed-in user.
_Avoid_: Open schedule

**Invited schedule**:
A schedule accessible only to its host and participants with invitations.
_Avoid_: Private schedule, invite-only schedule

**Public decision**:
A standalone decision accessible to any signed-in user.
_Avoid_: Open decision, anonymous decision

**Invited decision**:
A standalone decision accessible only to its host and participants with invitations.
_Avoid_: Private decision, invite-only decision

### Schedule

**Schedule**:
A proposal for an event with candidate times, a voting deadline, and an access mode.
_Avoid_: Poll, meeting

**Candidate time**:
A possible start and end time on which participants vote.
_Avoid_: Slot, option

**Voting close**:
The transition after which schedule ballots are no longer accepted and the host may choose a final time. Public schedules close at their deadline; invited schedules also close when every invitee has submitted a ballot.
_Avoid_: Poll end, expiration

**Final time**:
The candidate time selected by the host after voting closes.
_Avoid_: Winning option, result

**Calendar availability**:
Busy time ranges read from a participant's connected Google Calendar to inform their ballot without exposing event details.
_Avoid_: Calendar events, calendar data

### Inbound

**Inbound request**:
An authenticated inbound email whose JSON creates a schedule, a standalone decision, or a schedule with attached decisions.
_Avoid_: Email command, email schedule, email poll

**Schedule request**:
An inbound request that creates a schedule and may include attached decisions in the same JSON.
_Avoid_: Email command, email schedule

**Decision request**:
An inbound request that creates one standalone decision.
_Avoid_: Email poll, vote mail

**Requester**:
The verified JRNY Plan user whose sender address submits an inbound request and who becomes the host of every object that request creates.
_Avoid_: Sender, email user

### Decision

**Decision**:
A host-posed question with labeled options and an access mode.
_Avoid_: Poll, vote, survey

**Option**:
A labeled choice on a decision.
_Avoid_: Choice, item, answer

**Select mode**:
Whether a decision ballot names exactly one option or may name several. The host sets it when creating the decision and cannot change it later.
_Avoid_: Vote type, plurality

**Standalone decision**:
A decision with its own access mode and invitations. It is created unattached and cannot be attached later.
_Avoid_: Free poll, loose vote

**Attached decision**:
A decision that belongs to one schedule and uses that schedule's current access mode and invitations. It has no invitations of its own. Only the schedule host can create it. It cannot become standalone. Finalizing the schedule does not close it.
_Avoid_: Nested poll, sub-vote, child vote

**Decision close**:
The transition after which decision ballots are no longer accepted. The host may close a decision at any time. A decision with a deadline also closes when the deadline passes. Close cannot be reversed. No winning option is chosen.
_Avoid_: Final decision, result, poll end

**Closed decision**:
A decision that has passed decision close. Ballots and options stay visible and cannot change.
_Avoid_: Deleted decision, archived decision
