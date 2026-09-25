#!/usr/bin/env node
// Microsoft To Do MCP server (personal Microsoft accounts, Microsoft Graph).
//   node server.js login   -> one-time device-code sign-in, caches a refresh token
//   node server.js         -> stdio MCP server used by Claude Code
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Default: Microsoft's public "Microsoft Graph Command Line Tools" client, which
// accepts personal Microsoft accounts, so no Azure app registration is needed.
const CLIENT_ID = process.env.MS_TODO_CLIENT_ID || "14d82eec-204b-4c2f-b7e8-296a70dab67e";
const TENANT = process.env.MS_TODO_TENANT || "consumers";
const TIME_ZONE = process.env.MS_TODO_TIMEZONE || "Tokyo Standard Time";
const TOKEN_FILE =
  process.env.MS_TODO_TOKEN_FILE || path.join(os.homedir(), ".microsoft-todo-mcp", "token.json");
const SCOPES = "Tasks.ReadWrite User.Read offline_access";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH = "https://graph.microsoft.com/v1.0";

function saveToken(tok) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  const data = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return data;
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, body: await res.json() };
}

async function login() {
  const dc = await postForm(`${AUTH_BASE}/devicecode`, { client_id: CLIENT_ID, scope: SCOPES });
  if (!dc.ok) throw new Error(`Device code request failed: ${JSON.stringify(dc.body)}`);
  console.log(dc.body.message);
  let interval = (dc.body.interval || 5) * 1000;
  const deadline = Date.now() + dc.body.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const t = await postForm(`${AUTH_BASE}/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CLIENT_ID,
      device_code: dc.body.device_code,
    });
    if (t.ok) {
      saveToken(t.body);
      const me = await graph("GET", "/me");
      console.log(`Signed in as ${me.userPrincipalName || me.mail || me.displayName}. Token saved to ${TOKEN_FILE}`);
      return;
    }
    if (t.body.error === "slow_down") interval += 5000;
    else if (t.body.error !== "authorization_pending") {
      throw new Error(`Sign-in failed: ${t.body.error_description || t.body.error}`);
    }
  }
  throw new Error("Sign-in timed out. Run login again.");
}

async function accessToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("Not signed in. Run `node server.js login` in mcp/microsoft-todo first.");
  }
  const cached = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  if (cached.expires_at > Date.now()) return cached.access_token;
  const t = await postForm(`${AUTH_BASE}/token`, {
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: cached.refresh_token,
    scope: SCOPES,
  });
  if (!t.ok) throw new Error(`Token refresh failed (run login again): ${t.body.error_description || t.body.error}`);
  return saveToken({ refresh_token: cached.refresh_token, ...t.body }).access_token;
}

async function graph(method, urlPath, body) {
  const res = await fetch(urlPath.startsWith("http") ? urlPath : GRAPH + urlPath, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: `outlook.timezone="${TIME_ZONE}"`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph ${method} ${urlPath} -> ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
  return data;
}

// Accept "2026-09-30" or "2026-09-30T18:00" (interpreted in TIME_ZONE).
function dateTime(value) {
  if (!value) return undefined;
  const v = value.length === 10 ? `${value}T00:00:00` : value;
  return { dateTime: v, timeZone: TIME_ZONE };
}

function slimTask(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    importance: t.importance,
    due: t.dueDateTime?.dateTime,
    reminder: t.isReminderOn ? t.reminderDateTime?.dateTime : undefined,
    note: t.body?.content || undefined,
    created: t.createdDateTime,
    completed: t.completedDateTime?.dateTime,
  };
}

const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

function buildServer() {
  const server = new McpServer({ name: "microsoft-todo", version: "0.1.0" });

  server.registerTool(
    "list_task_lists",
    { description: "List all Microsoft To Do lists (id and name).", inputSchema: {} },
    async () => {
      const r = await graph("GET", "/me/todo/lists");
      return text(r.value.map((l) => ({ id: l.id, name: l.displayName, default: l.wellknownListName === "defaultList" })));
    }
  );

  server.registerTool(
    "create_task_list",
    { description: "Create a new Microsoft To Do list.", inputSchema: { name: z.string() } },
    async ({ name }) => {
      const l = await graph("POST", "/me/todo/lists", { displayName: name });
      return text({ id: l.id, name: l.displayName });
    }
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks in a list. By default only incomplete tasks. Follows paging up to `limit` (default 500).",
      inputSchema: {
        listId: z.string(),
        includeCompleted: z.boolean().optional(),
        limit: z.number().int().min(1).max(2000).optional(),
      },
    },
    async ({ listId, includeCompleted, limit }) => {
      const max = limit || 500;
      const q = new URLSearchParams({ $top: String(Math.min(max, 100)) });
      if (!includeCompleted) q.set("$filter", "status ne 'completed'");
      const tasks = [];
      let next = `/me/todo/lists/${listId}/tasks?${q}`;
      while (next && tasks.length < max) {
        const r = await graph("GET", next);
        tasks.push(...r.value);
        next = r["@odata.nextLink"];
      }
      return text(tasks.slice(0, max).map(slimTask));
    }
  );

  const taskFields = {
    title: z.string().optional(),
    note: z.string().optional().describe("Task body / memo"),
    due: z.string().optional().describe("YYYY-MM-DD (Tokyo time by default)"),
    reminder: z.string().optional().describe("YYYY-MM-DDTHH:mm (Tokyo time by default)"),
    importance: z.enum(["low", "normal", "high"]).optional(),
  };

  function taskPayload({ title, note, due, reminder, importance }) {
    const p = {};
    if (title !== undefined) p.title = title;
    if (note !== undefined) p.body = { content: note, contentType: "text" };
    if (due !== undefined) p.dueDateTime = dateTime(due);
    if (reminder !== undefined) {
      p.reminderDateTime = dateTime(reminder);
      p.isReminderOn = true;
    }
    if (importance !== undefined) p.importance = importance;
    return p;
  }

  server.registerTool(
    "create_task",
    {
      description: "Create a task in a Microsoft To Do list.",
      inputSchema: { listId: z.string(), ...taskFields, title: z.string() },
    },
    async ({ listId, ...fields }) => text(slimTask(await graph("POST", `/me/todo/lists/${listId}/tasks`, taskPayload(fields))))
  );

  server.registerTool(
    "update_task",
    {
      description: "Update a task (title, note, due, reminder, importance).",
      inputSchema: { listId: z.string(), taskId: z.string(), ...taskFields },
    },
    async ({ listId, taskId, ...fields }) =>
      text(slimTask(await graph("PATCH", `/me/todo/lists/${listId}/tasks/${taskId}`, taskPayload(fields))))
  );

  server.registerTool(
    "complete_task",
    {
      description: "Mark a task completed (or reopen it with completed=false).",
      inputSchema: { listId: z.string(), taskId: z.string(), completed: z.boolean().optional() },
    },
    async ({ listId, taskId, completed }) =>
      text(
        slimTask(
          await graph("PATCH", `/me/todo/lists/${listId}/tasks/${taskId}`, {
            status: completed === false ? "notStarted" : "completed",
          })
        )
      )
  );

  server.registerTool(
    "delete_task",
    { description: "Delete a task.", inputSchema: { listId: z.string(), taskId: z.string() } },
    async ({ listId, taskId }) => {
      await graph("DELETE", `/me/todo/lists/${listId}/tasks/${taskId}`);
      return text({ deleted: taskId });
    }
  );

  return server;
}

const cmd = process.argv[2];
if (cmd === "login") {
  login().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  await buildServer().connect(new StdioServerTransport());
}
