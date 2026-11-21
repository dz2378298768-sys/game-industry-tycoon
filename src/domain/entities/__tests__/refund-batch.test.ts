import { describe, it, expect } from 'vitest'
import {
  makeRefundBatchId,
  refundBatchIdempotencyKey,
} from '@domain/entities/refund-batch'

describe('RefundBatch 构造与幂等键纯函数（DESIGN-M2-001-A §10.5）', () => {
  it('T06 makeRefundBatchId 生成规范化 ID，seq 变化产生不同 ID', () => {
    expect(makeRefundBatchId('PROJ-001', 100, 114, 1)).toBe('RB-PROJ-001-100-114-1')
    expect(makeRefundBatchId('PROJ-001', 100, 114, 2)).toBe('RB-PROJ-001-100-114-2')
    expect(makeRefundBatchId('PROJ-001', 100, 114, 1)).not.toBe(
      makeRefundBatchId('PROJ-001', 100, 114, 2),
    )
  })

  it('T07 makeRefundBatchId 参数守卫：seq/日索引非法 RangeError，空 productId TypeError', () => {
    expect(() => makeRefundBatchId('PROJ-001', 100, 114, 0)).toThrow(RangeError)
    expect(() => makeRefundBatchId('PROJ-001', 100, 114, 1.2)).toThrow(RangeError)
    expect(() => makeRefundBatchId('', 100, 114, 1)).toThrow(TypeError)
    expect(() => makeRefundBatchId('PROJ-001', -1, 114, 1)).toThrow(RangeError)
    expect(() => makeRefundBatchId('PROJ-001', 100, -1, 1)).toThrow(RangeError)
  })

  it('T08 幂等键为 customer-refund:<id>', () => {
    expect(refundBatchIdempotencyKey('RB-PROJ-001-100-114-1')).toBe(
      'customer-refund:RB-PROJ-001-100-114-1',
    )
  })

  it('T09 空 id 抛 TypeError', () => {
    expect(() => refundBatchIdempotencyKey('')).toThrow(TypeError)
  })
})
