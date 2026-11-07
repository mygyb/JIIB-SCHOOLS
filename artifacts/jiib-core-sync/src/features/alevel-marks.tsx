// A-Level marks entry: one box per paper of the subject (Paper 1, Paper 2 ...). The subject mark is worked out from the papers.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { jiibApi } from "@/lib/jiib-api";
import { combinePapers, roundTotal, type ALevelSubject } from "@/lib/school-data";

type PaperMark = { studentId: string; subject: string; paper: string; score: number };
type Person = { id: string; name: string; className: string };

export function ALevelMarksTable({ schoolId, termKey, subject, config, students, locked }: {
  schoolId: string;
  termKey: string;
  subject: string;
  config: ALevelSubject;
  students: Person[];
  locked: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["alevel-marks", schoolId, termKey, subject];
  const marks = useQuery({
    queryKey,
    queryFn: () => jiibApi<PaperMark[]>(`/api/schools/${encodeURIComponent(schoolId)}/a-level/marks?termKey=${encodeURIComponent(termKey)}&subject=${encodeURIComponent(subject)}`),
  });
  const [error, setError] = useState("");
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});

  const scoreOf = (studentId: string, paper: string) => marks.data?.find((item) => item.studentId === studentId && item.paper === paper)?.score;

  const save = async (student: Person, paperName: string, max: number, input: HTMLInputElement) => {
    const key = `${student.id}|${paperName}`;
    const text = input.value.trim();
    const value = text === "" ? null : Number(text);
    const before = scoreOf(student.id, paperName);
    if (value === before || (value === null && before === undefined)) { setUnsaved((current) => ({ ...current, [key]: false })); return; }
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) {
      window.alert(`${paperName} must be between 0 and ${max}.`);
      input.value = before === undefined ? "" : String(before);
      return;
    }
    setUnsaved((current) => ({ ...current, [key]: true }));
    try {
      await jiibApi(`/api/schools/${encodeURIComponent(schoolId)}/a-level/marks`, {
        method: "PUT",
        body: JSON.stringify({ termKey, studentId: student.id, subject, paper: paperName, score: value }),
      });
      queryClient.setQueryData<PaperMark[]>(queryKey, (current = []) => {
        const rest = current.filter((item) => !(item.studentId === student.id && item.paper === paperName));
        return value === null ? rest : [...rest, { studentId: student.id, subject, paper: paperName, score: value }];
      });
      setUnsaved((current) => ({ ...current, [key]: false }));
      setError("");
    } catch (cause) {
      setError(navigator.onLine ? (cause instanceof Error ? cause.message : "This mark could not be saved.") : "You are offline. A-Level marks need a connection, so this mark was not saved.");
    }
  };

  if (marks.isLoading) return <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (marks.isError) return <div className="p-5 text-center"><CircleAlert className="mx-auto text-destructive" size={22} /><p role="alert" className="mt-2 text-sm">{marks.error instanceof Error ? marks.error.message : "Marks could not be loaded."}</p><button type="button" onClick={() => void marks.refetch()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm">Retry</button></div>;
  if (!students.length) return <div className="p-10 text-center"><p className="font-semibold">No students take {subject}</p><p className="mt-1 text-sm text-muted-foreground">Students appear here once they are enrolled in a combination that includes this subject.</p></div>;

  return <div data-testid="alevel-marks">
    {error && <p role="alert" data-testid="alevel-marks-error" className="m-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
      {config.combine === "weighted"
        ? `Subject mark = papers added by weight (${config.papers.map((paper) => `${paper.name} ${paper.weight ?? 0}%`).join(", ")}).`
        : "Subject mark = the average of the papers entered, each as a percentage of its own total."}
    </p>
    <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
      {students.map((student) => {
        const scores = config.papers.map((paper) => scoreOf(student.id, paper.name) ?? null);
        const combined = combinePapers(scores, config);
        const rounded = combined === null ? null : roundTotal(combined);
        return <div key={student.id} data-testid={`row-alevel-${student.id}`} className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold uppercase">{student.name}</p><p className="text-xs text-muted-foreground">{student.className} · {subject}</p></div>
            <p className="shrink-0 text-right"><span data-testid={`text-alevel-combined-${student.id}`} className={`font-display text-lg font-semibold ${rounded !== null && rounded >= 50 ? "text-[#2e8c72]" : "text-foreground"}`}>{rounded ?? "–"}</span><span className="ml-1 text-xs text-muted-foreground">/ 100</span></p>
          </div>
          <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(config.papers.length, 2)}, minmax(0, 1fr))` }}>
            {config.papers.map((paper, index) => {
              const stored = scoreOf(student.id, paper.name);
              const isUnsaved = unsaved[`${student.id}|${paper.name}`] === true;
              return <label key={paper.name} className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase leading-tight tracking-[.08em] text-muted-foreground">{paper.name} <span className="font-normal normal-case tracking-normal">({paper.max})</span></span>
                <input
                  key={`${student.id}-${paper.name}-${stored ?? "x"}`}
                  disabled={locked}
                  data-testid={`input-alevel-${student.id}-${index}`}
                  data-save-state={isUnsaved ? "unsaved" : "saved"}
                  aria-label={`${paper.name} (out of ${paper.max}) for ${student.name}`}
                  type="number" inputMode="decimal" min="0" max={paper.max} step="any"
                  defaultValue={stored ?? ""}
                  onChange={() => setUnsaved((current) => ({ ...current, [`${student.id}|${paper.name}`]: true }))}
                  onBlur={(event) => void save(student, paper.name, paper.max, event.currentTarget)}
                  className={`h-12 w-full rounded-md border px-2 text-center text-base outline-none transition-colors focus:ring-2 focus:ring-ring disabled:opacity-50 ${isUnsaved ? "border-[#e6a0a0] bg-[#fff1f1]" : stored !== undefined ? "border-[#96cdb8] bg-[#eef8f4]" : "border-input bg-background"}`}
                />
              </label>;
            })}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
