# Authenticate deterministic email schedule requests

Schedule requests received through AgentMail use a signed, versioned JSON email protocol instead of free-form language. The sender must match an existing verified JRNY Plan user and becomes the host; AgentMail event IDs make creation idempotent. This trades conversational flexibility for unambiguous dates, testable behavior, and protection against forged or duplicated schedule creation.
