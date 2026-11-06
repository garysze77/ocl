/**
 * ocl — IVS Realtime Web Player（Cloudflare Worker 版）
 *
 * 對應原本 Express/Vercel 嘅 api/token.js（@aws-sdk/client-ivs-realtime）。
 *
 * ⚠️ 關鍵：IVS RealTime 用 AWS JSON 1.1 協議，唔係 REST 路徑。
 *   POST https://ivsrealtime.<region>.amazonaws.com/GetStage            {"arn": "<stageArn>"}
 *   POST https://ivsrealtime.<region>.amazonaws.com/CreateParticipantToken
 *        {"stageArn": "...", "userId": "...", "capabilities": ["SUBSCRIBE"], "duration": 720}
 *   （寫成 /stage/{arn} 會回 403 "Unable to determine service/operation name"）
 *
 * 回傳同舊版一致：token / userId / stageArn / participantId / expirationTime /
 * whepUrl / whipUrl / eventsUrl / endpoints{...}
 *
 * Secrets：AWS_REGION、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY
 */
import { AwsClient } from "aws4fetch";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(pad));
  } catch {
    return {};
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/token") {
      if (request.method === "OPTIONS") return json({ ok: true });
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const region = env.AWS_REGION || "ap-northeast-1";
      const accessKeyId = env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) {
        return json({ error: "AWS 憑證未設定（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）" }, 500);
      }

      let stageArn = "";
      try {
        const b = await request.json();
        stageArn = (b?.stageArn || "").trim();
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      if (!stageArn) return json({ error: "stageArn is required" }, 400);

      const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "ivs", region });
      const base = `https://ivsrealtime.${region}.amazonaws.com`;

      const call = async (op, body) => {
        const res = await aws.fetch(`${base}/${op}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body || {}),
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        if (!res.ok) throw new Error(`AWS ${op} ${res.status}: ${data?.message || text.slice(0, 200)}`);
        return data;
      };

      try {
        const stageResp = await call("GetStage", { arn: stageArn });
        const stage = stageResp?.stage || {};
        const stageId = stageArn.split("/").pop();
        const whepUrl = `https://${stageId}.${region}.whep.live-video.net/`;

        const userId = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const tokenResp = await call("CreateParticipantToken", {
          stageArn,
          userId,
          capabilities: ["SUBSCRIBE"],
          duration: 720,
        });
        const pt = tokenResp?.participantToken || {};
        const payload = decodeJwtPayload(pt.token || "");

        return json({
          token: pt.token,
          userId: pt.userId || userId,
          stageArn,
          participantId: pt.participantId,
          expirationTime: pt.expirationTime || null,
          whepUrl,
          whipUrl: payload.whip_url || stage?.endpoints?.whip || null,
          eventsUrl: payload.events_url || stage?.endpoints?.events || null,
          endpoints: {
            whepUrl,
            eventsUrl: payload.events_url || stage?.endpoints?.events || null,
            whipUrl: payload.whip_url || stage?.endpoints?.whip || null,
            rtmp: stage?.endpoints?.rtmp || null,
            rtmps: stage?.endpoints?.rtmps || null,
          },
          stage: { arn: stage.arn, name: stage.name, activeSessionId: stage.activeSessionId || null },
        });
      } catch (e) {
        return json({ error: String(e.message || e) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
