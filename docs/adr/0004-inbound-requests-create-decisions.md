# Inbound email creates schedules and decisions atomically

AgentMail still authenticates the sender as an existing user who becomes host (ADR 0001). One JSON object creates a standalone decision, a schedule, or a schedule with attached decisions. The app is unshipped, so the payload requires an explicit kind instead of treating a missing type as a schedule. Create is atomic: if any nested decision is invalid, nothing is created. One AgentMail event ID still means one successful object set.
