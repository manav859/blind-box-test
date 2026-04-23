import { Pool } from 'pg';
import { Session } from '@shoplineos/shopline-api-js';
import { logger } from '../../lib/logger';

interface SessionRow {
  id: string;
  handle: string;
  state: string;
  is_online: number;     // stored as 0/1 INTEGER
  expires: string | null; // stored as bigint text from pg
  scope: string | null;
  access_token: string | null;
}

function rowToSession(row: SessionRow): Session {
  return new Session({
    id: row.id,
    handle: row.handle,
    state: row.state,
    isOnline: row.is_online !== 0,
    scope: row.scope ?? undefined,
    expires: row.expires ? new Date(Number(row.expires) * 1000) : undefined,
    accessToken: row.access_token ?? undefined,
  });
}

export class PostgresSessionStorage {
  constructor(private readonly pool: Pool) {}

  async storeSession(session: Session): Promise<boolean> {
    const expiresUnix = session.expires
      ? Math.floor(session.expires.getTime() / 1000)
      : null;

    await this.pool.query(
      `INSERT INTO shopline_sessions (id, handle, state, is_online, expires, scope, access_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         handle       = EXCLUDED.handle,
         state        = EXCLUDED.state,
         is_online    = EXCLUDED.is_online,
         expires      = EXCLUDED.expires,
         scope        = EXCLUDED.scope,
         access_token = EXCLUDED.access_token`,
      [
        session.id,
        session.handle,
        session.state,
        session.isOnline ? 1 : 0,
        expiresUnix,
        session.scope ?? null,
        session.accessToken ?? null,
      ],
    );

    logger.debug('Session stored', { id: session.id, handle: session.handle, isOnline: session.isOnline });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const result = await this.pool.query<SessionRow>(
      'SELECT id, handle, state, is_online, expires, scope, access_token FROM shopline_sessions WHERE id = $1',
      [id],
    );

    const row = result.rows[0];
    if (!row) {
      logger.debug('Session not found', { id });
      return undefined;
    }

    const session = rowToSession(row);

    // Treat expired sessions as not found — SDK may not filter these itself
    if (session.expires && session.expires < new Date()) {
      logger.debug('Session found but expired — treating as not found', { id, expires: session.expires });
      return undefined;
    }

    logger.debug('Session loaded', { id, handle: session.handle });
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM shopline_sessions WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    await this.pool.query('DELETE FROM shopline_sessions WHERE id = ANY($1)', [ids]);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return this.findSessionsByHandle(shop);
  }

  // SHOPLINE SDK requires this name (maps to the handle column)
  async findSessionsByHandle(handle: string): Promise<Session[]> {
    const result = await this.pool.query<SessionRow>(
      'SELECT id, handle, state, is_online, expires, scope, access_token FROM shopline_sessions WHERE handle = $1',
      [handle],
    );
    return result.rows.map(rowToSession);
  }
}
