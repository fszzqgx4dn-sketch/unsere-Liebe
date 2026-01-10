
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
  userId: string; // Now uses the unique pairing code
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
  lastUpdated: number;
}

export interface CheckIn {
  id: string;
  type: CheckInType;
  question: string;
  answers: Answer[];
  date: string; 
  periodLabel: string;
  lastUpdated: number;
}

export interface VisitInfo {
  date: string; 
  location: string;
  lastUpdated: number;
}

export enum PhotoStatus {
  NONE = 'NONE',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  RECEIVED = 'RECEIVED'
}

export interface PhotoExchange {
  id: string;
  senderId: string; // Now uses the unique pairing code
  data: string; // base64
  timestamp: number;
  status: PhotoStatus;
}

export interface AppState {
  currentUser: UserRole; // Only used for the local UI toggle (dev mode)
  isPaired: boolean;
  myPairingCode: string;
  partnerPairingCode: string | null;
  visitInfo: VisitInfo | null;
  prompts: Prompt[];
  checkIns: CheckIn[];
  streak: number;
  lastCompletedDate: string | null;
  pendingKissFor: string | null; // Stores the pairing code of the recipient
  photoExchanges: PhotoExchange[];
  devMode: boolean;
}
