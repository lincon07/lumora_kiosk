/**
 * Augment Express's Request interface so req.user is typed globally
 * without needing a cast in every route file.
 * AuthRequest (in middleware/auth.ts) is the canonical typed version;
 * this declaration makes TypeScript accept req.user on plain Request too.
 */
import type { JwtPayload } from "./types"

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { userId: string }
    }
  }
}

export {}
