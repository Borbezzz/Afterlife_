"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ProjectSummary = {
  id: string;
  title: string;
  slug: string;
  liveness: "alive" | "dormant" | "dead" | "unknown";
};

type ProfileOption = {
  id: string;
  name: string;
  devpostUrl: string | null;
  githubLogin: string | null;
  projects: ProjectSummary[];
};

type SavedProfile = {
  personId: string;
  name?: string;
  buildingNow?: string;
  wantToMeet?: string;
  openToSpeaking?: boolean;
  hidden?: boolean;
  consent?: boolean;
};

const livenessVariant = {
  alive: "success-light",
  dormant: "warning-light",
  dead: "outline",
  unknown: "info-light",
} as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createBrowserSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
  });
}

export function ClaimProfile({ profiles }: { profiles: ProfileOption[] }) {
  const [personId, setPersonId] = useState(profiles[0]?.id ?? "");
  const [name, setName] = useState("");
  const [buildingNow, setBuildingNow] = useState("");
  const [wantToMeet, setWantToMeet] = useState("");
  const [openToSpeaking, setOpenToSpeaking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loadedPersonId, setLoadedPersonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [signingIn, setSigningIn] = useState(false);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === personId),
    [personId, profiles],
  );
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const loading = loadedPersonId !== personId;
  const canVerifySelectedProfile = Boolean(selected?.githubLogin);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthLoading(false); }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) { setSession(nextSession); setAuthLoading(false); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    let current = true;
    async function loadSavedProfile() {
      if (supabaseConfigured && authLoading) return;
      if (supabaseConfigured && !session) {
        if (current) {
          setName(""); setBuildingNow(""); setWantToMeet(""); setOpenToSpeaking(false); setHidden(false); setConsent(false); setLoadedPersonId(personId);
        }
        return;
      }
      try {
        const response = await fetch(`/api/profile?personId=${encodeURIComponent(personId)}`, { cache: "no-store", headers: session ? { authorization: `Bearer ${session.access_token}` } : undefined });
        if (!response.ok) throw new Error("Could not load saved profile choices.");
        const payload = (await response.json()) as { profiles?: SavedProfile[] };
        const saved = payload.profiles?.find((profile) => profile.personId === personId);
        if (!current) return;
        setName(saved?.name ?? "");
        setBuildingNow(saved?.buildingNow ?? "");
        setWantToMeet(saved?.wantToMeet ?? "");
        setOpenToSpeaking(Boolean(saved?.openToSpeaking));
        setHidden(Boolean(saved?.hidden));
        setConsent(Boolean(saved?.consent));
      } catch (loadError) {
        if (current) setError(loadError instanceof Error ? loadError.message : "Could not load profile choices.");
      } finally {
        if (current) setLoadedPersonId(personId);
      }
    }
    void loadSavedProfile();
    return () => { current = false; };
  }, [personId, session, authLoading]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!personId || !consent || (supabaseConfigured && (!session || !canVerifySelectedProfile))) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json", ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ personId, name: name.trim() || undefined, buildingNow, wantToMeet, openToSpeaking, hidden, consent }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; verified?: boolean } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Your profile choices could not be saved.");
      setNotice(payload?.verified ? (hidden ? "Verified and saved. This profile will be excluded from discovery results." : "Verified and saved.") : (hidden ? "Saved. This profile will be excluded from discovery results." : "Saved. Your choices are available in this local workspace."));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your profile choices could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function signInWithGitHub() {
    if (!supabase) return;
    setSigningIn(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/claim` },
    });
    if (signInError) { setError(signInError.message); setSigningIn(false); }
  }

  async function signOut() {
    if (!supabase) return;
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }

  if (!profiles.length) {
    return (
      <section className="afterlife-page">
        <div className="afterlife-page-heading"><h1>Claim your profile</h1><p>No public builder profiles are indexed yet. Add public project data, then return here to set your discovery preferences.</p></div>
      </section>
    );
  }

  return (
    <section className="afterlife-page">
      <div className="afterlife-page-heading">
        <h1>Claim your profile</h1>
        <p>Choose a public builder record, add the context you want the community to see, or remove it from discovery.</p>
      </div>

      <div className="afterlife-two-column">
        <form className="afterlife-panel afterlife-form" onSubmit={saveProfile}>
          {supabaseConfigured ? <div className="afterlife-note">
            <strong>GitHub verification</strong>
            {authLoading ? <p>Checking your GitHub session…</p> : session ? <p>Signed in as {session.user.email ?? "a GitHub account"}. Save is available only when this account matches the selected public GitHub login. <button type="button" className="afterlife-inline-button" onClick={() => void signOut()}>Sign out</button></p> : <p>Sign in with the GitHub account linked to this public record before saving. <button type="button" className="afterlife-inline-button" onClick={() => void signInWithGitHub()} disabled={signingIn}>{signingIn ? "Redirecting…" : "Sign in with GitHub"}</button></p>}
          </div> : null}
          <div className="afterlife-form-field">
            <label htmlFor="person">Public builder record</label>
            <Select value={personId} onValueChange={(value) => { if (value) { setPersonId(value); setError(null); setNotice(null); } }} disabled={saving || authLoading}>
              <SelectTrigger id="person" className="w-full"><SelectValue>{selected?.name ?? "Choose a builder record"}</SelectValue></SelectTrigger>
              <SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent>
            </Select>
            <p>Pick the record connected to your public Devpost projects.</p>
          </div>

          <div className="afterlife-form-field">
            <label htmlFor="name">Name to show</label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={selected?.name} disabled={loading || saving} />
          </div>

          <div className="afterlife-form-field">
            <label htmlFor="building-now">What are you building now?</label>
            <textarea id="building-now" value={buildingNow} onChange={(event) => setBuildingNow(event.target.value)} disabled={loading || saving} rows={3} placeholder="A short public description is enough." />
          </div>

          <div className="afterlife-form-field">
            <label htmlFor="want-to-meet">Who do you want to meet?</label>
            <textarea id="want-to-meet" value={wantToMeet} onChange={(event) => setWantToMeet(event.target.value)} disabled={loading || saving} rows={3} placeholder="Skills, domains, or collaborators you are looking for." />
          </div>

          <label className="afterlife-check-row"><Checkbox checked={openToSpeaking} onCheckedChange={setOpenToSpeaking} disabled={loading || saving} /><span><strong>Open to speaking</strong><small>Organisers can include this public preference when looking for speakers.</small></span></label>
          <label className="afterlife-check-row"><Checkbox checked={hidden} onCheckedChange={setHidden} disabled={loading || saving} /><span><strong>Hide this profile from discovery</strong><small>Existing public source data remains public; Afterlife will exclude this record from its results.</small></span></label>
          <label className="afterlife-check-row afterlife-consent"><Checkbox checked={consent} onCheckedChange={setConsent} disabled={loading || saving} required /><span><strong>I consent to saving these preferences</strong><small>They are stored in this local Afterlife workspace until authenticated profile management is configured.</small></span></label>

          {error ? <p className="afterlife-message afterlife-message-error" role="alert">{error}</p> : null}
          {notice ? <p className="afterlife-message afterlife-message-success" role="status">{notice}</p> : null}
          {supabaseConfigured && !authLoading && session && !canVerifySelectedProfile ? <p className="afterlife-message afterlife-message-error">This public record has no GitHub login to verify. Choose a record with a linked GitHub account.</p> : null}
          <div className="afterlife-form-actions"><Button type="submit" disabled={loading || saving || !consent || (supabaseConfigured && (!session || !canVerifySelectedProfile))}>{saving ? "Saving…" : supabaseConfigured ? "Verify and save" : "Save preferences"}</Button></div>
        </form>

        <aside className="afterlife-panel afterlife-profile-summary" aria-live="polite">
          <h2>Public record</h2>
          {selected ? <>
            <p className="afterlife-profile-name">{selected.name}</p>
            <div className="afterlife-inline-links">
              {selected.devpostUrl ? <a href={selected.devpostUrl} target="_blank" rel="noreferrer">Devpost profile</a> : null}
              {selected.githubLogin ? <a href={`https://github.com/${selected.githubLogin}`} target="_blank" rel="noreferrer">GitHub</a> : null}
            </div>
            <div className="afterlife-project-list">
              <h3>Linked public projects</h3>
              {selected.projects.length ? selected.projects.map((project) => <a className="afterlife-project-row" href={`/p/${encodeURIComponent(project.slug)}`} key={project.id}><span>{project.title}</span><Badge variant={livenessVariant[project.liveness]} size="sm">{project.liveness}</Badge></a>) : <p>No linked projects were found.</p>}
            </div>
          </> : null}
          <div className="afterlife-note"><strong>Verification status</strong><p>{supabaseConfigured ? (canVerifySelectedProfile ? "GitHub sign-in is required before this record can be saved as verified." : "This public record has no linked GitHub login, so Afterlife cannot verify ownership.") : "This selection uses public project data. It is not a verified ownership claim. Local preferences remain available until Supabase Auth is configured."}</p></div>
        </aside>
      </div>
    </section>
  );
}
