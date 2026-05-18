import type { Question } from "@/features/question-bank/data/seed-questions";

import type {
  BlueprintTopic,
  ExamBlueprint,
  PackageMatrixRow,
} from "../data/types";

export interface DifficultyCounts {
  easy: number;
  medium: number;
  hard: number;
}

/**
 * Build a quick `byId` lookup so the heavier `Question[]` array isn't scanned
 * repeatedly for each topic. Caller decides the scope (e.g. just the campus
 * pool of the current user).
 */
export function indexQuestions(questions: Question[]): Map<string, Question> {
  return new Map(questions.map((q) => [q.id, q] as const));
}

export function countTopicByDifficulty(
  topic: BlueprintTopic,
  index: Map<string, Question>,
): DifficultyCounts {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const id of topic.pickedQuestionIds) {
    const q = index.get(id);
    if (!q) continue;
    counts[q.difficulty] += 1;
  }
  return counts;
}

export function countBlueprintByDifficulty(
  blueprint: ExamBlueprint,
  index: Map<string, Question>,
): DifficultyCounts {
  const totals = { easy: 0, medium: 0, hard: 0 };
  for (const t of blueprint.topics) {
    const c = countTopicByDifficulty(t, index);
    totals.easy += c.easy;
    totals.medium += c.medium;
    totals.hard += c.hard;
  }
  return totals;
}

export interface MatrixValidation {
  ok: boolean;
  totalRequested: number;
  /** Rows where the requested count exceeds the available pool. */
  exceeded: Array<{
    topicId: string;
    topicName: string;
    difficulty: "easy" | "medium" | "hard";
    requested: number;
    available: number;
  }>;
}

export function validateMatrix(
  blueprint: ExamBlueprint,
  matrix: PackageMatrixRow[],
  index: Map<string, Question>,
): MatrixValidation {
  const exceeded: MatrixValidation["exceeded"] = [];
  let total = 0;
  for (const row of matrix) {
    const topic = blueprint.topics.find((t) => t.id === row.topicId);
    if (!topic) continue;
    const avail = countTopicByDifficulty(topic, index);
    if (row.easyCount > avail.easy) {
      exceeded.push({
        topicId: topic.id,
        topicName: topic.name,
        difficulty: "easy",
        requested: row.easyCount,
        available: avail.easy,
      });
    }
    if (row.mediumCount > avail.medium) {
      exceeded.push({
        topicId: topic.id,
        topicName: topic.name,
        difficulty: "medium",
        requested: row.mediumCount,
        available: avail.medium,
      });
    }
    if (row.hardCount > avail.hard) {
      exceeded.push({
        topicId: topic.id,
        topicName: topic.name,
        difficulty: "hard",
        requested: row.hardCount,
        available: avail.hard,
      });
    }
    total += row.easyCount + row.mediumCount + row.hardCount;
  }
  return { ok: exceeded.length === 0, totalRequested: total, exceeded };
}

export const DIFFICULTY_LABEL = {
  easy: { short: "NB", full: "Nhận biết", color: "#16A34A" },
  medium: { short: "TH", full: "Thông hiểu", color: "#CA8A04" },
  hard: { short: "VDC", full: "Vận dụng cao", color: "#DC2626" },
} as const;
