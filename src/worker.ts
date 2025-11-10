/**
 * Calendar Worker - consolidated
 * - Static assets with password gate (only /dev_console*)
 * - API auth (cookie site_auth OR Authorization: Bearer <password> OR x-site-password)
 * - D1 tables expected: events (with notes), roles, attendance, audit_log, sent_notifications
 * - LINE webhook: Thai commands + Flex + "ensureUser" on follow/message
 * - Scheduled reminders before event times based on type
 * - Endpoint: /api/users/recent?limit=50 -> recent 'follow/first seen' users from audit_log
 */

export interface Env {
  calendar_db: D1Database;
  ASSETS: Fetcher;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  SITE_PASSWORD?: string;
}

/* ----------------------------- Types ------------------------------ */

type EventInput = {
  date: string; time: string; type: string;
  location: string; uniform: string; details: string; notes?: string;
};

/* -------------------------- Validation ---------------------------- */

function validateEventInput(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Invalid input' };
  
  // Validate date (YYYY-MM-DD)
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { valid: false, error: 'Invalid date format (required: YYYY-MM-DD)' };
  }
  
  // Validate time (HH:MM)
  if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) {
    return { valid: false, error: 'Invalid time format (required: HH:MM)' };
  }
  
  // Validate type
  const validTypes = ['ในหน่วย', 'ในกรม', 'บก.ใหญ่', 'นอกหน่วย'];
  if (!data.type || !validTypes.includes(data.type)) {
    return { valid: false, error: 'Invalid type' };
  }
  
  // Validate required text fields
  if (!data.location || typeof data.location !== 'string' || data.location.trim().length === 0) {
    return { valid: false, error: 'Location is required' };
  }
  if (!data.uniform || typeof data.uniform !== 'string' || data.uniform.trim().length === 0) {
    return { valid: false, error: 'Uniform is required' };
  }
  if (!data.details || typeof data.details !== 'string' || data.details.trim().length === 0) {
    return { valid: false, error: 'Details is required' };
  }
  
  // Validate length limits
  if (data.location.length > 500) return { valid: false, error: 'Location too long (max 500 chars)' };
  if (data.uniform.length > 500) return { valid: false, error: 'Uniform too long (max 500 chars)' };
  if (data.details.length > 2000) return { valid: false, error: 'Details too long (max 2000 chars)' };
  if (data.notes && data.notes.length > 2000) return { valid: false, error: 'Notes too long (max 2000 chars)' };
  
  return { valid: true };
}

function validateMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

type RoleRow = { user_id: string; role: "boss" | "secretary" | "viewer"; display_name?: string; updated_at: number };

/* --------------------------- Utilities ---------------------------- */

function json(data: unknown, init: ResponseInit = {}, req?: Request) {
  const origin = req?.headers.get("origin") || "*";
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
  };
  return new Response(JSON.stringify(data), {
    headers,
    ...init,
  });
}

