import { recordAuditHit } from "./lib/audit-hit.js";

export default {
  async fetch(request, env, ctx) {
    recordAuditHit(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
