// case 导出执行（对应 Java CaseExportDomainServiceImpl；规则表 0004 §8）。由 case-export 消费者调用。
// 与 Java 的差异：流式渲染 + lib-storage 分片上传（无 20 万行上限）；downloadUrl 不落库，详情时现签。
// 所有异常内部消化：成功 / 失败都回写 ext.lastExport，不上抛。
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { CaseRow, DatasetSampleRow } from '../../db/schema.js';
import type { Logger } from '../../infra/logger.js';
import type { ObjectStorage } from '../../infra/object-storage.js';
import type { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import { DELETED_NO, type CaseRepository } from './case.repo.js';
import { readCaseExt, type LastExport } from './config.js';
import { CaseExportStatus } from './enums.js';

const BATCH_SIZE = 500;
const UTF8_BOM = '﻿';
const COLUMNS = [
  'caseId',
  'bizId',
  'sourceSampleId',
  'inputData',
  'labelResultId',
  'labelResult',
  'reviewResultId',
  'reviewResult',
] as const;
const OBJECT_KEY_PREFIX = 'export/case';
const FAILURE_REASON_MAX_LENGTH = 1024;

export interface CaseExportServiceDeps {
  cases: CaseRepository;
  samples: DatasetSampleRepository;
  storage: ObjectStorage;
  logger: Logger;
  timeZone: string;
}

export class CaseExportService {
  constructor(private readonly deps: CaseExportServiceDeps) {}

  async exportCaseResult(caseId: number, format: string, operator: string): Promise<void> {
    const startTime = Date.now();
    let caseRow: CaseRow | undefined;
    try {
      caseRow = await this.deps.cases.selectById(caseId);
      if (!caseRow || caseRow.deleted !== DELETED_NO) {
        this.deps.logger.warn({ caseId }, 'case-export skipped: case missing or deleted');
        return;
      }
      const sourceVersionId = caseRow.datasetVersionId;
      if (sourceVersionId === null) throw new Error('case 缺少 datasetVersionId，无法导出');
      const isCsv = format.toLowerCase() === 'csv';
      const objectKey = buildObjectKey(caseId, format, this.deps.timeZone);
      const stream = Readable.from(this.renderRows(caseRow, sourceVersionId, isCsv));
      await this.deps.storage.putObjectStream(
        objectKey,
        stream,
        isCsv ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      );
      await this.writeLastExport(caseRow, operator, {
        status: CaseExportStatus.DONE,
        format,
        objectKey,
        triggerTime: triggerTimeOf(caseRow, startTime),
        finishTime: Date.now(),
      });
      this.deps.logger.info({ caseId, format, objectKey }, 'case-export done');
    } catch (err) {
      this.deps.logger.error({ err, caseId, format }, 'case-export failed');
      if (!caseRow) return;
      try {
        await this.writeLastExport(caseRow, operator, {
          status: CaseExportStatus.FAILED,
          format,
          triggerTime: triggerTimeOf(caseRow, startTime),
          finishTime: Date.now(),
          failureReason: truncate(err instanceof Error ? err.message : String(err)),
        });
      } catch (inner) {
        this.deps.logger.error({ err: inner, caseId }, 'case-export: marking FAILED failed');
      }
    }
  }

  /** 逐批拉源样本 → 串联标注 / 质检结果 → 产出文本块。 */
  private async *renderRows(
    caseRow: CaseRow,
    sourceVersionId: number,
    isCsv: boolean,
  ): AsyncGenerator<string> {
    if (isCsv) yield `${UTF8_BOM}${COLUMNS.join(',')}\n`;
    const resultVersionId = caseRow.labelResultDatasetVersionId;
    let afterId = 0;
    for (;;) {
      const sources = await this.deps.samples.selectPageByVersionAfterId(
        sourceVersionId,
        afterId,
        BATCH_SIZE,
      );
      if (sources.length === 0) break;
      const labelByBizId =
        resultVersionId === null
          ? new Map<string, DatasetSampleRow>()
          : await this.deps.samples.selectByVersionAndBizIds(
              resultVersionId,
              sources.map((s) => String(s.id)),
            );
      const labelIds = [...labelByBizId.values()].map((s) => String(s.id));
      const reviewByBizId =
        resultVersionId === null || labelIds.length === 0
          ? new Map<string, DatasetSampleRow>()
          : await this.deps.samples.selectByVersionAndBizIds(resultVersionId, labelIds);
      let chunk = '';
      for (const src of sources) {
        const label = labelByBizId.get(String(src.id));
        const review = label ? reviewByBizId.get(String(label.id)) : undefined;
        chunk += isCsv
          ? csvRow(caseRow.id, src, label, review)
          : jsonlRow(caseRow.id, src, label, review);
      }
      yield chunk;
      afterId = (sources[sources.length - 1] as DatasetSampleRow).id;
      if (sources.length < BATCH_SIZE) break;
    }
  }

  private writeLastExport(caseRow: CaseRow, operator: string, lastExport: LastExport) {
    return this.deps.cases.updateExt(caseRow.id, { lastExport }, operator, Date.now());
  }
}

function triggerTimeOf(caseRow: CaseRow, fallback: number): number {
  return readCaseExt(caseRow.ext).lastExport?.triggerTime ?? fallback;
}

function truncate(s: string): string {
  return s.length <= FAILURE_REASON_MAX_LENGTH ? s : `${s.slice(0, FAILURE_REASON_MAX_LENGTH)}...`;
}

function jsonAsString(v: unknown): string {
  return v === null || v === undefined ? '' : JSON.stringify(v);
}

/** RFC 4180：含 , " 换行的字段用双引号包裹，内部 " 转义为 ""；null → 空。 */
export function csvCell(raw: string | null): string {
  if (raw === null) return '';
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function csvRow(
  caseId: number,
  src: DatasetSampleRow,
  label: DatasetSampleRow | undefined,
  review: DatasetSampleRow | undefined,
): string {
  return (
    [
      csvCell(String(caseId)),
      csvCell(src.bizId),
      csvCell(String(src.id)),
      csvCell(jsonAsString(src.sampleDataJson)),
      csvCell(label ? String(label.id) : null),
      csvCell(label ? jsonAsString(label.sampleDataJson) : null),
      csvCell(review ? String(review.id) : null),
      csvCell(review ? jsonAsString(review.sampleDataJson) : null),
    ].join(',') + '\n'
  );
}

function jsonlRow(
  caseId: number,
  src: DatasetSampleRow,
  label: DatasetSampleRow | undefined,
  review: DatasetSampleRow | undefined,
): string {
  return (
    JSON.stringify({
      caseId,
      bizId: src.bizId,
      sourceSampleId: src.id,
      inputData: src.sampleDataJson ?? null,
      labelResultId: label ? label.id : null,
      labelResult: label ? (label.sampleDataJson ?? null) : null,
      reviewResultId: review ? review.id : null,
      reviewResult: review ? (review.sampleDataJson ?? null) : null,
    }) + '\n'
  );
}

function datePart(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/-/g, '');
}

export function buildObjectKey(caseId: number, format: string, timeZone: string): string {
  const unique = randomUUID().replace(/-/g, '');
  return `${OBJECT_KEY_PREFIX}/${caseId}/${datePart(timeZone)}/${unique}.${format.toLowerCase()}`;
}
