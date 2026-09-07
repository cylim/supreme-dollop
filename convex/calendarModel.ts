import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireUser } from "./model";

export const createOauthState = internalMutation({
  args: {
    userSubject: v.string(),
    state: v.string(),
    expiresAt: v.number(),
    redirectTo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userSubject);
    if (userId === null || (await ctx.db.get("users", userId)) === null) {
      throw new Error("Account not found.");
    }
    await ctx.db.insert("calendarOauthStates", {
      state: args.state,
      userId,
      expiresAt: args.expiresAt,
      redirectTo: args.redirectTo,
    });
    return null;
  },
});

export const consumeOauthState = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.object({ userId: v.id("users"), redirectTo: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("calendarOauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (state === null) return null;
    await ctx.db.delete("calendarOauthStates", state._id);
    if (state.expiresAt < Date.now()) return null;
    return { userId: state.userId, redirectTo: state.redirectTo };
  },
});

export const getConnection = internalQuery({
  args: { userSubject: v.string() },
  returns: v.union(
    v.object({
      id: v.id("calendarConnections"),
      encryptedAccessToken: v.string(),
      encryptedRefreshToken: v.union(v.string(), v.null()),
      accessTokenExpiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userSubject);
    if (userId === null) return null;
    const connection = await ctx.db
      .query("calendarConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (connection === null) return null;
    return {
      id: connection._id,
      encryptedAccessToken: connection.encryptedAccessToken,
      encryptedRefreshToken: connection.encryptedRefreshToken ?? null,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.optional(v.string()),
    accessTokenExpiresAt: v.number(),
    scope: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendarConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const value = {
      encryptedAccessToken: args.encryptedAccessToken,
      ...(args.encryptedRefreshToken
        ? { encryptedRefreshToken: args.encryptedRefreshToken }
        : {}),
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      scope: args.scope,
      connectedAt: Date.now(),
    };
    if (existing === null) {
      await ctx.db.insert("calendarConnections", { userId: args.userId, ...value });
    } else {
      await ctx.db.patch("calendarConnections", existing._id, value);
    }
    return null;
  },
});

export const updateAccessToken = internalMutation({
  args: {
    connectionId: v.id("calendarConnections"),
    encryptedAccessToken: v.string(),
    accessTokenExpiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get("calendarConnections", args.connectionId);
    if (connection !== null) {
      await ctx.db.patch("calendarConnections", connection._id, {
        encryptedAccessToken: args.encryptedAccessToken,
        accessTokenExpiresAt: args.accessTokenExpiresAt,
      });
    }
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const connection = await ctx.db
      .query("calendarConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (connection !== null) await ctx.db.delete("calendarConnections", connection._id);
    return null;
  },
});
