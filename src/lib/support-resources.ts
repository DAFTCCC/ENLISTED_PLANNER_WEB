import type { Contact } from "./types";

export interface SupportAgency {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  url?: string;
  sourceLabel?: string;
}
export interface SupportNeed {
  id: string;
  label: string;
  group: "Family" | "Personal" | "Finance" | "Legal";
  urgent?: boolean;
}

const official = (path: string) => `https://www.militaryonesource.mil${path}`;
export const SUPPORT_SOURCE = {
  plannerPages: "2026 USAF Digital Planner, pages 78–79",
  checkedAt: "2026-10-10T06:48:14Z",
  explanation:
    "The planner supplies the topics and agency names. Matches below are practical starting points based on agency roles and current public Military OneSource descriptions; they do not reproduce the older PDF’s dot matrix or establish eligibility.",
};

export const SUPPORT_AGENCIES: SupportAgency[] = [
  {
    id: "onesource",
    name: "Military OneSource",
    aliases: ["Military OneSource", "Military One Source"],
    description:
      "A starting point for military life information, referrals, and available non-medical counseling.",
    url: official("/"),
    sourceLabel: "Military OneSource",
  },
  {
    id: "chaplain",
    name: "Chaplain",
    aliases: ["Chaplain", "Chapel"],
    description:
      "Spiritual care and a listening point for personal and family challenges. Ask the chaplain about available services and privacy.",
  },
  {
    id: "mflc",
    name: "Military & Family Life Counselor",
    aliases: [
      "Military and Family Life Counselor",
      "Military Family Life Counselor",
      "MFLC",
      "M FLC",
      "Military and Family Life Consultant",
    ],
    description:
      "Available non-medical counseling for everyday adjustment, stress, relationships, and family life.",
    url: official("/benefits/military-family-life-counseling-program/"),
    sourceLabel: "About the MFLC program",
  },
  {
    id: "mental-health",
    name: "Mental Health",
    aliases: ["Mental Health", "Behavioral Health"],
    description:
      "Qualified clinical care and guidance for mental health concerns; local services can explain access and urgent support.",
    url: official("/health-wellness/mental-health/"),
    sourceLabel: "Military mental health support",
  },
  {
    id: "family-readiness",
    name: "Military & Family Readiness Center",
    aliases: [
      "Military and Family Readiness Center",
      "Airman and Family Readiness Center",
      "Airmen and Family Readiness Center",
      "M FRC",
      "MFRC",
      "AFRC",
      "A FRC",
      "M F R C",
    ],
    description:
      "Installation support for relocation, deployment, employment, family readiness, and personal finances.",
    url: official("/moving-pcs/"),
    sourceLabel: "Military PCS and moving support",
  },
  {
    id: "legal",
    name: "Legal Office / Staff Judge Advocate",
    aliases: [
      "Legal Office",
      "Staff Judge Advocate",
      "SJA",
      "JAG",
      "Legal Assistance",
    ],
    description:
      "Ask installation legal assistance about civil legal matters, available services, and the proper consultation channel.",
    url: official("/financial-legal/legal/"),
    sourceLabel: "Military legal assistance and services",
  },
  {
    id: "defense-counsel",
    name: "Area Defense Counsel",
    aliases: ["Area Defense Counsel", "Area Defense Council", "ADC"],
    description:
      "An independent defense counsel contact for a member who needs advice about an adverse action. Confirm availability and scope directly.",
  },
  {
    id: "red-cross",
    name: "American Red Cross",
    aliases: ["American Red Cross", "Red Cross"],
    description:
      "Emergency communications and support for military families; connect through the current official emergency resources.",
    url: official("/emergency-contacts-for-disasters-evacuations/"),
    sourceLabel: "Military emergency contact resources",
  },
  {
    id: "dava",
    name: "Domestic Abuse Victim Advocate",
    aliases: ["Domestic Abuse Victim Advocate", "DAVA"],
    description:
      "A specialist starting point to discuss safety, support, and reporting options for domestic abuse.",
    url: official("/relationships/prevent-violence-abuse/domestic-abuse-help/"),
    sourceLabel: "Help for military domestic abuse victims",
  },
  {
    id: "family-advocacy",
    name: "Family Advocacy Program",
    aliases: ["Family Advocacy Program", "FAP", "Family Advocacy"],
    description:
      "Support and prevention resources for family relationships, parenting, and domestic abuse concerns.",
    url: official("/relationships/prevent-violence-abuse/domestic-abuse-help/"),
    sourceLabel: "Domestic abuse support and options",
  },
  {
    id: "equal-opportunity",
    name: "Equal Opportunity",
    aliases: ["Equal Opportunity", "EO"],
    description:
      "Local guidance on discrimination, harassment concerns, and applicable complaint channels.",
  },
  {
    id: "health-promotion",
    name: "Health Promotion",
    aliases: [
      "Health Promotion",
      "Health Promotions",
      "Health and Wellness Center",
      "HAWC",
    ],
    description:
      "Ask about local nutrition, wellness education, and prevention programs.",
    url: official("/health-wellness/fitness-nutrition/"),
    sourceLabel: "Military nutrition and fitness support",
  },
  {
    id: "medical",
    name: "Primary Care / Medical Clinic",
    aliases: ["Primary Care", "Primary Care Manager", "PCM", "Medical Clinic"],
    description:
      "Your starting point for health concerns, preventive care, and appropriate clinical referrals.",
    url: official("/health-wellness/prevention-care/"),
    sourceLabel: "Health prevention and care resources",
  },
  {
    id: "sarc",
    name: "Sexual Assault Response Coordinator",
    aliases: ["Sexual Assault Response Coordinator", "SARC", "SAPR"],
    description:
      "Ask a SARC about support and reporting options before sharing details. Do not assume a reporting route or privacy protections.",
  },
  {
    id: "supervisor",
    name: "Supervisor",
    aliases: ["Supervisor", "Rater", "Rater Supervisor"],
    description:
      "A work and development contact for clear expectations, practical support, and duty coordination.",
  },
  {
    id: "first-sergeant",
    name: "First Sergeant / Senior Enlisted Leader",
    aliases: [
      "First Sergeant",
      "First Sgt",
      "Senior Enlisted Leader",
      "SEL",
      "First Sergeant Senior Enlisted Leader",
    ],
    description:
      "A unit contact for readiness support, connecting to agencies, and coordination through the chain of command.",
  },
  {
    id: "commander",
    name: "Commander",
    aliases: [
      "Commander",
      "Squadron Commander",
      "Flight Commander",
      "Group Commander",
      "Wing Commander",
    ],
    description:
      "A chain-of-command contact for command responsibilities and appropriate coordination.",
  },
  {
    id: "afas",
    name: "Air Force Aid Society",
    aliases: ["Air Force Aid Society", "AF Aid Society", "AFAS"],
    description:
      "Ask your readiness center about available emergency financial assistance and current eligibility.",
    url: official("/financial-legal/personal-finance/"),
    sourceLabel: "Military personal finance resources",
  },
  {
    id: "adapt",
    name: "ADAPT / Substance-use Care",
    aliases: [
      "ADAPT",
      "Alcohol Drug Abuse Prevention and Treatment",
      "Substance Use Care",
    ],
    description:
      "A clinical point of contact for questions about alcohol or substance use, available care, and applicable procedures.",
  },
];

