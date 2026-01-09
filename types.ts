
export enum UserRole {
  ME = 'ME',
  PARTNER = 'PARTNER'
}

export enum PromptCategory {
  RELATIONSHIP = 'Relationship',
  MEMORIES = 'Memories',
  STORY = 'Tell a Story',
  POEM = 'Poem',
  DATE_IDEA = 'Date Idea',
  PROXIMITY = 'Visit Excitement',
  CONTROVERSY = 'Controversy',
  SEXY = 'Sexy Talk',
  FUNNY = 'Funny',
  FUTURE = 'Future Dreams',
  MUSIC = 'Music',
  FAMILY = 'Family',
  GROWTH = 'Process & Growth',
  PAST = 'Reflecting on Past'
}

export enum CheckInType {
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
  ANNUAL = 'Annual'
}

export interface Answer {
  userId: UserRole;
  text: string;
  timestamp: number;
}

export interface Prompt {
  id: string;
  category: PromptCategory;
  question: string;
  answers: Answer[];
  date: string; // ISO date string
  isDaily: boolean;
}

export interface CheckIn {
  id: string;
  type: CheckInType;
  question: string;
  answers: Answer[];
  date: string; // ISO string for the period start
  periodLabel: string; // e.g. "Week of Oct 12" or "October 2023"
}

export interface VisitInfo {
  date: string; // ISO date string
  location: string;
}

export enum PhotoStatus {
  NONE = 'NONE',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  RECEIVED = 'RECEIVED'
}

export interface PhotoExchange {
  id: string;
  senderId: UserRole;
  data: string; // base64
  timestamp: number;
  status: PhotoStatus;
}

export interface AppState {
  currentUser: UserRole;
  isPaired: boolean;
  myPairingCode: string;
  partnerPairingCode: string | null;
  visitInfo: VisitInfo | null;
  prompts: Prompt[];
  checkIns: CheckIn[];
  streak: number;
  lastCompletedDate: string | null;
  pendingKissFor: UserRole | null;
  photoExchanges: PhotoExchange[];
  devMode: boolean;
}
