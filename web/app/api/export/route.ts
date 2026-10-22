import { localWorkspaceDenied } from "@/lib/local-access";
import { body, jsonError } from "@/lib/intelligence/http";
import { safeLog } from "@/lib/intelligence";
function csvValue(value: unknown) {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  // Spreadsheet apps can evaluate cells beginning with formula markers, even
  // when the CSV field is quoted. Prefix an apostrophe after leading controls.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function POST(request: Request) { const denied = localWorkspaceDenied(request); if (denied) return denied; try { const input = await body(request); const kind = input.kind === "speakers" || input.kind === "intros" ? input.kind : null; if (!kind || !Array.isArray(input.items) || input.items.length > 200) throw new Error("Provide up to 200 speakers or intros to export"); const rows = kind === "intros" ? [["Subject", "Body", "Project", "Person"], ...input.items.map((item) => { const value = item as Record<string, unknown>; return [value.subject, value.body, value.projectId, value.personName]; })] : [["Name", "Projects", "Reasons", "Evidence"], ...input.items.map((item) => { const value = item as Record<string, unknown>; return [value.person && typeof value.person === "object" ? (value.person as Record<string, unknown>).name : value.name, Array.isArray(value.projects) ? value.projects.map((project) => typeof project === "object" && project ? (project as Record<string, unknown>).title : "").join("; ") : "", Array.isArray(value.reasons) ? value.reasons.join("; ") : "", Array.isArray(value.evidence) ? value.evidence.map((e) => typeof e === "object" && e ? (e as Record<string, unknown>).url : "").join("; ") : ""]; })]; const content = rows.map((row) => row.map(csvValue).join(",")).join("\n"); await safeLog("export.csv", "ok", { kind, count: input.items.length }, { kind }); return new Response(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="afterlife-${kind}.csv"` } }); } catch (error) { return jsonError(error); } }
