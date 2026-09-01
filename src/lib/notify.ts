import { db } from './db';
import { notifications } from './schema';

export async function createNotification(params: {
  userId: number;
  type: 'share' | 'comment';
  projectId: number;
  projectName: string;
  fromUserName: string;
  message: string;
}) {
  await db.insert(notifications).values(params);
}
