import { useState } from "react";
import { Calculator } from "lucide-react";
import { usePlanner } from "../lib/planner";
import {
  PFRA_EVENTS,
  classifyAssessment,
  formatClock,
  nextAssessmentMonths,
  parseClock,
  scoreEvent,
  scoreWaistToHeight,
  scoreWalk,
  type EventScore,
  type PfraChart,
} from "../lib/pfra";
import { PFRA_CHART_SOURCE, type PfraEvent } from "../lib/pfra-charts";

type CardioEvent = "run2mile" | "hamr" | "walk";
type StrengthEvent = "pushup" | "handReleasePushup";
type CoreEvent = "situp" | "reverseCrunch" | "plank";

const maxima = { cardio: 50, strength: 15, core: 15, body: 20 };

function readPerformance(event: PfraEvent | "walk", raw: string): number | null {
  if (!raw.trim()) return null;
  if (event === "walk" || PFRA_EVENTS[event as PfraEvent]?.unit === "time")
    return parseClock(raw);
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function describe(event: PfraEvent, value: number): string {
  return PFRA_EVENTS[event].unit === "time"
    ? formatClock(value)
    : `${value} ${PFRA_EVENTS[event].unit === "shuttles" ? "shuttles" : "reps"}`;
}

function nextStep(event: PfraEvent, score: EventScore): string {
  if (!score.next) return "Maximum points.";
  const target = describe(event, score.next.threshold);
  return PFRA_EVENTS[event].lowerIsBetter
    ? `${target} or faster earns ${score.next.points}.`
    : `${target} earns ${score.next.points}.`;
}

/** Converts practice results to points with the official PFRA charts. */
export default function FitnessScorer() {
  const { mutate, state } = usePlanner();
  const [chart, setChart] = useState<PfraChart>("M");
  const [age, setAge] = useState("");
  const [cardioEvent, setCardioEvent] = useState<CardioEvent>("run2mile");
  const [cardio, setCardio] = useState("");
  const [strengthEvent, setStrengthEvent] = useState<StrengthEvent>("pushup");
  const [strength, setStrength] = useState("");
  const [coreEvent, setCoreEvent] = useState<CoreEvent>("situp");
  const [core, setCore] = useState("");
  const [waist, setWaist] = useState("");
  const [height, setHeight] = useState("");
  const [applied, setApplied] = useState("");

  const ageValue = Number(age);
  const needsAge = chart !== "AFSPECWAR/EOD" || cardioEvent === "walk";
  const ageValid = Number.isInteger(ageValue) && ageValue >= 17 && ageValue <= 99;
  const ready = !needsAge || ageValid;

  const cardioValue = readPerformance(cardioEvent, cardio);
  const strengthValue = readPerformance(strengthEvent, strength);
  const coreValue = readPerformance(coreEvent, core);

  const walk =
    ready && cardioEvent === "walk" && chart !== "AFSPECWAR/EOD" && cardioValue !== null
      ? scoreWalk(chart, ageValue, cardioValue)
      : null;
  const cardioScore =
    ready && cardioEvent !== "walk" && cardioValue !== null
      ? scoreEvent(cardioEvent, chart, ageValue, cardioValue)
      : null;
  const strengthScore =
    ready && strengthValue !== null
      ? scoreEvent(strengthEvent, chart, ageValue, strengthValue)
      : null;
  const coreScore =
    ready && coreValue !== null
      ? scoreEvent(coreEvent, chart, ageValue, coreValue)
      : null;
  const body = scoreWaistToHeight(Number(waist), Number(height));

  const rows: Array<{
    label: string;
    result: string;
    points: string;
    status: string;
    good: boolean | null;
    hint: string;
  }> = [];
  if (cardioScore && cardioValue !== null && cardioEvent !== "walk")
    rows.push({
      label: PFRA_EVENTS[cardioEvent].label,
      result: describe(cardioEvent, cardioValue),
      points: `${cardioScore.points} / ${maxima.cardio}`,
      status: cardioScore.metMinimum ? "Minimum met" : `Below minimum (${describe(cardioEvent, cardioScore.minimum)})`,
      good: cardioScore.metMinimum,
      hint: nextStep(cardioEvent, cardioScore),
    });
  if (walk && cardioValue !== null)
    rows.push({
      label: "2.0 km walk",
      result: formatClock(cardioValue),
      points: "Pass/fail",
      status: walk.passed ? "Meets standard" : "Does not meet standard",
      good: walk.passed,
      hint: `Maximum time ${formatClock(walk.maximum)}.`,
    });
  if (strengthScore && strengthValue !== null)
    rows.push({
      label: PFRA_EVENTS[strengthEvent].label,
      result: describe(strengthEvent, strengthValue),
      points: `${strengthScore.points} / ${maxima.strength}`,
      status: strengthScore.metMinimum ? "Minimum met" : `Below minimum (${describe(strengthEvent, strengthScore.minimum)})`,
      good: strengthScore.metMinimum,
      hint: nextStep(strengthEvent, strengthScore),
    });
  if (coreScore && coreValue !== null)
    rows.push({
      label: PFRA_EVENTS[coreEvent].label,
      result: describe(coreEvent, coreValue),
      points: `${coreScore.points} / ${maxima.core}`,
      status: coreScore.metMinimum ? "Minimum met" : `Below minimum (${describe(coreEvent, coreScore.minimum)})`,
      good: coreScore.metMinimum,
      hint: nextStep(coreEvent, coreScore),
    });
  if (body)
    rows.push({
      label: "Waist-to-height ratio",
      result: `${body.ratio.toFixed(2)} (${body.recordedWaist} in ÷ ${body.recordedHeight} in)`,
      points: `${body.points} / ${maxima.body}`,
      status: `${body.risk} risk`,
      good: body.risk === "Low" ? true : body.risk === "High" ? false : null,
      hint:
        body.points === maxima.body
          ? "Maximum points."
          : "0.49 or lower earns 20. Waist is rounded down to the nearest ½ inch, height to the nearest ½ inch, and the ratio is cut off at two decimals.",
    });

  const scored = [cardioScore, strengthScore, coreScore, body].filter(Boolean);
  const total =
    (cardioScore?.points ?? 0) +
    (strengthScore?.points ?? 0) +
    (coreScore?.points ?? 0) +
    (body?.points ?? 0);
  const complete =
    (!!cardioScore || !!walk) && !!strengthScore && !!coreScore && !!body;
  const result = classifyAssessment({
    cardio: cardioScore,
    walkPassed: walk ? walk.passed : null,
    strength: strengthScore,
    core: coreScore,
    body,
  });
  const dueMonths = result
    ? nextAssessmentMonths(result.category, state.profile.component)
    : null;

  const invalid: string[] = [];
  if (needsAge && age && !ageValid) invalid.push("Enter an age from 17 to 99.");
  if (cardio && cardioValue === null)
    invalid.push(
      cardioEvent === "hamr" ? "Enter HAMR shuttles as a whole number." : "Enter times as m:ss, for example 15:42.",
    );
  if (strength && strengthValue === null) invalid.push("Enter strength reps as a whole number.");
  if (core && coreValue === null)
    invalid.push(coreEvent === "plank" ? "Enter the plank time as m:ss, for example 2:30." : "Enter core reps as a whole number.");
  if ((waist || height) && !body) invalid.push("Enter waist and height in inches.");

  function apply() {
    mutate((draft) => {
      if (cardioScore) draft.fitness.cardioScore = cardioScore.points;
      if (cardioScore && cardioEvent === "run2mile" && cardioValue !== null) {
        draft.fitness.distance = 2;
        draft.fitness.minutes = Math.floor(cardioValue / 60);
        draft.fitness.seconds = cardioValue % 60;
      }
      if (strengthScore) draft.fitness.strengthScore = strengthScore.points;
      if (coreScore) draft.fitness.coreScore = coreScore.points;
      if (body) draft.fitness.bodyCompositionScore = body.points;
    });
    setApplied("Points copied to your saved component points above.");
  }

  const unit = (event: PfraEvent | "walk") =>
    event === "walk" || PFRA_EVENTS[event as PfraEvent].unit === "time"
      ? "Time (m:ss)"
      : event === "hamr"
        ? "Shuttles"
        : "Reps";

  return (
    <section className="panel tool-panel" aria-labelledby="pfra-heading">
      <div className="panel-heading">
        <div className="tool-heading">
          <span className="tool-icon fitness">
            <Calculator size={22} />
          </span>
          <div>
            <h2 id="pfra-heading">Score a practice assessment</h2>
            <p className="muted">
              Turn reps and times into points with the official scoring charts.
            </p>
          </div>
        </div>
        <span className="badge">Effective 1 March 2026</span>
      </div>
      <div className="tool-columns">
        <div>
          <div className="form-grid fitness-fields">
            <label className="field">
              <span>Scoring chart</span>
              <select
                value={chart}
                onChange={(event) => {
                  const next = event.target.value as PfraChart;
                  setChart(next);
                  if (next === "AFSPECWAR/EOD" && cardioEvent === "walk") {
                    setCardioEvent("run2mile");
                    setCardio("");
                  }
                }}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="AFSPECWAR/EOD">AFSPECWAR/EOD</option>
              </select>
            </label>
            <label className="field">
              <span>Age on test day</span>
              <input
                type="number"
                inputMode="numeric"
                min="17"
                max="99"
                value={age}
                onChange={(event) => setAge(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Cardio event</span>
              <select
                value={cardioEvent}
                onChange={(event) => {
                  setCardioEvent(event.target.value as CardioEvent);
                  setCardio("");
                }}
              >
                <option value="run2mile">2-mile run</option>
                <option value="hamr">20-meter HAMR</option>
                {chart !== "AFSPECWAR/EOD" && (
                  <option value="walk">2.0 km walk</option>
                )}
              </select>
            </label>
            <label className="field">
              <span>Cardio result: {unit(cardioEvent)}</span>
              <input
                inputMode={cardioEvent === "hamr" ? "numeric" : "text"}
                placeholder={cardioEvent === "hamr" ? "60" : "15:42"}
                value={cardio}
                onChange={(event) => setCardio(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Strength event</span>
              <select
                value={strengthEvent}
                onChange={(event) => setStrengthEvent(event.target.value as StrengthEvent)}
              >
                <option value="pushup">Push-ups (1 minute)</option>
                <option value="handReleasePushup">Hand-release push-ups (2 minutes)</option>
              </select>
            </label>
            <label className="field">
              <span>Strength result: Reps</span>
              <input
                inputMode="numeric"
                value={strength}
                onChange={(event) => setStrength(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Core event</span>
              <select
                value={coreEvent}
                onChange={(event) => {
                  setCoreEvent(event.target.value as CoreEvent);
                  setCore("");
                }}
              >
                <option value="situp">Sit-ups (1 minute)</option>
                <option value="reverseCrunch">Cross-leg reverse crunches (2 minutes)</option>
                <option value="plank">Forearm plank</option>
              </select>
            </label>
            <label className="field">
              <span>Core result: {unit(coreEvent)}</span>
              <input
                inputMode={coreEvent === "plank" ? "text" : "numeric"}
                placeholder={coreEvent === "plank" ? "2:30" : ""}
                value={core}
                onChange={(event) => setCore(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Waist (inches)</span>
              <input
                type="number"
                min="10"
                max="80"
                step="0.25"
                value={waist}
                onChange={(event) => setWaist(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Height (inches)</span>
              <input
                type="number"
                min="48"
                max="90"
                step="0.25"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
          </div>
          {invalid.length > 0 && (
            <ul className="error-text small">
              {invalid.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {needsAge && !ageValid && (cardio || strength || core) && (
            <p className="small muted">Enter your age to choose the right chart column.</p>
          )}
        </div>
        <div className="calculation-card" aria-live="polite">
          <span className="eyebrow">
            {result?.estimated ? "ESTIMATED COMPOSITE" : "COMPOSITE"}
          </span>
          <strong className="big-result">
            {(result ? result.composite : total).toFixed(1)}
            <span> / 100</span>
          </strong>
          {result && (
            <div
              className={`pfra-category ${result.category === "Unsatisfactory" ? "warn" : "ok"}`}
            >
              <strong>
                {result.category}
                {result.category === "Unsatisfactory" ? " (Not Ready)" : " (Ready)"}
              </strong>
              {result.reasons.length > 0 && (
                <ul className="small">
                  {result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              {dueMonths && (
                <span className="small">
                  Next assessment due in {dueMonths} months
                  {result.category === "Unsatisfactory"
                    ? "."
                    : state.profile.component === "Active Duty"
                      ? "."
                      : " (Guard and Reserve test every 12 months)."}
                </span>
              )}
            </div>
          )}
          {result?.notes.map((note) => (
            <p className="small muted" key={note}>
              {note}
            </p>
          ))}
          {!complete && scored.length > 0 && (
            <p className="small muted">
              Partial total: enter all four components for a full score and
              result.
            </p>
          )}
          {rows.length > 0 && (
            <table className="pfra-results">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">Result</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      {row.label}
                      <span
                        className={`small pfra-status ${row.good === true ? "ok" : row.good === false ? "warn" : ""}`}
                      >
                        {row.status}
                      </span>
                      <span className="small muted">{row.hint}</span>
                    </th>
                    <td>{row.result}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {scored.length > 0 && (
            <button type="button" className="button secondary" onClick={apply}>
              Use these points
            </button>
          )}
          {applied && (
            <p className="small" role="status">
              {applied}
            </p>
          )}
          <div className="fitness-note">
            <strong>Practice scoring, not an official result</strong>
            <p className="small muted">
              Points come from the{" "}
              <a href={PFRA_CHART_SOURCE.url} target="_blank" rel="noopener noreferrer">
                {PFRA_CHART_SOURCE.title}
              </a>
              ; categories and minimums follow AFMAN 36-2905 (24 March 2026),
              paras 3.6 and 3.7. Only scores entered in myFitness are official,
              and exemptions or a body fat assessment can change the outcome.
            </p>
            {state.profile.service === "Space Force" && (
              <p className="small muted">
                AFMAN 36-2905 does not apply to the Space Force. Use your
                service's fitness guidance.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
