import type { Question } from "@/features/question-bank/data/seed-questions";

export type Verdict = "correct" | "wrong" | "partial" | "manual" | "skipped";

export interface GradeResult {
  verdict: Verdict;
  /** Score awarded (0..1). For "manual" the caller decides whether to count. */
  score: number;
  /** Human-readable description of the correct answer (rendered in results). */
  correctText: string;
  /** Human-readable rendering of the student's answer. */
  studentText: string;
}

/** Normalize for fill-blank / short-answer comparison. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Format student's MCQ-multi Set as a stable, comma-joined letter list. */
function formatLetters(optionIds: string[], all: string[]): string {
  if (optionIds.length === 0) return "(không chọn)";
  return optionIds
    .map((id) => {
      const idx = all.indexOf(id);
      return idx >= 0 ? String.fromCharCode(65 + idx) : "?";
    })
    .sort()
    .join(", ");
}

export function gradeQuestion(question: Question, answer: unknown): GradeResult {
  switch (question.type) {
    case "mcq-single": {
      const ids = question.options.map((o) => o.id);
      const correctOpt = question.options.find((o) => o.isCorrect);
      const correctText = correctOpt
        ? `${String.fromCharCode(65 + ids.indexOf(correctOpt.id))}. ${correctOpt.content}`
        : "—";
      if (typeof answer !== "string") {
        return {
          verdict: "skipped",
          score: 0,
          correctText,
          studentText: "(chưa làm)",
        };
      }
      const studentOpt = question.options.find((o) => o.id === answer);
      const studentText = studentOpt
        ? `${String.fromCharCode(65 + ids.indexOf(studentOpt.id))}. ${studentOpt.content}`
        : "—";
      const correct = correctOpt?.id === answer;
      return {
        verdict: correct ? "correct" : "wrong",
        score: correct ? 1 : 0,
        correctText,
        studentText,
      };
    }
    case "mcq-multi": {
      const ids = question.options.map((o) => o.id);
      const correctSet = new Set(
        question.options.filter((o) => o.isCorrect).map((o) => o.id),
      );
      const studentSet =
        answer instanceof Set
          ? new Set(answer as Set<string>)
          : new Set<string>();
      const correctText = formatLetters(Array.from(correctSet), ids);
      const studentText = formatLetters(Array.from(studentSet), ids);
      if (studentSet.size === 0) {
        return {
          verdict: "skipped",
          score: 0,
          correctText,
          studentText: "(chưa làm)",
        };
      }
      // Score = correctly-picked options minus incorrect picks, capped at 0.
      let hits = 0;
      let misses = 0;
      for (const id of studentSet) {
        if (correctSet.has(id)) hits += 1;
        else misses += 1;
      }
      const score =
        correctSet.size === 0
          ? 0
          : Math.max(0, (hits - misses) / correctSet.size);
      const exact =
        studentSet.size === correctSet.size &&
        Array.from(studentSet).every((id) => correctSet.has(id));
      return {
        verdict: exact ? "correct" : hits > 0 ? "partial" : "wrong",
        score,
        correctText,
        studentText,
      };
    }
    case "true-false": {
      const correctText = question.correctAnswer ? "Đúng" : "Sai";
      if (typeof answer !== "boolean") {
        return {
          verdict: "skipped",
          score: 0,
          correctText,
          studentText: "(chưa làm)",
        };
      }
      const studentText = answer ? "Đúng" : "Sai";
      const correct = answer === question.correctAnswer;
      return {
        verdict: correct ? "correct" : "wrong",
        score: correct ? 1 : 0,
        correctText,
        studentText,
      };
    }
    case "fill-blank": {
      const blanks = question.blanks;
      const arr = Array.isArray(answer) ? (answer as string[]) : [];
      const correctText = blanks
        .map((b, i) => `#${i + 1}: ${b.acceptedAnswers.join(" | ")}`)
        .join(" · ");
      const filled = blanks.map((_, i) => arr[i]?.trim() ?? "").every((v) => v === "");
      if (filled) {
        return {
          verdict: "skipped",
          score: 0,
          correctText,
          studentText: "(chưa làm)",
        };
      }
      let hits = 0;
      blanks.forEach((b, i) => {
        const user = norm(arr[i] ?? "");
        if (b.acceptedAnswers.some((a) => norm(a) === user)) hits += 1;
      });
      const score = blanks.length === 0 ? 0 : hits / blanks.length;
      const studentText = blanks
        .map((_, i) => `#${i + 1}: ${arr[i]?.trim() || "(trống)"}`)
        .join(" · ");
      const exact = hits === blanks.length;
      return {
        verdict: exact ? "correct" : hits > 0 ? "partial" : "wrong",
        score,
        correctText,
        studentText,
      };
    }
    case "short-answer": {
      const accepted = question.acceptedAnswers;
      const correctText = accepted.join(" | ");
      if (typeof answer !== "string" || !answer.trim()) {
        return {
          verdict: "skipped",
          score: 0,
          correctText,
          studentText: "(chưa làm)",
        };
      }
      const studentText = answer.trim();
      const user = question.caseSensitive ? studentText : norm(studentText);
      const correct = accepted.some((a) =>
        question.caseSensitive ? a.trim() === user : norm(a) === user,
      );
      return {
        verdict: correct ? "correct" : "wrong",
        score: correct ? 1 : 0,
        correctText,
        studentText,
      };
    }
    case "essay": {
      const txt = typeof answer === "string" ? answer.trim() : "";
      return {
        verdict: "manual",
        score: 0,
        correctText: question.rubric.map((r) => `${r.label} (${r.points}đ)`).join(" · "),
        studentText: txt ? `${txt.length} ký tự` : "(chưa làm)",
      };
    }
    case "multi-tf": {
      const map = (answer && typeof answer === "object" ? answer : {}) as Record<string, boolean>;
      let okCount = 0;
      for (const sub of question.subQuestions) {
        if (map[sub.id] === sub.correctAnswer) okCount++;
      }
      const allCorrect = okCount === question.subQuestions.length;
      return {
        verdict: allCorrect ? "correct" : okCount > 0 ? "partial" : "wrong",
        score: allCorrect ? 1 : 0,
        correctText: question.subQuestions
          .map((s, i) => `${i + 1}. ${s.correctAnswer ? "Đ" : "S"}`)
          .join(" · "),
        studentText:
          Object.keys(map).length === 0
            ? "(chưa làm)"
            : question.subQuestions
                .map(
                  (s, i) =>
                    `${i + 1}. ${map[s.id] === undefined ? "—" : map[s.id] ? "Đ" : "S"}`,
                )
                .join(" · "),
      };
    }
    case "matching": {
      const map = (answer && typeof answer === "object" ? answer : {}) as Record<string, string>;
      let okCount = 0;
      for (const p of question.pairs) {
        if (map[p.id] === p.id) okCount++;
      }
      const allCorrect = okCount === question.pairs.length;
      return {
        verdict:
          Object.keys(map).length === 0
            ? "skipped"
            : allCorrect
              ? "correct"
              : okCount > 0
                ? "partial"
                : "wrong",
        score: allCorrect ? 1 : 0,
        correctText: question.pairs.map((p) => `${p.left} → ${p.right}`).join(" · "),
        studentText:
          Object.keys(map).length === 0
            ? "(chưa làm)"
            : `Ghép đúng ${okCount}/${question.pairs.length}`,
      };
    }
    case "ordering": {
      const order = Array.isArray(answer) ? (answer as string[]) : [];
      const correct = question.items.map((it) => it.id);
      const allCorrect =
        order.length === correct.length &&
        order.every((id, i) => id === correct[i]);
      return {
        verdict:
          order.length === 0 ? "skipped" : allCorrect ? "correct" : "wrong",
        score: allCorrect ? 1 : 0,
        correctText: question.items.map((it, i) => `${i + 1}. ${it.content}`).join(" · "),
        studentText:
          order.length === 0
            ? "(chưa làm)"
            : order
                .map((id, i) => {
                  const it = question.items.find((x) => x.id === id);
                  return `${i + 1}. ${it?.content ?? id}`;
                })
                .join(" · "),
      };
    }
    case "drag-drop": {
      const arr = Array.isArray(answer) ? (answer as string[]) : [];
      const norm = (s: string) => (s ?? "").trim().toLowerCase();
      let okCount = 0;
      for (let i = 0; i < question.zones.length; i++) {
        if (norm(arr[i] ?? "") === norm(question.zones[i]!.correctContent))
          okCount++;
      }
      const allCorrect = okCount === question.zones.length;
      return {
        verdict:
          arr.filter(Boolean).length === 0
            ? "skipped"
            : allCorrect
              ? "correct"
              : okCount > 0
                ? "partial"
                : "wrong",
        score: allCorrect ? 1 : 0,
        correctText: question.zones
          .map((z, i) => `${i + 1}. ${z.correctContent}`)
          .join(" · "),
        studentText:
          arr.filter(Boolean).length === 0
            ? "(chưa làm)"
            : `Đúng ${okCount}/${question.zones.length} vùng`,
      };
    }
    case "underline": {
      // Value = number[] of selected token indices (position-based).
      // Re-tokenize content same way the trial UI does so we can map
      // each index → its correct flag + its underlying word value.
      const picked = Array.isArray(answer) ? (answer as number[]) : [];
      const slices: Array<{ text: string; isMarker: boolean }> = [];
      const reMark = /\[u:([^\]\n]+)\]/g;
      let lastIdx = 0;
      let mm: RegExpExecArray | null;
      while ((mm = reMark.exec(question.content)) !== null) {
        if (mm.index > lastIdx)
          slices.push({
            text: question.content.slice(lastIdx, mm.index),
            isMarker: false,
          });
        slices.push({ text: mm[1]!, isMarker: true });
        lastIdx = mm.index + mm[0].length;
      }
      if (lastIdx < question.content.length)
        slices.push({
          text: question.content.slice(lastIdx),
          isMarker: false,
        });
      const tokens: Array<{ kind: "word" | "sep"; value: string; correct: boolean }> = [];
      const tokRe = /([\p{L}\p{N}]+(?:['']\p{L}+)?)|([^\p{L}\p{N}]+)/gu;
      for (const slice of slices) {
        tokRe.lastIndex = 0;
        let tm: RegExpExecArray | null;
        while ((tm = tokRe.exec(slice.text)) !== null) {
          if (tm[1] !== undefined)
            tokens.push({ kind: "word", value: tm[1]!, correct: slice.isMarker });
          else if (tm[2] !== undefined)
            tokens.push({ kind: "sep", value: tm[2]!, correct: false });
        }
      }
      let truePos = 0;
      let falsePos = 0;
      let falseNeg = 0;
      tokens.forEach((tk, i) => {
        if (tk.kind !== "word") return;
        const isPicked = picked.includes(i);
        if (tk.correct && isPicked) truePos++;
        else if (!tk.correct && isPicked) falsePos++;
        else if (tk.correct && !isPicked) falseNeg++;
      });
      const exactMatch = falsePos === 0 && falseNeg === 0;
      const studentLabels = picked
        .map((i) => tokens[i]?.value)
        .filter((s): s is string => !!s);
      const correctLabels = tokens
        .filter((t) => t.kind === "word" && t.correct)
        .map((t) => t.value);
      return {
        verdict:
          picked.length === 0
            ? "skipped"
            : exactMatch
              ? "correct"
              : truePos > 0
                ? "partial"
                : "wrong",
        score: exactMatch ? 1 : 0,
        correctText: correctLabels.join(", "),
        studentText: studentLabels.length === 0 ? "(chưa làm)" : studentLabels.join(", "),
      };
    }
    default:
      return {
        verdict: "manual",
        score: 0,
        correctText: "Cần chấm thủ công cho dạng câu này.",
        studentText: answer ? "(đã làm)" : "(chưa làm)",
      };
  }
}

export interface ExamGrade {
  results: Array<{ questionId: string; grade: GradeResult }>;
  totalScore: number;
  /** Auto-gradable questions only — used as the denominator. */
  autoGradableCount: number;
  manualCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  skippedCount: number;
}

export function gradeExam(
  questions: Question[],
  answers: Record<string, unknown>,
): ExamGrade {
  const results: ExamGrade["results"] = [];
  let totalScore = 0;
  let autoGradableCount = 0;
  let manualCount = 0;
  let correctCount = 0;
  let partialCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  for (const q of questions) {
    const g = gradeQuestion(q, answers[q.id]);
    results.push({ questionId: q.id, grade: g });
    if (g.verdict === "manual") {
      manualCount += 1;
    } else {
      autoGradableCount += 1;
      totalScore += g.score;
      if (g.verdict === "correct") correctCount += 1;
      else if (g.verdict === "partial") partialCount += 1;
      else if (g.verdict === "wrong") wrongCount += 1;
      else if (g.verdict === "skipped") skippedCount += 1;
    }
  }
  return {
    results,
    totalScore,
    autoGradableCount,
    manualCount,
    correctCount,
    partialCount,
    wrongCount,
    skippedCount,
  };
}
