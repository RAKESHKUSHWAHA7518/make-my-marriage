"use client";

import { useEffect, useRef, useState } from "react";
import type { CommentView } from "@/modules/tasks/comments";

type Thread = { data: CommentView[]; pagination: { nextCursor: string | null }; readOnly: boolean };
type Target = { action: "patch" | "remove"; comment: CommentView };
type Submission = { url: string; method: "POST" | "PATCH"; body: string; key: string };
type Outcome = CommentView | { id: string; removed: true };

class CommentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function responseData<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new CommentError(response.status, result.error?.code, result.error?.message ?? "Please try again.");
  return result;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toUpperCase();
}

export function TaskComments({ weddingId, taskId, readOnly, timezone, name }: { weddingId: string; taskId: string; readOnly: boolean; timezone: string; name: string }) {
  const endpoint = `/api/v1/weddings/${weddingId}/tasks/${taskId}/comments`;
  const [thread, setThread] = useState<Thread>();
  const [generation, reload] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [olderError, setOlderError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [target, setTarget] = useState<Target>();
  const [edit, setEdit] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Submission>();
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const inFlight = useRef(false);
  const archived = readOnly || thread?.readOnly || locked;
  const format = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(responseData<Thread>).then(result => {
      if (!controller.signal.aborted) setThread(result);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof CommentError ? error.message : "Could not load comments. Please retry.");
    });
    return () => controller.abort();
  }, [endpoint, generation]);

  function refresh() {
    setThread(undefined);
    setLoadError("");
    setOlderError("");
    reload(value => value + 1);
  }

  function lostAccess(error: unknown) {
    if (!(error instanceof CommentError) || error.code === "COMMENT_UNAVAILABLE" || ![401, 404].includes(error.status)) return false;
    setThread(undefined);
    setLoadError(error.message);
    setPending(undefined);
    setTarget(undefined);
    return true;
  }

  async function loadOlder() {
    const cursor = thread?.pagination.nextCursor;
    if (!cursor || inFlight.current || pending) return;
    inFlight.current = true;
    setOlderBusy(true);
    setOlderError("");
    try {
      const result = await responseData<Thread>(await fetch(`${endpoint}?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" }));
      setThread(previous => previous && {
        ...result,
        data: [...previous.data, ...result.data.filter(item => !previous.data.some(existing => existing.id === item.id))],
      });
    } catch (error) {
      if (!lostAccess(error)) setOlderError("Could not load older comments.");
    } finally {
      inFlight.current = false;
      setOlderBusy(false);
    }
  }

  async function save(submission: Submission) {
    if (inFlight.current || archived) return;
    inFlight.current = true;
    setPending(submission);
    setBusy(true);
    setSaveError("");
    setNotice("");
    try {
      const response = await fetch(submission.url, {
        method: submission.method, body: submission.body,
        headers: { "Content-Type": "application/json", "X-MMM-CSRF": "1", "Idempotency-Key": submission.key },
      });
      const { data } = await responseData<{ data: Outcome }>(response);
      setThread(previous => {
        if (!previous) return previous;
        if ("removed" in data) return { ...previous, data: previous.data.filter(item => item.id !== data.id) };
        if (target) return { ...previous, data: previous.data.map(item => item.id === data.id ? data : item) };
        const comments = [data, ...previous.data.filter(item => item.id !== data.id)];
        comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        return { ...previous, data: comments };
      });
      if (!target) setMessage("");
      setNotice(target?.action === "remove" ? "Comment removed." : target ? "Comment updated." : "Comment posted.");
      setTarget(undefined);
      setPending(undefined);
    } catch (error) {
      if (lostAccess(error)) return;
      if (error instanceof CommentError && error.status < 500 && error.status !== 429) {
        setPending(undefined);
        if (error.code === "WEDDING_ARCHIVED") {
          setLocked(true);
          setTarget(undefined);
        }
        if (["VERSION_CONFLICT", "COMMENT_UNAVAILABLE"].includes(error.code)) refresh();
      }
      setSaveError(error instanceof CommentError ? error.message : "We couldn’t confirm this save. Retry to check it.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submit() {
    if (pending || olderBusy) return;
    const body = (target ? edit : message).trim();
    if (target?.action !== "remove" && !body) {
      if (target) setSaveError("Enter a comment before saving.");
      else setFieldError("Enter a comment before posting.");
      return;
    }
    const payload = target ? {
      expectedVersion: target.comment.version, ...(target.action === "patch" ? { body } : {}),
    } : { body };
    void save({
      url: target ? `${endpoint}/${target.comment.id}${target.action === "remove" ? "/remove" : ""}` : endpoint,
      method: target?.action === "patch" ? "PATCH" : "POST",
      body: JSON.stringify(payload), key: crypto.randomUUID(),
    });
  }

  function select(next?: Target) {
    setTarget(next);
    setEdit(next?.comment.body ?? "");
    setSaveError("");
    setNotice("");
  }

  const frozen = !!pending || olderBusy;
  const retry = pending && !busy && <button type="button" className="button button-secondary" onClick={() => void save(pending)}>Retry save</button>;
  return <section className="workspace-panel task-comments" aria-labelledby="task-comments-title">
    <header className="task-comments-heading"><h2 id="task-comments-title">Comments</h2><span>Private family thread</span></header>
    {!thread && (loadError
      ? <div className="task-comment-card"><p role="alert">{loadError}</p><button type="button" className="button button-secondary" onClick={refresh}>Retry loading</button></div>
      : <div className="task-comment-card" role="status">
        <p>Loading comments…</p>
        <div className="task-comment-skeleton" aria-hidden="true"><span /><span /></div>
      </div>)}
    {thread && <>
      {archived ? <p className="task-comment-card">This wedding is archived. Comments are read-only.</p> :
        <form className="task-comment-card task-comment-composer" onSubmit={event => { event.preventDefault(); if (!target) submit(); }}>
          <label htmlFor="task-comment-body"><span className="task-comment-avatar" aria-hidden="true">{initials(name)}</span> Add a comment</label>
          <textarea id="task-comment-body" rows={3} maxLength={10000} disabled={frozen || !!target}
            aria-invalid={!!fieldError} aria-describedby={fieldError ? "task-comment-validation" : undefined}
            placeholder="Add a note or ask your family a question about this task…" value={message}
            onChange={event => { setMessage(event.target.value); setFieldError(""); }} />
          {fieldError && <p id="task-comment-validation" role="alert">{fieldError}</p>}
          {!target && saveError && <p className="task-comment-feedback" role="alert">{saveError}</p>}
          <div className="task-comment-actions">{!target && retry}<button type="submit" className="button button-primary" disabled={frozen || !!target}>{busy && !target ? "Posting…" : "Post comment"}</button></div>
        </form>}
      {notice && <p role="status">{notice}</p>}
      {archived && saveError && <p role="alert">{saveError}</p>}
      {!thread.data.length && <div className="task-comment-empty"><strong>No comments yet</strong>{!archived && <p>Add a note or ask your family a question about this task.</p>}</div>}
      <ul className="task-comment-list">{thread.data.map(comment => {
        const selected = !archived && target?.comment.id === comment.id ? target : undefined;
        const stale = !!selected && selected.comment.version !== comment.version;
        return <li className="task-comment-card" key={comment.id}>
          <div className="task-comment-meta">
            <span className="task-comment-avatar" aria-hidden="true">{initials(comment.author.name)}</span>
            <div><strong>{comment.author.name}</strong><div><time dateTime={comment.createdAt}>{format.format(new Date(comment.createdAt))}</time>{comment.editedAt && " · Edited"}</div></div>
          </div>
          {selected?.action === "patch" ?
            <form onSubmit={event => { event.preventDefault(); submit(); }}>
              <label htmlFor="task-comment-edit">Edit comment</label>
              <textarea id="task-comment-edit" rows={3} maxLength={10000} value={edit} disabled={frozen} onChange={event => setEdit(event.target.value)} />
              {stale && <p className="task-comment-body">Latest comment: {comment.body}</p>}
              <div className="task-comment-actions"><button type="button" className="button button-secondary" disabled={frozen} onClick={() => select()}>Cancel</button>
                {stale && <button type="button" className="button button-secondary" disabled={frozen} onClick={() => { setTarget({ action: "patch", comment }); setSaveError(""); }}>Use latest version</button>}
                <button type="submit" className="button button-primary" disabled={frozen || stale}>{busy ? "Saving…" : "Save changes"}</button></div>
            </form> : <p className="task-comment-body">{comment.body}</p>}
          {selected?.action === "remove" && <div>
            <strong>Remove comment?</strong><p>This comment will be hidden from the family thread.</p>
            <div className="task-comment-actions"><button type="button" className="button button-secondary" disabled={frozen} onClick={() => select()}>Cancel</button>
              <button type="button" className="button button-primary" disabled={frozen} onClick={() => stale ? select({ action: "remove", comment }) : submit()}>{busy ? "Removing…" : stale ? "Review latest version" : "Remove comment"}</button></div>
          </div>}
          {selected && <>{saveError && <p role="alert">{saveError}</p>}{retry}</>}
          {!archived && !target && <div className="task-comment-actions">
            <button type="button" className="button button-secondary" disabled={frozen} onClick={() => select({ action: "patch", comment })}>Edit</button>
            <button type="button" className="button button-secondary" disabled={frozen} onClick={() => select({ action: "remove", comment })}>Remove</button>
          </div>}
        </li>;
      })}</ul>
      {target && !thread.data.some(comment => comment.id === target.comment.id) && <div className="task-comment-card">
        <p role="alert">The comment is unavailable in the current page of this thread.</p>
        {target.action === "patch" && <p className="task-comment-body">{edit}</p>}
        <button type="button" className="button button-secondary" onClick={() => select()}>Dismiss</button>
      </div>}
      {thread.pagination.nextCursor && <div className="task-comment-actions">
        {olderError && <p role="alert">{olderError}</p>}
        <button type="button" className="button button-secondary" disabled={frozen} onClick={() => void loadOlder()}>{olderBusy ? "Loading older comments…" : olderError ? "Retry loading older comments" : "Load older comments"}</button>
      </div>}
      <div className="task-comment-actions">
        <button type="button" className="button button-secondary" disabled={frozen || !!target} onClick={refresh}>Refresh comments</button>
      </div>
    </>}
  </section>;
}
