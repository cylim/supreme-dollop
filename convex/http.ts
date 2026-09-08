import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { callback } from "./calendar";
import { receiveAgentMail } from './agentMailWebhook'
import { llmsTxt } from './llms'

const http = httpRouter();

http.route({ path: "/calendar/callback", method: "GET", handler: callback });
http.route({ path: '/agentmail/webhook', method: 'POST', handler: receiveAgentMail })
http.route({ path: '/llms.txt', method: 'GET', handler: llmsTxt })
registerStaticRoutes(http, components.staticHosting);

export default http;
