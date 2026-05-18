export interface McqOption {
  id: string;
  label: string;
}

export interface McqQuestion {
  id: string;
  type: "mcq";
  prompt: string;
  options: McqOption[];
}

export type Question = McqQuestion;

export interface ExamBank {
  examId: string;
  title: string;
  questions: Question[];
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
