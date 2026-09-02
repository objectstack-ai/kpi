import type { Hook } from '@objectstack/spec/data';
import { EntryLineDeleteGuardHook, EntryLineScoreHook } from './entry-line.hook.js';
import { SheetAfterTransitionHook, SheetDeleteGuardHook, SheetInsertGuardHook, SheetTransitionHook } from './sheet.hook.js';
import { CheckTaskAfterDecideHook, CheckTaskDecideHook } from './check-task.hook.js';
import { PersonalItemFreezeHook, PlanChildFreezeHook, PlanChildNameHook, PlanCloneHook, PlanPublishHook } from './plan.hook.js';
import { DisputeAfterRaiseHook, DisputeAfterResolveHook, DisputeRaiseHook, DisputeResolveHook } from './dispute.hook.js';
import { BonusAfterDecideHook, BonusHook } from './bonus.hook.js';
import { AdjustmentHook } from './adjustment.hook.js';
import { ResultSystemOnlyHook, ReviewRecordImmutableHook, SnapshotImmutableHook } from './immutable.hook.js';

/** 全部 hook;必须在 defineStack({ hooks }) 注册,否则是死元数据。 */
export const allHooks: Hook[] = [
  EntryLineScoreHook,
  EntryLineDeleteGuardHook,
  SheetInsertGuardHook,
  SheetTransitionHook,
  SheetAfterTransitionHook,
  SheetDeleteGuardHook,
  CheckTaskDecideHook,
  CheckTaskAfterDecideHook,
  PlanChildFreezeHook,
  PersonalItemFreezeHook,
  PlanChildNameHook,
  PlanPublishHook,
  PlanCloneHook,
  DisputeRaiseHook,
  DisputeAfterRaiseHook,
  DisputeResolveHook,
  DisputeAfterResolveHook,
  BonusHook,
  BonusAfterDecideHook,
  AdjustmentHook,
  SnapshotImmutableHook,
  ReviewRecordImmutableHook,
  ResultSystemOnlyHook,
];
