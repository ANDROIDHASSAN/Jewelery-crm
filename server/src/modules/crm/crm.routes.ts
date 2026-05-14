import { Router } from 'express';
import { z } from 'zod';
import { LeadInputSchema } from '@goldos/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { LEAD_STATUSES } from '@goldos/shared/constants';
import { NotFoundError } from '../../lib/errors.js';

export const crmRouter: Router = Router();

// Pipeline kanban supports drag-and-drop in any direction — both for normal
// progression (NEW → CONTACTED → … → CONVERTED), for marking lost from any
// stage, and for reverting an accidental drop. The previous strict transition
// table blocked the kanban UX. Status is still validated against the enum.

crmRouter.get('/leads', async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.enum(LEAD_STATUSES).optional(),
        source: z.string().optional(),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    const take = 20;
    const leads = await prisma.lead.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.source ? { source: q.source } : {}) },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = leads.length > take;
    res.json({
      data: leads.slice(0, take),
      page: { nextCursor: hasMore ? leads.at(-2)?.id : undefined, hasMore },
    });
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/leads', async (req, res, next) => {
  try {
    const body = LeadInputSchema.parse(req.body);
    const lead = await prisma.lead.create({ data: { ...body, status: 'NEW' } });
    res.status(201).json({ data: lead });
  } catch (err) {
    next(err);
  }
});

// Broadcast — resolve recipients by lead-status filter and log a WHATSAPP_BROADCAST
// activity per recipient. v1 stops short of dispatching to Meta's WhatsApp API
// (that hooks in via BullMQ in a later phase); the route returns the count of
// recipients that WOULD have been sent so the UI stops lying about it.
const BroadcastSchema = z.object({
  audience: z.enum(['ALL', ...LEAD_STATUSES]),
  template: z.string().min(2).max(80),
  message: z.string().min(2).max(1500),
});

crmRouter.post('/broadcasts', async (req, res, next) => {
  try {
    const body = BroadcastSchema.parse(req.body);
    const where = body.audience === 'ALL' ? {} : { status: body.audience };
    const recipients = await prisma.lead.findMany({ where, select: { id: true, phone: true, name: true } });
    if (recipients.length === 0) {
      res.json({ data: { queued: 0, recipients: [] } });
      return;
    }
    const note = `[${body.template}] ${body.message}`.slice(0, 400);
    await prisma.leadActivity.createMany({
      data: recipients.map((r) => ({
        leadId: r.id,
        type: 'WHATSAPP_BROADCAST',
        notes: note,
        performedByUserId: req.user?.userId ?? null,
      })),
    });
    res.status(201).json({
      data: {
        queued: recipients.length,
        recipients: recipients.map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
      },
    });
  } catch (err) {
    next(err);
  }
});

crmRouter.patch('/leads/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(LEAD_STATUSES).optional(),
        assignedToUserId: z.string().optional(),
        notes: z.string().max(400).optional(),
      })
      .parse(req.body);

    const existing = await prisma.lead.findUnique({ where: { id: req.params['id']! } });
    if (!existing) throw new NotFoundError();

    const lead = await prisma.lead.update({
      where: { id: req.params['id']! },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.assignedToUserId ? { assignedToUserId: body.assignedToUserId } : {}),
      },
    });
    if (body.notes) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'NOTE',
          notes: body.notes,
          performedByUserId: req.user?.userId ?? null,
        },
      });
    }
    res.json({ data: lead });
  } catch (err) {
    next(err);
  }
});
