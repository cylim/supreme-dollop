import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeEmail, requireUser } from "./model";

const optionInput = v.object({
  startAt: v.number(),
  endAt: v.number(),
  source: v.union(v.literal("exact"), v.literal("range")),
});

const optionView = v.object({
  id: v.id("scheduleOptions"),
  startAt: v.number(),
  endAt: v.number(),
  source: v.union(v.literal("exact"), v.literal("range")),
  availableCount: v.number(),
  myVote: v.union(v.boolean(), v.null()),
});

const summary = v.object({
  id: v.id("schedules"),
  slug: v.string(),
  title: v.string(),
  visibility: v.union(v.literal("public"), v.literal("invited")),
  timezone: v.string(),
  votingClosesAt: v.number(),
  status: v.union(
    v.literal("open"),
    v.literal("awaiting_confirmation"),
    v.literal("finalized"),
    v.literal("cancelled"),
  ),
});

const invitationView = v.object({
  email: v.string(),
  status: v.union(v.literal("pending"), v.literal("voted")),
});

function assertFiniteTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new Error(`${label} is invalid.`);
  }
}

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("invited")),
    timezone: v.string(),
    durationMinutes: v.number(),
    votingClosesAt: v.number(),
    options: v.array(optionInput),
    inviteEmails: v.array(v.string()),
  },
  returns: v.object({
    id: v.id("schedules"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const title = args.title.trim();
    if (title.length < 3 || title.length > 120) {
      throw new Error("Use a title between 3 and 120 characters.");
    }
    if (
      !Number.isInteger(args.durationMinutes) ||
      args.durationMinutes < 15 ||
      args.durationMinutes > 480
    ) {
      throw new Error("Duration must be between 15 minutes and 8 hours.");
    }
    assertFiniteTimestamp(args.votingClosesAt, "Voting deadline");
    if (args.votingClosesAt <= Date.now() + 60_000) {
      throw new Error("Voting must stay open for at least one minute.");
    }
    if (args.options.length < 2 || args.options.length > 100) {
      throw new Error("Add between 2 and 100 candidate times.");
    }

    const seen = new Set<string>();
    for (const option of args.options) {
      assertFiniteTimestamp(option.startAt, "Candidate start");
      assertFiniteTimestamp(option.endAt, "Candidate end");
      if (option.endAt <= option.startAt) {
        throw new Error("Each candidate must end after it starts.");
      }
      const key = `${option.startAt}:${option.endAt}`;
      if (seen.has(key)) throw new Error("Candidate times must be unique.");
      seen.add(key);
    }

    const inviteEmails = Array.from(
      new Set(args.inviteEmails.map(normalizeEmail).filter(Boolean)),
    );
    if (inviteEmails.length > 100) {
      throw new Error("A schedule can invite at most 100 people.");
    }
    if (args.visibility === "invited" && inviteEmails.length === 0) {
      throw new Error("Invite-only schedules need at least one email.");
    }

    const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const description = args.description?.trim();
    const scheduleId = await ctx.db.insert("schedules", {
      hostId: user._id,
      slug,
      title,
      ...(description ? { description: description.slice(0, 1_000) } : {}),
      visibility: args.visibility,
      timezone: args.timezone.slice(0, 80),
      durationMinutes: args.durationMinutes,
      votingClosesAt: args.votingClosesAt,
      status: "open",
    });

    for (const option of args.options.sort((a, b) => a.startAt - b.startAt)) {
      await ctx.db.insert("scheduleOptions", {
        scheduleId,
        startAt: option.startAt,
        endAt: option.endAt,
        source: option.source,
        availableCount: 0,
      });
    }

    if (args.visibility === "invited") {
      for (const email of inviteEmails) {
        await ctx.db.insert("invitations", {
          scheduleId,
          email,
          status: "pending",
        });
      }
      const notificationRunId = await ctx.db.insert("notificationRuns", {
        scheduleId,
        kind: "invitation",
        status: "pending",
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendInvitations, {
        scheduleId,
        notificationRunId,
      });
    }

    await ctx.scheduler.runAt(
      args.votingClosesAt,
      internal.schedules.closeVoting,
      { scheduleId },
    );
    return { id: scheduleId, slug };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(summary),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_host_and_status", (q) => q.eq("hostId", user._id))
      .order("desc")
      .take(50);
    return schedules.map((schedule) => ({
      id: schedule._id,
      slug: schedule.slug,
      title: schedule.title,
      visibility: schedule.visibility,
      timezone: schedule.timezone,
      votingClosesAt: schedule.votingClosesAt,
      status: schedule.status,
    }));
  },
});

export const getBySlug = query({
  args: { slug: v.string(), now: v.number() },
  returns: v.union(
    v.object({
      id: v.id("schedules"),
      title: v.string(),
      description: v.union(v.string(), v.null()),
      visibility: v.union(v.literal("public"), v.literal("invited")),
      timezone: v.string(),
      durationMinutes: v.number(),
      votingClosesAt: v.number(),
      status: v.union(
        v.literal("open"),
        v.literal("awaiting_confirmation"),
        v.literal("finalized"),
        v.literal("cancelled"),
      ),
      isHost: v.boolean(),
      canVote: v.boolean(),
      selectedOptionId: v.union(v.id("scheduleOptions"), v.null()),
      recommendedOptionId: v.union(v.id("scheduleOptions"), v.null()),
      options: v.array(optionView),
      invitations: v.array(invitationView),
      participantCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (schedule === null) return null;
    const isHost = schedule.hostId === user._id;

    let invitation = null;
    if (schedule.visibility === "invited" && !isHost) {
      invitation = await ctx.db
        .query("invitations")
        .withIndex("by_schedule_and_email", (q) =>
          q.eq("scheduleId", schedule._id).eq("email", user.email),
        )
        .unique();
      if (invitation === null) {
        throw new Error("This schedule is limited to invited guests.");
      }
    }

    const options = await ctx.db
      .query("scheduleOptions")
      .withIndex("by_schedule_and_start_at", (q) =>
        q.eq("scheduleId", schedule._id),
      )
      .take(100);
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_schedule_and_user", (q) =>
        q.eq("scheduleId", schedule._id).eq("userId", user._id),
      )
      .take(100);
    const votesByOption = new Map(
      votes.map((vote) => [vote.optionId, vote.available]),
    );
    const participants = await ctx.db
      .query("scheduleParticipants")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .take(250);
    const invitations = isHost
      ? await ctx.db
          .query("invitations")
          .withIndex("by_schedule_and_status", (q) =>
            q.eq("scheduleId", schedule._id),
          )
          .take(100)
      : [];
    const recommended = options.reduce<(typeof options)[number] | null>(
      (best, option) =>
        best === null ||
        option.availableCount > best.availableCount ||
        (option.availableCount === best.availableCount &&
          option.startAt < best.startAt)
          ? option
          : best,
      null,
    );

    return {
      id: schedule._id,
      title: schedule.title,
      description: schedule.description ?? null,
      visibility: schedule.visibility,
      timezone: schedule.timezone,
      durationMinutes: schedule.durationMinutes,
      votingClosesAt: schedule.votingClosesAt,
      status: schedule.status,
      isHost,
      canVote: schedule.status === "open" && schedule.votingClosesAt > args.now,
      selectedOptionId: schedule.selectedOptionId ?? null,
      recommendedOptionId: recommended?._id ?? null,
      options: options.map((option) => ({
        id: option._id,
        startAt: option.startAt,
        endAt: option.endAt,
        source: option.source,
        availableCount: option.availableCount,
        myVote: votesByOption.get(option._id) ?? null,
      })),
      invitations: invitations.map((item) => ({
        email: item.email,
        status: item.status,
      })),
      participantCount: participants.length,
    };
  },
});

export const submitVote = mutation({
  args: {
    scheduleId: v.id("schedules"),
    responses: v.array(
      v.object({
        optionId: v.id("scheduleOptions"),
        available: v.boolean(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const schedule = await ctx.db.get("schedules", args.scheduleId);
    if (schedule === null) throw new Error("Schedule not found.");
    if (schedule.status !== "open" || schedule.votingClosesAt <= Date.now()) {
      if (schedule.status === "open") {
        await ctx.db.patch("schedules", schedule._id, {
          status: "awaiting_confirmation",
          closedAt: Date.now(),
        });
      }
      throw new Error("Voting has closed.");
    }
    if (args.responses.length > 100) {
      throw new Error("Too many voting responses.");
    }

    let invitation = null;
    if (schedule.visibility === "invited" && schedule.hostId !== user._id) {
      invitation = await ctx.db
        .query("invitations")
        .withIndex("by_schedule_and_email", (q) =>
          q.eq("scheduleId", schedule._id).eq("email", user.email),
        )
        .unique();
      if (invitation === null) throw new Error("You were not invited.");
    }

    const deduped = new Map(
      args.responses.map((response) => [response.optionId, response.available]),
    );
    if (deduped.size !== args.responses.length) {
      throw new Error("Each candidate may be voted on once.");
    }

    const scheduleOptions = await ctx.db
      .query("scheduleOptions")
      .withIndex("by_schedule_and_start_at", (q) =>
        q.eq("scheduleId", schedule._id),
      )
      .take(100);
    if (deduped.size !== scheduleOptions.length) {
      throw new Error("Submit one response for every candidate time.");
    }

    for (const [optionId, available] of deduped) {
      const option = await ctx.db.get("scheduleOptions", optionId);
      if (option === null || option.scheduleId !== schedule._id) {
        throw new Error("A candidate does not belong to this schedule.");
      }
      const existing = await ctx.db
        .query("votes")
        .withIndex("by_option_and_user", (q) =>
          q.eq("optionId", optionId).eq("userId", user._id),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("votes", {
          scheduleId: schedule._id,
          optionId,
          userId: user._id,
          available,
          updatedAt: Date.now(),
        });
        if (available) {
          await ctx.db.patch("scheduleOptions", optionId, {
            availableCount: option.availableCount + 1,
          });
        }
      } else if (existing.available !== available) {
        await ctx.db.patch("votes", existing._id, { available, updatedAt: Date.now() });
        await ctx.db.patch("scheduleOptions", optionId, {
          availableCount: Math.max(
            0,
            option.availableCount + (available ? 1 : -1),
          ),
        });
      }
    }

    const participant = await ctx.db
      .query("scheduleParticipants")
      .withIndex("by_schedule_and_user", (q) =>
        q.eq("scheduleId", schedule._id).eq("userId", user._id),
      )
      .unique();
    if (participant === null) {
      await ctx.db.insert("scheduleParticipants", {
        scheduleId: schedule._id,
        userId: user._id,
        votedAt: Date.now(),
      });
    } else {
      await ctx.db.patch("scheduleParticipants", participant._id, { votedAt: Date.now() });
    }

    if (invitation !== null && invitation.status !== "voted") {
      await ctx.db.patch("invitations", invitation._id, { status: "voted" });
      const pending = await ctx.db
        .query("invitations")
        .withIndex("by_schedule_and_status", (q) =>
          q.eq("scheduleId", schedule._id).eq("status", "pending"),
        )
        .first();
      if (pending === null) {
        await ctx.db.patch("schedules", schedule._id, {
          status: "awaiting_confirmation",
          closedAt: Date.now(),
        });
      }
    }
    return null;
  },
});

export const chooseFinal = mutation({
  args: {
    scheduleId: v.id("schedules"),
    optionId: v.id("scheduleOptions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const schedule = await ctx.db.get("schedules", args.scheduleId);
    if (schedule === null) throw new Error("Schedule not found.");
    if (schedule.hostId !== user._id) throw new Error("Only the host can choose.");
    if (schedule.status !== "awaiting_confirmation") {
      throw new Error("Voting must close before choosing the final time.");
    }
    const option = await ctx.db.get("scheduleOptions", args.optionId);
    if (option === null || option.scheduleId !== schedule._id) {
      throw new Error("That candidate does not belong to this schedule.");
    }
    await ctx.db.patch("schedules", schedule._id, {
      selectedOptionId: option._id,
      status: "finalized",
      finalizedAt: Date.now(),
    });
    const notificationRunId = await ctx.db.insert("notificationRuns", {
      scheduleId: schedule._id,
      kind: "finalized",
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.notifications.sendFinalized, {
      scheduleId: schedule._id,
      notificationRunId,
    });
    return null;
  },
});

export const closeVoting = internalMutation({
  args: { scheduleId: v.id("schedules") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get("schedules", args.scheduleId);
    if (schedule !== null && schedule.status === "open") {
      await ctx.db.patch("schedules", schedule._id, {
        status: "awaiting_confirmation",
        closedAt: Date.now(),
      });
    }
    return null;
  },
});
