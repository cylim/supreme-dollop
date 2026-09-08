# Scheduling

JRNY Plan coordinates group availability and lets a host choose a final event time from candidate times.

## Language

**Schedule**:
A proposal for an event with candidate times, a voting deadline, and an access mode.
_Avoid_: Poll, meeting

**Host**:
The signed-in user who creates a schedule and exclusively chooses its final time.
_Avoid_: Owner, organizer

**Participant**:
A signed-in user who submits a ballot for a schedule.
_Avoid_: Voter, guest

**Candidate time**:
A possible start and end time on which participants vote.
_Avoid_: Slot, option

**Ballot**:
One participant's availability response for every candidate time in a schedule.
_Avoid_: Vote, response

**Invitation**:
The grant that allows a signed-in user with a matching email address to access an invited schedule.
_Avoid_: Invite

**Public schedule**:
A schedule accessible to any signed-in user.
_Avoid_: Open schedule

**Invited schedule**:
A schedule accessible only to its host and participants with invitations.
_Avoid_: Private schedule, invite-only schedule

**Voting close**:
The transition after which ballots are no longer accepted and the host may choose a final time. Public schedules close at their deadline; invited schedules also close when every invitee has submitted a ballot.
_Avoid_: Poll end, expiration

**Final time**:
The candidate time selected by the host after voting closes.
_Avoid_: Winning option, result

**Calendar availability**:
Busy time ranges read from a participant's connected Google Calendar to inform their ballot without exposing event details.
_Avoid_: Calendar events, calendar data

**Schedule request**:
An authenticated inbound email asking JRNY Plan to create a schedule from an explicit, machine-readable description.
_Avoid_: Email command, email schedule

**Requester**:
The verified JRNY Plan user whose sender address submits a schedule request and who becomes the schedule's host.
_Avoid_: Sender, email user
