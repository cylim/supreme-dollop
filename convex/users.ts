import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./model";

const viewerValidator = v.object({
  id: v.id("users"),
  email: v.string(),
  name: v.union(v.string(), v.null()),
  picture: v.union(v.string(), v.null()),
});

export const createUser = internalMutation({
  args: {
    provider: v.literal("google"),
    providerAccountId: v.string(),
    profile: vGoogleProfile,
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    if (!args.profile.email || !args.profile.emailVerified) {
      throw new Error("A verified Google email is required.");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_provider_account_id", (q) =>
        q.eq("providerAccountId", args.providerAccountId),
      )
      .unique();
    if (existing !== null) {
      await ctx.db.patch("users", existing._id, {
        email: args.profile.email.toLowerCase(),
        name: args.profile.name,
        picture: args.profile.picture,
      });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      providerAccountId: args.providerAccountId,
      email: args.profile.email.toLowerCase(),
      name: args.profile.name,
      picture: args.profile.picture,
    });
  },
});

export const viewer = query({
  args: {},
  returns: v.union(viewerValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = ctx.db.normalizeId("users", identity.subject);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (user === null) return null;
    return {
      id: user._id,
      email: user.email,
      name: user.name ?? null,
      picture: user.picture ?? null,
    };
  },
});

export const calendarStatus = query({
  args: {},
  returns: v.object({ connected: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const connection = await ctx.db
      .query("calendarConnections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return { connected: connection !== null };
  },
});
