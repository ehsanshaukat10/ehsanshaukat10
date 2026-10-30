import { columns, validateRows, aggregate } from "./sheets-validation.mjs";
import {
  suggestHeader,
  profileColumns,
  parseDate,
  parseNumber,
  validateTable,
} from "../shared/table-data.mjs";
export const AUTO_VERSION = 1;
const idColumn =
  /\b(id|identifier|code|phone|telephone|zip|postcode|account number|sku)\b/i;
const dateColumn =
  /\b(date|dated|created|updated|deadline|due|when|timestamp)\b/i;
const incoming =
  /^(revenue|sales|income|monthly revenue|sales revenue|total revenue)$/i;
const outgoing =
  /^(costs|expenses|operating expenses|operating costs|total expenses)$/i;
const departmentWords = {
  finance: /finance|account|revenue|expenses|costs|profit|budget/i,
  sales: /sales|leads?|pipeline|deals?|prospects?|crm/i,
  qa: /\bqa\b|test|bug|defect|quality/i,
  operations: /operations?|delivery|logistics|supply/i,
  engineering: /engineering|development|sprint|software/i,
  marketing: /marketing|campaign|advert|traffic|seo/i,
  people: /people|human resources|\bhr\b|employees?|payroll|hiring/i,
  inventory: /inventory|stock|warehouse|products?|sku/i,
};
function departmentFor(title, headers, departments) {
  if (departments.length === 1) return departments[0];
  const titleMatches = departments.filter((d) =>
    title.toLowerCase().includes(d.toLowerCase()),
  );
  if (titleMatches.length === 1) return titleMatches[0];
  const scores = departments
    .map((department) => {
      const group = Object.entries(departmentWords).find(
        ([name, re]) =>
          re.test(department) || department.toLowerCase() === name,
      );
      const re = group?.[1];
      return {
        department,
        score: re
          ? (re.test(title) ? 3 : 0) + headers.filter((h) => re.test(h)).length
          : 0,
      };
    })
    .sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 && scores[0].score > (scores[1]?.score || 0)
    ? scores[0].department
    : "";
}
function dateOrder(values) {
  let day = false,
    month = false,
    ambiguous = false;
  for (const value of values) {
    const m = String(value)
      .trim()
      .match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) continue;
    if (Number(m[1]) > 12) day = true;
    else if (Number(m[2]) > 12) month = true;
    else ambiguous = true;
  }
  return day && month
    ? "mixed"
    : day
      ? "dmy"
      : month
        ? "mdy"
        : ambiguous
          ? "ambiguous"
          : "ymd";
}
export function detectTable(values, { title, tabId, departments = [] }) {
  const headerRow = suggestHeader(values),
    sliced = values.slice(headerRow);
  if (
    !sliced.some((row) => row.some((v) => String(v ?? "").trim())) ||
    sliced.length < 2
  )
    return {
      tabId,
      title,
      status: "empty",
      headerRow,
      properties: [],
      department: "",
      dateFormat: "ymd",
      questions: [],
      notes: ["No table records found."],
      origin: "local",
    };
  const headers = columns(sliced),
    data = sliced
      .slice(1)
      .filter((row) => row.some((v) => String(v ?? "").trim()));
  if (!data.length)
    return {
      tabId,
      title,
      status: "empty",
      headerRow,
      properties: [],
      department: "",
      dateFormat: "ymd",
      questions: [],
      notes: ["No table records found."],
      origin: "local",
    };
  const profiles = profileColumns(headers, data),
    questions = [],
    notes = [],
    protectedText = [];
  const orders = headers.map((h, index) =>
    dateColumn.test(h)
      ? dateOrder(
          data.map((row) => row[index]).filter((v) => String(v ?? "").trim()),
        )
      : "ymd",
  );
  const chosen = new Set(orders.filter((v) => ["dmy", "mdy"].includes(v)));
  let dateFormat = chosen.size === 1 ? [...chosen][0] : "ymd";
  const properties = profiles.map((p, index) => {
    const values = data
      .map((row) => row[index])
      .filter((v) => String(v ?? "").trim());
    if (
      idColumn.test(p.name) ||
      values.some((v) => typeof v === "string" && /^0\d+$/.test(v.trim()))
    ) {
      protectedText.push(index);
      return "text";
    }
    if (dateColumn.test(p.name) && values.length) {
      if (orders[index] === "ambiguous") {
        questions.push({
          id: `date:${index}`,
          kind: "date_order",
          column: index,
          message: `Which date order does “${p.name}” use?`,
          choices: [
            { value: "dmy", label: "Day / month / year" },
            { value: "mdy", label: "Month / day / year" },
            { value: "text", label: "Keep the original text" },
          ],
        });
        return "text";
      }
      if (orders[index] === "mixed" || chosen.size > 1) {
        notes.push(`“${p.name}” kept as text because date formats differ.`);
        return "text";
      }
      if (values.every((v) => parseDate(v, dateFormat) !== null)) return "date";
    }
    let type = p.type;
    if (
      ["number", "currency", "percentage"].includes(type) &&
      !values.every((v) => parseNumber(v) !== null)
    ) {
      type = "text";
      notes.push(`“${p.name}” contains mixed values and stays as text.`);
    }
    if (
      type === "date" &&
      !values.every((v) => parseDate(v, dateFormat) !== null)
    )
      type = "text";
    if (
      type === "boolean" &&
      !values.every((v) => /^(true|false|yes|no)$/i.test(String(v)))
    )
      type = "text";
    return type;
  });
  const department = departmentFor(title, headers, departments);
  if (!department && departments.length)
    questions.push({
      id: "department",
      kind: "department",
      message: `Which team owns “${title}”?`,
      choices: [
        ...departments.map((value) => ({ value, label: value })),
        { value: "", label: "Leave unassigned for now" },
      ],
    });
  const ambiguousSales = headers.some((h) =>
    /payment status|paid|tax|currency|refund|invoice (?:amount|total)|invoiced/i.test(
      h,
    ),
  );
  const ri = headers.findIndex((h) => incoming.test(h)),
    ei = headers.findIndex((h) => outgoing.test(h));
  if (
    ri >= 0 &&
    ei >= 0 &&
    properties.filter((p) => p === "date").length === 1 &&
    [ri, ei].every((i) => ["number", "currency"].includes(properties[i]))
  ) {
    const currencyIndex = headers.findIndex((h) =>
      /^currency(?: code)?$/i.test(h.trim()),
    );
    const currencies =
      currencyIndex < 0
        ? new Set()
        : new Set(
            data
              .map((row) =>
                String(row[currencyIndex] ?? "")
                  .trim()
                  .toUpperCase(),
              )
              .filter(Boolean),
          );
    if (currencies.size > 1)
      notes.push(
        "Financial totals are withheld because this table contains multiple currencies. No currency conversion was assumed.",
      );
    else if (ambiguousSales)
      questions.push({
        id: "financial",
        kind: "financial",
        message:
          "This table includes payment, invoice, tax or currency details. Use its revenue and expense amounts exactly as recorded?",
        choices: [
          { value: "recorded", label: "Use the recorded amounts" },
          { value: "table", label: "Keep as a table without financial totals" },
        ],
      });
    else {
      properties[ri] = "money_in";
      properties[ei] = "money_out";
    }
  }
  return {
    tabId,
    title,
    status: questions.length ? "ready_with_questions" : "ready",
    headerRow,
    headers,
    properties,
    department,
    dateFormat,
    questions,
    notes,
    protectedText,
    origin: "local",
  };
}
export function finalizePlan(values, proposal, departments) {
  const plan = structuredClone(proposal);
  if (
    !Number.isInteger(plan.headerRow) ||
    plan.headerRow < 0 ||
    plan.headerRow > 99
  )
    throw Error("The table header needs review.");
  const headers = columns(values.slice(plan.headerRow));
  if (
    !Array.isArray(plan.properties) ||
    plan.properties.length !== headers.length
  )
    throw Error("The column suggestions do not match this table.");
  if (plan.department && !departments.includes(plan.department))
    throw Error("The suggested department is not in this workspace.");
  if (!["ymd", "dmy", "mdy", "excel"].includes(plan.dateFormat))
    throw Error("The date format needs review.");
  const config = {
    title: plan.title,
    headerRow: plan.headerRow,
    headers,
    department: plan.department || "",
    properties: plan.properties,
    dateFormat: plan.dateFormat,
    types: plan.properties.map((p) =>
      ["money_in", "money_out"].includes(p) ? "currency" : p,
    ),
    automatic: true,
  };
  // Full-data validation, not an AI confidence score, authorizes a saved import.
  const table = validateTable(values, config, columns);
  if (
    plan.properties.includes("money_in") ||
    plan.properties.includes("money_out")
  ) {
    if (
      plan.properties.filter((p) => p === "date").length !== 1 ||
      plan.properties.filter((p) => p === "money_in").length !== 1 ||
      plan.properties.filter((p) => p === "money_out").length !== 1
    )
      throw Error(
        "Financial roles need one date, one revenue and one expense column.",
      );
    try {
      table.financial = aggregate(
        validateRows(values, {
          date: headers[plan.properties.indexOf("date")],
          revenue: headers[plan.properties.indexOf("money_in")],
          expenses: headers[plan.properties.indexOf("money_out")],
          _headerRow: String(plan.headerRow),
          _dateFormat: plan.dateFormat,
        }),
        "all",
      );
    } catch {
      config.properties = config.properties.map((p) =>
        ["money_in", "money_out"].includes(p) ? "currency" : p,
      );
      plan.properties = config.properties;
      plan.questions = plan.questions.filter((q) => q.id !== "financial");
      plan.notes.push(
        "Financial totals are withheld because some dates or amounts are missing or invalid. Your original values are still available.",
      );
    }
  }
  plan.headers = headers;
  plan.status = plan.questions.length ? "ready_with_questions" : "ready";
  return { plan, config, table };
}
export function applyAnswer(plan, id, value, values, departments) {
  const result = structuredClone(plan),
    question = result.questions.find((q) => q.id === id);
  if (!question || !question.choices.some((c) => c.value === value))
    throw Error("Choose one of the available answers.");
  if (question.kind === "department") result.department = value;
  else if (question.kind === "date_order") {
    if (value !== "text") {
      const incompatible = result.properties.some(
        (p, i) =>
          p === "date" &&
          i !== question.column &&
          result.dateFormat !== value &&
          values.slice(result.headerRow + 1).some((row) => {
            const v = row[i];
            return String(v ?? "").trim() && !parseDate(v, value);
          }),
      );
      if (incompatible)
        throw Error(
          "These date columns use different orders. Use manual editing to keep the conflicting column as text.",
        );
      result.properties[question.column] = "date";
      result.dateFormat = value;
    }
  } else if (question.kind === "financial" && value === "recorded") {
    const ri =
        question.revenueColumn ??
        result.headers.findIndex((h) => incoming.test(h)),
      ei =
        question.expenseColumn ??
        result.headers.findIndex((h) => outgoing.test(h));
    if (
      !Number.isInteger(ri) ||
      !Number.isInteger(ei) ||
      ri < 0 ||
      ei < 0 ||
      ri >= result.headers.length ||
      ei >= result.headers.length ||
      ri === ei
    )
      throw Error("Review the financial columns manually.");
    result.properties[ri] = "money_in";
    result.properties[ei] = "money_out";
  }
  result.questions = result.questions.filter((q) => q.id !== id);
  if (
    question.kind === "date_order" &&
    value !== "text" &&
    !result.headers.some((h) =>
      /payment status|paid|tax|currency|refund|invoice (?:amount|total)|invoiced/i.test(
        h,
      ),
    ) &&
    result.properties.filter((p) => p === "date").length === 1
  ) {
    const ri = result.headers.findIndex((h) => incoming.test(h)),
      ei = result.headers.findIndex((h) => outgoing.test(h));
    if (
      ri >= 0 &&
      ei >= 0 &&
      [ri, ei].every((i) =>
        ["number", "currency"].includes(result.properties[i]),
      )
    ) {
      result.properties[ri] = "money_in";
      result.properties[ei] = "money_out";
    }
  }
  return finalizePlan(values, result, departments);
}
export function aiMetadata(tabs, departments) {
  // No cell samples leave the server. Titles/headers are metadata and still require opt-in.
  const clean = (value) =>
    String(value)
      .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
      .replace(/https?:\/\/\S+/g, "[link]")
      .replace(/\b\d{5,}\b/g, "[number]")
      .slice(0, 100);
  return {
    departments: departments.map(clean),
    tabs: tabs.map(({ plan, values }) => ({
      tabId: plan.tabId,
      title: clean(plan.title),
      headerRow: plan.headerRow,
      headers: plan.headers.map(clean),
      properties: plan.properties,
      columnProfiles: profileColumns(
        plan.headers,
        values.slice(plan.headerRow + 1, plan.headerRow + 101),
      ).map((p) => ({
        type: p.type,
        ambiguousDate: p.ambiguousDate,
        missing: p.missing,
      })),
    })),
  };
}
export function mergeAiSuggestion(base, suggestion, values, departments) {
  // The model can improve classification, never resolve factual ambiguity.
  if (
    suggestion.tabId !== base.tabId ||
    suggestion.headerRow !== base.headerRow ||
    !Array.isArray(suggestion.properties) ||
    suggestion.properties.length !== base.headers.length ||
    suggestion.properties.some(
      (p) =>
        ![
          "text",
          "number",
          "currency",
          "percentage",
          "date",
          "boolean",
          "ignore",
          "money_in",
          "money_out",
        ].includes(p),
    )
  )
    throw Error("Invalid AI proposal.");
  const result = structuredClone(base);
  result.origin = "ai";
  result.properties = suggestion.properties.map((property, index) => {
    if (
      idColumn.test(base.headers[index]) ||
      base.protectedText?.includes(index)
    )
      return "text";
    if (
      base.questions.some((q) => q.kind === "date_order" && q.column === index)
    )
      return "text";
    // Excluding user data or assigning financial roles requires a manual choice.
    if (property === "ignore") return base.properties[index];
    return ["money_in", "money_out"].includes(property) ? "currency" : property;
  });
  // Preserve already validated, clearly named financial roles.
  base.properties.forEach((p, i) => {
    if (["money_in", "money_out"].includes(p)) result.properties[i] = p;
  });
  if (suggestion.department && departments.includes(suggestion.department)) {
    result.department = suggestion.department;
    result.questions = result.questions.filter((q) => q.kind !== "department");
  }
  const ri = suggestion.properties.indexOf("money_in"),
    ei = suggestion.properties.indexOf("money_out");
  const currencyIndex = base.headers.findIndex((h) =>
    /^currency(?: code)?$/i.test(h.trim()),
  );
  const currencies =
    currencyIndex < 0
      ? new Set()
      : new Set(
          values
            .slice(base.headerRow + 1)
            .map((row) =>
              String(row[currencyIndex] ?? "")
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        );
  if (
    ri >= 0 &&
    ei >= 0 &&
    ri !== ei &&
    currencies.size <= 1 &&
    result.properties[ri] === "currency" &&
    result.properties[ei] === "currency" &&
    result.properties.filter((p) => p === "date").length === 1 &&
    !base.properties.includes("money_in") &&
    !result.questions.some((q) => q.kind === "financial")
  ) {
    result.questions.push({
      id: "financial:ai",
      kind: "financial",
      revenueColumn: ri,
      expenseColumn: ei,
      message: `Use “${base.headers[ri]}” as revenue and “${base.headers[ei]}” as expenses? No payment filtering, tax adjustments or currency conversion will be applied.`,
      choices: [
        { value: "recorded", label: "Yes, use these recorded amounts" },
        { value: "table", label: "Keep as ordinary values" },
      ],
    });
  }
  return finalizePlan(values, result, departments);
}
