import { Router } from 'express';
import { param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as notificationController from '../controllers/notification.controller';

export const notificationRouter = Router();

notificationRouter.use(verifyJwt);

notificationRouter.get('/', [query('page').optional().isInt({ min: 1 })], validate, notificationController.listMyNotifications);
notificationRouter.get('/unread-count', notificationController.getUnreadCount);
notificationRouter.patch('/:id/read', [param('id').isMongoId()], validate, notificationController.markRead);
notificationRouter.patch('/read-all', notificationController.markAllRead);