function getCookie(req: Request, name: string) {
  const v = req.headers.get("cookie") || "";
  for (const part of v.split(/;\s*/)) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Gate ONLY /dev_console(.html|/)
function protectPage(req: Request, env: Env) {
  const url = new URL(req.url);
  const protectedPaths = new Set([
    "/dev_console.html","/dev_console","/dev_console/"
  ]);
  if (!protectedPaths.has(url.pathname)) return null;

  // if no password set -> don't block (dev mode)
  if (!env.SITE_PASSWORD) return null;

  const cookie = getCookie(req, "site_auth");
  if (cookie === env.SITE_PASSWORD) return null;

  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Login</title><style>body{font-family:system-ui;background:#0b0b0c;color:#e5e7eb;display:grid;place-items:center;height:100vh}</style>
  <form method="POST" action="/auth/login" style="display:flex;gap:.5rem;flex-direction:column;min-width:300px">
    <h1>ใส่รหัสผ่าน</h1>
    <input type="password" name="password" placeholder="password" style="padding:.6rem;border-radius:.6rem;background:#111827;color:#e5e7eb;border:1px solid #374151">
    <input type="hidden" name="redirect" value="${url.pathname}">
    <button style="padding:.6rem;border-radius:.6rem;background:#10b981;color:#111827;font-weight:700">เข้าสู่ระบบ</button>
  </form>`;
  return new Response(html, { status: 401, headers: { "content-type":"text/html" } });
}

// --- Replace apiAuthOk with this version (only dev_console needs password) ---
function apiAuthOk(req: Request, env: Env): boolean {
  if (!env.SITE_PASSWORD) return true;
  const url = new URL(req.url);
  if (url.pathname === "/webhook/line") return true;

  // Public endpoints (no password):
  if (req.method === "GET" && (url.pathname === "/api/events" || url.pathname.startsWith("/api/summary/"))) {
    return true;
  }
  // Secretary operations (no password as per requirement):
  if (url.pathname.startsWith("/api/events") && (req.method === "POST" || req.method === "PUT" || req.method === "DELETE")) {
    return true;
  }

  // Everything else requires password (dev_console uses this)
  const cookie = getCookie(req, "site_auth");
  if (cookie && cookie === env.SITE_PASSWORD) return true;
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1] === env.SITE_PASSWORD) return true;
  const hdr = req.headers.get("x-site-password");
  if (hdr && hdr === env.SITE_PASSWORD) return true;
  return false;
}

// Bangkok "today" (00:00:00) as Date in UTC
function bkkToday(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const bkkMs = utcMs + 7 * 3600 * 1000;
  const d = new Date(bkkMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toYMD(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseThaiDateOnly(text: string): string | null {
  const m = text.match(/(?:งานวันที่|วันที่)\s*(\d{1,2})(?!\d)/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const now = bkkToday();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = new Date(Date.UTC(y, mo, day));
  return toYMD(d);
}

async function sendLine(env: Env, to: string, message: string) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text: message.slice(0, 4000) }] }),
    });
    if (!res.ok) {
      console.error(`LINE API error: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Failed to send LINE message:", err);
  }
}

async function logAudit(env: Env, actor: string, action: string, entity: string, payload: unknown) {
  const id = crypto.randomUUID();
  const ts = Date.now();
  await env.calendar_db.prepare(
    "INSERT INTO audit_log (id,actor,action,entity,payload,ts) VALUES (?,?,?,?,?,?)"
  ).bind(id, actor, action, entity, JSON.stringify(payload ?? {}), ts).run();
}

/* ----------------------- Flex Message helpers --------------------- */

function typeColor(type: string) {
  switch (type) {
    case "ในหน่วย": return "#10b981";
    case "ในกรม":   return "#0ea5e9";
    case "บก.ใหญ่": return "#f59e0b";
    case "นอกหน่วย":return "#ef4444";
    default:         return "#9ca3af";
  }
}

function typeEmoji(type: string) {
  switch (type) {
    case "ในหน่วย": return "🏢";
    case "ในกรม":   return "🏛️";
    case "บก.ใหญ่": return "⭐";
    case "นอกหน่วย":return "🚗";
    default:         return "📌";
  }
}

function chunkText(s: string, size: number) {
  const out: string[] = [];
  const str = String(s || "");
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

function buildBubble(ev: any) {
  const contents: any[] = [];
  
  // Header: สถานที่ + ประเภท
  contents.push({
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `${typeEmoji(ev.type)} ${ev.location}`,
        weight: "bold",
        size: "xl",
        color: "#FFFFFF",
        wrap: true,
      },
      {
        type: "text",
        text: ev.type,
        size: "sm",
        color: typeColor(ev.type),
        margin: "xs",
      }
    ],
    backgroundColor: typeColor(ev.type) + "33",
    paddingAll: "md",
    cornerRadius: "md",
  });

  contents.push({ type: "separator", margin: "md", color: typeColor(ev.type) + "40" });

  // วันที่และเวลา
  contents.push({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    margin: "md",
    contents: [
      { type: "text", text: "📅", size: "sm", flex: 0, margin: "none" },
      { type: "text", text: "วันที่", color: "#a1a1aa", size: "sm", flex: 2 },
      { type: "text", text: ev.date, size: "sm", flex: 5, wrap: true, color: "#FFFFFF" },
    ],
  });

  contents.push({
    type: "box",
    layout: "baseline",
    spacing: "sm",
    margin: "sm",
    contents: [
      { type: "text", text: "⏰", size: "sm", flex: 0, margin: "none" },
      { type: "text", text: "เวลา", color: "#a1a1aa", size: "sm", flex: 2 },
      { type: "text", text: ev.time, size: "sm", flex: 5, wrap: true, color: "#FFFFFF", weight: "bold" },
    ],
  });

  // ชุด (เครื่องแต่งกาย)
  const uniformChunks = chunkText(ev.uniform, 300);
  uniformChunks.forEach((chunk, idx) => {
    contents.push({
      type: "box",
      layout: "baseline",
      spacing: "sm",
      margin: idx === 0 ? "md" : "sm",
      contents: [
        { type: "text", text: idx === 0 ? "👔" : "", size: "sm", flex: 0, margin: "none" },
        { type: "text", text: idx === 0 ? "ชุด" : "", color: "#a1a1aa", size: "sm", flex: 2 },
        { type: "text", text: chunk, size: "sm", flex: 5, wrap: true, color: "#FFFFFF" },
      ],
    });
  });

  // รายละเอียด
  const detailsChunks = chunkText(ev.details, 300);
  detailsChunks.forEach((chunk, idx) => {
    contents.push({
      type: "box",
      layout: "baseline",
      spacing: "sm",
      margin: idx === 0 ? "md" : "sm",
      contents: [
        { type: "text", text: idx === 0 ? "📋" : "", size: "sm", flex: 0, margin: "none" },
        { type: "text", text: idx === 0 ? "รายละเอียด" : "", color: "#a1a1aa", size: "sm", flex: 2 },
        { type: "text", text: chunk, size: "sm", flex: 5, wrap: true, color: "#FFFFFF" },
      ],
    });
  });

  // กำหนดการ (Notes) - แสดงเฉพาะเมื่อมี
  if (ev.notes && String(ev.notes).trim().length) {
    contents.push({ type: "separator", margin: "md", color: "#fbbf24" + "40" });
    
    // แยกบรรทัด (ถ้ามี bullet points หรือ line breaks)
    const noteLines = String(ev.notes).split(/\n|(?=\d+\.|[\-•])/).filter(l => l.trim());
    
    noteLines.forEach((line, idx) => {
      const chunks = chunkText(line.trim(), 300);
      chunks.forEach((chunk, chunkIdx) => {
        contents.push({
          type: "box",
          layout: "baseline",
          spacing: "sm",
          margin: (idx === 0 && chunkIdx === 0) ? "md" : "sm",
          contents: [
            { type: "text", text: (idx === 0 && chunkIdx === 0) ? "⚠️" : "", size: "sm", flex: 0, margin: "none" },
            { type: "text", text: (idx === 0 && chunkIdx === 0) ? "กำหนดการ" : "", color: "#fbbf24", size: "sm", flex: 2, weight: "bold" },
            { type: "text", text: chunk, size: "sm", flex: 5, wrap: true, color: "#fde68a" },
          ],
        });
      });
    });
  }

  return {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "none", contents },
    styles: { 
      body: { backgroundColor: "#1a1a2e" }
    },
  };
}

