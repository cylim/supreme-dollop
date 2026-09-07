import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { callback } from "./calendar";

const http = httpRouter();

http.route({ path: "/calendar/callback", method: "GET", handler: callback });
registerStaticRoutes(http, components.staticHosting);

export default http;
