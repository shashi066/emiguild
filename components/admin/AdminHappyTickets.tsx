"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ticket, RotateCcw, RotateCw, Archive } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  PendingRewardError,
  submitRewardRequest,
} from "@/lib/reward-request-client";
import type { HappyConfig } from "@/lib/happy-ticket-rules";
import styles from "./HappyTicketsAdmin.module.css";

import { AdminModalShell } from "./AdminModalShell";
import type {
  AdminHappyData as AdminData,
  AdminSection,
} from "@/lib/admin-happy-types";
const stamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
export function AdminHappyTickets({
  initialData,
  initialOwnerId,
  initialError,
}: {
  initialData?: AdminData;
  initialOwnerId?: string;
  initialError?: string;
} = {}) {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AdminData | null>(initialData ?? null);
  const [config, setConfig] = useState<HappyConfig | null>(
    initialData?.pool.config ?? null,
  );
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [confirm, setConfirm] = useState<Record<string, unknown> | null>(null);
  const [editor, setEditor] = useState<"eligibility" | "member" | null>(null);
  const [reading, setReading] = useState(false);
  const query = useRef("");
  const generation = useRef(0);
  const flight = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const previousOwner = useRef(initialOwnerId);
  const refresh = useCallback(async (params = query.current) => {
    const id = ++generation.current;
    setReading(true);
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(
        "/api/admin/happy-tickets" + (params ? "?" + params : ""),
        { cache: "no-store", signal: controller.signal },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load tickets.");
      if (id !== generation.current) return false;
      if (
        !body.pool?.config ||
        !body.counts ||
        !Array.isArray(body.members) ||
        !body.section
      )
        throw new Error("Page data is out of date. Reload this page.");
      query.current = params;
      setData(body);
      setConfig(body.pool.config);
      setError("");
      return true;
    } catch (cause) {
      if (id !== generation.current) return false;
      throw new Error(
        controller.signal.aborted
          ? "Loading took too long. Try again."
          : cause instanceof Error
            ? cause.message
            : "Could not load tickets.",
      );
    } finally {
      clearTimeout(timeout);
      if (id === generation.current) setReading(false);
    }
  }, []);
  useEffect(() => {
    if (status === "loading") return;
    const requests = generation;
    const controller = readController;
    const owner = session?.user?.id;
    if (previousOwner.current !== owner) {
      setData(null);
      setConfig(null);
      query.current = "";
    }
    previousOwner.current = owner;
    if (owner && (!initialData || initialOwnerId !== owner))
      void refresh().catch((e) => setError(e.message));
    try {
      setRecovery(
        !!localStorage.getItem(`emiguild:reward:${owner}:GUILD_RESET`),
      );
    } catch {
      setError("Browser storage is required for recovery.");
    }
    return () => {
      requests.current++;
      controller.current?.abort();
    };
  }, [refresh, session?.user?.id, status, initialData, initialOwnerId]);
  const reload = (params?: string) =>
    void refresh(params).catch((e) => setError(e.message));
  const submit = async (
    kind: "RESET" | "CONFIG",
    input: Record<string, unknown>,
    recover = false,
  ) => {
    if (!session?.user?.id || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "RESET") {
        const savedPayload = recover
          ? JSON.parse(
              localStorage.getItem(
                `emiguild:reward:${session.user.id}:GUILD_RESET`,
              ) || "{}",
            ).payload
          : { kind, input };
        const response = await submitRewardRequest(
          session.user.id,
          "GUILD_RESET",
          "/api/admin/happy-tickets",
          savedPayload,
        );
        const result = response.result ?? response;
        setNotice(
          result.affectedCount === undefined
            ? "Previous shared reset result recovered. Current personal balances are shown below."
            : `${result.affectedCount} accounts updated. Existing cooldowns and claimed tickets were kept.`,
        );
        setRecovery(false);
      } else {
        const response = await fetch("/api/admin/happy-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, input }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Save failed.");
        setNotice("Eligibility saved.");
      }
      // A committed action remains successful even if its follow-up GET fails.
      try {
        await refresh();
      } catch {
        setError("Saved successfully. Refresh to load the latest data.");
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      if (e instanceof PendingRewardError) setRecovery(true);
      return false;
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    if (!flight.current) setConfirm(null);
  };
  const ask = (action: "BANK" | "FORCE" | "CANCEL", grantId?: string) => {
    setReason("");
    setConfirm({
      action,
      ...(grantId ? { grantId } : { expectedAccounts: data?.counts.accounts }),
    });
  };
  const navigate = (
    section: AdminSection,
    page = 1,
    extra: Record<string, string> = {},
  ) => {
    setEditor(null);
    const filter =
      section === "tickets" && data?.section === "tickets"
        ? new URLSearchParams(query.current).get("userId")
        : null;
    reload(
      new URLSearchParams({
        ...(filter ? { userId: filter } : {}),
        section,
        page: String(page),
        ...(section === "members" ? { search } : {}),
        ...extra,
      }).toString(),
    );
  };
  const viewMember = async (userId: string) => {
    try {
      const loaded = await refresh(
        new URLSearchParams({
          section: "members",
          page: String(data?.page ?? 1),
          search,
          userId,
        }).toString(),
      );
      if (loaded) setEditor("member");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load member.");
    }
  };
  const modalHeader = (title: string) => (
    <div className={styles.modalHeader}>
      <h2 id="happy-editor-title">{title}</h2>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="Close dialog"
        disabled={busy}
        onClick={() => {
          setEditor(null);
          close();
        }}
      >
        Close
      </button>
    </div>
  );
  return (
    <div className={styles.root}>
      <div className="page-header">
        <h1 className="page-title">
          <Ticket size={24} aria-hidden="true" /> Happy Tickets
        </h1>
        <div className={styles.actions}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!data || busy}
            onClick={() => setEditor("eligibility")}
          >
            Eligibility
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy || reading}
            onClick={() => reload()}
          >
            <RotateCw size={15} aria-hidden="true" />{" "}
            {reading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {recovery && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void submit("RESET", {}, true)}
        >
          Check previous result
        </button>
      )}
      {!data || !config ? (
        !error && (
          <div role="status" className="loading-state">
            <span className="spinner" aria-hidden="true" /> Loading tickets...
          </div>
        )
      ) : (
        <>
          <div className={styles.stats} aria-label="Account totals">
            {[
              ["Accounts", data.counts.accounts],
              ["Claimable", data.counts.available],
              ["Claimed", data.counts.issued],
              ["Used", data.counts.redeemed],
              ["Expired", data.counts.expired],
              ["Unused resets", data.counts.banked],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className={styles.tabs} aria-label="Ticket administration">
            {(["tickets", "members", "resets"] as const).map((section) => (
              <button
                key={section}
                type="button"
                className="btn btn-ghost"
                aria-pressed={data.section === section}
                disabled={busy}
                onClick={() => navigate(section)}
              >
                {section[0].toUpperCase() + section.slice(1)}
              </button>
            ))}
          </div>
          <section className={`card ${styles.content}`} aria-busy={reading}>
            {data.section === "tickets" &&
              new URLSearchParams(query.current).has("userId") && (
                <div className={styles.toolbar}>
                  <span>Selected member tickets</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => reload("section=tickets")}
                  >
                    All tickets
                  </button>
                </div>
              )}
            {data.section === "members" && (
              <form
                className={styles.toolbar}
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate("members");
                }}
              >
                <label className={styles.search}>
                  <span className={styles.srOnly}>Search name or email</span>
                  <input
                    className="form-input"
                    placeholder="Search name or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={150}
                  />
                </label>
                <button
                  className="btn btn-secondary btn-sm"
                  type="submit"
                  disabled={reading}
                >
                  Search
                </button>
              </form>
            )}
            {data.section === "resets" && (
              <div className={styles.toolbar}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy || recovery}
                  onClick={() => ask("BANK")}
                >
                  <Archive size={15} /> Give banked reset
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy || recovery}
                  onClick={() => ask("FORCE")}
                >
                  <RotateCcw size={15} /> Refill accounts
                </button>
              </div>
            )}
            <div
              className={styles.table}
              data-section={data.section}
              tabIndex={0}
              role="region"
              aria-label={`${data.section} table`}
            >
              {data.section === "tickets" && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Claimed (IST)</th>
                      <th>Expiry (IST)</th>
                      <th>Status / booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.length === 0 && (
                      <tr>
                        <td colSpan={4}>No claimed tickets.</td>
                      </tr>
                    )}
                    {data.tickets.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.user.name}</strong>
                          <small>{t.user.email}</small>
                        </td>
                        <td>{stamp(t.claimedAt)}</td>
                        <td>
                          {stamp(
                            new Date(Date.parse(t.expiresAt) - 1).toISOString(),
                          )}
                        </td>
                        <td>
                          <span className="badge">
                            {t.status === "CLAIMED" &&
                            Date.parse(t.expiresAt) <= Date.now()
                              ? "EXPIRED"
                              : t.status}
                          </span>
                          {t.redemptions.map((r) => (
                            <small key={r.id}>
                              <a
                                href={`/admin/bookings?search=${encodeURIComponent(t.user.email)}`}
                              >
                                #{r.bookingId.slice(-8).toUpperCase()}
                              </a>{" "}
                              / {r.status}
                            </small>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.section === "members" && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Claimable</th>
                      <th>Unused resets</th>
                      <th>
                        <span className={styles.srOnly}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.length === 0 && (
                      <tr>
                        <td colSpan={4}>No members found.</td>
                      </tr>
                    )}
                    {data.members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.name}</strong>
                          <small>{m.email}</small>
                        </td>
                        <td>{m.happyAvailable}/5</td>
                        <td>{m._count.happyResets}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={reading}
                            onClick={() => void viewMember(m.id)}
                            aria-label={`View ${m.name}`}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {data.section === "resets" && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Grant</th>
                      <th>Copies</th>
                      <th>Expires (IST)</th>
                      <th>
                        <span className={styles.srOnly}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.resets.length === 0 && (
                      <tr>
                        <td colSpan={4}>No personal reset grants yet.</td>
                      </tr>
                    )}
                    {data.resets.map((r) => (
                      <tr key={r.grantId}>
                        <td>
                          {r.reason}
                          <small>
                            {r.kind === "BANKED"
                              ? "Banked reset"
                              : "Account refill"}{" "}
                            / {stamp(r.createdAt)}
                          </small>
                        </td>
                        <td>
                          {r.expired ? 0 : (r.counts.PENDING ?? 0)} unused
                          <small>
                            {r.counts.ACTIVATED ?? 0} used /{" "}
                            {r.counts.CANCELLED ?? 0} cancelled
                            {r.expired
                              ? ` / ${r.counts.PENDING ?? 0} expired`
                              : ""}
                          </small>
                        </td>
                        <td>{stamp(r.expiresAt)}</td>
                        <td>
                          {!r.expired &&
                            r.kind === "BANKED" &&
                            !!r.counts.PENDING && (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={busy || recovery}
                                onClick={() => ask("CANCEL", r.grantId)}
                              >
                                Cancel unused
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className={styles.pagination}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={reading || data.page <= 1}
                onClick={() => navigate(data.section, data.page - 1)}
              >
                Previous
              </button>
              <span>Page {data.page}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={reading || !data.hasNext}
                onClick={() => navigate(data.section, data.page + 1)}
              >
                Next
              </button>
            </div>
          </section>
          {data.section === "resets" && (
            <details className={styles.audit}>
              <summary>Recent reset activity</summary>
              {data.events.length === 0 ? (
                <p>No reset activity.</p>
              ) : (
                data.events.map((e) => (
                  <p key={e.id}>
                    {stamp(e.createdAt)} /{" "}
                    {(
                      {
                        RESET_BANK: "Banked resets granted",
                        RESET_FORCE: "Accounts refilled",
                        RESET_CANCEL: "Unused resets cancelled",
                        POOL_ACTIVATE: "Personal reset used",
                      } as Record<string, string>
                    )[e.action] ?? e.action}
                  </p>
                ))
              )}
            </details>
          )}
          {editor === "eligibility" && (
            <AdminModalShell
              labelledBy="happy-editor-title"
              onClose={() => {
                if (!busy) setEditor(null);
              }}
              lightweight
            >
              {modalHeader("Ticket eligibility")}
              <fieldset disabled={busy} className={styles.eligibility}>
                <fieldset>
                  <legend>PS5 stations</legend>
                  {data.stations.map((station) => (
                    <label key={station.id}>
                      <input
                        type="checkbox"
                        checked={config.stationIds.includes(station.id)}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            stationIds: e.target.checked
                              ? [...config.stationIds, station.id]
                              : config.stationIds.filter(
                                  (id) => id !== station.id,
                                ),
                          })
                        }
                      />
                      {station.name}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Eligible days</legend>
                  <div className={styles.days}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day, i) => (
                        <label key={day}>
                          <input
                            type="checkbox"
                            checked={config.days.includes(i)}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                days: e.target.checked
                                  ? [...config.days, i].sort()
                                  : config.days.filter((d) => d !== i),
                              })
                            }
                          />
                          {day}
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
                <div className={styles.timeRow}>
                  <label>
                    From (IST)
                    <input
                      className="form-input"
                      type="time"
                      step="1800"
                      value={config.startTime}
                      onChange={(e) =>
                        setConfig({ ...config, startTime: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    To (IST)
                    <input
                      className="form-input"
                      type="time"
                      step="1800"
                      value={config.endTime}
                      onChange={(e) =>
                        setConfig({ ...config, endTime: e.target.value })
                      }
                    />
                  </label>
                </div>
              </fieldset>
              <div className={styles.footer}>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await submit("CONFIG", {
                        config,
                        version: data.pool.version,
                      })
                    )
                      setEditor(null);
                  }}
                >
                  {busy ? "Saving..." : "Save eligibility"}
                </button>
              </div>
              {error && <p role="alert">{error}</p>}
            </AdminModalShell>
          )}
          {editor === "member" && data.member && (
            <AdminModalShell
              labelledBy="happy-editor-title"
              onClose={() => setEditor(null)}
              lightweight
            >
              {modalHeader(data.member.user.name)}
              <p className={styles.muted}>{data.member.user.email}</p>
              <p>
                <strong>{data.member.available}/5</strong> claimable
              </p>
              <p>Next claim: {stamp(data.member.nextClaimAt)}</p>
              <details>
                <summary>Recent resets</summary>
                {data.member.resets.length === 0 ? (
                  <p>No resets.</p>
                ) : (
                  data.member.resets.map((r) => (
                    <p key={r.id}>
                      {r.reason} / {r.status}
                      <small className={styles.muted}>
                        {" "}
                        / {stamp(r.expiresAt)}
                      </small>
                    </p>
                  ))
                )}
              </details>
              <div className={styles.footer}>
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    navigate("tickets", 1, { userId: data.member!.user.id })
                  }
                >
                  View claimed tickets
                </button>
              </div>
            </AdminModalShell>
          )}
        </>
      )}
      {confirm && (
        <AdminModalShell
          labelledBy="happy-editor-title"
          onClose={close}
          lightweight
        >
          {modalHeader(
            confirm.action === "BANK"
              ? "Give banked reset"
              : confirm.action === "FORCE"
                ? "Refill accounts"
                : "Cancel unused resets",
          )}
          <p>
            {confirm.action === "CANCEL"
              ? "Only unused, unexpired copies will be cancelled."
              : `${confirm.expectedAccounts} existing accounts: ${confirm.action === "BANK" ? "each receives one personal reset. Later signups are excluded." : "each balance becomes five. Claimed tickets and cooldowns stay unchanged."}`}
          </p>
          <label className={styles.reason}>
            Reason
            <input
              autoFocus
              className="form-input"
              value={reason}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className={styles.footer}>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={close}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !reason.trim() || recovery}
              onClick={async () => {
                if (await submit("RESET", { ...confirm, reason }))
                  setConfirm(null);
              }}
            >
              {busy ? "Saving..." : "Confirm"}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </AdminModalShell>
      )}
    </div>
  );
}
