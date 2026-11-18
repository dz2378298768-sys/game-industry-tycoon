// ===== 项目阶段 =====
export type ProjectPhase =
  | 'CONCEPT'
  | 'PRE_PRODUCTION'
  | 'PRODUCTION'
  | 'QA'
  | 'READY_TO_LAUNCH'
  | 'LAUNCHED'
  | 'CANCELLED'

// ===== 概念子阶段 =====
export type ConceptSubPhase = 'DRAFT' | 'EVALUATING' | 'APPROVED'

// ===== 日历速度 =====
export type CalendarSpeed = 'paused' | 'slow' | 'normal' | 'fast' | 'ultra' | 'step'

// ===== 员工角色 =====
export type EmployeeRole =
  | 'designer'
  | 'programmer'
  | 'artist'
  | 'qa'
  | 'producer'
  | 'manager'

// ===== 专业领域（用于 work discipline） =====
export type Discipline = 'design' | 'programming' | 'art' | 'qa'

// ===== 交易分类 =====
export type TransactionCategory =
  | 'salary'
  | 'office_rent'
  | 'project_expense'
  | 'marketing'
  | 'sales_revenue'
  | 'customer_refund'
  | 'platform_fee'
  | 'contract_payment'
  | 'tax'
  | 'advance'
  | 'severance'

// ===== 公司状态 =====
export type CompanyStatus = 'active' | 'bankrupt' | 'dissolved'

// ===== 成长阶段 =====
export type GrowthStage =
  | 'startup'
  | 'small_studio'
  | 'growing_dev'
  | 'mid_publisher'
  | 'mature'

// ===== 取消原因 =====
export type CancellationReason =
  | 'scope_became_unviable'
  | 'budget_exhausted'
  | 'team_dissolved'
  | 'market_window_missed'
  | 'player_decision'
  | 'pause_timeout'

// ===== 项目内角色 =====
export type ProjectRole = 'lead' | 'senior' | 'generalist' | 'junior'

// ===== 产品生命周期阶段 =====
export type ProductLifecycleStage =
  | 'launch'
  | 'growth'
  | 'mature'
  | 'decline'
  | 'long_tail'
  | 'retired'

// ===== 产品状态 =====
export type ProductStatus = 'active' | 'retired'

// ===== 风险等级 =====
export type RiskLevel = 'low' | 'medium' | 'high'

// ===== 员工状态 =====
export type EmployeeStatus = 'hired' | 'on_leave' | 'resigned' | 'fired'

// ===== 交易状态 =====
export type TransactionStatus = 'posted' | 'reversed'

// ===== 成本分摊来源类型（DESIGN-G05 §2.2）=====
export type CostSourceType = 'salary' | 'contract' | 'direct_expense'

// ===== 成本分摊状态（DESIGN-G05 §2.2）=====
export type CostAllocationStatus = 'committed' | 'spent'

// ===== 技能来源 =====
export type Source =
  | 'gen'
  | 'art'
  | 'sys'
  | 'des'
  | 'aud'
  | 'pri'
  | 'mar'
  | 'wr'
  | 'tech'
  | '3d'
  | 'ui'
  | 'an'
