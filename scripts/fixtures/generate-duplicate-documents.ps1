# Generate real Office files and text PDFs for duplicate regression tests.
# Requires Microsoft Word and PowerPoint on Windows; tests only read the saved files.
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../../backend/test/fixtures/duplicate-documents'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$null = New-Item -ItemType Directory -Path $outputPath -Force
$baseWords = @(0..1999 | ForEach-Object { "word$_" })
$variants = [ordered]@{
    original = $baseWords
    'same-text' = $baseWords
    high = @(0..1999 | ForEach-Object { if ($_ % 100 -eq 0) { "changed$_" } else { $baseWords[$_] } })
    'above-85' = @(0..1999 | ForEach-Object { if ($_ % 60 -eq 0) { "changed$_" } else { $baseWords[$_] } })
    warning = @(0..1999 | ForEach-Object { if ($_ % 40 -eq 0) { "medium$_" } else { $baseWords[$_] } })
    different = @(0..1999 | ForEach-Object { if ($_ % 10 -eq 0) { "new$_" } else { $baseWords[$_] } })
}
function Write-TextPdf([string]$Path, [string[]]$Words, [string]$Label) {
    $objects = [System.Collections.Generic.List[string]]::new()
    $objects.Add('<< /Type /Catalog /Pages 2 0 R >>')
    $objects.Add('<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R] /Count 4 >>')
    for ($page = 0; $page -lt 4; $page++) {
        $content = "BT /F1 10 Tf 48 790 Td 14 TL`n"
        for ($line = 0; $line -lt 50; $line++) {
            $start = $page * 500 + $line * 10
            $content += '(' + ($Words[$start..($start + 9)] -join ' ') + ") Tj T*`n"
        }
        $content += 'ET'
        $objects.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 11 0 R >> >> /Contents $($objects.Count + 2) 0 R >>")
        $objects.Add("<< /Length $($content.Length) >>`nstream`n$content`nendstream")
    }
    $objects.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    $objects.Add("<< /Title (BTL duplicate fixture $Label) /Author (BTL Cloud tests) >>")
    $source = "%PDF-1.7`n"
    $offsets = [System.Collections.Generic.List[int]]::new()
    for ($i = 0; $i -lt $objects.Count; $i++) {
        $offsets.Add($source.Length)
        $source += "$($i + 1) 0 obj`n$($objects[$i])`nendobj`n"
    }
    $xref = $source.Length
    $source += "xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n"
    foreach ($offset in $offsets) { $source += ('{0:D10} 00000 n ' -f $offset) + "`n" }
    $source += "trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R /Info 12 0 R >>`nstartxref`n$xref`n%%EOF`n"
    [System.IO.File]::WriteAllBytes($Path, [System.Text.Encoding]::ASCII.GetBytes($source))
}
function Set-FixtureMetadata([string]$Path, [string]$Label) {
    $archive = [System.IO.Compression.ZipFile]::Open($Path, 'Update')
    try {
        $entry = $archive.GetEntry('docProps/core.xml')
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($field in @(
            @('dc', 'title', 'http://purl.org/dc/elements/1.1/', "BTL duplicate fixture $Label"),
            @('dc', 'creator', 'http://purl.org/dc/elements/1.1/', 'BTL Cloud tests'),
            @('cp', 'lastModifiedBy', 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'BTL Cloud tests')
        )) {
            $node = $xml.GetElementsByTagName($field[1], $field[2]).Item(0)
            if ($null -eq $node) {
                $node = $xml.CreateElement($field[0], $field[1], $field[2])
                $null = $xml.DocumentElement.AppendChild($node)
            }
            $node.InnerText = $field[3]
        }
        $entry.Delete()
        $writer = [System.IO.StreamWriter]::new($archive.CreateEntry('docProps/core.xml').Open(), [System.Text.UTF8Encoding]::new($false))
        try { $writer.Write($xml.OuterXml) } finally { $writer.Dispose() }
    } finally { $archive.Dispose() }
}
$word = $null
$powerPoint = $null
$powerPointWasRunning = @(Get-Process -Name POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.DisplayAlerts = 1
    foreach ($variant in $variants.GetEnumerator()) {
        $document = $null
        $presentation = $null
        try {
            $paragraphs = @(for ($offset = 0; $offset -lt $variant.Value.Count; $offset += 100) {
                $variant.Value[$offset..($offset + 99)] -join ' '
            })
            $document = $word.Documents.Add()
            $document.Content.Text = $paragraphs -join "`r"
            $document.Content.Font.Name = 'Arial'
            $document.Content.Font.Size = 11
            $document.Content.ParagraphFormat.SpaceAfter = 6
            $docxPath = Join-Path $outputPath "$($variant.Key).docx"
            $pdfPath = Join-Path $outputPath "$($variant.Key).pdf"
            $document.SaveAs2([ref]([string]$docxPath), [ref]([int]16))
            Write-TextPdf $pdfPath $variant.Value $variant.Key

            $presentation = $powerPoint.Presentations.Add(0)
            $presentation.PageSetup.SlideWidth = 960
            $presentation.PageSetup.SlideHeight = 540
            foreach ($paragraph in $paragraphs) {
                $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)
                $text = $slide.Shapes.AddTextbox(1, 48, 48, 864, 444)
                $text.TextFrame.WordWrap = -1
                $text.TextFrame.TextRange.Text = $paragraph
                $text.TextFrame.TextRange.Font.Name = 'Arial'
                $text.TextFrame.TextRange.Font.Size = 22
            }
            $presentation.SaveAs((Join-Path $outputPath "$($variant.Key).pptx"), 24)
            Write-Output "Generated $($variant.Key): DOCX, PDF, PPTX"
        } finally {
            if ($null -ne $presentation) { $presentation.Close(); $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
            if ($null -ne $document) { $document.Close([ref]0); $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
        }
        Set-FixtureMetadata (Join-Path $outputPath "$($variant.Key).docx") $variant.Key
        Set-FixtureMetadata (Join-Path $outputPath "$($variant.Key).pptx") $variant.Key
    }
} finally {
    if ($null -ne $powerPoint) {
        if (-not $powerPointWasRunning -and $powerPoint.Presentations.Count -eq 0) { $powerPoint.Quit() }
        $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint)
    }
    if ($null -ne $word) { $word.Quit([ref]0); $null = [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
