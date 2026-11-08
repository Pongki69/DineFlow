<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use ZipArchive;

/**
 * A small, styled Excel (.xlsx) file for report exports - no library needed.
 *
 * One sheet: a title row, a subtitle row, a dark green header row that stays
 * in view (frozen) with filters, banded rows, money as pesos, dates as real
 * Excel dates, and a total row for the money columns.
 *
 * Column types: text, label (snake_case words made readable), money,
 * number, datetime.
 */
class XlsxWriter
{
    private const STYLE = [
        'title' => 1, 'subtitle' => 2, 'header' => 3,
        'text' => 4, 'money' => 5, 'datetime' => 6, 'number' => 10,
        'text_band' => 7, 'money_band' => 8, 'datetime_band' => 9, 'number_band' => 11,
        'total_label' => 12, 'total_money' => 13, 'total_blank' => 14,
    ];

    /**
     * @param  list<string>  $headers
     * @param  list<string>  $types
     * @param  list<list<mixed>>  $rows
     */
    public static function build(string $sheet, string $title, string $subtitle, array $headers, array $types, array $rows, string $timezone): string
    {
        $path = tempnam(sys_get_temp_dir(), 'dineflow-xlsx-');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', self::contentTypes());
        $zip->addFromString('_rels/.rels', self::rootRels());
        $zip->addFromString('xl/workbook.xml', self::workbook($sheet, count($headers), count($rows)));
        $zip->addFromString('xl/_rels/workbook.xml.rels', self::workbookRels());
        $zip->addFromString('xl/styles.xml', self::styles());
        $logo = resource_path('brand/dineflow-mark.png');
        $hasLogo = is_file($logo);
        $zip->addFromString('xl/worksheets/sheet1.xml', self::worksheet($title, $subtitle, $headers, $types, $rows, $timezone, $hasLogo));
        if ($hasLogo) {
            $zip->addFile($logo, 'xl/media/image1.png');
            $zip->addFromString('xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>'
                .'</Relationships>');
            $zip->addFromString('xl/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>'
                .'</Relationships>');
            $zip->addFromString('xl/drawings/drawing1.xml', self::logoDrawing(self::$logoColumn, self::$logoOffset));
        }
        $zip->close();

        return $path;
    }

    /** Where the logo sits: its column and the offset into it (EMU). */
    private static int $logoColumn = 0;

    private static int $logoOffset = 0;

    /** The 40px logo, one-cell anchored at the top right of the header. */
    private static function logoDrawing(int $column, int $offset): string
    {
        $size = 40 * 9525;

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<xdr:oneCellAnchor><xdr:from><xdr:col>'.$column.'</xdr:col><xdr:colOff>'.$offset.'</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>'.(8 * 9525).'</xdr:rowOff></xdr:from>'
            .'<xdr:ext cx="'.$size.'" cy="'.$size.'"/>'
            .'<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="DineFlow"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
            .'<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            .'<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'.$size.'" cy="'.$size.'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>'
            .'<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
    }

