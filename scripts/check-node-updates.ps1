# Проверка окружения и обновлений Node.js для WorldHistory Atlas.
# Выходной код: 0 - всё хорошо или проверить не удалось; 2 - доступна более новая LTS-версия Node.js.

$ErrorActionPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$required = [version]'22.5.0'

function ConvertTo-Version {
    param($Text)
    $clean = ''
    if ($Text) { $clean = ($Text | Out-String).Trim() }
    if ($clean -match '^v?(\d+(\.\d+){0,2})') {
        try { return [version]$Matches[1] } catch { return $null }
    }
    return $null
}

$nodeRaw = ''
try { $nodeRaw = (& node -v) | Out-String } catch {}
$installed = ConvertTo-Version $nodeRaw
$npmRaw = ''
try { $npmRaw = (& npm -v) | Out-String } catch {}

if (-not $installed) {
    Write-Output '[ВНИМАНИЕ] Не удалось определить версию Node.js - проверку обновлений пропускаю.'
    exit 0
}

$summary = "Окружение: Node.js v$installed (минимум 22.5.0)"
if ($npmRaw) { $summary += ', npm ' + $npmRaw.Trim() }
Write-Output $summary

if ($installed -lt $required) {
    Write-Output "[ОШИБКА] Node.js v$installed слишком старый: нужно 22.5.0 или новее."
    exit 2
}

# Последняя LTS-версия берётся с nodejs.org. Результат кэшируется на сутки,
# чтобы каждый запуск батника не скачивал список версий заново.
$cacheDir = $env:TEMP
if (-not $cacheDir) { $cacheDir = '/tmp' }
$cacheFile = Join-Path $cacheDir 'worldhistory-node-latest.txt'
$latest = $null

if (Test-Path $cacheFile) {
    $cacheFresh = $false
    try { $cacheFresh = ((Get-Date) - (Get-Item $cacheFile).LastWriteTime).TotalHours -lt 24 } catch {}
    if ($cacheFresh) { $latest = ConvertTo-Version (Get-Content $cacheFile -First 1) }
}

if (-not $latest) {
    try {
        $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 8
        $ltsEntry = $releases | Where-Object { $_.lts } | Select-Object -First 1
        if ($ltsEntry -and $ltsEntry.version) {
            $latest = ConvertTo-Version $ltsEntry.version
            if ($latest) {
                try { Set-Content -Path $cacheFile -Value $ltsEntry.version -Encoding ASCII } catch {}
            }
        }
    } catch {}
}

if (-not $latest) {
    Write-Output 'Не удалось проверить обновления Node.js (нет доступа к nodejs.org). Продолжаю без проверки.'
    exit 0
}

if ($installed -lt $latest) {
    Write-Output "[ОБНОВЛЕНИЕ] Доступна более новая LTS-версия Node.js: v$latest (установлена v$installed)."
    Write-Output 'Устаревший Node.js - частая причина ошибки «API 502» в этом приложении.'
    exit 2
}

Write-Output "Node.js v$installed актуален (последняя LTS: v$latest)."
exit 0
