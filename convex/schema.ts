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
  }).index('by_provider_account_id', ['providerAccountId']),

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

  notificationRuns: defineTable({
    scheduleId: v.id('schedules'),
    kind: v.union(v.literal('invitation'), v.literal('finalized')),
    status: v.union(
      v.literal('pending'),
      v.literal('sent'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
    attemptedAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  }).index('by_schedule_and_kind', ['scheduleId', 'kind']),
})
