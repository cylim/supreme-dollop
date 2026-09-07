import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("You must be signed in.");
  }
  const userId = ctx.db.normalizeId("users", identity.subject);
  if (userId === null) {
    throw new Error("Your account could not be found.");
  }
  const user = await ctx.db.get("users", userId);
  if (user === null) {
    throw new Error("Your account could not be found.");
  }
  return user;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