export const SUPPORT_NEEDS: SupportNeed[] = [
  { id: "school-change", label: "Change in schools", group: "Family" },
  { id: "deployment", label: "Deployment", group: "Family" },
  { id: "separation-family", label: "Divorce or separation", group: "Family" },
  {
    id: "marriage",
    label: "Getting married / strengthening a relationship",
    group: "Family",
  },
  { id: "loss", label: "Loss of a family member or friend", group: "Family" },
  { id: "new-parent", label: "New parent", group: "Family" },
  { id: "pcs", label: "PCS / relocation", group: "Family" },
  {
    id: "raising-children",
    label: "Raising children / single parenting",
    group: "Family",
  },
  { id: "relationship", label: "Relationship challenges", group: "Family" },
  { id: "spouse-employment", label: "Spouse finding work", group: "Family" },
  { id: "past-trauma", label: "Past abuse or trauma", group: "Personal" },
  {
    id: "substance-use",
    label: "Alcohol or substance-use concern",
    group: "Personal",
  },
  { id: "anger", label: "Anger management", group: "Personal" },
  { id: "anxiety", label: "Anxiety", group: "Personal" },
  {
    id: "dating-violence",
    label: "Dating violence",
    group: "Personal",
    urgent: true,
  },
  {
    id: "discrimination",
    label: "Discrimination / harassment",
    group: "Personal",
  },
  {
    id: "domestic-violence",
    label: "Domestic violence",
    group: "Personal",
    urgent: true,
  },
  { id: "health", label: "Health concerns", group: "Personal" },
  { id: "loneliness", label: "Loneliness / isolation", group: "Personal" },
  { id: "self-esteem", label: "Low self-esteem", group: "Personal" },
  { id: "mediation", label: "Mediation", group: "Personal" },
  {
    id: "sexual-assault",
    label: "Sexual assault / reporting options",
    group: "Personal",
    urgent: true,
  },
  { id: "sleep", label: "Sleep difficulties", group: "Personal" },
  { id: "stress", label: "Stress", group: "Personal" },
  {
    id: "suicide-prevention",
    label: "Suicide prevention / immediate mental health support",
    group: "Personal",
    urgent: true,
  },
  { id: "nutrition", label: "Weight / nutrition", group: "Personal" },
  {
    id: "financial-emergency",
    label: "Emergency financial need",
    group: "Finance",
  },
  {
    id: "foreclosure",
    label: "Foreclosure / housing payments",
    group: "Finance",
  },
  { id: "loans", label: "Mortgages / loans", group: "Finance" },
  {
    id: "transition",
    label: "Retirement / separation planning",
    group: "Finance",
  },
  { id: "legal-need", label: "Legal assistance", group: "Legal" },
  {
    id: "adverse-action",
    label: "Advice about an adverse action",
    group: "Legal",
  },
];

