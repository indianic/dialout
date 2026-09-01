export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface Machine {
  id: number;
  userId: number;
  name: string;
  hidden?: boolean;
  terminalNameTemplate?: string | null;
  terminalPreviewLines?: number | null;
  createdAt: string;
}

export interface SessionInfo {
  userId: number;
  machineId: number;
  email: string;
  name: string;
  machines: Machine[];
  twoFactorEnabled?: boolean;
  requires2faEnrollment?: boolean;
}

export interface ShareComment {
  id: number;
  projectId: number;
  userId: number;
  userName: string;
  content: string;
  createdAt: string;
}

export interface ProjectShare {
  id: number;
  projectId: number;
  sharedBy: number;
  sharedWith: number;
  createdAt: string;
}

export interface Project {
  id: number;
  userId: number | null;
  machineId: number | null;
  name: string;
  port: number | null;
  addonPorts: string;
  url: string;
  techStack: string;
  description: string;
  startDate: string | null;
  runner: string;
  status: string;
  tags: string;
  notes: string;
  rootPath: string;
  startCommand: string;
  stopCommand: string;
  restartCommand: string;
  runInBackground: boolean;
  isRunning: boolean;
  lastChecked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFormData {
  name: string;
  port: number | null;
  addonPorts: string;
  url: string;
  techStack: string;
  description: string;
  startDate: string;
  runner: string;
  status: string;
  tags: string;
  notes: string;
  rootPath: string;
  startCommand: string;
  stopCommand: string;
  restartCommand: string;
  runInBackground: boolean;
}

export interface SystemService {
  id: number;
  name: string;
  port: number;
  description: string;
  createdAt: string;
}

export interface SystemServiceFormData {
  name: string;
  port: number;
  description: string;
}

export interface ProjectNote {
  id: number;
  projectId: number;
  title: string;
  content: string;
  tags: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCredential {
  id: number;
  projectId: number;
  environment: string;
  kind: string;
  label: string;
  backendUrl: string;
  username: string;
  hasSecret: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTodo {
  id: number;
  projectId: number;
  text: string;
  priority: 'low' | 'medium' | 'high';
  isDone: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: 'share' | 'comment';
  projectId: number;
  projectName: string;
  fromUserName: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Stats {
  total: number;
  active: number;
  archived: number;
  running: number;
  offline: number;
}

export interface ScanResult {
  ports: number[];
  scanned: number;
}

export interface ScannedProject {
  name: string;
  path: string;
  stack: string;
  framework: string;
  language: string;
  packageManager: string | null;
  port: number | null;
  // 'none' = no port detected, left unassigned (no auto-allocation).
  // 'assigned' retained for pre-2.3.2 agents that still auto-allocated.
  portSource: 'script' | 'env' | 'config' | 'default' | 'assigned' | 'none';
  url: string | null;
  startCommand: string | null;
  running: boolean;
  // annotations added by /api/scan/projects
  existing: boolean;
  existingProjectId?: number;
  existingName?: string;
  portConflict?: boolean;
  portConflictWith?: string;
}

export interface LiveTerminalSession {
  id: number;
  machineId: number;
  // Non-null by contract: the API filters on isNotNull(tmuxName).
  tmuxName: string;
  termProgram: string | null;
  origin: 'native' | 'browser' | null;
  isLive: boolean;
  startedAt: string | null;
  lastActiveAt: string | null;
  cols: number | null;
  rows: number | null;
  folder: string | null;
  folderPath: string | null;
  createdLocal: string | null;
  gitBranch: string | null;
  lastLines: string | null;
}