    private static function worksheet(string $title, string $subtitle, array $headers, array $types, array $rows, string $timezone, bool $hasLogo = false): string
    {
        $count = count($headers);
        $last = self::column($count - 1);
        $firstData = 4;
        $lastData = $firstData + count($rows) - 1;

        // Column widths from the longest value, within sensible bounds.
        $widths = array_map(fn ($header) => mb_strlen($header) + 4, $headers);
        $cells = [];
        foreach ($rows as $r => $row) {
            foreach (array_values($row) as $c => $value) {
                $cells[$r][$c] = self::convert($value, $types[$c] ?? 'text', $timezone);
                $shown = match ($types[$c] ?? 'text') {
                    'money' => 14, 'datetime' => 20, 'number' => 8,
                    default => mb_strlen((string) $cells[$r][$c]),
                };
                $widths[$c] = max($widths[$c], $shown + 2);
            }
        }
        $final = array_map(fn ($width) => min(48, max(10, $width)), $widths);
        // A character of width is about 7px plus 5px of padding per column.
        $lastPx = (int) round(end($final) * 7 + 5);
        self::$logoColumn = count($final) - 1;
        self::$logoOffset = max(0, $lastPx - 40 - 10) * 9525;
        $cols = '';
        foreach ($widths as $c => $width) {
            $cols .= '<col min="'.($c + 1).'" max="'.($c + 1).'" width="'.min(48, max(10, $width)).'" customWidth="1"/>';
        }

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            .'<sheetFormatPr defaultRowHeight="20" customHeight="1"/>'
            .'<cols>'.$cols.'</cols><sheetData>';
        $xml .= '<row r="1" ht="30" customHeight="1">'.self::text('A1', $title, self::STYLE['title']).'</row>';
        $xml .= '<row r="2" ht="20" customHeight="1">'.self::text('A2', $subtitle, self::STYLE['subtitle']).'</row>';
        $xml .= '<row r="3" ht="26" customHeight="1">';
        foreach ($headers as $c => $header) {
            $xml .= self::text(self::column($c).'3', $header, self::STYLE['header']);
        }
        $xml .= '</row>';
        foreach ($cells as $r => $row) {
            $line = $firstData + $r;
            $band = $r % 2 === 1 ? '_band' : '';
            $xml .= '<row r="'.$line.'">';
            foreach ($row as $c => $value) {
                $ref = self::column($c).$line;
                $type = $types[$c] ?? 'text';
                $style = self::STYLE[(in_array($type, ['money', 'datetime', 'number'], true) ? $type : 'text').$band];
                $xml .= ($value === null || $value === '')
                    ? '<c r="'.$ref.'" s="'.$style.'"/>'
                    : (is_int($value) || is_float($value)
                        ? '<c r="'.$ref.'" s="'.$style.'"><v>'.$value.'</v></c>'
                        : self::text($ref, (string) $value, $style));
            }
            $xml .= '</row>';
        }
        // Total row: sums of the money columns.
        if ($rows && in_array('money', $types, true)) {
            $line = $lastData + 1;
            $xml .= '<row r="'.$line.'" ht="24" customHeight="1">';
            foreach ($headers as $c => $header) {
                $ref = self::column($c).$line;
                if ($c === 0) {
                    $xml .= self::text($ref, 'Total ('.count($rows).' rows)', self::STYLE['total_label']);
                } elseif (($types[$c] ?? '') === 'money') {
                    $letter = self::column($c);
                    $xml .= '<c r="'.$ref.'" s="'.self::STYLE['total_money'].'"><f>SUM('.$letter.$firstData.':'.$letter.$lastData.')</f></c>';
                } else {
                    $xml .= '<c r="'.$ref.'" s="'.self::STYLE['total_blank'].'"/>';
                }
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData>';
        $xml .= '<autoFilter ref="A3:'.$last.max(3, $lastData).'"/>';
        $xml .= '<mergeCells count="2"><mergeCell ref="A1:'.$last.'1"/><mergeCell ref="A2:'.$last.'2"/></mergeCells>';
        $xml .= '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
        $xml .= '<pageSetup orientation="landscape"/>';
        $xml .= '<headerFooter><oddFooter>&amp;L&amp;8'.htmlspecialchars($title, ENT_XML1 | ENT_QUOTES, 'UTF-8').'&amp;R&amp;8Page &amp;P of &amp;N</oddFooter></headerFooter>';
        if ($hasLogo) {
            $xml .= '<drawing r:id="rId1"/>';
        }

        return $xml.'</worksheet>';
    }

    /** A cell value as Excel wants it for its column type. */
    private static function convert(mixed $value, string $type, string $timezone): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }
        return match ($type) {
            'money', 'number' => is_numeric($value) ? (float) $value : $value,
            'datetime' => self::serial($value, $timezone),
            'label' => ucfirst(str_replace('_', ' ', (string) $value)),
            default => (string) $value,
        };
    }

    /** An Excel date serial in the restaurant's time zone. */
    private static function serial(mixed $value, string $timezone): float|string
    {
        try {
            $at = Carbon::parse($value)->setTimezone($timezone);
        } catch (\Throwable) {
            return (string) $value;
        }

        return round(($at->getTimestamp() + $at->getOffset()) / 86400 + 25569, 6);
    }

