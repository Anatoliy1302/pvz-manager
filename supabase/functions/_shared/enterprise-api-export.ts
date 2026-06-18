import type { SupabaseClient } from '@supabase/supabase-js';
import type { DateRangeParams, SalaryEmployeeRow, ShiftRow } from './enterprise-api-data.ts';
import { fetchSalary, fetchShifts } from './enterprise-api-data.ts';

export type ExportFormat = 'xml' | 'json' | 'csv';

export interface ExportPayload {
  meta: {
    period_start: string;
    period_end: string;
    generated_at: string;
    format: ExportFormat;
    owner_id: string;
  };
  payroll: SalaryEmployeeRow[];
  shifts: ShiftRow[];
}

export async function buildExportPayload(
  admin: SupabaseClient,
  ownerId: string,
  params: DateRangeParams,
  pvzId?: string
): Promise<ExportPayload> {
  const [payroll, shifts] = await Promise.all([
    fetchSalary(admin, ownerId, params, { pvzId }),
    fetchShifts(admin, ownerId, params, { pvzId, statusFilter: 'countable' }),
  ]);

  return {
    meta: {
      period_start: params.fromDate,
      period_end: params.toDate,
      generated_at: new Date().toISOString(),
      format: 'json',
      owner_id: ownerId,
    },
    payroll,
    shifts,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeExport(payload: ExportPayload, format: ExportFormat): {
  content: string;
  mimeType: string;
  extension: string;
} {
  const { meta, payroll, shifts } = payload;

  if (format === 'json') {
    return {
      content: JSON.stringify({ ...payload, meta: { ...meta, format: 'json' } }, null, 2),
      mimeType: 'application/json; charset=utf-8',
      extension: 'json',
    };
  }

  if (format === 'xml') {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<PayrollExport xmlns="http://pvzpersonal.ru/1c/payroll/1.0">',
      '  <Meta>',
      `    <PeriodFrom>${meta.period_start}</PeriodFrom>`,
      `    <PeriodTo>${meta.period_end}</PeriodTo>`,
      `    <GeneratedAt>${meta.generated_at}</GeneratedAt>`,
      '  </Meta>',
      '  <Payroll>',
    ];

    for (const row of payroll) {
      lines.push('    <Employee>');
      lines.push(`      <Id>${row.employee_id}</Id>`);
      lines.push(`      <Name>${escapeXml(row.employee_name)}</Name>`);
      lines.push(`      <Phone>${escapeXml(row.phone)}</Phone>`);
      lines.push(`      <PvzId>${row.pvz_id}</PvzId>`);
      lines.push(`      <PvzName>${escapeXml(row.pvz_name)}</PvzName>`);
      lines.push(`      <ShiftsCount>${row.shifts_count}</ShiftsCount>`);
      lines.push(`      <Hours>${row.hours}</Hours>`);
      lines.push(`      <Accrued>${row.accrued}</Accrued>`);
      lines.push(`      <Fines>${row.fines}</Fines>`);
      lines.push(`      <Bonuses>${row.bonuses}</Bonuses>`);
      lines.push(`      <Withheld>${row.withheld}</Withheld>`);
      lines.push(`      <NetPayable>${row.net_payable}</NetPayable>`);
      lines.push(`      <Paid>${row.paid}</Paid>`);
      lines.push(`      <Balance>${row.balance}</Balance>`);
      lines.push('    </Employee>');
    }

    lines.push('  </Payroll>');
    lines.push('  <Shifts>');

    for (const s of shifts) {
      lines.push('    <Shift>');
      lines.push(`      <Id>${s.id}</Id>`);
      lines.push(`      <Date>${s.date}</Date>`);
      lines.push(`      <EmployeeId>${s.employee_id}</EmployeeId>`);
      lines.push(`      <EmployeeName>${escapeXml(s.employee_name)}</EmployeeName>`);
      lines.push(`      <PvzId>${s.pvz_id}</PvzId>`);
      lines.push(`      <PvzName>${escapeXml(s.pvz_name)}</PvzName>`);
      lines.push(`      <StartTime>${s.start_time}</StartTime>`);
      lines.push(`      <EndTime>${s.end_time}</EndTime>`);
      lines.push(`      <Hours>${s.total_hours}</Hours>`);
      lines.push(`      <Earnings>${s.earnings}</Earnings>`);
      lines.push(`      <Status>${s.status}</Status>`);
      lines.push('    </Shift>');
    }

    lines.push('  </Shifts>');
    lines.push('</PayrollExport>');

    return {
      content: lines.join('\n'),
      mimeType: 'application/xml; charset=utf-8',
      extension: 'xml',
    };
  }

  // CSV — ведомость + детализация смен
  const sections: string[] = [
    '\uFEFF',
    `Отчёт для 1С / бухгалтерии`,
    `Период,${meta.period_start} — ${meta.period_end}`,
    `Дата выгрузки,${meta.generated_at.split('T')[0]}`,
    '',
    'ВЕДОМОСТЬ НАЧИСЛЕНИЙ',
    [
      'Сотрудник',
      'Телефон',
      'ПВЗ',
      'Смен',
      'Часов',
      'Начислено',
      'Штрафы',
      'Бонусы',
      'Удержано',
      'К выплате',
      'Выплачено',
      'Остаток',
    ].join(','),
  ];

  for (const r of payroll) {
    sections.push(
      [
        r.employee_name,
        r.phone,
        r.pvz_name,
        r.shifts_count,
        r.hours,
        r.accrued,
        r.fines,
        r.bonuses,
        r.withheld,
        r.net_payable,
        r.paid,
        r.balance,
      ]
        .map(escapeCsvField)
        .join(',')
    );
  }

  sections.push('', 'ДЕТАЛИЗАЦИЯ СМЕН');
  sections.push(
    ['Дата', 'Сотрудник', 'ПВЗ', 'Начало', 'Конец', 'Часы', 'Начислено', 'Статус'].join(',')
  );

  for (const s of shifts) {
    sections.push(
      [
        s.date,
        s.employee_name,
        s.pvz_name,
        s.start_time,
        s.end_time,
        s.total_hours,
        s.earnings,
        s.status,
      ]
        .map(escapeCsvField)
        .join(',')
    );
  }

  return {
    content: sections.join('\n'),
    mimeType: 'text/csv; charset=utf-8',
    extension: 'csv',
  };
}

export async function uploadExportFile(
  admin: SupabaseClient,
  ownerId: string,
  content: string,
  extension: string,
  mimeType: string
): Promise<{ downloadUrl: string; path: string; expiresAt: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${ownerId}/export_${timestamp}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from('api-exports')
    .upload(path, new TextEncoder().encode(content), {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload export: ${uploadError.message}`);
  }

  const expiresIn = 3600;
  const { data: signed, error: signError } = await admin.storage
    .from('api-exports')
    .createSignedUrl(path, expiresIn);

  if (signError || !signed?.signedUrl) {
    throw new Error(`Failed to create download URL: ${signError?.message}`);
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    downloadUrl: signed.signedUrl,
    path,
    expiresAt,
  };
}