function buildFlexForEvents(events: any[]) {
  const bubbles = events.slice(0, 10).map(buildBubble);
  return {
    type: "flex",
    altText: `ตารางงาน ${events[0]?.location || events[0]?.date || ""}`.trim(),
    contents: { type: "carousel", contents: bubbles },
  };
}

async function pushFlexForDate(env: Env, uid: string, ymd: string) {
  const res = await env.calendar_db.prepare("SELECT * FROM events WHERE date=? ORDER BY time").bind(ymd).all();
  const rows = (res.results || []) as any[];
  if (!rows.length) { await sendLine(env, uid, `(${ymd}) ไม่มีรายการ`); return; }
  for (let i = 0; i < rows.length; i += 10) {
    const part = rows.slice(i, i + 10);
    const flex = buildFlexForEvents(part);
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
        body: JSON.stringify({ to: uid, messages: [flex] }),
      });
      if (!res.ok) {
        console.error(`LINE Flex API error: ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to send Flex message:", err);
    }
  }
}

/* --------------------- Notification helpers ---------------------- */

async function notifyBossesNewEvent(env: Env, eventId: string, eventData: any) {
  // เฉพาะงานวันนี้เท่านั้น
  const today = toYMD(bkkToday());
  if (eventData.date !== today) return;

  // หา Boss ทั้งหมด
  const bosses = await env.calendar_db.prepare("SELECT user_id FROM roles WHERE role='boss'").all();
  const bossIds = (bosses.results || []).map((r: any) => r.user_id).filter(Boolean);
  if (!bossIds.length) return;

  // สร้าง Flex Message
  const flex = buildFlexForEvents([eventData]);
  
  // ส่งให้ Boss ทุกคน
  for (const uid of bossIds) {
    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { 
          "content-type": "application/json", 
          "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` 
        },
        body: JSON.stringify({ 
          to: uid, 
          messages: [ 
            { type: "text", text: "🔔 มีงานใหม่เพิ่มเข้ามาวันนี้!" }, 
            flex 
          ] 
        }),
      });
    } catch (err) {
      console.error(`Failed to notify boss ${uid}:`, err);
    }
  }
}

function toBkkDateTime(ymd: string, time: string) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const utcMs = Date.UTC(Y, M - 1, D, h - 7, m, 0, 0); // BKK-7h -> UTC
  return new Date(utcMs);
}