type MatchDefinition = readonly [agencyId: string, reason: string];
const everyday: MatchDefinition[] = [
  ["mflc", "Non-medical support may help with everyday coping and adjustment."],
  [
    "chaplain",
    "A chaplain can be a starting point for a conversation and spiritual support.",
  ],
  [
    "onesource",
    "OneSource can explain available military-life resources and referrals.",
  ],
];
const family: MatchDefinition[] = [
  [
    "family-readiness",
    "Your installation readiness center can connect family needs with local services.",
  ],
  ...everyday,
];
const legal: MatchDefinition[] = [
  [
    "legal",
    "Legal assistance can explain available services and the appropriate consultation route.",
  ],
  [
    "family-readiness",
    "The readiness center can help locate available local support.",
  ],
];
const MATCHES: Record<string, MatchDefinition[]> = {
  "school-change": [
    ["family-readiness", "Ask about school liaison and relocation support."],
    [
      "onesource",
      "Use military-family resources to prepare for a school change.",
    ],
  ],
  deployment: [
    [
      "family-readiness",
      "Ask about deployment preparation and family readiness services.",
    ],
    ["supervisor", "Coordinate duty expectations and support needs."],
    [
      "first-sergeant",
      "Ask for help connecting the family with unit and installation services.",
    ],
    [
      "commander",
      "Coordinate command-level requirements through the appropriate chain of command.",
    ],
    ...everyday,
  ],
  "separation-family": [...legal, ...everyday],
  marriage: family,
  loss: [
    [
      "red-cross",
      "Ask about emergency communication and military-family support.",
    ],
    ["chaplain", "A chaplain can support conversations about grief and loss."],
    [
      "mental-health",
      "Clinical support is a starting point when grief affects health or daily functioning.",
    ],
    [
      "onesource",
      "Ask about resources for coping with grief and family logistics.",
    ],
  ],
  "new-parent": [
    [
      "family-advocacy",
      "Ask about available parenting and new-parent support.",
    ],
    ...family,
  ],
  pcs: [
    [
      "family-readiness",
      "Ask about relocation assistance, checklists, and installation resources.",
    ],
    ["supervisor", "Coordinate work and travel expectations."],
    ["onesource", "Use current military moving and housing guidance."],
  ],
  "raising-children": [
    ["family-advocacy", "Ask about parenting support and family services."],
    ...family,
  ],
  relationship: family,
  "spouse-employment": [
    ["family-readiness", "Ask about local spouse employment assistance."],
    ["onesource", "Explore military-spouse career and education resources."],
  ],
  "past-trauma": [
    [
      "mental-health",
      "Ask a qualified clinical provider about trauma-related care.",
    ],
    ["chaplain", "A chaplain is a possible listening and support contact."],
    ["onesource", "Ask about appropriate support resources and referrals."],
  ],
  "substance-use": [
    [
      "adapt",
      "Ask the appropriate clinical program about available care and procedures.",
    ],
    [
      "medical",
      "A healthcare professional can discuss care and referral options.",
    ],
    ["first-sergeant", "Ask about unit and installation support channels."],
  ],
  anger: [
    [
      "mental-health",
      "Ask a clinical provider about health-related concerns and available care.",
    ],
    ...everyday,
  ],
  anxiety: [
    [
      "mental-health",
      "A qualified clinical provider can discuss anxiety and care options.",
    ],
    ...everyday,
  ],
  "dating-violence": [
    [
      "dava",
      "Discuss safety and available support or reporting options with a specialist.",
    ],
    ["family-advocacy", "Ask about available relationship-safety resources."],
    [
      "legal",
      "Ask about legal assistance and appropriate consultation options.",
    ],
  ],
  discrimination: [
    [
      "equal-opportunity",
      "Ask EO about discrimination or harassment complaint channels.",
    ],
    ["legal", "Ask which legal assistance or consultation channel applies."],
    [
      "first-sergeant",
      "Ask about appropriate unit support without assuming a complaint route.",
    ],
  ],
  "domestic-violence": [
    [
      "dava",
      "Discuss safety and available support or reporting options with a specialist.",
    ],
    ["family-advocacy", "Ask about available relationship-safety resources."],
    [
      "legal",
      "Ask about appropriate legal assistance and consultation options.",
    ],
  ],
  health: [
    [
      "medical",
      "A primary care provider is a starting point for health concerns and referrals.",
    ],
    [
      "health-promotion",
      "Ask about prevention and wellness programs appropriate to your needs.",
    ],
  ],
  loneliness: everyday,
  "self-esteem": everyday,
  mediation: [
    ...legal,
    [
      "equal-opportunity",
      "Ask whether EO offers an appropriate dispute-resolution process.",
    ],
  ],
  "sexual-assault": [
    [
      "sarc",
      "A SARC can explain support and reporting options before you share details.",
    ],
    ["medical", "A healthcare professional can discuss medical care options."],
    ["mental-health", "Ask about appropriate clinical support."],
  ],
  sleep: [
    [
      "medical",
      "Ask a healthcare professional about persistent sleep concerns.",
    ],
    [
      "mental-health",
      "Ask about support if sleep difficulties accompany mental health concerns.",
    ],
    ["health-promotion", "Ask about available sleep and wellness education."],
  ],
  stress: everyday,
  "suicide-prevention": [
    [
      "mental-health",
      "Use qualified immediate or ongoing mental health support; do not wait for a planning follow-up.",
    ],
    ["medical", "Ask local medical services about urgent care access."],
  ],
  nutrition: [
    ["health-promotion", "Ask about nutrition and wellness education."],
    [
      "medical",
      "A healthcare professional can discuss health concerns or appropriate referrals.",
    ],
  ],
  "financial-emergency": [
    [
      "family-readiness",
      "Ask about current financial counseling and emergency assistance channels.",
    ],
    ["afas", "Ask about available assistance and current eligibility."],
    [
      "first-sergeant",
      "Ask for help coordinating available unit and installation resources.",
    ],
  ],
  foreclosure: [
    ...legal,
    [
      "onesource",
      "Use current personal finance guidance and ask about counseling resources.",
    ],
  ],
  loans: [
    ["family-readiness", "Ask about personal financial counseling."],
    ["onesource", "Use current military personal finance guidance."],
    ["legal", "Ask about available contract or consumer legal assistance."],
  ],
  transition: [
    [
      "family-readiness",
      "Ask about transition preparation and financial readiness resources.",
    ],
    [
      "onesource",
      "Use military transition, retirement, and separation planning resources.",
    ],
  ],
  "legal-need": legal,
  "adverse-action": [
    [
      "defense-counsel",
      "A member can ask independent defense counsel about representation and advice.",
    ],
    [
      "legal",
      "Supervisors and command representatives should confirm the proper consultation channel with legal.",
    ],
  ],
};

export function matchSupportNeed(
  needId: string,
): { agency: SupportAgency; reason: string }[] {
  return (MATCHES[needId] ?? []).map(([id, reason]) => ({
    agency: SUPPORT_AGENCIES.find((agency) => agency.id === id)!,
    reason,
  }));
}
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export function matchAgencyContacts(
  agencyId: string,
  contacts: Contact[],
): Contact[] {
  const agency = SUPPORT_AGENCIES.find((item) => item.id === agencyId);
  if (!agency) return [];
  const aliases = [agency.name, ...agency.aliases].map(normalize);
  return contacts.filter((contact) =>
    [contact.agency, contact.role, contact.name].some((value) => {
      const normalized = normalize(value);
      return aliases.some(
        (alias) =>
          normalized === alias ||
          (alias.length >= 2 && ` ${normalized} `.includes(` ${alias} `)),
      );
    }),
  );
}
