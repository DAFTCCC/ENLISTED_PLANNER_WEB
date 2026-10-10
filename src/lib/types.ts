export type BlockCategory = "Duty" | "Development" | "Fitness" | "Personal";
export type MajorGradedArea =
  | "Executing the Mission"
  | "Leading People"
  | "Managing Resources"
  | "Improving the Unit";
export type AirmanLeadershipQuality =
  | "Job proficiency"
  | "Initiative"
  | "Adaptability"
  | "Inclusion and teamwork"
  | "Emotional intelligence"
  | "Communication"
  | "Stewardship"
  | "Accountability"
  | "Decision making"
  | "Innovation";
export type Page =
  | "today"
  | "calendar"
  | "career"
  | "captures"
  | "readiness"
  | "leadership"
  | "tools"
  | "settings"
  | "work"
  | "strategy"
  | "support";
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
  taskId?: string;
  rhythmId?: string;
}
export interface Task {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  priority: "High" | "Normal" | "Low";
  projectId?: string;
  assigneeId?: string;
  objectiveId?: string;
  meetingId?: string;
  careerPlanId?: string;
  requestor?: string;
  suspenseTime?: string;
  status?: "Open" | "In progress" | "Blocked" | "Done";
  dependencyIds?: string[];
  notes?: string;
  estimatedMinutes?: number;
  kind?: "Task" | "Milestone";
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  category: "Personal" | "Career" | "Training" | "Administrative";
  recurrence: "None" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";
  source: "User entered" | "Estimate";
  memberId?: string;
  developmentActionId?: string;
  disciplinePlanId?: string;
  meetingId?: string;
  goalId?: string;
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
  impact?: string;
  evidence?: string;
  mga?: MajorGradedArea | "";
  alq?: AirmanLeadershipQuality | "";
  projectId?: string;
  taskId?: string;
  objectiveId?: string;
  memberIds?: string[];
}
export interface Goal {
  id: string;
  title: string;
  targetDate: string;
  category: string;
  progress: number;
  objectiveId?: string;
  source?: "User entered" | "Estimate";
  sourceRef?: string;
}
export interface Member {
  id: string;
  name: string;
  rank: string;
  focus: string;
  nextFeedback: string;
  notes: string;
  team?: string;
  supervisorId?: string;
  contactId?: string;
  role?: "Teammate" | "Wingman" | "Supervisor" | "Senior leader" | "Resource";
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
export interface Project {
  id: string;
  title: string;
  objective: string;
  startDate: string;
  dueDate: string;
  status: "Planned" | "Active" | "On hold" | "Complete";
  ownerId: string;
  objectiveId: string;
  resources: string;
  risks: string;
  successMeasure: string;
  baseline: string;
  target: string;
  actual: string;
  notes: string;
  swot: {
    strengths: string;
    weaknesses: string;
    opportunities: string;
    threats: string;
  };
}
export interface StrategyObjective {
  id: string;
  title: string;
  level:
    | "Personal"
    | "Section"
    | "Squadron"
    | "Group"
    | "Wing"
    | "MAJCOM"
    | "Service"
    | "National";
  parentId: string;
  mission: string;
  measure: string;
  targetDate: string;
  notes: string;
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  agency: string;
  phone: string;
  email: string;
  location: string;
  notes: string;
}
export interface DevelopmentAction {
  id: string;
  memberId: string;
  title: string;
  kind: "Training" | "Mentoring" | "Feedback" | "Responsibility";
  dueDate: string;
  status: "Planned" | "In progress" | "Complete";
  notes: string;
  taskId?: string;
}
export interface DisciplinePlan {
  id: string;
  memberId: string;
  title: string;
  expectation: string;
  observedGap: string;
  supportPlan: string;
  followUpDate: string;
  consultation: "Not started" | "Requested" | "Completed";
  status: "Open" | "Monitoring" | "Closed";
  notes: string;
}
export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  objective: string;
  participants: string[];
  agenda: string;
  decisions: string;
  nextDate: string;
  notes: string;
}
export interface BattleRhythm {
  id: string;
  title: string;
  mga: MajorGradedArea;
  frequency: "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";
  startDate: string;
  startTime: string;
  endTime: string;
  category: BlockCategory;
  notes: string;
}
export interface CareerPlan {
  id: string;
  title: string;
  pathway:
    | "Junior enlisted"
    | "BTZ"
    | "WAPS"
    | "SNCO board"
    | "Guardian development"
    | "Component specific";
  dueDate: string;
  afsc: string;
  cycle: string;
  status: "Preparing" | "Ready for review" | "Complete";
  checklist: {
    id: string;
    label: string;
    completed: boolean;
    taskId?: string;
  }[];
  notes: string;
  sourceUrl: string;
  lastVerified: string;
}
export interface PlannerState {
  version: 2;
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
  projects: Project[];
  objectives: StrategyObjective[];
  contacts: Contact[];
  developmentActions: DevelopmentAction[];
  disciplinePlans: DisciplinePlan[];
  meetings: Meeting[];
  battleRhythms: BattleRhythm[];
  careerPlans: CareerPlan[];
}
