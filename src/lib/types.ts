export type BlockCategory = "Duty" | "Development" | "Fitness" | "Personal";
export type Page =
  | "today"
  | "calendar"
  | "career"
  | "captures"
  | "readiness"
  | "leadership"
  | "tools"
  | "settings";
export interface Profile {
  name: string;
  service: "Air Force" | "Space Force";
  rank: string;
  component: "Active Duty" | "Guard" | "Reserve";
  dateOfRank: string;
  dateOfEntry: string;
  role: "Individual" | "Supervisor" | "Senior leader";
  onboarded: boolean;
}
export interface TimeBlock {
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  category: BlockCategory;
  notes: string;
  completed: boolean;
}
export interface Task {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  priority: "High" | "Normal" | "Low";
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  category: "Personal" | "Career" | "Training" | "Administrative";
  recurrence: "None" | "Weekly" | "Monthly";
  source: "User entered" | "Estimate";
}
export interface Capture {
  id: string;
  title: string;
  date: string;
  category: "Mission" | "Leadership" | "Development" | "Community";
  context: string;
  actions: string;
  outcome: string;
  lessons: string;
  tags: string[];
}
export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  category: string;
  progress: number;
}
export interface Member {
  id: string;
  name: string;
  rank: string;
  focus: string;
  nextFeedback: string;
  notes: string;
}
export interface Budget {
  income: number;
  housing: number;
  transport: number;
  food: number;
  insurance: number;
  debt: number;
  savings: number;
  other: number;
}
export interface Fitness {
  distance: number;
  minutes: number;
  seconds: number;
  goalMinutes: number;
  cardioScore: number;
  strengthScore: number;
  coreScore: number;
}
export interface Habit {
  id: string;
  title: string;
  category: string;
  completedDates: string[];
}
export interface PlannerState {
  version: 1;
  profile: Profile;
  blocks: TimeBlock[];
  tasks: Task[];
  events: CalendarEvent[];
  captures: Capture[];
  goals: Goal[];
  members: Member[];
  budget: Budget;
  fitness: Fitness;
  habits: Habit[];
}
