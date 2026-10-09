import { Banknote, Dumbbell, ExternalLink } from "lucide-react";
import { usePlanner } from "../lib/planner";
import { calculateBudget, calculateFitness } from "../lib/calculations";
import type { Budget, Fitness } from "../lib/types";
import "./tools-settings.css";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const budgetFields: { key: keyof Budget; label: string }[] = [
  { key: "housing", label: "Housing & utilities" },
  { key: "transport", label: "Transportation" },
  { key: "food", label: "Food & groceries" },
  { key: "insurance", label: "Insurance" },
  { key: "debt", label: "Debt payments" },
  { key: "savings", label: "Savings & investing" },
  { key: "other", label: "Other expenses" },
];
const formatPace = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

export default function Tools() {
  const { state, mutate } = usePlanner();
  const budget = calculateBudget(state.budget);
  const fitness = calculateFitness(state.fitness);

  function setBudget(key: keyof Budget, value: string) {
    const number = Math.min(100000000, Math.max(0, Number(value) || 0));
    mutate((draft) => {
      draft.budget[key] = number;
    });
  }

  function setFitness(key: keyof Fitness, value: string, maximum = 100000) {
    const number = Math.min(maximum, Math.max(0, Number(value) || 0));
    mutate((draft) => {
      draft.fitness[key] = number;
    });
  }

  return (
    <div className="tools-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PUT YOUR PLAN INTO PRACTICE</span>
          <h1>Tools</h1>
          <p>
            Practical numbers for financial readiness and fitness preparation.
          </p>
        </div>
      </header>
      <section className="panel tool-panel" aria-labelledby="financial-heading">
        <div className="panel-heading">
          <div className="tool-heading">
            <span className="tool-icon">
              <Banknote size={22} />
            </span>
            <div>
              <h2 id="financial-heading">Financial readiness</h2>
              <p className="muted">
                Build a monthly budget around your actual take-home income.
              </p>
            </div>
          </div>
          <span className="badge">Monthly budget</span>
        </div>
        <div className="tool-columns">
          <div>
            <label className="field income-field">
              <span>Monthly take-home income ($)</span>
              <input
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                value={state.budget.income}
                onChange={(event) => setBudget("income", event.target.value)}
              />
            </label>
            <div className="form-grid">
              {budgetFields.map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label} ($)</span>
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="0.01"
                    value={state.budget[field.key]}
                    onChange={(event) =>
                      setBudget(field.key, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
            <p className="small muted">
              Use your net deposit after deductions. Enter each expense once.
              Savings are included in your total monthly allocation.
            </p>
          </div>
          <div className="calculation-card budget-result" aria-live="polite">
            <span className="eyebrow">MONEY LEFT TO ASSIGN</span>
            <strong
              className={`big-result ${budget.remaining < 0 ? "negative" : ""}`}
            >
              {currency.format(budget.remaining)}
            </strong>
            <p className="muted">
              {budget.remaining < 0
                ? "Your planned spending exceeds your income. Adjust your allocations to bring the budget into balance."
                : state.budget.income === 0
                  ? "Enter your income and expenses to see your monthly plan."
                  : "Give the remaining amount a purpose: a buffer, a goal, or an extra payment."}
            </p>
            <dl className="calculation-breakdown">
              <div>
                <dt>Take-home income</dt>
                <dd>{currency.format(state.budget.income)}</dd>
              </div>
              <div>
                <dt>Living expenses</dt>
                <dd>{currency.format(budget.expenses)}</dd>
              </div>
              <div>
                <dt>Savings & investing</dt>
                <dd>{currency.format(state.budget.savings)}</dd>
              </div>
              <div>
                <dt>Planned savings rate</dt>
                <dd>{budget.savingsRate.toFixed(1)}%</dd>
              </div>
            </dl>
            <p className="small muted">
              A planning estimate based on your inputs, not financial advice. No
              bank connection is required.
            </p>
          </div>
        </div>
      </section>

      <section className="panel tool-panel" aria-labelledby="fitness-heading">
        <div className="panel-heading">
          <div className="tool-heading">
            <span className="tool-icon fitness">
              <Dumbbell size={22} />
            </span>
            <div>
              <h2 id="fitness-heading">Fitness calculator</h2>
              <p className="muted">
                Plan a running pace and add verified component points.
              </p>
            </div>
          </div>
          <span className="badge">Training & preparation</span>
        </div>
        <div className="tool-columns">
          <div>
            <h3>Running pace</h3>
            <div className="form-grid fitness-fields">
              <label className="field">
                <span>Distance (miles)</span>
                <input
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  value={state.fitness.distance}
                  onChange={(event) =>
                    setFitness("distance", event.target.value, 1000)
                  }
                />
              </label>
              <label className="field">
                <span>Goal time (minutes)</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="0.1"
                  value={state.fitness.goalMinutes}
                  onChange={(event) =>
                    setFitness("goalMinutes", event.target.value, 10000)
                  }
                />
              </label>
              <label className="field">
                <span>Run time: minutes</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={state.fitness.minutes}
                  onChange={(event) =>
                    setFitness("minutes", event.target.value, 10000)
                  }
                />
              </label>
              <label className="field">
                <span>Run time: seconds</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={state.fitness.seconds}
                  onChange={(event) =>
                    setFitness("seconds", event.target.value, 59)
                  }
                />
              </label>
            </div>
            <h3 className="tool-subheading">Official component points</h3>
            <p className="small muted">
              Use the applicable official score chart for your service,
              assessment, age, and category. Enter the points awarded, not
              repetitions.
            </p>
            <div className="fitness-score-fields">
              <label className="field">
                <span>Cardio (0–60)</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.1"
                  value={state.fitness.cardioScore}
                  onChange={(event) =>
                    setFitness("cardioScore", event.target.value, 60)
                  }
                />
              </label>
              <label className="field">
                <span>Strength (0–20)</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={state.fitness.strengthScore}
                  onChange={(event) =>
                    setFitness("strengthScore", event.target.value, 20)
                  }
                />
              </label>
              <label className="field">
                <span>Core (0–20)</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={state.fitness.coreScore}
                  onChange={(event) =>
                    setFitness("coreScore", event.target.value, 20)
                  }
                />
              </label>
            </div>
          </div>
          <div className="calculation-card" aria-live="polite">
            <span className="eyebrow">YOUR RUNNING PACE</span>
            <strong className="big-result">
              {formatPace(fitness.paceSeconds)}
              <span> / mile</span>
            </strong>
            <dl className="calculation-breakdown">
              <div>
                <dt>Goal pace</dt>
                <dd>{formatPace(fitness.goalPaceSeconds)} / mile</dd>
              </div>
              <div>
                <dt>Entered component total</dt>
                <dd>{fitness.totalScore.toFixed(1)} / 100</dd>
              </div>
            </dl>
            <div className="fitness-note">
              <strong>Preparation, not an official result</strong>
              <p className="small muted">
                This tool sums manually entered points on a 60/20/20 scale. It
                does not determine pass/fail, exemptions, component minimums, or
                current policy eligibility. Verify your assessment format and
                requirements with your fitness program office.
              </p>
            </div>
            <a
              className="external-resource"
              href="https://www.afpc.af.mil/Career-Management/Fitness-Program/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Air Force fitness resources <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
