/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as calendarModel from "../calendarModel.js";
import type * as e2eAuthPolicy from "../e2eAuthPolicy.js";
import type * as http from "../http.js";
import type * as model from "../model.js";
import type * as notificationModel from "../notificationModel.js";
import type * as notificationPolicy from "../notificationPolicy.js";
import type * as notifications from "../notifications.js";
import type * as schedules from "../schedules.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  calendar: typeof calendar;
  calendarModel: typeof calendarModel;
  e2eAuthPolicy: typeof e2eAuthPolicy;
  http: typeof http;
  model: typeof model;
  notificationModel: typeof notificationModel;
  notificationPolicy: typeof notificationPolicy;
  notifications: typeof notifications;
  schedules: typeof schedules;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/core/_generated/component.js").ComponentApi<"auth">;
  oauthGoogle: import("@convex-dev/auth/providers/oauth/_generated/component.js").ComponentApi<"oauthGoogle">;
  authPasswordProvider: import("@convex-dev/auth/providers/password/_generated/component.js").ComponentApi<"authPasswordProvider">;
  authUsername: import("@convex-dev/auth/username/_generated/component.js").ComponentApi<"authUsername">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
