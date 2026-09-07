import { v } from "convex/values";
import { action, env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const busyPeriod = v.object({ startAt: v.number(), endAt: v.number() });

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Calendar encryption is not configured.");
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) {
    throw new Error("Calendar encryption key must contain 32 bytes.");
  }
  return await crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv) },
    await encryptionKey(),
    asArrayBuffer(new TextEncoder().encode(value)),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string): Promise<string> {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("Stored calendar token is invalid.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(ivPart)) },
    await encryptionKey(),
    asArrayBuffer(base64ToBytes(encryptedPart)),
  );
  return new TextDecoder().decode(decrypted);
}

function appUrl(): string {
  const value = env.APP_URL;
  if (!value) throw new Error("APP_URL is not configured.");
  return value.replace(/\/$/, "");
}

export const startConnect = action({
  args: { returnPath: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("You must be signed in.");
    const clientId = env.AUTH_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Google Calendar is not configured.");
    const state = crypto.randomUUID();
    const safePath = args.returnPath?.startsWith("/") ? args.returnPath : "/";
    await ctx.runMutation(internal.calendarModel.createOauthState, {
      userSubject: identity.subject,
      state,
      expiresAt: Date.now() + 10 * 60_000,
      redirectTo: `${appUrl()}${safePath}`,
    });
    const callbackUrl = `${env.CONVEX_SITE_URL}/calendar/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events.freebusy",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
});

export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateValue || !code || url.searchParams.has("error")) {
    return Response.redirect(`${appUrl()}/?calendar=error`, 302);
  }
  const state = await ctx.runMutation(internal.calendarModel.consumeOauthState, {
    state: stateValue,
  });
  if (state === null) {
    return Response.redirect(`${appUrl()}/?calendar=expired`, 302);
  }
  const clientId = env.AUTH_GOOGLE_CLIENT_ID;
  const clientSecret = env.AUTH_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${state.redirectTo}?calendar=error`, 302);
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${env.CONVEX_SITE_URL}/calendar/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    console.error("Google Calendar token exchange failed", response.status);
    return Response.redirect(`${state.redirectTo}?calendar=error`, 302);
  }
  const tokens = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };
  await ctx.runMutation(internal.calendarModel.saveConnection, {
    userId: state.userId,
    encryptedAccessToken: await encrypt(tokens.access_token),
    ...(tokens.refresh_token
      ? { encryptedRefreshToken: await encrypt(tokens.refresh_token) }
      : {}),
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1_000,
    scope: tokens.scope ?? "",
  });
  const separator = state.redirectTo.includes("?") ? "&" : "?";
  return Response.redirect(`${state.redirectTo}${separator}calendar=connected`, 302);
});

export const getBusyTimes = action({
  args: { timeMin: v.number(), timeMax: v.number() },
  returns: v.array(busyPeriod),
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.timeMin) ||
      !Number.isFinite(args.timeMax) ||
      args.timeMax <= args.timeMin ||
      args.timeMax - args.timeMin > 366 * 24 * 60 * 60 * 1_000
    ) {
      throw new Error("Calendar range must be between one minute and one year.");
    }
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("You must be signed in.");
    const connection = await ctx.runQuery(internal.calendarModel.getConnection, {
      userSubject: identity.subject,
    });
    if (connection === null) throw new Error("Connect Google Calendar first.");

    let accessToken = await decrypt(connection.encryptedAccessToken);
    if (connection.accessTokenExpiresAt <= Date.now() + 60_000) {
      if (connection.encryptedRefreshToken === null) {
        throw new Error("Reconnect Google Calendar.");
      }
      const clientId = env.AUTH_GOOGLE_CLIENT_ID;
      const clientSecret = env.AUTH_GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error("Calendar is not configured.");
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: await decrypt(connection.encryptedRefreshToken),
          grant_type: "refresh_token",
        }),
      });
      if (!refreshResponse.ok) throw new Error("Reconnect Google Calendar.");
      const refreshed = (await refreshResponse.json()) as {
        access_token: string;
        expires_in: number;
      };
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.calendarModel.updateAccessToken, {
        connectionId: connection.id,
        encryptedAccessToken: await encrypt(accessToken),
        accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1_000,
      });
    }

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          timeMin: new Date(args.timeMin).toISOString(),
          timeMax: new Date(args.timeMax).toISOString(),
          items: [{ id: "primary" }],
        }),
      },
    );
    if (!response.ok) throw new Error("Google Calendar availability failed.");
    const result = (await response.json()) as {
      calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
    };
    return (result.calendars?.primary?.busy ?? []).map((period) => ({
      startAt: new Date(period.start).getTime(),
      endAt: new Date(period.end).getTime(),
    }));
  },
});
