"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { MATERIAL_ACCEPT, uploadMaterial, type MaterialKind, type UploadResult } from "@/lib/api/subjectMaterials";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import UploadSheet from "./UploadSheet";
import UploadTray from "./UploadTray";

export interface UploadTarget {
  subjectId: string;
  kind: MaterialKind;
}

export type UploadStatus = "waiting" | "uploading" | "reading" | "done" | "unread" | "failed";

export interface UploadItem extends UploadTarget {
  key: number;
  file: File;
  status: UploadStatus;
  /** 0 to 1 while the bytes go up. */
  progress: number;
  /** Why it failed, or why Arcad couldn't read it. */
  message?: string;
  /** Failed because uploads need Pro or Max. */
  upgrade?: boolean;
  result?: UploadResult;
}

/** Where the upload sheet starts: the subject and kind the page is about. */
export interface UploadPreset {
  subjectId?: string | null;
  kind?: MaterialKind;
  /** The current syllabus per subject id, so replacing one can be spelled out. */
  syllabi?: Record<string, string>;
}

type SheetState = { locked: true } | { locked: false; files: File[]; preset: UploadPreset } | null;

interface UploadContextValue {
  /** Uploads are on Pro and Max. */
  canUpload: boolean;
  items: UploadItem[];
  /** Goes up by one each time an upload finishes, so pages know to refetch. */
  finished: number;
  /** Opens the file picker, then the upload sheet (or the plan sheet on Free). */
  choose: (preset?: UploadPreset) => void;
  /** The upload sheet with files already picked, e.g. dropped on the page. */
  openWith: (files: File[], preset?: UploadPreset) => void;
  /** Straight to the queue, for places that already know the subject and kind. */
  start: (files: File[], target: UploadTarget) => number[];
  retry: (key: number) => void;
  dismiss: (key: number) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads must be used inside <UploadProvider>");
  return ctx;
}

/**
 * Every file upload in the app runs through here: one picker, one sheet that
 * asks which subject and what kind of file, and one queue that sends files
 * one at a time. It sits above the pages so an upload keeps going when the
 * student moves on, and the tray shows how it went on pages that don't list
 * files themselves.
 */
export default function UploadProvider({ children }: { children: ReactNode }) {
  const { data } = useDashboardData();
  const canUpload = data.user.tier === "pro" || data.user.tier === "max";
  const [items, setItems] = useState<UploadItem[]>([]);
  const [finished, setFinished] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pickPreset = useRef<UploadPreset>({});
  const nextKey = useRef(1);
  const running = useRef(false);
  // Pages that list files themselves register here: they take drops, and
  // the tray stays out of their way.
  const pages = useRef<Array<{ current: UploadPreset }>>([]);
  const [pageCount, setPageCount] = useState(0);

  // The queue reads the list between awaits, so it lives in a ref too.
  const itemsRef = useRef<UploadItem[]>([]);
  const commit = useCallback((change: (prev: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = change(itemsRef.current);
    setItems(itemsRef.current);
  }, []);
  const update = useCallback(
    (key: number, patch: Partial<UploadItem>) =>
      commit((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item))),
    [commit],
  );

  // One file at a time: each one waits for Arcad to finish reading it.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.status === "waiting");
        if (!next) break;
        update(next.key, { status: "uploading", progress: 0 });
        try {
          const result = await uploadMaterial(next.subjectId, next.file, next.kind, {
            onProgress: (progress) => update(next.key, { progress }),
            onSent: () => update(next.key, { status: "reading", progress: 1 }),
          });
          update(next.key, {
            status: result.read ? "done" : "unread",
            result,
            message: result.read ? undefined : result.message ?? "Arcad couldn't read this one.",
          });
        } catch (err) {
          const upgrade = err instanceof ApiError && err.status === 402;
          const message = err instanceof Error ? err.message : "Upload failed.";
          // Out of plan: the rest would fail the same way, so they stop too.
          commit((prev) =>
            prev.map((item) =>
              item.key === next.key || (upgrade && item.status === "waiting")
                ? { ...item, status: "failed", message, upgrade }
                : item,
            ),
          );
        }
        setFinished((count) => count + 1);
      }
    } finally {
      running.current = false;
    }
  }, [commit, update]);

  const openWith = useCallback(
    (files: File[], preset: UploadPreset = {}) => {
      if (!canUpload) {
        setSheet({ locked: true });
        return;
      }
      setSheet((prev) =>
        // A second drop while the sheet is open adds to what's there.
        prev && !prev.locked ? { ...prev, files: [...prev.files, ...files] } : { locked: false, files, preset },
      );
    },
    [canUpload],
  );

  const choose = useCallback(
    (preset: UploadPreset = {}) => {
      if (!canUpload) {
        setSheet({ locked: true });
        return;
      }
      pickPreset.current = preset;
      input.current?.click();
    },
    [canUpload],
  );

  const start = useCallback((files: File[], target: UploadTarget) => {
    const added = files.map<UploadItem>((file) => ({
      ...target,
      key: nextKey.current++,
      file,
      status: "waiting",
      progress: 0,
    }));
    commit((prev) => [...prev, ...added]);
    void pump();
    return added.map((item) => item.key);
  }, [commit, pump]);

  const retry = useCallback(
    (key: number) => {
      update(key, { status: "waiting", progress: 0, message: undefined, upgrade: false });
      void pump();
    },
    [update, pump],
  );

  const dismiss = useCallback(
    (key: number) =>
      commit((prev) => prev.filter((item) => item.key !== key || item.status === "uploading" || item.status === "reading")),
    [commit],
  );

  // Clear the finished ones a few seconds after the queue settles, unless
  // something failed and still needs a decision.
  const settled = items.length > 0 && items.every((item) => item.status === "done" || item.status === "unread");
  useEffect(() => {
    if (!settled) return;
    const timer = window.setTimeout(
      () => commit((prev) => prev.filter((item) => item.status !== "done" && item.status !== "unread")),
      6000,
    );
    return () => window.clearTimeout(timer);
  }, [settled, finished, commit]);

  // Dropping files anywhere on a page that lists files.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!pages.current.length || !hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!pages.current.length || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!pages.current.length || !hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!pages.current.length || !hasFiles(event)) return;
      // A drop zone inside the page handles its own drop.
      if (event.defaultPrevented) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) openWith(files, pages.current[pages.current.length - 1].current);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openWith]);

  const register = useCallback((page: { current: UploadPreset }) => {
    pages.current.push(page);
    setPageCount(pages.current.length);
    return () => {
      pages.current = pages.current.filter((entry) => entry !== page);
      setPageCount(pages.current.length);
    };
  }, []);

  const value = useMemo<UploadContextValue>(
    () => ({ canUpload, items, finished, choose, openWith, start, retry, dismiss }),
    [canUpload, items, finished, choose, openWith, start, retry, dismiss],
  );

  return (
    <UploadContext.Provider value={value}>
      <RegisterContext.Provider value={register}>{children}</RegisterContext.Provider>
      <input
        ref={input}
        type="file"
        multiple
        accept={MATERIAL_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) openWith(files, pickPreset.current);
        }}
      />
      <UploadSheet
        state={sheet}
        onClose={() => setSheet(null)}
        onAddFiles={() => input.current?.click()}
        onRemoveFile={(index) =>
          setSheet((prev) => (prev && !prev.locked ? { ...prev, files: prev.files.filter((_, i) => i !== index) } : prev))
        }
        onUpload={(files, target) => {
          start(files, target);
          setSheet(null);
        }}
      />
      {dragging ? <DropOverlay canUpload={canUpload} /> : null}
      <TrayOutsideFilePages pageCount={pageCount} items={items} retry={retry} dismiss={dismiss} />
    </UploadContext.Provider>
  );
}

