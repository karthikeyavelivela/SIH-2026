import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as chatTranslate from '../controllers/chatTranslate.controller';

/** P4.2 — on-demand translation of booking chat messages (Bhashini). Off unless BHASHINI_ENABLED. */
export const chatRouter = Router();
chatRouter.use(verifyJwt, requestsLimiter);

chatRouter.get('/translate-status', chatTranslate.translateStatus);
chatRouter.post(
  '/:messageId/translate',
  [param('messageId').isMongoId(), body('target').isIn(['en', 'te', 'hi'])],
  validate,
  chatTranslate.translateChatMessage
);
