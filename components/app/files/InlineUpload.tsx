"use client";

import { useEffect, useRef, useState } from "react";
import { checkMaterial } from "@/lib/api/subjectMaterials";
import DropArea from "./DropArea";
import { PendingRow } from "./FileRows";
import { useUploads } from "./UploadProvider";

/**
 * Upload notes without leaving the form that needs them (a new deck or
 * sheet). They're filed as notes under `subjectId`, and `onRead` gets each
 * one Arcad manages to read so the form can select it.
 */
export default function InlineUpload({
  subjectId,
  onRead,
  title = "Upload notes",
}: {
  subjectId: string;
  onRead: (fileId: string) => void;
  title?: string;
}) {
  const { start, items, retry, dismiss } = useUploads();
  const [keys, setKeys] = useState<number[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const mine = items.filter((item) => keys.includes(item.key));

  const handled = useRef(new Set<number>());
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });
  useEffect(() => {
    for (const item of mine) {
      if (item.status === "done" && item.result && !handled.current.has(item.key)) {
        handled.current.add(item.key);
        onReadRef.current(item.result.file.id);
      }
    }
  }, [mine]);

  return (
    <div className="space-y-2">
      <DropArea
        compact
        title={title}
        hint="Arcad reads it, then it's picked here. PDFs, photos or text, up to 8 MB."
        disabled={subjectId ? undefined : "Choose a subject above first, so the file has somewhere to go."}
        onFiles={(files) => {
          const checked = files.map((file) => ({ file, problem: checkMaterial(file) }));
          setProblems(checked.flatMap(({ file, problem }) => (problem ? [`${file.name}: ${problem}`] : [])));
          const ok = checked.filter((entry) => !entry.problem).map((entry) => entry.file);
          if (ok.length) {
            const added = start(ok, { subjectId, kind: "resource" });
            setKeys((prev) => [...prev, ...added]);
          }
        }}
      />
      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
          {problem}
        </p>
      ))}
      {mine.length ? (
        <ul className="rounded-md px-3" style={{ background: "var(--app-surface-soft)" }}>
          {mine.map((item) => (
            <PendingRow key={item.key} item={item} retry={retry} dismiss={dismiss} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
