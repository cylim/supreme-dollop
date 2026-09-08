import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const scheduleStatus = v.union(
  v.literal('open'),
  v.literal('awaiting_confirmation'),
  v.literal('finalized'),
  v.literal('cancelled'),
)

export default defineSchema({
  users: defineTable({
    providerAccountId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  })
    .index('by_provider_account_id', ['providerAccountId'])
    .index('by_email', ['email']),

  schedules: defineTable({
    hostId: v.id('users'),
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal('public'), v.literal('invited')),
    timezone: v.string(),
    durationMinutes: v.number(),
    votingClosesAt: v.number(),
    status: scheduleStatus,
    selectedOptionId: v.optional(v.id('scheduleOptions')),
    closedAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_host_and_status', ['hostId', 'status'])
    .index('by_status_and_voting_closes_at', ['status', 'votingClosesAt']),

  scheduleOptions: defineTable({
    scheduleId: v.id('schedules'),
    startAt: v.number(),
    endAt: v.number(),
    source: v.union(v.literal('exact'), v.literal('range')),
    availableCount: v.number(),
  }).index('by_schedule_and_start_at', ['scheduleId', 'startAt']),

  invitations: defineTable({
    scheduleId: v.id('schedules'),
    email: v.string(),
    status: v.union(v.literal('pending'), v.literal('voted')),
  })
    .index('by_schedule_and_email', ['scheduleId', 'email'])
    .index('by_schedule_and_status', ['scheduleId', 'status']),

  votes: defineTable({
    scheduleId: v.id('schedules'),
    optionId: v.id('scheduleOptions'),
    userId: v.id('users'),
    available: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_option_and_user', ['optionId', 'userId'])
    .index('by_schedule_and_user', ['scheduleId', 'userId']),

  scheduleParticipants: defineTable({
    scheduleId: v.id('schedules'),
    userId: v.id('users'),
    votedAt: v.number(),
  })
    .index('by_schedule_and_user', ['scheduleId', 'userId'])
    .index('by_schedule', ['scheduleId']),

  calendarOauthStates: defineTable({
    state: v.string(),
    userId: v.id('users'),
    expiresAt: v.number(),
    redirectTo: v.string(),
  }).index('by_state', ['state']),

  calendarConnections: defineTable({
    userId: v.id('users'),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    accessTokenExpiresAt: v.number(),
    scope: v.string(),
    connectedAt: v.number(),
  }).index('by_user', ['userId']),

  decisions: defineTable({
    hostId: v.id('users'),
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    scheduleId: v.optional(v.id('schedules')),
    visibility: v.optional(v.union(v.literal('public'), v.literal('invited'))),
    selectMode: v.union(v.literal('single'), v.literal('multi')),
    closesAt: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('closed')),
    closedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_host', ['hostId'])
    .index('by_schedule', ['scheduleId'])
    .index('by_status_and_closes_at', ['status', 'closesAt']),

  decisionOptions: defineTable({
    decisionId: v.id('decisions'),
    label: v.string(),
    order: v.number(),
    selectionCount: v.number(),
  }).index('by_decision_and_order', ['decisionId', 'order']),

  decisionInvitations: defineTable({
    decisionId: v.id('decisions'),
    email: v.string(),
  }).index('by_decision_and_email', ['decisionId', 'email']),

  decisionVotes: defineTable({
    decisionId: v.id('decisions'),
    optionId: v.id('decisionOptions'),
    userId: v.id('users'),
    updatedAt: v.number(),
  })
    .index('by_option_and_user', ['optionId', 'userId'])
    .index('by_decision_and_user', ['decisionId', 'userId'])
    .index('by_option', ['optionId']),

  decisionParticipants: defineTable({
    decisionId: v.id('decisions'),
    userId: v.id('users'),
    votedAt: v.number(),
  })
    .index('by_decision_and_user', ['decisionId', 'userId'])
    .index('by_decision', ['decisionId']),

  notificationRuns: defineTable({
    scheduleId: v.optional(v.id('schedules')),
    decisionId: v.optional(v.id('decisions')),
    kind: v.union(
      v.literal('invitation'),
      v.literal('finalized'),
      v.literal('decision_invitation'),
    ),
    status: v.union(
      v.literal('pending'),
      v.literal('sent'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
    attemptedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  })
    .index('by_schedule_and_kind', ['scheduleId', 'kind'])
    .index('by_decision_and_kind', ['decisionId', 'kind']),

  inboundScheduleRequests: defineTable({
    eventId: v.string(),
    messageId: v.string(),
    inboxId: v.string(),
    senderEmail: v.string(),
    body: v.optional(v.string()),
    status: v.union(
      v.literal('pending'),
      v.literal('created'),
      v.literal('rejected'),
    ),
    scheduleId: v.optional(v.id('schedules')),
    decisionId: v.optional(v.id('decisions')),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    replyStatus: v.optional(
      v.union(v.literal('sent'), v.literal('failed'), v.literal('skipped')),
    ),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index('by_event_id', ['eventId'])
    .index('by_message_id', ['messageId']),
})
