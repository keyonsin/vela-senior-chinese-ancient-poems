param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::OpenRead(
  (Resolve-Path -LiteralPath $InputPath).Path
)

try {
  $entry = $archive.GetEntry('word/document.xml')
  if ($null -eq $entry) {
    throw 'The document has no word/document.xml part.'
  }

  $settings = [System.Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $stream = $entry.Open()
  $reader = [System.Xml.XmlReader]::Create($stream, $settings)
  $document = [System.Xml.XmlDocument]::new()
  $document.XmlResolver = $null
  try {
    $document.Load($reader)
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }

  $ns = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $paragraphs = [System.Collections.Generic.List[string]]::new()

  foreach ($paragraph in $document.SelectNodes('/w:document/w:body//w:p', $ns)) {
    $text = [System.Text.StringBuilder]::new()
    foreach ($node in $paragraph.SelectNodes('.//w:t | .//w:br | .//w:tab', $ns)) {
      if ($node.LocalName -eq 't') {
        [void]$text.Append($node.InnerText)
      } elseif ($node.LocalName -eq 'tab') {
        [void]$text.Append("`t")
      } elseif ($node.GetAttribute('type', $ns.LookupNamespace('w')) -ne 'page') {
        [void]$text.Append("`n")
      }
    }
    $paragraphs.Add($text.ToString())
  }

  $result = @{
    paragraphs = $paragraphs.ToArray()
    footnoteReferences = $document.SelectNodes('//w:footnoteReference', $ns).Count
    drawings = $document.SelectNodes('//w:drawing', $ns).Count
  }
  [Console]::Write(($result | ConvertTo-Json -Depth 4 -Compress))
} finally {
  $archive.Dispose()
}
