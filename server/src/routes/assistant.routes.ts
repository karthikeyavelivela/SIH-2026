import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { agentLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as assistantController from '../controllers/assistant.controller';

export const assistantRouter = Router();

// Every authenticated role gets TARA — that is the point of there being one
// assistant instead of a different widget per dashboard. What differs per
// role is what TARA can see, and that is decided server-side in
// agents/tara/context.ts from the caller's own id, never from anything the
// client sends.
//
// Same agentLimiter as the other agent routes: TARA is a model call like any
// other and must not become a way around the rate limit.
assistantRouter.use(verifyJwt, agentLimiter);

assistantRouter.post(
  '/ask',
  [
    body('question').isString().trim().isLength({ min: 1, max: 500 }),
    body('conversationId').optional().isMongoId(),
  ],
  validate,
  assistantController.ask
);

assistantRouter.get('/conversations', assistantController.listConversations);

assistantRouter.get(
  '/conversations/:id',
  [param('id').isMongoId()],
  validate,
  assistantController.getConversation
);

// The human exit. A person presses this; TARA has no path to it.
assistantRouter.post(
  '/conversations/:id/escalate',
  [param('id').isMongoId()],
  validate,
  assistantController.escalate
);
