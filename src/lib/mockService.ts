import type { Company, User, WorkspaceData } from "./api";

/** Frontend prototype only. No requests, credentials, tokens, or backend authorization. */
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  scope: string[];
};
type Invitation = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  scope: string[];
  expires: number;
  status: string;
  token: string;
  inviter: string;
};
type PrototypeState = {
  users: User[];
  companies: Company[];
  members: Record<string, Member[]>;
  invitations: Invitation[];
  idempotency: Record<string, string>;
};
const STORE = "aynor.frontend-prototype.v1",
  SESSION = "aynor.prototype-persona";
const empty = (): WorkspaceData => ({
  departments: [],
  priorities: [],
  sources: [],
  mappings: [],
  kpis: [],
  goals: [],
  steps: {},
  step: "departments",
  completed: false,
});
const alex: User = {
  id: "sample-alex",
  name: "Alex Morgan",
  email: "alex@aynor.example",
  verified: true,
};
function seed(): PrototypeState {
  const profile = {
    industry: "Technology & software",
    country: "Pakistan",
    timezone: "Asia/Karachi",
    currency: "PKR",
    website: "",
    size: "11–50 employees",
    version: 1,
    scope: [],
  };
  const companies: Company[] = [
    {
      ...profile,
      id: "vordx",
      name: "Vordx Technologies",
      role: "Owner",
      data: {
        ...empty(),
        departments: [
          "Finance",
          "Sales",
          "Project Delivery",
          "Human Resources",
          "Marketing",
          "Operations",
        ],
        priorities: ["Revenue growth", "Project delivery", "Cash flow"],
        step: "integrations",
        steps: { departments: "completed", priorities: "completed" },
        goals: [
          {
            id: "sample-goal",
            name: "Build a more predictable revenue engine",
            kpi: "Revenue",
            target: "500000",
            deadline: "2027-03-31",
            owner: "Alex Morgan",
          },
        ],
      },
    },
    {
      ...profile,
      id: "northstar",
      name: "Northstar Studio",
      industry: "Professional services",
      role: "Viewer",
      scope: ["Project Delivery"],
      data: {
        ...empty(),
        departments: ["Project Delivery", "Operations"],
        completed: true,
        step: "complete",
      },
    },
    {
      ...profile,
      id: "meridian",
      name: "Meridian Commerce",
      industry: "Retail & commerce",
      role: "Admin",
      data: {
        ...empty(),
        departments: ["Finance", "Sales", "Operations"],
        priorities: ["Profitability", "Cash flow"],
        step: "priorities",
      },
    },
  ];
  const members = Object.fromEntries(
    companies.map((c) => [
      c.id,
      [
        {
          id: alex.id,
          name: alex.name,
          email: alex.email,
          role: c.role,
          scope: c.scope,
        },
      ],
    ]),
  );
  members.vordx.push({
    id: "sample-sam",
    name: "Sam Chen",
    email: "sam@aynor.example",
    role: "Executive",
    scope: [],
  });
  return {
    users: [alex],
    companies,
    members,
    invitations: [
      {
        id: "sample-invite",
        company_id: "vordx",
        email: "guest@aynor.example",
        role: "Executive",
        scope: [],
        expires: Date.now() + 7 * 86400000,
        status: "pending",
        token: "prototype-invitation",
        inviter: "Alex Morgan",
      },
    ],
    idempotency: {},
  };
}
function load(): PrototypeState {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : seed();
  } catch {
    return seed();
  }
}
let state = load();
let fault: "none" | "error" | "offline" | "slow" = "none";
function persist() {
  localStorage.setItem(STORE, JSON.stringify(state));
}
const id = () => crypto.randomUUID();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function current() {
  return (
    state.users.find((u) => u.id === sessionStorage.getItem(SESSION)) || null
  );
}
function signIn(user: User) {
  sessionStorage.setItem(SESSION, user.id);
  return { user };
}
function requireUser() {
  const u = current();
  if (!u) {
    window.dispatchEvent(new Event("session-expired"));
    throw Error("Your prototype session ended. Please sign in to continue.");
  }
  return u;
}
function companyView(c: Company, u: User): Company {
  const m = state.members[c.id]?.find((m) => m.id === u.id);
  if (!m)
    throw Error(
      "This prototype persona does not have access to this workspace.",
    );
  const copy = structuredClone(c);
  copy.role = m.role;
  copy.scope = m.scope;
  if (["Viewer", "Department Manager"].includes(m.role)) {
    copy.data.departments = copy.data.departments.filter((d) =>
      m.scope.includes(d),
    );
    copy.data.goals = [];
    copy.data.kpis = [];
    copy.data.priorities = [];
    copy.data.sources = [];
    copy.data.mappings = [];
  }
  return copy;
}
export const prototype = {
  preview(screen: string) {
    state = load();
    sessionStorage.setItem("aynor.screen-preview", "active");
    if (screen.startsWith("/auth/") || screen === "/welcome") {
      sessionStorage.removeItem(SESSION);
      if (screen.startsWith("/auth/verify")) {
        let u = state.users.find((u) => u.id === "preview-verification");
        if (!u) {
          u = {
            id: "preview-verification",
            name: "Alex Morgan",
            email: "alex@aynor.example",
            verified: false,
          };
          state.users.push(u);
        }
        u.verified = false;
        signIn(u);
        sessionStorage.setItem("aynor-dev-challenge", "123456");
        persist();
        return { user: u, path: screen };
      }
      return { user: null, path: screen };
    }
    let user = state.users.find((u) => u.id === alex.id) || alex;
    if (screen.startsWith("/invite/")) {
      user = {
        id: "preview-guest",
        name: "Jordan Blake",
        email: "guest@aynor.example",
        verified: true,
      };
      if (!state.users.some((u) => u.id === user.id)) state.users.push(user);
      const inv = state.invitations.find(
        (i) => i.token === "prototype-invitation",
      );
      if (inv) {
        inv.status = "pending";
        inv.expires = Date.now() + 7 * 86400000;
      }
    }
    if (!state.companies.some((c) => c.id === "preview-workspace")) {
      const c: Company = {
        id: "preview-workspace",
        name: "Vordx Technologies",
        industry: "Technology & software",
        country: "Pakistan",
        timezone: "Asia/Karachi",
        currency: "PKR",
        website: "https://vordx.example",
        size: "11–50 employees",
        version: 1,
        scope: [],
        role: "Owner",
        data: {
          ...empty(),
          departments: [
            "Finance",
            "Sales",
            "Project Delivery",
            "Human Resources",
            "Marketing",
            "Operations",
          ],
          priorities: ["Revenue growth", "Profitability", "Project delivery"],
          sources: [
            "Business performance · 2026",
            "Project delivery tracker",
            "Team & capacity",
          ],
          demo: true,
          connected: true,
          discovered: true,
          mappings: [
            {
              field: "Monthly Revenue",
              department: "Finance",
              meaning: "Revenue",
              confirmed: true,
            },
            {
              field: "Operating Expenses",
              department: "Finance",
              meaning: "Expenses",
              confirmed: false,
            },
            {
              field: "Project Status",
              department: "Project Delivery",
              meaning: "Status",
              confirmed: true,
            },
            {
              field: "Team Member",
              department: "Human Resources",
              meaning: "Employee",
              confirmed: false,
            },
          ],
          kpis: [
            {
              name: "Revenue",
              department: "Finance",
              target: "500000",
              period: "Monthly",
              enabled: true,
              calculation: "Sum of monthly revenue",
            },
            {
              name: "Active projects",
              department: "Project Delivery",
              target: "24",
              period: "Monthly",
              enabled: true,
              calculation: "Count of active projects",
            },
          ],
          goals: [
            {
              id: "preview-goal-1",
              name: "Build predictable recurring revenue",
              kpi: "Revenue",
              target: "500000",
              deadline: "2027-03-31",
              owner: "Alex Morgan",
            },
            {
              id: "preview-goal-2",
              name: "Deliver more, with confidence",
              kpi: "Active projects",
              target: "24",
              deadline: "2027-06-30",
              owner: "Sam Chen",
            },
          ],
          step: "departments",
          steps: {
            departments: "completed",
            priorities: "completed",
            integrations: "completed",
            sources: "completed",
            discovery: "completed",
          },
        },
      };
      state.companies.push(c);
      state.members[c.id] = [
        {
          id: alex.id,
          name: alex.name,
          email: alex.email,
          role: "Owner",
          scope: [],
        },
        {
          id: "preview-sam",
          name: "Sam Chen",
          email: "sam@aynor.example",
          role: "Executive",
          scope: [],
        },
        {
          id: "preview-jamie",
          name: "Jamie Lee",
          email: "jamie@aynor.example",
          role: "Department Manager",
          scope: ["Project Delivery"],
        },
      ];
      state.invitations.push({
        id: "preview-invitation",
        token: "preview-pending",
        company_id: c.id,
        email: "avery@aynor.example",
        role: "Viewer",
        scope: ["Finance"],
        status: "pending",
        expires: Date.now() + 7 * 86400000,
        inviter: "Alex Morgan",
      });
    }
    signIn(user);
    persist();
    return { user, path: screen.replace(":id", "preview-workspace") };
  },

  simulateNext(value: typeof fault) {
    fault = value;
  },
  async explore() {
    await wait(350);
    const user = state.users.find((u) => u.id === alex.id) || alex;
    return signIn(user);
  },
  reset() {
    state = seed();
    persist();
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem("aynor-dev-challenge");
  },
  expire() {
    sessionStorage.removeItem(SESSION);
    window.dispatchEvent(new Event("session-expired"));
  },
  invitation() {
    return "/invite/prototype-invitation";
  },
};
export async function mockRequest<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const b = (body || {}) as any;
  const mode = fault;
  fault = "none";
  await wait(mode === "slow" ? 1800 : 260);
  if (mode === "offline")
    throw Error(
      "You appear to be offline. This is a simulated connection issue. Retry to continue.",
    );
  if (mode === "error")
    throw Error(
      "We couldn’t complete that action. This is a simulated service error. Please try again.",
    );
  state = load();
  const result = handle(path, method, b, headers);
  persist();
  return structuredClone(result) as T;
}
function handle(
  path: string,
  method: string,
  b: any,
  headers: Record<string, string>,
): any {
  if (path === "/config")
    return {
      development: true,
      prototype: true,
      googleOAuth: "simulated",
      emailDelivery: "simulated",
    };
  if (path === "/session") return { user: current() };
  if (path === "/auth/signup") {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
      !b.name?.trim() ||
      b.password?.length < 10
    )
      throw Error(
        "Enter your name, a valid email, and a password of at least 10 characters.",
      );
    if (
      state.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())
    )
      throw Error(
        "This prototype account already exists. Sign in to continue.",
      );
    const user: User = {
      id: id(),
      name: b.name.trim(),
      email: b.email.toLowerCase(),
      verified: false,
    };
    state.users.push(user);
    return { ...signIn(user), developmentToken: "123456" };
  }
  if (path === "/auth/google") return signIn(alex);
  if (path === "/auth/login") {
    const user = state.users.find(
      (u) => u.email.toLowerCase() === b.email?.toLowerCase(),
    );
    if (!user || !b.password)
      throw Error(
        "Try an account created in this prototype, or explore the sample workspace.",
      );
    return signIn(user);
  }
  if (path === "/auth/recover")
    return {
      message: "Simulated reset link prepared. No email was sent.",
      developmentToken: "prototype-reset",
    };
  if (path === "/auth/reset") {
    if (b.token !== "prototype-reset")
      throw Error("This sample reset link is invalid. Request another link.");
    if (!b.password || b.password.length < 10)
      throw Error("Use at least 10 characters.");
    sessionStorage.removeItem(SESSION);
    return { ok: true };
  }
  const user = requireUser();
  if (path === "/auth/logout") {
    sessionStorage.removeItem(SESSION);
    return { ok: true };
  }
  if (path === "/auth/resend") return { developmentToken: "123456" };
  if (path === "/auth/verify") {
    if (b.token !== "123456")
      throw Error(
        "That code doesn’t match. Use 123456 for this prototype, or request another code.",
      );
    user.verified = true;
    return { user };
  }
  if (path === "/companies") {
    if (method === "GET")
      return state.companies
        .filter((c) => state.members[c.id]?.some((m) => m.id === user.id))
        .map((c) => companyView(c, user));
    if (
      !b.name?.trim() ||
      !b.industry ||
      !b.country ||
      !b.currency ||
      !b.timezone
    )
      throw Error("Complete the required company details.");
    if (b.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(b.website))
      throw Error("Enter a valid website URL.");
    const previous = state.idempotency[headers["Idempotency-Key"]];
    if (previous) {
      const c = state.companies.find((c) => c.id === previous);
      if (c) return companyView(c, user);
    }
    const c: Company = {
      ...b,
      id: id(),
      version: 1,
      role: "Owner",
      scope: [],
      data: empty(),
    };
    state.companies.push(c);
    state.members[c.id] = [
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "Owner",
        scope: [],
      },
    ];
    if (headers["Idempotency-Key"])
      state.idempotency[headers["Idempotency-Key"]] = c.id;
    return c;
  }
  if (path === "/invitations")
    return state.invitations
      .filter((i) => i.email === user.email && i.status === "pending")
      .map((i) => ({
        ...i,
        scope: JSON.stringify(i.scope),
        company:
          state.companies.find((c) => c.id === i.company_id)?.name ||
          "Unavailable company",
      }));
  const invitation = path.match(
    /^\/invitations\/([^/]+)(?:\/(accept|decline))?$/,
  );
  if (invitation) {
    if (invitation[1] === "prototype-expired")
      throw Error(
        "This invitation has expired. Ask the inviter for a new link.",
      );
    if (invitation[1] === "prototype-revoked")
      throw Error(
        "This invitation was revoked. Ask your company administrator for a new invitation.",
      );
    const i = state.invitations.find(
      (i) => i.id === invitation[1] || i.token === invitation[1],
    );
    if (!i) throw Error("This invitation was not found. Ask for a new link.");
    if (i.status !== "pending")
      throw Error(`This invitation has been ${i.status}.`);
    if (i.expires < Date.now())
      throw Error(
        "This invitation has expired. Ask the inviter for a new link.",
      );
    if (i.email !== user.email)
      throw Error(
        `This invitation belongs to ${i.email}. Sign out and use that prototype account.`,
      );
    const c = state.companies.find((c) => c.id === i.company_id);
    if (!c) throw Error("This company is no longer available.");
    if (!invitation[2])
      return {
        id: i.id,
        company: c.name,
        role: i.role,
        scope: i.scope,
        inviter: i.inviter,
      };
    if (invitation[2] === "accept") {
      i.status = "accepted";
      if (!state.members[c.id].some((m) => m.id === user.id))
        state.members[c.id].push({
          id: user.id,
          name: user.name,
          email: user.email,
          role: i.role,
          scope: i.scope,
        });
    } else i.status = "declined";
    return { companyId: c.id };
  }
  const match = path.match(
    /^\/companies\/([^/]+)(?:\/(members|invitations|leave|archive|profile))?(?:\/([^/]+))?$/,
  );
  if (!match) throw Error("This prototype action is unavailable.");
  const [, cid, resource, item] = match;
  const c = state.companies.find((c) => c.id === cid);
  if (!c)
    throw Error("This workspace is unavailable. Return to your companies.");
  const view = companyView(c, user);
  const editing = ["Owner", "Admin"].includes(view.role);
  if (!resource && method === "GET") return view;
  if (!editing && resource !== "leave")
    throw Error(
      "This action is unavailable for this sample role. Switch to an Owner or Admin workspace.",
    );
  if (!resource && method === "PATCH") {
    if (b.version !== c.version)
      throw Error(
        "This workspace changed in another tab. Reload to keep your setup current.",
      );
    const data = b.data as WorkspaceData;
    if (
      data.departments.some(
        (d, i) =>
          !d.trim() ||
          data.departments.findIndex(
            (x) => x.toLowerCase() === d.toLowerCase(),
          ) !== i,
      )
    )
      throw Error("Department names must be unique and non-empty.");
    if (
      data.mappings.some(
        (m) =>
          !m.ignored &&
          m.department &&
          !data.departments.includes(m.department),
      )
    )
      throw Error("Review mappings for removed departments.");
    c.data = structuredClone(data);
    c.version++;
    return companyView(c, user);
  }
  if (resource === "profile") {
    if (!b.name?.trim()) throw Error("Enter a company name.");
    Object.assign(c, { ...b, data: c.data, id: c.id, version: c.version + 1 });
    return companyView(c, user);
  }
  if (resource === "members") {
    if (method === "GET") return state.members[cid];
    const member = state.members[cid].find((m) => m.id === item);
    if (!member) throw Error("Member not found.");
    if (member.role === "Owner")
      throw Error("The last Owner cannot be removed through this action.");
    if (method === "DELETE")
      state.members[cid] = state.members[cid].filter((m) => m.id !== item);
    else {
      if (["Department Manager", "Viewer"].includes(b.role) && !b.scope.length)
        throw Error("Choose at least one permitted department.");
      member.role = b.role;
      member.scope = b.scope;
    }
    return { ok: true };
  }
  if (resource === "invitations") {
    if (method === "GET")
      return state.invitations
        .filter((i) => i.company_id === cid)
        .map((i) => ({ ...i, scope: JSON.stringify(i.scope) }));
    if (item) {
      const i = state.invitations.find(
        (i) => i.id === item && i.company_id === cid,
      );
      if (!i || i.status !== "pending")
        throw Error("This invitation can no longer be changed.");
      if (method === "DELETE") {
        i.status = "revoked";
        return { ok: true };
      }
      i.token = id();
      i.expires = Date.now() + 7 * 86400000;
      return {
        id: i.id,
        email: i.email,
        developmentLink: "/invite/" + i.token,
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))
      throw Error("Enter a valid email address.");
    const email = b.email.toLowerCase();
    if (state.members[cid].some((m) => m.email === email))
      throw Error("This person is already a member.");
    if (
      state.invitations.some(
        (i) =>
          i.company_id === cid &&
          i.email === email &&
          i.status === "pending" &&
          i.expires > Date.now(),
      )
    )
      throw Error("An invitation is already pending. Use Resend below.");
    if (["Viewer", "Department Manager"].includes(b.role) && !b.scope?.length)
      throw Error("Choose at least one department for this role.");
    const i: Invitation = {
      id: id(),
      company_id: cid,
      email,
      role: b.role,
      scope: b.scope || [],
      status: "pending",
      token: id(),
      expires: Date.now() + 7 * 86400000,
      inviter: user.name,
    };
    state.invitations.push(i);
    return { id: i.id, developmentLink: "/invite/" + i.token };
  }
  if (resource === "archive") {
    state.companies = state.companies.filter((c) => c.id !== cid);
    return { ok: true };
  }
  if (resource === "leave") {
    if (view.role === "Owner")
      throw Error("Transfer ownership before leaving this workspace.");
    state.members[cid] = state.members[cid].filter((m) => m.id !== user.id);
    return { ok: true };
  }
  throw Error("This prototype action is unavailable.");
}
