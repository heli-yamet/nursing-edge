"use client";

import { useState } from "react";
import { OpenQuestion } from "@/components/OpenQuestion";
import type { BrowseQuestion } from "@/lib/player-load";

export function QuestionBrowse({
  label,
  size,
  questions,
}: {
  label: string;
  size: number;
  questions: BrowseQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const current = questions[index];
  if (!current) {
    return null;
  }

  return (
    <OpenQuestion
      key={current.position}
      label={label}
      position={current.position}
      size={size}
      stem={current.question.stem}
      format={current.question.format}
      options={current.question.options}
      onNext={
        index + 1 < questions.length ? () => setIndex(index + 1) : undefined
      }
    />
  );
}
