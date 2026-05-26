export const APP_NAME = "AI Spend Audit";
export const APP_DESCRIPTION = "Analyze your AI stack, identify wasted spend, and discover smarter alternatives instantly.";
export const APP_URL = "http://localhost:3000";

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "$ USD" },
  { value: "EUR", label: "€ EUR" },
  { value: "GBP", label: "£ GBP" },
  { value: "CAD", label: "C$ CAD" },
  { value: "AUD", label: "A$ AUD" },
] as const;

export const TEAM_SIZE_OPTIONS = [
  { value: 1, label: "Just me" },
  { value: 5, label: "2-5 people" },
  { value: 20, label: "6-20 people" },
  { value: 50, label: "21-50 people" },
  { value: 100, label: "50+ people" },
] as const;

export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  AUDITS: "/dashboard/audits",
  REPORTS: "/dashboard/reports",
  SETTINGS: "/dashboard/settings",
} as const;