function minutesDiff(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

async function thresholdsForType(env: Env, t: string): Promise<number[]> {
  try {
    const row = await env.calendar_db.prepare("SELECT thresholds FROM notification_settings WHERE type=?").bind(t).first();
    if (row && row.thresholds) {
      return String(row.thresholds).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    }
  } catch (err) {
    console.error("Failed to get thresholds from DB:", err);
  }
  
  // Fallback to hardcoded values
  switch (t) {
    case "ในหน่วย": return [30];
    case "ในกรม":   return [60];
    case "บก.ใหญ่": return [60];
    case "นอกหน่วย":return [120, 60];
    default: return [60];
  }
}

async function shouldSendPreNotif(env: Env, event_id: string, kind: string, user_id: string) {
  const row = await env.calendar_db.prepare(
    "SELECT 1 FROM sent_notifications WHERE event_id=? AND kind=? AND target=?"
  ).bind(event_id, kind, user_id).first();
  return !row;
}

async function markPreNotif(env: Env, event_id: string, kind: string, user_id: string) {
  try {
    await env.calendar_db.prepare(
      "INSERT INTO sent_notifications (event_id,kind,target,sent_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING"
    ).bind(event_id, kind, user_id, Date.now()).run();
  } catch (err) {
    console.error("Failed to mark notification:", err);
  }
}

/* -------------------------- First seen --------------------------- */

async function ensureUser(env: Env, userId: string) {
  if (!userId) return;
  const row = await env.calendar_db.prepare("SELECT 1 FROM roles WHERE user_id=?").bind(userId).first();
  if (!row) {
    const now = Date.now();
    await env.calendar_db.prepare(
      "INSERT INTO roles (user_id, role, updated_at) VALUES (?, 'viewer', ?)"
    ).bind(userId, now).run();
    await logAudit(env, userId, "auto_register", `role:${userId}`, { role: "viewer" });
  }
}

/* ------------------------------ App ------------------------------ */

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Password gate for /dev_console*
    const guard = protectPage(req, env);
    if (guard) return guard;

    // Login endpoint
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const form = await req.formData();
      const passwd = String(form.get("password") || "");
      const redirect = String(form.get("redirect") || "/");
      if (env.SITE_PASSWORD && passwd === env.SITE_PASSWORD) {
        return new Response(null, { status: 303, headers: {
          "Set-Cookie": `site_auth=${encodeURIComponent(passwd)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "Location": redirect
        }});
      }
      return new Response("รหัสผ่านไม่ถูกต้อง", { status: 401 });
    }

    // CORS preflight for API
    if (url.pathname.startsWith("/api/") && req.method === "OPTIONS") {
      const origin = req.headers.get("origin") || "*";
      return new Response(null, { headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,authorization,x-site-password",
        "access-control-allow-credentials": "true",
      }});
    }

    // API auth gate (except for LINE webhook)
    if (url.pathname.startsWith("/api/") && !apiAuthOk(req, env)) {
      return json({ error: "unauthorized" }, { status: 401 });
    }

    /* ------------------------ LINE Webhook ------------------------ */
    if (url.pathname === "/webhook/line" && req.method === "POST") {
      const body = await req.json<any>();
      for (const ev of body.events ?? []) {
        if (ev.type === "follow" && ev.source?.userId) {
          await ensureUser(env, ev.source.userId);
          
          // ส่งข้อความต้นรับพร้อม Quick Reply
          const uid = ev.source.userId;
          const userRole = await env.calendar_db.prepare("SELECT role FROM roles WHERE user_id=?").bind(uid).first();
          const role = userRole ? (userRole as any).role : "viewer";
          
          let welcomeMsg = "ยินดีต้อนรับสู่ระบบตารางงาน! 🎉\n\n";
          
          if (role === "boss") {
            welcomeMsg += "คุณได้รับสิทธิ์ Boss แล้ว\n\nคำสั่งที่ใช้ได้:\n• ตารางงานวันนี้\n• สั่งงานด่วน: ...\n• ส่งไฟล์\n• ช่วยเหลือ\n\nดูคู่มือเต็ม:\nhttps://your-worker.workers.dev/boss-help.html";
          } else if (role === "secretary") {
            welcomeMsg += "คุณได้รับสิทธิ์เลขาแล้ว\n\nจัดการตารางที่:\nhttps://your-worker.workers.dev/secretary.html";
          } else {
            welcomeMsg += "พิมพ์ 'ช่วยเหลือ' เพื่อดูคำสั่งที่ใช้ได้";
          }
          
          await sendLine(env, uid, welcomeMsg);
        }
        
        // จัดการไฟล์ (PDF, DOC, DOCX)
        if (ev.type === "message" && (ev.message?.type === "file" || ev.message?.type === "image")) {
          const uid: string | undefined = ev.source?.userId;
          if (!uid) continue;
          
          // เช็คว่าเป็น Boss หรือไม่
          const userRole = await env.calendar_db.prepare("SELECT role FROM roles WHERE user_id=?").bind(uid).first();
          if (userRole && userRole.role === "boss") {
            // ส่งต่อให้เลขาทั้งหมด
            const secretaries = await env.calendar_db.prepare("SELECT user_id FROM roles WHERE role='secretary'").all();
            const secIds = (secretaries.results || []).map((r: any) => r.user_id).filter(Boolean);
            
            const fileName = ev.message?.fileName || "ไฟล์จาก Boss";
            const fileType = ev.message?.type === "image" ? "รูปภาพ" : "ไฟล์";
            
            for (const secId of secIds) {
              try {
                await sendLine(env, secId, `📎 ${fileType} จาก Boss: ${fileName}\n\n(กรุณาเปิด LINE เพื่อดาวน์โหลดไฟล์)`);
              } catch (err) {
                console.error(`Failed to forward file to secretary ${secId}:`, err);
              }
            }
            
            await sendLine(env, uid, "✅ ส่งไฟล์ให้เลขาเรียบร้อยแล้ว");
          }
        }
        
        if (ev.type === "message" && ev.message?.type === "text") {
          const text: string = String(ev.message.text || "").trim();
          const uid: string | undefined = ev.source?.userId;
          if (uid) await ensureUser(env, uid);

          if (!uid) continue;
          
          // คำสั่งช่วยเหลือ
          if (text === "ช่วยเหลือ" || text === "help" || text === "Help" || text === "คู่มือ" || text === "วิธีใช้") {
            const userRole = await env.calendar_db.prepare("SELECT role FROM roles WHERE user_id=?").bind(uid).first();
            if (userRole && userRole.role === "boss") {
              await sendLine(env, uid, "📖 คู่มือการใช้งานสำหรับ Boss:\n\nhttps://your-worker.workers.dev/boss-help.html\n\nรวมคำสั่งและฟีเจอร์ทั้งหมดที่คุณสามารถใช้ได้");
            } else if (userRole && userRole.role === "secretary") {
              await sendLine(env, uid, "📖 คู่มือการใช้งานสำหรับเลขา:\n\nhttps://your-worker.workers.dev/secretary.html\n\nจัดการตารางงานและรายละเอียดต่างๆ");
            } else {
              await sendLine(env, uid, "📖 คู่มือการใช้งาน:\n\nคำสั่งพื้นฐาน:\n• ตารางงานวันนี้\n• ตารางงานพรุ่งนี้\n• สรุปสัปดาห์\n• สรุปเดือน\n• วันที่ [เลข] (เช่น วันที่ 15)");
            }
            continue;
          }
          
          // คำสั่งพิเศษสำหรับ Boss: สั่งงานด่วน
          if (text.startsWith("สั่งงานด่วน:") || text.startsWith("สั่งงานด่วน：")) {
            // เช็คว่าเป็น Boss หรือไม่
            const userRole = await env.calendar_db.prepare("SELECT role FROM roles WHERE user_id=?").bind(uid).first();
            if (userRole && userRole.role === "boss") {
              const message = text.replace(/^สั่งงานด่วน[：:]\s*/, "").trim();
              
              // ส่งให้เลขาทั้งหมด
              const secretaries = await env.calendar_db.prepare("SELECT user_id,display_name FROM roles WHERE role='secretary'").all();
              const secIds = (secretaries.results || []).map((r: any) => r.user_id).filter(Boolean);
              
              if (secIds.length === 0) {
                await sendLine(env, uid, "❌ ไม่พบเลขาในระบบ");
              } else {
                const bossName = (await env.calendar_db.prepare("SELECT display_name FROM roles WHERE user_id=?").bind(uid).first() as any)?.display_name || "Boss";
                
                for (const secId of secIds) {
                  try {
                    await sendLine(env, secId, `🚨 งานด่วนจาก ${bossName}:\n\n${message}`);
                  } catch (err) {
                    console.error(`Failed to send urgent task to secretary ${secId}:`, err);
                  }
                }
                
                await sendLine(env, uid, `✅ ส่งงานด่วนให้เลขา ${secIds.length} คนเรียบร้อยแล้ว`);
                await logAudit(env, uid, "urgent_task", "task", { message, secretaries: secIds.length });
              }
              continue;
            }
          }
          
          if (text === "ตารางงานวันนี้" || text === "นัดหมายวันนี้" || text === "จำนวนงานวันนี้") {
            const today = toYMD(bkkToday());
            if (text.includes("จำนวน")) {
              const c = await env.calendar_db.prepare("SELECT COUNT(1) AS c FROM events WHERE date=?").bind(today).first();
              await sendLine(env, uid, `วันนี้ (${today}) มี ${c?.c ?? 0} รายการ`);
            } else {
              await pushFlexForDate(env, uid, today);
            }
          } else if (text === "ตารางงานพรุ่งนี้" || text === "นัดหมายพรุ่งนี้" || text === "จำนวนงานพรุ่งนี้") {
            const t = bkkToday(); t.setUTCDate(t.getUTCDate() + 1);
            const ymd = toYMD(t);
            if (text.includes("จำนวน")) {
              const c = await env.calendar_db.prepare("SELECT COUNT(1) AS c FROM events WHERE date=?").bind(ymd).first();
              await sendLine(env, uid, `พรุ่งนี้ (${ymd}) มี ${c?.c ?? 0} รายการ`);
            } else {
              await pushFlexForDate(env, uid, ymd);
            }
          } else if (text === "สรุปสัปดาห์") {
            const base = bkkToday();
            const dow = (base.getUTCDay() + 6) % 7; // Mon=0..Sun=6
            const mon = new Date(base); mon.setUTCDate(base.getUTCDate() - dow);
            const out: string[] = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i);
              const ymd = toYMD(d);
              const cnt = await env.calendar_db.prepare("SELECT COUNT(1) AS c FROM events WHERE date=?").bind(ymd).first();
              out.push(`${ymd}: ${cnt?.c ?? 0} รายการ`);
            }
            await sendLine(env, uid, out.join("\n"));
          } else if (text === "สรุปเดือน") {
            const base = bkkToday();
            const y = base.getUTCFullYear(), m = base.getUTCMonth();
            const first = new Date(Date.UTC(y, m, 1));
            const next = new Date(Date.UTC(y, m + 1, 1));
            const res = await env.calendar_db.prepare(
              "SELECT date,time,type,location,uniform FROM events WHERE date>=? AND date<? ORDER BY date,time"
            ).bind(toYMD(first), toYMD(next)).all();
            const rows = (res.results || []) as any[];
            if (!rows.length) await sendLine(env, uid, "ทั้งเดือนนี้ยังไม่มีรายการ");
            else {
              const grouped = new Map<string, any[]>();
              for (const r of rows) { if (!grouped.has(r.date)) grouped.set(r.date, []); grouped.get(r.date)!.push(r); }
              const out: string[] = [];
              for (const [d, list] of grouped) {
                out.push("(" + d + ")");
                for (const r of list) out.push(`• ${r.time} ${r.type}@${r.location}`);
                out.push("");
              }
              await sendLine(env, uid, out.join("\n"));
            }
          } else {
            const ymd = parseThaiDateOnly(text);
            if (ymd) await pushFlexForDate(env, uid, ymd);
          }
        }
      }
      return json({ ok: true });
    }

    /* -------------------------- API ------------------------------ */

    // Events
    if (url.pathname === "/api/events" && req.method === "GET") {
      const month = url.searchParams.get("month"); // YYYY-MM
      if (month && !validateMonth(month)) {
        return json({ error: "Invalid month format (required: YYYY-MM)" }, { status: 400 });
      }
      const stmt = month
        ? env.calendar_db.prepare("SELECT * FROM events WHERE substr(date,1,7)=? ORDER BY date,time").bind(month)
        : env.calendar_db.prepare("SELECT * FROM events ORDER BY date,time LIMIT 500");
      const res = await stmt.all();
      return json(res.results ?? []);
    }

    if (url.pathname === "/api/events" && req.method === "POST") {
      try {
        const body = (await req.json()) as EventInput;
        const validation = validateEventInput(body);
        if (!validation.valid) {
          return json({ error: validation.error }, { status: 400 });
        }
        const id = crypto.randomUUID();
        const now = Date.now();
        await env.calendar_db.prepare(
          "INSERT INTO events (id,date,time,type,location,uniform,details,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
        ).bind(id, body.date, body.time, body.type, body.location, body.uniform, body.details, body.notes || "", now, now).run();
        await logAudit(env, "api", "create_event", `event:${id}`, body);
        
        // แจ้งเตือน Boss ถ้าเป็นงานวันนี้
        if (env.LINE_CHANNEL_ACCESS_TOKEN) {
          const eventData = { id, ...body };
          // ใช้ ctx.waitUntil เพื่อไม่ให้ block response
          await notifyBossesNewEvent(env, id, eventData);
        }
        
        return json({ id });
      } catch (err) {
        console.error("Error creating event:", err);
        return json({ error: "Failed to create event" }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/events/") && req.method === "PUT") {
      try {
        const id = url.pathname.split("/").pop()!;
        const update = (await req.json()) as Partial<EventInput>;
        const existing = await env.calendar_db.prepare("SELECT * FROM events WHERE id=?").bind(id).first();
        if (!existing) return json({ error: "not found" }, { status: 404 });
        const merged = { ...existing, ...update };
        const validation = validateEventInput(merged);
        if (!validation.valid) {
          return json({ error: validation.error }, { status: 400 });
        }
        const now = Date.now();
        await env.calendar_db.prepare(
          "UPDATE events SET date=?,time=?,type=?,location=?,uniform=?,details=?,notes=?,updated_at=? WHERE id=?"
        ).bind(merged.date, merged.time, merged.type, merged.location, merged.uniform, merged.details, merged.notes || "", now, id).run();
        await logAudit(env, "api", "update_event", `event:${id}`, update);
        return json({ ok: true });
      } catch (err) {
        console.error("Error updating event:", err);
        return json({ error: "Failed to update event" }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/events/") && req.method === "DELETE") {
      try {
        const id = url.pathname.split("/").pop()!;
        if (!id || id.length === 0) {
          return json({ error: "Invalid event ID" }, { status: 400 });
        }
        await env.calendar_db.prepare("DELETE FROM events WHERE id=?").bind(id).run();
        await logAudit(env, "api", "delete_event", `event:${id}`, {});
        return json({ ok: true });
      } catch (err) {
        console.error("Error deleting event:", err);
        return json({ error: "Failed to delete event" }, { status: 500 });
      }
    }

    // Roles
    if (url.pathname === "/api/roles" && req.method === "GET") {
      const user_id = url.searchParams.get("user_id");
      if (!user_id) {
        const res = await env.calendar_db.prepare("SELECT * FROM roles ORDER BY updated_at DESC").all();
        return json(res.results ?? []);
      }
      const row = await env.calendar_db.prepare("SELECT * FROM roles WHERE user_id=?").bind(user_id).first();
      return json(row ?? { user_id, role: "viewer" });
    }

    if (url.pathname === "/api/roles" && req.method === "POST") {
      try {
        const body = await req.json() as Partial<RoleRow>;
        if (!body.user_id || !body.role) return json({ error: "invalid" }, { status: 400 });
        const validRoles = ['boss', 'secretary', 'viewer'];
        if (!validRoles.includes(body.role)) {
          return json({ error: "Invalid role" }, { status: 400 });
        }
        const now = Date.now();
        
        // Get display name from LINE Profile API
        let displayName = null;
        if (env.LINE_CHANNEL_ACCESS_TOKEN) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${body.user_id}`, {
              headers: { "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
            });
            if (profileRes.ok) {
              const profile = await profileRes.json() as { displayName?: string };
              displayName = profile.displayName;
            }
          } catch (e) {
            console.error("Failed to fetch LINE profile:", e);
          }
        }
        
        await env.calendar_db.prepare(
          "INSERT INTO roles (user_id,role,display_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, display_name=excluded.display_name, updated_at=excluded.updated_at"
        ).bind(body.user_id, body.role, displayName, now).run();
        await logAudit(env, "api", "set_role", `role:${body.user_id}`, body);
        return json({ ok: true });
      } catch (err) {
        console.error("Error setting role:", err);
        return json({ error: "Failed to set role" }, { status: 500 });
      }
    }

    // Attendance
    if (url.pathname === "/api/attendance" && req.method === "POST") {
      try {
        const body = await req.json() as { event_id: string, user_id: string, status: "join"|"absent"|"busy", actor?: string };
        if (!body.event_id || !body.user_id || !body.status) return json({ error: "invalid" }, { status: 400 });
        const validStatuses = ['join', 'absent', 'busy'];
        if (!validStatuses.includes(body.status)) {
          return json({ error: "Invalid status" }, { status: 400 });
        }
        const now = Date.now();
        await env.calendar_db.prepare(
          "INSERT INTO attendance (event_id,user_id,status,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status, updated_by=excluded.updated_by, updated_at=excluded.updated_at"
        ).bind(body.event_id, body.user_id, body.status, body.actor || body.user_id, now).run();
        await logAudit(env, body.actor || body.user_id, "set_attendance", `event:${body.event_id}`, body);
        return json({ ok: true });
      } catch (err) {
        console.error("Error setting attendance:", err);
        return json({ error: "Failed to set attendance" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/attendance" && req.method === "GET") {
      const date = url.searchParams.get("date");
      const user_id = url.searchParams.get("user_id");
      if (!date || !user_id) return json({ error: "date and user_id required" }, { status: 400 });
      const res = await env.calendar_db.prepare(
        "SELECT a.event_id,a.status,e.date,e.time,e.type,e.location,e.uniform,e.details,e.notes FROM attendance a JOIN events e ON a.event_id=e.id WHERE e.date=? AND a.user_id=? ORDER BY e.time"
      ).bind(date, user_id).all();
      return json(res.results ?? []);
    }

    // Recent users (first seen via ensureUser/auto_register in audit_log)
    if (url.pathname === "/api/users/recent" && req.method === "GET") {
      const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
      const res = await env.calendar_db.prepare(
        "SELECT actor as user_id, ts FROM audit_log WHERE action='auto_register' ORDER BY ts DESC LIMIT ?"
      ).bind(limit).all();
      return json(res.results ?? []);
    }

    // Notification Settings
    if (url.pathname === "/api/notification-settings" && req.method === "GET") {
      try {
        const res = await env.calendar_db.prepare(
          "SELECT type, thresholds, updated_at FROM notification_settings ORDER BY type"
        ).all();
        return json(res.results ?? []);
      } catch (err) {
        console.error("Error loading notification settings:", err);
        // Return default values if table doesn't exist
        return json([
          { type: "ในหน่วย", thresholds: "30", updated_at: 0 },
          { type: "ในกรม", thresholds: "60", updated_at: 0 },
          { type: "บก.ใหญ่", thresholds: "60", updated_at: 0 },
          { type: "นอกหน่วย", thresholds: "120,60", updated_at: 0 }
        ]);
      }
    }

    if (url.pathname === "/api/notification-settings" && req.method === "POST") {
      try {
        const body = await req.json() as { type: string, thresholds: string };
        if (!body.type || !body.thresholds) return json({ error: "type and thresholds required" }, { status: 400 });
        
        // Validate thresholds format (comma-separated numbers)
        const nums = body.thresholds.split(',').map(s => parseInt(s.trim(), 10));
        if (nums.some(n => isNaN(n) || n < 0 || n > 1440)) {
          return json({ error: "Invalid thresholds format" }, { status: 400 });
        }
        
        const now = Date.now();
        await env.calendar_db.prepare(
          "INSERT INTO notification_settings (type, thresholds, updated_at) VALUES (?, ?, ?) ON CONFLICT(type) DO UPDATE SET thresholds=excluded.thresholds, updated_at=excluded.updated_at"
        ).bind(body.type, body.thresholds, now).run();
        await logAudit(env, "api", "update_notification_settings", `type:${body.type}`, body);
        return json({ ok: true });
      } catch (err) {
        console.error("Error updating notification settings:", err);
        return json({ error: "Failed to update settings" }, { status: 500 });
      }
    }

    // Audit Logs
    if (url.pathname === "/api/audit-log" && req.method === "GET") {
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "100", 10)));
      const action = url.searchParams.get("action");
      
      let query = "SELECT id, actor, action, entity, payload, ts FROM audit_log";
      const bindings: any[] = [];
      
      if (action) {
        query += " WHERE action=?";
        bindings.push(action);
      }
      
      query += " ORDER BY ts DESC LIMIT ?";
      bindings.push(limit);
      
      const stmt = env.calendar_db.prepare(query);
      const res = await stmt.bind(...bindings).all();
      return json(res.results ?? []);
    }

    // Quick summaries API
    if (url.pathname.startsWith("/api/summary/") && req.method === "GET") {
      const kind = url.pathname.split("/").pop();
      if (kind === "today") return json({ text: `(${toYMD(bkkToday())})` });
      if (kind === "tomorrow") { const t = bkkToday(); t.setUTCDate(t.getUTCDate() + 1); return json({ text: `(${toYMD(t)})` }); }
      return json({ error: "unknown" }, { status: 404 });
    }

    // POST to root -> redirect to GET
    if (url.pathname === "/" && req.method !== "GET" && req.method !== "HEAD") {
      return new Response(null, { status: 303, headers: { Location: "/" } });
    }

    // Static assets
    return env.ASSETS.fetch(req);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Run every ~5 min (set in wrangler.jsonc triggers)
    const nowUtc = new Date();
    const todayBkk = toYMD(bkkToday());
    
    // Bangkok time
    const bkkTime = new Date(nowUtc.getTime() + 7 * 3600 * 1000);
    const bkkHour = bkkTime.getUTCHours();
    const bkkMin = bkkTime.getUTCMinutes();

    // ส่งลิงก์ attendance ทุกวันเวลา 08:30 (ถ้ามีงาน)
    if (bkkHour === 8 && bkkMin >= 30 && bkkMin < 35) {
      const hasEvents = await env.calendar_db.prepare("SELECT COUNT(1) AS c FROM events WHERE date=?").bind(todayBkk).first();
      if (hasEvents && (hasEvents as any).c > 0) {
        const bosses = await env.calendar_db.prepare("SELECT user_id FROM roles WHERE role='boss'").all();
        const bossIds = (bosses.results || []).map((r: any) => r.user_id).filter(Boolean);
        
        for (const uid of bossIds) {
          try {
            await sendLine(env, uid, `📋 สวัสดีตอนเช้า!\n\nวันนี้มีงาน ${(hasEvents as any).c} รายการ\n\nกรุณาแจ้งว่าจะไป/ไม่ไป:\nhttps://your-worker.workers.dev/attendance.html`);
          } catch (err) {
            console.error(`Failed to send attendance link to boss ${uid}:`, err);
          }
        }
      }
    }

    const res = await env.calendar_db.prepare(
      "SELECT id,date,time,type,location,uniform,details,notes FROM events WHERE date=? ORDER BY time"
    ).bind(todayBkk).all();
    const rows = (res.results || []) as any[];
    if (!rows.length) return;

    const bosses = await env.calendar_db.prepare("SELECT user_id FROM roles WHERE role='boss'").all();
    const bossIds = (bosses.results || []).map((r: any) => r.user_id).filter(Boolean);
    if (!bossIds.length) return;

    for (const ev of rows) {
      const evDt = toBkkDateTime(ev.date, ev.time);
      const diffMin = minutesDiff(evDt, nowUtc);
      const thresholds = await thresholdsForType(env, ev.type);

      for (const th of thresholds) {
        if (diffMin <= th && diffMin > th - 6) {
          const kind = `pre_${th}`;
          for (const uid of bossIds) {
            const allowed = await shouldSendPreNotif(env, ev.id, kind, uid);
            if (!allowed) continue;
            
            // Mark notification BEFORE sending to prevent race condition
            await markPreNotif(env, ev.id, kind, uid);
            
            const flex = buildFlexForEvents([ev]);
            try {
              await fetch("https://api.line.me/v2/bot/message/push", {
                method: "POST",
                headers: { "content-type": "application/json", "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
                body: JSON.stringify({ to: uid, messages: [ { type: "text", text: `เตือนล่วงหน้า ${th} นาที` }, flex ] }),
              });
            } catch (err) {
              console.error("Failed to send notification:", err);
            }
          }
        }
      }
    }
  }
};
