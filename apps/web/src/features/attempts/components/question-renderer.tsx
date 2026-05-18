"use client";

import type { Control } from "react-hook-form";

import { McqRenderer } from "./mcq-renderer";
import type { Question } from "../types";

interface QuestionRendererProps {
  question: Question;
  index: number;
  total: number;
  disabled?: boolean;
  control: Control<{ answers: Record<string, string> }>;
  onChange: (value: string) => void;
}

export function QuestionRenderer(props: QuestionRendererProps) {
  switch (props.question.type) {
    case "mcq":
      return <McqRenderer {...props} question={props.question} />;
    default: {
      const _exhaustive: never = props.question.type;
      return null;
    }
  }
}
