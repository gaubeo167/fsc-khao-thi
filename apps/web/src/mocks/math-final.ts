import type { ExamBank } from "@/features/attempts/types";

export const MATH_FINAL: ExamBank = {
  examId: "math-final",
  title: "Math Final",
  questions: [
    {
      id: "q1",
      type: "mcq",
      prompt: "What is the derivative of x² with respect to x?",
      options: [
        { id: "a", label: "x" },
        { id: "b", label: "2x" },
        { id: "c", label: "x²/2" },
        { id: "d", label: "2" },
      ],
    },
    {
      id: "q2",
      type: "mcq",
      prompt: "∫ 2x dx equals which of the following (+ C)?",
      options: [
        { id: "a", label: "x²" },
        { id: "b", label: "2x²" },
        { id: "c", label: "x²/2" },
        { id: "d", label: "2" },
      ],
    },
    {
      id: "q3",
      type: "mcq",
      prompt: "Solve for x: 3x − 7 = 11.",
      options: [
        { id: "a", label: "x = 4" },
        { id: "b", label: "x = 6" },
        { id: "c", label: "x = 18/3" },
        { id: "d", label: "x = 1" },
      ],
    },
    {
      id: "q4",
      type: "mcq",
      prompt: "The limit of (sin x) / x as x → 0 is:",
      options: [
        { id: "a", label: "0" },
        { id: "b", label: "1" },
        { id: "c", label: "∞" },
        { id: "d", label: "undefined" },
      ],
    },
    {
      id: "q5",
      type: "mcq",
      prompt: "Which of these is a prime number?",
      options: [
        { id: "a", label: "21" },
        { id: "b", label: "33" },
        { id: "c", label: "37" },
        { id: "d", label: "49" },
      ],
    },
    {
      id: "q6",
      type: "mcq",
      prompt: "The slope of the line y = 4x + 3 is:",
      options: [
        { id: "a", label: "3" },
        { id: "b", label: "4" },
        { id: "c", label: "−4" },
        { id: "d", label: "1" },
      ],
    },
    {
      id: "q7",
      type: "mcq",
      prompt: "If f(x) = e^x, then f′(x) is:",
      options: [
        { id: "a", label: "e^x" },
        { id: "b", label: "x · e^(x−1)" },
        { id: "c", label: "1/x" },
        { id: "d", label: "ln x" },
      ],
    },
    {
      id: "q8",
      type: "mcq",
      prompt: "The area of a circle with radius r is:",
      options: [
        { id: "a", label: "2πr" },
        { id: "b", label: "πr²" },
        { id: "c", label: "πd" },
        { id: "d", label: "r²/2" },
      ],
    },
  ],
};
