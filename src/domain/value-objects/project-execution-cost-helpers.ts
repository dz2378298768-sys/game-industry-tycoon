/**
 * PROJ 执行内核的公用派生类型。
 * `BudgetCapacityCents` 为语义别名（§3.4），避免与 `Project.budgetCapacityCents` 的裸 number 混用。
 */
import type { Discipline } from '@domain/entities/project-execution'

/** §3.4 玩家分配的项目预算上限（整数美分，≤AvailableCash at setup）。 */
export type BudgetCapacityCents = number

/** 分学科工作量向量。 */
export type DisciplineWorkload = Record<Discipline, number>
