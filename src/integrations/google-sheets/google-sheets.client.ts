import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';

export interface SheetPairRow {
  sheetRow: number;
  title: string | null;
  supplierUrl: string;
  ebayUrl: string;
  extraUrls: string[];
}

export interface SheetReadOptions {
  spreadsheetUrl: string;
  worksheetName: string;
  supplierColumn: number;
  ebayColumn: number;
  titleColumn: number;
}

const SPREADSHEET_ID = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i;

@Injectable()
export class GoogleSheetsClient {
  private readonly logger = new Logger(GoogleSheetsClient.name);

  spreadsheetIdFromUrl(input: string): string {
    const trimmed = input.trim();
    const match = trimmed.match(SPREADSHEET_ID);
    if (match) return match[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
    throw new BadRequestException(
      'Paste a full Google Sheets link, for example https://docs.google.com/spreadsheets/d/…/edit',
    );
  }

  async readPairs(options: SheetReadOptions): Promise<SheetPairRow[]> {
    const spreadsheetId = this.spreadsheetIdFromUrl(options.spreadsheetUrl);
    const workbook = await this.downloadWorkbook(spreadsheetId);
    return this.parseWorkbook(workbook, options);
  }

  private async downloadWorkbook(spreadsheetId: string): Promise<Buffer> {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'User-Agent': 'Mozilla/5.0 (compatible; DropshipMonitor/1.0)',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new BadRequestException(
        `Could not open the Google Sheet (${response.status}). Share it as “Anyone with the link can view”.`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.subarray(0, 2).toString() !== 'PK') {
      throw new BadRequestException(
        'Google did not return the workbook. Share the sheet as “Anyone with the link can view”.',
      );
    }
    return bytes;
  }

  private async parseWorkbook(bytes: Buffer, options: SheetReadOptions): Promise<SheetPairRow[]> {
    const zip = await JSZip.loadAsync(bytes);
    const workbookXml = await this.readZip(zip, 'xl/workbook.xml');
    const relsXml = await this.readZip(zip, 'xl/_rels/workbook.xml.rels');
    const sheetFile = this.worksheetPath(workbookXml, relsXml, options.worksheetName);
    const sheetXml = await this.readZip(zip, `xl/${sheetFile}`);
    const sheetRelsPath = `xl/${sheetFile.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels')}`;
    const sheetRelsXml = await this.readZip(zip, sheetRelsPath).catch(() => '');
    const sharedStrings = await this.readSharedStrings(zip);

    const hyperlinks = this.parseHyperlinks(sheetXml, sheetRelsXml);
    const values = this.parseSheetValues(sheetXml, sharedStrings);
    const maxRow = Math.max(
      ...[...hyperlinks.keys(), ...values.keys()].map((key) => Number(key.split(':')[0]) || 0),
      0,
    );

    const rows: SheetPairRow[] = [];
    for (let sheetRow = 2; sheetRow <= maxRow; sheetRow += 1) {
      const title = this.cellText(values, sheetRow, options.titleColumn);
      const supplierUrl =
        hyperlinks.get(`${sheetRow}:${options.supplierColumn}`) ??
        this.asUrl(this.cellText(values, sheetRow, options.supplierColumn));
      const ebayUrl =
        hyperlinks.get(`${sheetRow}:${options.ebayColumn}`) ??
        this.asUrl(this.cellText(values, sheetRow, options.ebayColumn));
      if (!title && !supplierUrl && !ebayUrl) continue;
      if (this.looksLikeHeader(title, supplierUrl, ebayUrl)) continue;

      const extraUrls = [...hyperlinks.entries()]
        .filter(([key, url]) => key.startsWith(`${sheetRow}:`) && url !== supplierUrl && url !== ebayUrl)
        .map(([, url]) => url);

      rows.push({
        sheetRow,
        title,
        supplierUrl: supplierUrl ?? '',
        ebayUrl: ebayUrl ?? '',
        extraUrls,
      });
    }

    this.logger.log(`Read ${rows.length} product rows from "${options.worksheetName}"`);
    return rows;
  }

  private worksheetPath(workbookXml: string, relsXml: string, worksheetName: string): string {
    const wanted = worksheetName.trim().toLowerCase();
    const sheets = [...workbookXml.matchAll(/<sheet\b([^>]+)\/>/gi)];
    const rels = new Map(
      [...relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/gi)].map((match) => [match[1], match[2]]),
    );
    for (const sheet of sheets) {
      const attrs = sheet[1];
      const name = attrs.match(/name="([^"]+)"/i)?.[1] ?? '';
      const rId = attrs.match(/r:id="([^"]+)"/i)?.[1] ?? '';
      if (name.trim().toLowerCase() !== wanted) continue;
      const target = rels.get(rId);
      if (!target) continue;
      return target.replace(/^\//, '');
    }
    const names = sheets
      .map((sheet) => sheet[1].match(/name="([^"]+)"/i)?.[1])
      .filter((name): name is string => Boolean(name));
    throw new BadRequestException(
      `Worksheet "${worksheetName}" was not found. Available tabs: ${names.join(', ') || 'none'}.`,
    );
  }

  private parseHyperlinks(sheetXml: string, relsXml: string): Map<string, string> {
    const targets = new Map(
      [...relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/gi)].map((match) => [
        match[1],
        this.decodeXml(match[2]),
      ]),
    );
    const links = new Map<string, string>();
    for (const match of sheetXml.matchAll(/<hyperlink\b([^>]+)\/>/gi)) {
      const attrs = match[1];
      const ref = attrs.match(/\bref="([A-Z]+)(\d+)"/i);
      const rId = attrs.match(/r:id="([^"]+)"/i)?.[1];
      if (!ref || !rId) continue;
      const url = this.asUrl(targets.get(rId) ?? null);
      if (!url) continue;
      links.set(`${Number(ref[2])}:${this.columnIndex(ref[1])}`, url);
    }
    return links;
  }

  private parseSheetValues(sheetXml: string, sharedStrings: string[]): Map<string, string> {
    const values = new Map<string, string>();
    for (const cell of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const ref = cell[1].match(/\br="([A-Z]+)(\d+)"/i);
      if (!ref) continue;
      const type = cell[1].match(/\bt="([^"]+)"/i)?.[1];
      const raw = cell[2].match(/<v>([\s\S]*?)<\/v>/i)?.[1] ?? '';
      const inline = cell[2].match(/<t[^>]*>([\s\S]*?)<\/t>/i)?.[1] ?? '';
      let text = this.decodeXml(inline || raw);
      if (type === 's' && raw !== '') {
        const index = Number(raw);
        text = Number.isFinite(index) ? (sharedStrings[index] ?? '') : '';
      }
      if (!text) continue;
      values.set(`${Number(ref[2])}:${this.columnIndex(ref[1])}`, text.trim());
    }
    return values;
  }

  private async readSharedStrings(zip: JSZip): Promise<string[]> {
    const xml = await this.readZip(zip, 'xl/sharedStrings.xml').catch(() => '');
    if (!xml) return [];
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/gi)].map((entry) =>
      [...entry[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)]
        .map((part) => this.decodeXml(part[1]))
        .join('')
        .trim(),
    );
  }

  private cellText(values: Map<string, string>, row: number, column: number): string | null {
    const value = values.get(`${row}:${column}`)?.trim();
    return value ? value : null;
  }

  private asUrl(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
  }

  private looksLikeHeader(title: string | null, supplierUrl: string | null, ebayUrl: string | null): boolean {
    const blob = `${title ?? ''} ${supplierUrl ?? ''} ${ebayUrl ?? ''}`.toLowerCase();
    return blob.includes('supplier product link') || blob.includes('ebay product link');
  }

  private columnIndex(letters: string): number {
    let index = 0;
    for (const char of letters.toUpperCase()) {
      index = index * 26 + (char.charCodeAt(0) - 64);
    }
    return index;
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private async readZip(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path);
    if (!file) throw new Error(`Workbook is missing ${path}`);
    return file.async('string');
  }
}
