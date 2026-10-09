import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { PlannerProvider } from "./lib/planner";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <h1>Your planner couldn’t open.</h1>
        <p>
          Your saved data has not been deleted. Reload the app to try again.
        </p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PlannerProvider>
        <App />
      </PlannerProvider>
    </ErrorBoundary>
  </StrictMode>,
);