    private static function text(string $ref, string $value, int $style): string
    {
        return '<c r="'.$ref.'" t="inlineStr" s="'.$style.'"><is><t xml:space="preserve">'
            .htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8').'</t></is></c>';
    }

    private static function column(int $index): string
    {
        $name = '';
        for ($index++; $index > 0; $index = intdiv($index - 1, 26)) {
            $name = chr(65 + ($index - 1) % 26).$name;
        }

        return $name;
    }

    private static function styles(): string
    {
        $green = 'FF1E4D3A';
        $band = 'FFF2F6F0';
        $total = 'FFE2EEE4';
        $line = 'FFD7E0D5';
        $border = '<border><left/><right/><top/><bottom style="thin"><color rgb="'.$line.'"/></bottom><diagonal/></border>';
        $xf = fn ($num, $font, $fill, $border, $extra = '') => '<xf numFmtId="'.$num.'" fontId="'.$font.'" fillId="'.$fill.'" borderId="'.$border.'" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"'.$extra.'/></xf>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            .'<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="mmm d, yyyy h:mm AM/PM"/></numFmts>'
            .'<fonts count="5">'
            .'<font><sz val="11"/><color rgb="FF1F2A24"/><name val="Calibri"/><family val="2"/></font>'
            .'<font><b/><sz val="16"/><color rgb="'.$green.'"/><name val="Calibri"/><family val="2"/></font>'
            .'<font><i/><sz val="10"/><color rgb="FF5F6B63"/><name val="Calibri"/><family val="2"/></font>'
            .'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>'
            .'<font><b/><sz val="11"/><color rgb="'.$green.'"/><name val="Calibri"/><family val="2"/></font>'
            .'</fonts>'
            .'<fills count="5">'
            .'<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="'.$green.'"/><bgColor indexed="64"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="'.$band.'"/><bgColor indexed="64"/></patternFill></fill>'
            .'<fill><patternFill patternType="solid"><fgColor rgb="'.$total.'"/><bgColor indexed="64"/></patternFill></fill>'
            .'</fills>'
            .'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'.$border.'</borders>'
            .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            .'<cellXfs count="15">'
            .'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            .$xf(0, 1, 0, 0)               // 1 title
            .$xf(0, 2, 0, 0)               // 2 subtitle
            .$xf(0, 3, 2, 0, ' indent="1"') // 3 header
            .$xf(0, 0, 0, 1, ' indent="1"') // 4 text
            .$xf(164, 0, 0, 1)             // 5 money
            .$xf(165, 0, 0, 1, ' horizontal="left" indent="1"') // 6 datetime
            .$xf(0, 0, 3, 1, ' indent="1"') // 7 text band
            .$xf(164, 0, 3, 1)             // 8 money band
            .$xf(165, 0, 3, 1, ' horizontal="left" indent="1"') // 9 datetime band
            .$xf(1, 0, 0, 1, ' horizontal="center"') // 10 number
            .$xf(1, 0, 3, 1, ' horizontal="center"') // 11 number band
            .$xf(0, 4, 4, 1, ' indent="1"') // 12 total label
            .$xf(164, 4, 4, 1)             // 13 total money
            .$xf(0, 4, 4, 1)               // 14 total blank
            .'</cellXfs>'
            .'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            .'</styleSheet>';
    }

    private static function workbook(string $sheet, int $columns, int $rows): string
    {
        $name = htmlspecialchars(mb_substr($sheet, 0, 31), ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $range = "'".$name."'!\$A\$3:\$".self::column($columns - 1).'$'.max(3, 3 + $rows);

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            .'<sheets><sheet name="'.$name.'" sheetId="1" r:id="rId1"/></sheets>'
            .'<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'.$range.'</definedName></definedNames>'
            .'</workbook>';
    }

    private static function contentTypes(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            .'<Default Extension="xml" ContentType="application/xml"/>'
            .'<Default Extension="png" ContentType="image/png"/>'
            .'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
            .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            .'</Types>';
    }

    private static function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            .'</Relationships>';
    }

    private static function workbookRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            .'</Relationships>';
    }
}