const RegisterContext = createContext<((page: { current: UploadPreset }) => () => void) | null>(null);

/**
 * For a page that lists files: files dropped anywhere on it open the upload
 * sheet with this preset, and progress shows in the page's own rows rather
 * than the tray.
 */
export function useUploadPage(preset: UploadPreset) {
  const register = useContext(RegisterContext);
  const latest = useRef(preset);
  useEffect(() => {
    latest.current = preset;
  });
  useEffect(() => (register ? register(latest) : undefined), [register]);
}

/** Calls `refresh` each time an upload finishes, so the page shows the new file. */
export function useRefreshOnUpload(refresh: () => unknown) {
  const { finished } = useUploads();
  const latest = useRef(refresh);
  // The page fetched when it opened; only later uploads need a refetch.
  const seen = useRef(finished);
  useEffect(() => {
    latest.current = refresh;
  });
  useEffect(() => {
    if (finished === seen.current) return;
    seen.current = finished;
    void latest.current();
  }, [finished]);
}

function TrayOutsideFilePages({
  pageCount,
  items,
  retry,
  dismiss,
}: {
  pageCount: number;
  items: UploadItem[];
  retry: (key: number) => void;
  dismiss: (key: number) => void;
}) {
  const pathname = usePathname();
  if (pageCount > 0 || items.length === 0) return null;
  return <UploadTray items={items} retry={retry} dismiss={dismiss} showFilesLink={pathname !== "/app/files"} />;
}

function DropOverlay({ canUpload }: { canUpload: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center p-6"
      style={{ background: "color-mix(in oklab, var(--app-bg) 72%, transparent)" }}
    >
      <div
        className="flex w-full max-w-[420px] flex-col items-center gap-1.5 rounded-xl px-6 py-10 text-center"
        style={{ border: "2px dashed var(--app-accent)", background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
      >
        <UploadGlyph size={22} />
        <p className="mt-2 text-[16px] font-semibold" style={{ color: "var(--app-text)" }}>
          {canUpload ? "Drop to upload" : "Uploads are on Pro and Max"}
        </p>
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          {canUpload ? "You'll pick the subject next." : "Drop it anyway to see what's included."}
        </p>
      </div>
    </div>
  );
}

export function UploadGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13V3.5M6 7.5l4-4 4 4M4 13.5v1.5A1.5 1.5 0 0 0 5.5 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  );
}

export function LockGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
