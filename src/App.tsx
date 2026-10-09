import { useEffect, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Compass,
  ChevronRight,
  NotebookPen,
  Mountain,
  HeartPulse,
  Users,
  Wrench,
  Settings as SettingsIcon,
  ShieldCheck,
  Menu,
  X,
  Star,
  ArrowRight,
  WifiOff,
  Download,
  CheckCircle2,
} from "lucide-react";
import { usePlanner } from "./lib/planner";
import { localDate } from "./lib/dates";
import type { Page, Profile } from "./lib/types";
import Today from "./pages/Today";
import Calendar from "./pages/Calendar";
import Career from "./pages/Career";
import Captures from "./pages/Captures";
import Readiness from "./pages/Readiness";
import Leadership from "./pages/Leadership";
import Tools from "./pages/Tools";
import Settings from "./pages/Settings";
import DialogAccessibility from "./components/DialogAccessibility";

const nav = [
  { page: "today", label: "Day plan", icon: Compass },
  { page: "calendar", label: "Calendar", icon: CalendarDays },
  { page: "career", label: "Career progress", icon: Mountain },
  { page: "captures", label: "Career records", icon: NotebookPen },
  { page: "readiness", label: "Personal readiness", icon: HeartPulse },
  { page: "leadership", label: "Leadership", icon: Users },
  { page: "tools", label: "Tools", icon: Wrench },
] as const;
const pages: Page[] = [...nav.map((item) => item.page), "settings"];
function currentPage(): Page {
  const hash = window.location.hash.slice(1) as Page;
  return pages.includes(hash) ? hash : "today";
}

export default function App() {
  const { state, mutate, storageError } = usePlanner();
  const [page, setPage] = useState<Page>(currentPage);
  const [day, setDay] = useState(localDate());
  const [mobileNav, setMobileNav] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({
    ...state.profile,
    rank: state.profile.rank || "AB",
  });
  const [installPrompt, setInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  useEffect(() => {
    if (!state.profile.onboarded) {
      setProfile({
        ...state.profile,
        rank:
          state.profile.rank ||
          (state.profile.service === "Space Force" ? "Spc1" : "AB"),
      });
      setWelcomeStep(0);
    }
  }, [state.profile]);
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const install = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  function go(next: Page) {
    window.location.hash = next;
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  }
  function finishWelcome(event?: FormEvent) {
    event?.preventDefault();
    mutate((draft) => {
      draft.profile = { ...profile, onboarded: true };
    });
  }
  const currentLabel =
    nav.find((item) => item.page === page)?.label || "Settings & data";
  const name =
    state.profile.name.trim() ||
    (state.profile.service === "Space Force" ? "Guardian" : "Airman");
  const initials = state.profile.name.trim()
    ? state.profile.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "EP";

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      <DialogAccessibility />
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <button className="brand" onClick={() => go("today")}>
          <div className="brand-mark">
            <Star size={23} fill="currentColor" strokeWidth={1.3} />
          </div>
          <div>
            <span>ENLISTED</span>
            <strong>PLANNER</strong>
          </div>
        </button>
        <p className="brand-tagline">An entire career. One place.</p>
        <div className="sidebar-rule" />
        <p className="nav-heading">YOUR PLANNER</p>
        <nav>
          {nav.map((item, index) => (
            <div key={item.page}>
              {index === 4 && (
                <p className="nav-heading second">GROW BEYOND THE MISSION</p>
              )}
              <button
                className={`nav-item ${page === item.page ? "active" : ""}`}
                aria-current={page === item.page ? "page" : undefined}
                onClick={() => go(item.page)}
              >
                <item.icon size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
                {item.page === "captures" && state.captures.length > 0 && (
                  <span className="nav-count">{state.captures.length}</span>
                )}
                {page === item.page && (
                  <ChevronRight className="nav-arrow" size={15} />
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Your planner. Your data.</strong>
              <p>Private, local & under your control.</p>
            </div>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
            aria-current={page === "settings" ? "page" : undefined}
          >
            <SettingsIcon size={18} />
            <span>Settings & data</span>
          </button>
          <button
            className="profile-switch"
            onClick={() => go("settings")}
            aria-label="Edit your profile"
          >
            <span className="avatar">{initials}</span>
            <div>
              <strong>{name}</strong>
              <span>
                {state.profile.rank || "Your enlisted journey"} ·{" "}
                {state.profile.service === "Air Force" ? "USAF" : "USSF"}
              </span>
            </div>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            <span>Your planner</span>
            <ChevronRight size={13} />
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-right">
            {installPrompt && (
              <button
                className="button ghost"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
              >
                <Download size={15} />
                Install
              </button>
            )}
            <span className="local-status">
              {!online ? <WifiOff size={14} /> : <ShieldCheck size={14} />}
              {!online
                ? "Offline · available on this device"
                : "Stored on this device"}
            </span>
            <button
              className="top-avatar"
              aria-label="Open profile settings"
              onClick={() => go("settings")}
            >
              {initials}
            </button>
          </div>
        </header>
        {storageError && (
          <div className="storage-warning" role="alert">
            <strong>Your data needs attention.</strong> {storageError}{" "}
            <button onClick={() => go("settings")} className="text-button">
              Open data settings
            </button>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          {page === "today" && (
            <Today
              date={day}
              setDate={setDay}
              onCalendar={() => go("calendar")}
              onCaptures={() => go("captures")}
            />
          )}
          {page === "calendar" && (
            <Calendar
              onOpenDay={(date) => {
                setDay(date);
                go("today");
              }}
            />
          )}
          {page === "career" && <Career />}
          {page === "captures" && <Captures />}
          {page === "readiness" && <Readiness />}
          {page === "leadership" && <Leadership />}
          {page === "tools" && <Tools />}
          {page === "settings" && <Settings />}
        </main>
        <footer className="app-footer">
          <span>ONE AIRMAN. ONE PLANNER. AN ENTIRE CAREER.</span>
          <span>
            Enlisted Planner <i>·</i> Built by John Garcia
          </span>
        </footer>
      </div>
      {!state.profile.onboarded && (
        <div className="modal-backdrop welcome-backdrop">
          <section
            className="modal welcome-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
          >
            <div className="welcome-star">
              <Star size={30} fill="currentColor" />
            </div>
            <p className="eyebrow">WELCOME TO ENLISTED PLANNER</p>
            <h2 id="welcome-title">
              {welcomeStep === 0 ? (
                <>
                  One Airman.
                  <br />
                  One Planner.
                  <br />
                  <em>An entire career.</em>
                </>
              ) : (
                "Make this planner yours."
              )}
            </h2>
            {welcomeStep === 0 ? (
              <>
                <p className="welcome-description">
                  Make time for today, capture what you accomplish, and build
                  toward the leader you want to become.
                </p>
                <div className="welcome-features">
                  <span>
                    <ClockIcon /> A day with purpose
                  </span>
                  <span>
                    <Mountain size={17} /> A career with direction
                  </span>
                  <span>
                    <ShieldCheck size={17} /> Data that stays yours
                  </span>
                </div>
                <button
                  className="button primary"
                  onClick={() => setWelcomeStep(1)}
                >
                  Set up my planner <ArrowRight size={16} />
                </button>
                <button
                  className="button ghost"
                  onClick={() => finishWelcome()}
                >
                  Explore first
                </button>
                <p className="small muted">
                  A personal planning tool. Verify official personnel and
                  fitness guidance with your service. Store only information you
                  are authorized to keep.
                </p>
              </>
            ) : (
              <form onSubmit={finishWelcome}>
                <label className="field">
                  What should we call you?
                  <input
                    autoFocus
                    maxLength={80}
                    placeholder="Your name (optional)"
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    Service
                    <select
                      value={profile.service}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          service: e.target.value as Profile["service"],
                          rank:
                            e.target.value === "Space Force" ? "Spc1" : "AB",
                        })
                      }
                    >
                      <option>Air Force</option>
                      <option>Space Force</option>
                    </select>
                  </label>
                  <label className="field">
                    Rank
                    <select
                      value={profile.rank}
                      onChange={(e) =>
                        setProfile({ ...profile, rank: e.target.value })
                      }
                    >
                      {(profile.service === "Air Force"
                        ? [
                            "AB",
                            "Amn",
                            "A1C",
                            "SrA",
                            "SSgt",
                            "TSgt",
                            "MSgt",
                            "SMSgt",
                            "CMSgt",
                          ]
                        : [
                            "Spc1",
                            "Spc2",
                            "Spc3",
                            "Spc4",
                            "Sgt",
                            "TSgt",
                            "MSgt",
                            "SMSgt",
                            "CMSgt",
                          ]
                      ).map((rank) => (
                        <option key={rank}>{rank}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Component
                    <select
                      value={profile.component}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          component: e.target.value as Profile["component"],
                        })
                      }
                    >
                      <option>Active Duty</option>
                      <option>Guard</option>
                      <option>Reserve</option>
                    </select>
                  </label>
                  <label className="field">
                    Primary role
                    <select
                      value={profile.role}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          role: e.target.value as Profile["role"],
                        })
                      }
                    >
                      <option>Individual</option>
                      <option>Supervisor</option>
                      <option>Senior leader</option>
                    </select>
                  </label>
                </div>
                <p className="muted small">
                  Every tool stays available as your responsibilities grow. You
                  can add service dates in Settings.
                </p>
                <button className="button primary">
                  Start planning <ArrowRight size={16} />
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setWelcomeStep(0)}
                >
                  Back
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function ClockIcon() {
  return <CalendarDays size={17} />;
}
